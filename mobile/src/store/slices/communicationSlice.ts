import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../services/api';
import { logger } from '../../utils/logger';

export interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  channelId: string;
  timestamp: string;
  type: 'text' | 'image' | 'voice' | 'file' | 'location' | 'system';
  attachments?: Array<{
    id: string;
    type: string;
    url: string;
    name: string;
    size: number;
  }>;
  metadata?: any;
  isRead: boolean;
  isDelivered: boolean;
  replyTo?: string;
}

export interface Channel {
  id: string;
  name: string;
  type: 'DIRECT' | 'GROUP' | 'BROADCAST' | 'EMERGENCY';
  description?: string;
  participants: Array<{
    id: string;
    name: string;
    role: string;
    isOnline: boolean;
    lastSeen?: string;
  }>;
  lastMessage?: Message;
  unreadCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CommunicationState {
  channels: Channel[];
  messages: Record<string, Message[]>;
  activeChannelId: string | null;
  isLoading: boolean;
  error: string | null;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  typingUsers: Record<string, string[]>; // channelId -> userIds
  onlineUsers: string[];
}

const initialState: CommunicationState = {
  channels: [],
  messages: {},
  activeChannelId: null,
  isLoading: false,
  error: null,
  connectionStatus: 'disconnected',
  typingUsers: {},
  onlineUsers: [],
};

// Async thunks
export const getChannels = createAsyncThunk(
  'communication/getChannels',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/mobile/communication/channels');
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch channels');
    }
  }
);

export const getChannelMessages = createAsyncThunk(
  'communication/getChannelMessages',
  async (payload: { 
    channelId: string; 
    limit?: number; 
    offset?: number; 
    before?: string 
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/mobile/communication/channels/${payload.channelId}/messages`, {
        params: {
          limit: payload.limit || 50,
          offset: payload.offset || 0,
          before: payload.before,
        },
      });
      return { channelId: payload.channelId, messages: response.data.messages };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch messages');
    }
  }
);

export const sendMessage = createAsyncThunk(
  'communication/sendMessage',
  async (payload: {
    channelId: string;
    content: string;
    type?: string;
    attachments?: any[];
    replyTo?: string;
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post(`/mobile/communication/channels/${payload.channelId}/messages`, {
        content: payload.content,
        type: payload.type || 'text',
        attachments: payload.attachments,
        replyTo: payload.replyTo,
      });
      return response.data.message;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to send message');
    }
  }
);

export const markMessagesAsRead = createAsyncThunk(
  'communication/markAsRead',
  async (payload: { channelId: string; messageIds: string[] }, { rejectWithValue }) => {
    try {
      await apiClient.post(`/mobile/communication/channels/${payload.channelId}/mark-read`, {
        messageIds: payload.messageIds,
      });
      return payload;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to mark messages as read');
    }
  }
);

export const createChannel = createAsyncThunk(
  'communication/createChannel',
  async (payload: {
    name: string;
    type: string;
    description?: string;
    participantIds: string[];
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/mobile/communication/channels', payload);
      return response.data.channel;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create channel');
    }
  }
);

export const uploadAttachment = createAsyncThunk(
  'communication/uploadAttachment',
  async (payload: { file: any; channelId: string }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('file', payload.file);
      formData.append('channelId', payload.channelId);

      const response = await apiClient.post('/mobile/communication/attachments', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data.attachment;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to upload attachment');
    }
  }
);

export const sendVoiceMessage = createAsyncThunk(
  'communication/sendVoiceMessage',
  async (payload: {
    channelId: string;
    audioFile: any;
    duration: number;
  }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('audio', payload.audioFile);
      formData.append('duration', payload.duration.toString());

      const response = await apiClient.post(
        `/mobile/communication/channels/${payload.channelId}/voice-message`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      return response.data.message;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to send voice message');
    }
  }
);

export const sendLocationMessage = createAsyncThunk(
  'communication/sendLocationMessage',
  async (payload: {
    channelId: string;
    latitude: number;
    longitude: number;
    address?: string;
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post(
        `/mobile/communication/channels/${payload.channelId}/location-message`,
        payload
      );
      return response.data.message;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to send location');
    }
  }
);

const communicationSlice = createSlice({
  name: 'communication',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<Message>) => {
      const message = action.payload;
      const channelId = message.channelId;
      
      if (!state.messages[channelId]) {
        state.messages[channelId] = [];
      }
      
      // Check if message already exists
      const existingIndex = state.messages[channelId].findIndex(m => m.id === message.id);
      if (existingIndex === -1) {
        state.messages[channelId].push(message);
        
        // Sort messages by timestamp
        state.messages[channelId].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        // Update channel's last message and unread count
        const channel = state.channels.find(c => c.id === channelId);
        if (channel) {
          channel.lastMessage = message;
          if (channelId !== state.activeChannelId && !message.isRead) {
            channel.unreadCount++;
          }
        }
      }
    },
    
    updateMessage: (state, action: PayloadAction<{ channelId: string; messageId: string; updates: Partial<Message> }>) => {
      const { channelId, messageId, updates } = action.payload;
      const messages = state.messages[channelId];
      
      if (messages) {
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
          state.messages[channelId][messageIndex] = {
            ...messages[messageIndex],
            ...updates,
          };
        }
      }
    },
    
    setActiveChannel: (state, action: PayloadAction<string | null>) => {
      state.activeChannelId = action.payload;
      
      // Mark messages as read when channel becomes active
      if (action.payload) {
        const channel = state.channels.find(c => c.id === action.payload);
        if (channel) {
          channel.unreadCount = 0;
        }
        
        const messages = state.messages[action.payload];
        if (messages) {
          messages.forEach(message => {
            if (!message.isRead) {
              message.isRead = true;
            }
          });
        }
      }
    },
    
    setConnectionStatus: (state, action: PayloadAction<'connected' | 'connecting' | 'disconnected'>) => {
      state.connectionStatus = action.payload;
    },
    
    setTypingUsers: (state, action: PayloadAction<{ channelId: string; userIds: string[] }>) => {
      state.typingUsers[action.payload.channelId] = action.payload.userIds;
    },
    
    setOnlineUsers: (state, action: PayloadAction<string[]>) => {
      state.onlineUsers = action.payload;
      
      // Update participant online status in channels
      state.channels.forEach(channel => {
        channel.participants.forEach(participant => {
          participant.isOnline = state.onlineUsers.includes(participant.id);
        });
      });
    },
    
    clearMessages: (state, action: PayloadAction<string>) => {
      delete state.messages[action.payload];
    },
    
    clearError: (state) => {
      state.error = null;
    },
  },
  
  extraReducers: (builder) => {
    builder
      // Get Channels
      .addCase(getChannels.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getChannels.fulfilled, (state, action) => {
        state.isLoading = false;
        state.channels = action.payload.channels || [];
      })
      .addCase(getChannels.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      
      // Get Channel Messages
      .addCase(getChannelMessages.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getChannelMessages.fulfilled, (state, action) => {
        state.isLoading = false;
        const { channelId, messages } = action.payload;
        state.messages[channelId] = messages || [];
      })
      .addCase(getChannelMessages.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      
      // Send Message
      .addCase(sendMessage.pending, (state) => {
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        // Message will be added via WebSocket or addMessage action
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      
      // Mark Messages as Read
      .addCase(markMessagesAsRead.fulfilled, (state, action) => {
        const { channelId, messageIds } = action.payload;
        const messages = state.messages[channelId];
        
        if (messages) {
          messages.forEach(message => {
            if (messageIds.includes(message.id)) {
              message.isRead = true;
            }
          });
        }
        
        const channel = state.channels.find(c => c.id === channelId);
        if (channel) {
          channel.unreadCount = Math.max(0, channel.unreadCount - messageIds.length);
        }
      })
      
      // Create Channel
      .addCase(createChannel.fulfilled, (state, action) => {
        state.channels.push(action.payload);
      })
      
      // Upload Attachment
      .addCase(uploadAttachment.fulfilled, (state, action) => {
        // Attachment uploaded successfully
      })
      
      // Send Voice Message
      .addCase(sendVoiceMessage.fulfilled, (state, action) => {
        // Voice message will be added via WebSocket or addMessage action
      })
      
      // Send Location Message
      .addCase(sendLocationMessage.fulfilled, (state, action) => {
        // Location message will be added via WebSocket or addMessage action
      });
  },
});

export const {
  addMessage,
  updateMessage,
  setActiveChannel,
  setConnectionStatus,
  setTypingUsers,
  setOnlineUsers,
  clearMessages,
  clearError,
} = communicationSlice.actions;

export default communicationSlice.reducer;
