import crypto from 'crypto';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';
import WebSocketService from './websocketService';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId?: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'location' | 'voice' | 'system';
  metadata: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number; // for voice messages
    coordinates?: { latitude: number; longitude: number };
    thumbnailUrl?: string;
  };
  status: 'sent' | 'delivered' | 'read' | 'failed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  isEncrypted: boolean;
  createdAt: Date;
  updatedAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
  replyToId?: string;
  reactions: Array<{
    userId: string;
    emoji: string;
    timestamp: Date;
  }>;
}

export interface Conversation {
  id: string;
  type: 'private' | 'group' | 'broadcast' | 'emergency';
  name?: string;
  description?: string;
  participants: Array<{
    userId: string;
    role: 'member' | 'admin' | 'moderator';
    joinedAt: Date;
    lastReadAt?: Date;
    notificationSettings: {
      muted: boolean;
      muteUntil?: Date;
    };
  }>;
  settings: {
    allowFileSharing: boolean;
    allowVoiceMessages: boolean;
    maxParticipants: number;
    autoDeleteMessages: boolean;
    autoDeleteAfterDays?: number;
    requireApprovalToJoin: boolean;
  };
  metadata: {
    createdBy: string;
    lastMessageAt?: Date;
    messageCount: number;
    isArchived: boolean;
    tags: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDeliveryReceipt {
  messageId: string;
  userId: string;
  status: 'delivered' | 'read';
  timestamp: Date;
}

class MessagingService {
  private wsService: WebSocketService;
  private encryptionKey: string;

  constructor(wsService: WebSocketService) {
    this.wsService = wsService;
    this.encryptionKey = process.env.MESSAGE_ENCRYPTION_KEY || 'default-key';
  }

  public async sendMessage(
    senderId: string,
    conversationId: string,
    content: string,
    type: Message['type'] = 'text',
    metadata: Message['metadata'] = {},
    options: {
      recipientId?: string;
      priority?: Message['priority'];
      replyToId?: string;
      encrypt?: boolean;
    } = {}
  ): Promise<Message> {
    try {
      // Validate conversation access
      const conversation = await this.getConversation(conversationId);
      if (!conversation || !this.canUserAccessConversation(senderId, conversation)) {
        throw new Error('Access denied to conversation');
      }

      // Create message
      const message: Message = {
        id: crypto.randomUUID(),
        conversationId,
        senderId,
        recipientId: options.recipientId,
        content: options.encrypt ? this.encryptMessage(content) : content,
        type,
        metadata,
        status: 'sent',
        priority: options.priority || 'normal',
        isEncrypted: options.encrypt || false,
        createdAt: new Date(),
        updatedAt: new Date(),
        replyToId: options.replyToId,
        reactions: [],
      };

      // Store message
      await this.storeMessage(message);

      // Update conversation
      await this.updateConversationLastMessage(conversationId, message);

      // Send via WebSocket
      await this.deliverMessage(message, conversation);

      // Handle priority messages
      if (message.priority === 'urgent') {
        await this.handleUrgentMessage(message, conversation);
      }

      // Send push notifications
      await this.sendPushNotifications(message, conversation);

      logger.info(`Message sent: ${message.id} in conversation ${conversationId}`);
      return message;

    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  }

  public async createConversation(
    creatorId: string,
    type: Conversation['type'],
    participantIds: string[],
    options: {
      name?: string;
      description?: string;
      settings?: Partial<Conversation['settings']>;
    } = {}
  ): Promise<Conversation> {
    try {
      const conversation: Conversation = {
        id: crypto.randomUUID(),
        type,
        name: options.name,
        description: options.description,
        participants: [
          {
            userId: creatorId,
            role: 'admin',
            joinedAt: new Date(),
            notificationSettings: { muted: false },
          },
          ...participantIds.map(userId => ({
            userId,
            role: 'member' as const,
            joinedAt: new Date(),
            notificationSettings: { muted: false },
          })),
        ],
        settings: {
          allowFileSharing: true,
          allowVoiceMessages: true,
          maxParticipants: type === 'private' ? 2 : 100,
          autoDeleteMessages: false,
          requireApprovalToJoin: false,
          ...options.settings,
        },
        metadata: {
          createdBy: creatorId,
          messageCount: 0,
          isArchived: false,
          tags: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store conversation
      await this.storeConversation(conversation);

      // Notify participants
      await this.notifyConversationCreated(conversation);

      logger.info(`Conversation created: ${conversation.id} by ${creatorId}`);
      return conversation;

    } catch (error) {
      logger.error('Failed to create conversation:', error);
      throw error;
    }
  }

  public async addParticipant(
    conversationId: string,
    userId: string,
    newParticipantId: string,
    role: 'member' | 'admin' | 'moderator' = 'member'
  ): Promise<void> {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Check permissions
      if (!this.canUserManageConversation(userId, conversation)) {
        throw new Error('Insufficient permissions');
      }

      // Check if already participant
      if (conversation.participants.some(p => p.userId === newParticipantId)) {
        throw new Error('User is already a participant');
      }

      // Add participant
      conversation.participants.push({
        userId: newParticipantId,
        role,
        joinedAt: new Date(),
        notificationSettings: { muted: false },
      });

      conversation.updatedAt = new Date();

      // Update conversation
      await this.updateConversation(conversation);

      // Send system message
      await this.sendSystemMessage(
        conversationId,
        `User added to conversation`,
        { addedUserId: newParticipantId, addedBy: userId }
      );

      // Notify participants
      this.wsService.broadcastToRoom(conversationId, 'participant_added', {
        conversationId,
        userId: newParticipantId,
        role,
        addedBy: userId,
      });

    } catch (error) {
      logger.error('Failed to add participant:', error);
      throw error;
    }
  }

  public async removeParticipant(
    conversationId: string,
    userId: string,
    participantId: string
  ): Promise<void> {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Check permissions
      if (!this.canUserManageConversation(userId, conversation) && userId !== participantId) {
        throw new Error('Insufficient permissions');
      }

      // Remove participant
      conversation.participants = conversation.participants.filter(
        p => p.userId !== participantId
      );

      conversation.updatedAt = new Date();

      // Update conversation
      await this.updateConversation(conversation);

      // Send system message
      await this.sendSystemMessage(
        conversationId,
        `User removed from conversation`,
        { removedUserId: participantId, removedBy: userId }
      );

      // Notify participants
      this.wsService.broadcastToRoom(conversationId, 'participant_removed', {
        conversationId,
        userId: participantId,
        removedBy: userId,
      });

    } catch (error) {
      logger.error('Failed to remove participant:', error);
      throw error;
    }
  }

  public async markMessageAsRead(
    userId: string,
    messageId: string
  ): Promise<void> {
    try {
      const message = await this.getMessage(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Update message status
      if (message.status !== 'read') {
        message.status = 'read';
        message.updatedAt = new Date();
        await this.updateMessage(message);
      }

      // Create delivery receipt
      const receipt: MessageDeliveryReceipt = {
        messageId,
        userId,
        status: 'read',
        timestamp: new Date(),
      };

      await this.storeDeliveryReceipt(receipt);

      // Update conversation last read
      await this.updateLastReadAt(message.conversationId, userId);

      // Notify sender
      this.wsService.sendToUser(message.senderId, 'message_read', {
        messageId,
        readBy: userId,
        timestamp: receipt.timestamp,
      });

    } catch (error) {
      logger.error('Failed to mark message as read:', error);
      throw error;
    }
  }

  public async addReaction(
    userId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    try {
      const message = await this.getMessage(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user already reacted with this emoji
      const existingReaction = message.reactions.find(
        r => r.userId === userId && r.emoji === emoji
      );

      if (existingReaction) {
        // Remove existing reaction
        message.reactions = message.reactions.filter(
          r => !(r.userId === userId && r.emoji === emoji)
        );
      } else {
        // Add new reaction
        message.reactions.push({
          userId,
          emoji,
          timestamp: new Date(),
        });
      }

      message.updatedAt = new Date();
      await this.updateMessage(message);

      // Broadcast reaction update
      this.wsService.broadcastToRoom(message.conversationId, 'message_reaction', {
        messageId,
        userId,
        emoji,
        action: existingReaction ? 'removed' : 'added',
      });

    } catch (error) {
      logger.error('Failed to add reaction:', error);
      throw error;
    }
  }

  public async searchMessages(
    userId: string,
    query: string,
    filters: {
      conversationId?: string;
      senderId?: string;
      type?: Message['type'];
      startDate?: Date;
      endDate?: Date;
    } = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 20 }
  ): Promise<{ messages: Message[]; total: number }> {
    try {
      // Get user's accessible conversations
      const conversations = await this.getUserConversations(userId);
      const conversationIds = conversations.map(c => c.id);

      // Apply conversation filter
      if (filters.conversationId && !conversationIds.includes(filters.conversationId)) {
        return { messages: [], total: 0 };
      }

      // Search messages
      const results = await this.searchMessagesInDatabase(
        query,
        {
          ...filters,
          conversationIds: filters.conversationId ? [filters.conversationId] : conversationIds,
        },
        pagination
      );

      return results;

    } catch (error) {
      logger.error('Failed to search messages:', error);
      throw error;
    }
  }

  public async getConversationMessages(
    userId: string,
    conversationId: string,
    pagination: { page: number; limit: number; before?: string } = { page: 1, limit: 50 }
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation || !this.canUserAccessConversation(userId, conversation)) {
        throw new Error('Access denied to conversation');
      }

      const messages = await this.getMessagesFromDatabase(conversationId, pagination);
      
      return {
        messages,
        hasMore: messages.length === pagination.limit,
      };

    } catch (error) {
      logger.error('Failed to get conversation messages:', error);
      throw error;
    }
  }

  // Private helper methods
  private async deliverMessage(message: Message, conversation: Conversation): Promise<void> {
    // Send to all participants
    for (const participant of conversation.participants) {
      if (participant.userId !== message.senderId) {
        this.wsService.sendToUser(participant.userId, 'new_message', message);
      }
    }

    // Also broadcast to conversation room
    this.wsService.broadcastToRoom(conversation.id, 'new_message', message);
  }

  private async handleUrgentMessage(message: Message, conversation: Conversation): Promise<void> {
    // Send high-priority notifications
    for (const participant of conversation.participants) {
      if (participant.userId !== message.senderId) {
        this.wsService.sendToUser(participant.userId, 'urgent_message', {
          message,
          conversation,
        });
      }
    }
  }

  private async sendPushNotifications(message: Message, conversation: Conversation): Promise<void> {
    // Implementation for push notifications
    // This would integrate with FCM, APNS, etc.
  }

  private async sendSystemMessage(
    conversationId: string,
    content: string,
    metadata: any = {}
  ): Promise<void> {
    const systemMessage: Message = {
      id: crypto.randomUUID(),
      conversationId,
      senderId: 'system',
      content,
      type: 'system',
      metadata,
      status: 'sent',
      priority: 'normal',
      isEncrypted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      reactions: [],
    };

    await this.storeMessage(systemMessage);
    this.wsService.broadcastToRoom(conversationId, 'new_message', systemMessage);
  }

  private canUserAccessConversation(userId: string, conversation: Conversation): boolean {
    return conversation.participants.some(p => p.userId === userId);
  }

  private canUserManageConversation(userId: string, conversation: Conversation): boolean {
    const participant = conversation.participants.find(p => p.userId === userId);
    return participant && (participant.role === 'admin' || participant.role === 'moderator');
  }

  private encryptMessage(content: string): string {
    // Simple encryption - in production, use proper encryption
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private decryptMessage(encryptedContent: string): string {
    // Simple decryption - in production, use proper decryption
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Database operations (to be implemented based on your database)
  private async storeMessage(message: Message): Promise<void> {
    // Store message in database
  }

  private async storeConversation(conversation: Conversation): Promise<void> {
    // Store conversation in database
  }

  private async updateConversation(conversation: Conversation): Promise<void> {
    // Update conversation in database
  }

  private async updateMessage(message: Message): Promise<void> {
    // Update message in database
  }

  private async getMessage(messageId: string): Promise<Message | null> {
    // Get message from database
    return null;
  }

  private async getConversation(conversationId: string): Promise<Conversation | null> {
    // Get conversation from database
    return null;
  }

  private async getUserConversations(userId: string): Promise<Conversation[]> {
    // Get user's conversations from database
    return [];
  }

  private async updateConversationLastMessage(conversationId: string, message: Message): Promise<void> {
    // Update conversation's last message timestamp
  }

  private async updateLastReadAt(conversationId: string, userId: string): Promise<void> {
    // Update user's last read timestamp for conversation
  }

  private async storeDeliveryReceipt(receipt: MessageDeliveryReceipt): Promise<void> {
    // Store delivery receipt in database
  }

  private async searchMessagesInDatabase(
    query: string,
    filters: any,
    pagination: any
  ): Promise<{ messages: Message[]; total: number }> {
    // Search messages in database
    return { messages: [], total: 0 };
  }

  private async getMessagesFromDatabase(
    conversationId: string,
    pagination: any
  ): Promise<Message[]> {
    // Get messages from database
    return [];
  }

  private async notifyConversationCreated(conversation: Conversation): Promise<void> {
    // Notify participants about new conversation
    for (const participant of conversation.participants) {
      this.wsService.sendToUser(participant.userId, 'conversation_created', conversation);
    }
  }
}

export default MessagingService;
