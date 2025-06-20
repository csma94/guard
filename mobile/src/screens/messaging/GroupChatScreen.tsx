import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';

import { RootState, AppDispatch } from '../../store';
import { 
  fetchGroupMessages, 
  sendGroupMessage, 
  markGroupMessageAsRead,
  addGroupMessage,
  updateTypingStatus,
} from '../../store/slices/messagingSlice';
import { useSocket } from '../../hooks/useSocket';
import { useOffline } from '../../providers/OfflineProvider';
import { colors, typography, spacing } from '../../theme';
import LoadingSpinner from '../../components/LoadingSpinner';
import MessageBubble from '../../components/messaging/MessageBubble';
import TypingIndicator from '../../components/messaging/TypingIndicator';
import AttachmentPicker from '../../components/messaging/AttachmentPicker';

interface RouteParams {
  groupId: string;
  groupName: string;
}

const GroupChatScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const dispatch = useDispatch<AppDispatch>();
  const { socket } = useSocket();
  const { isConnected, queueAction } = useOffline();
  
  const { groupId, groupName } = route.params as RouteParams;
  
  const {
    groupMessages,
    isLoading,
    error,
    typingUsers,
  } = useSelector((state: RootState) => state.messaging);
  
  const { user } = useSelector((state: RootState) => state.auth);
  
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<any>(null);
  
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  
  const messages = groupMessages[groupId] || [];

  // Load messages when screen focuses
  useFocusEffect(
    useCallback(() => {
      dispatch(fetchGroupMessages({ groupId }));
    }, [dispatch, groupId])
  );

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleNewGroupMessage = (messageData: any) => {
      if (messageData.groupId === groupId) {
        dispatch(addGroupMessage(messageData));
        
        // Mark as read if screen is active
        if (messageData.senderId !== user?.id) {
          dispatch(markGroupMessageAsRead({
            groupId,
            messageId: messageData.id,
          }));
        }
      }
    };

    const handleTypingIndicator = (data: any) => {
      if (data.groupId === groupId && data.userId !== user?.id) {
        dispatch(updateTypingStatus({
          groupId,
          userId: data.userId,
          username: data.username,
          isTyping: data.isTyping,
        }));
      }
    };

    socket.on('new_group_message', handleNewGroupMessage);
    socket.on('group_typing_indicator', handleTypingIndicator);

    return () => {
      socket.off('new_group_message', handleNewGroupMessage);
      socket.off('group_typing_indicator', handleTypingIndicator);
    };
  }, [socket, groupId, dispatch, user?.id]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSendMessage = async () => {
    if (!messageText.trim() && !selectedAttachment) return;

    const messageData = {
      groupId,
      message: messageText.trim(),
      messageType: selectedAttachment ? 'ATTACHMENT' : 'TEXT',
      attachment: selectedAttachment,
      priority: 'NORMAL',
    };

    setIsSending(true);
    setMessageText('');
    setSelectedAttachment(null);

    try {
      if (isConnected) {
        await dispatch(sendGroupMessage(messageData)).unwrap();
      } else {
        // Queue for offline sending
        await queueAction({
          type: 'SEND_GROUP_MESSAGE',
          data: messageData,
          endpoint: '/messages/groups/send',
          method: 'POST',
        });
        
        Alert.alert(
          'Message Queued',
          'Your message will be sent when you reconnect to the internet.'
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send message');
      // Restore message text on error
      setMessageText(messageData.message);
      setSelectedAttachment(messageData.attachment);
    } finally {
      setIsSending(false);
    }
  };

  const handleTyping = (text: string) => {
    setMessageText(text);

    if (!socket || !isConnected) return;

    // Send typing indicator
    if (text.length > 0 && !isTyping) {
      setIsTyping(true);
      socket.emit('group_typing_start', { groupId });
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        socket.emit('group_typing_stop', { groupId });
      }
    }, 2000);
  };

  const handleAttachmentSelect = (attachment: any) => {
    setSelectedAttachment(attachment);
    setAttachmentPickerVisible(false);
  };

  const handleImagePicker = () => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        { text: 'Camera', onPress: openCamera },
        { text: 'Gallery', onPress: openGallery },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const openCamera = () => {
    launchCamera(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1024,
        maxHeight: 1024,
      },
      (response) => {
        if (response.assets && response.assets[0]) {
          handleAttachmentSelect({
            type: 'image',
            uri: response.assets[0].uri,
            name: response.assets[0].fileName,
            size: response.assets[0].fileSize,
          });
        }
      }
    );
  };

  const openGallery = () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1024,
        maxHeight: 1024,
      },
      (response) => {
        if (response.assets && response.assets[0]) {
          handleAttachmentSelect({
            type: 'image',
            uri: response.assets[0].uri,
            name: response.assets[0].fileName,
            size: response.assets[0].fileSize,
          });
        }
      }
    );
  };

  const handleDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });
      
      if (result[0]) {
        handleAttachmentSelect({
          type: 'document',
          uri: result[0].uri,
          name: result[0].name,
          size: result[0].size,
        });
      }
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        Alert.alert('Error', 'Failed to pick document');
      }
    }
  };

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    const isOwnMessage = item.senderId === user?.id;
    const showSender = !isOwnMessage && (
      index === 0 || 
      messages[index - 1]?.senderId !== item.senderId
    );

    return (
      <MessageBubble
        message={item}
        isOwnMessage={isOwnMessage}
        showSender={showSender}
        onPress={() => {
          // Handle message press (e.g., show details)
        }}
        onLongPress={() => {
          // Handle long press (e.g., show options)
        }}
      />
    );
  };

  const renderTypingIndicator = () => {
    const currentTypingUsers = typingUsers[groupId] || [];
    if (currentTypingUsers.length === 0) return null;

    return (
      <TypingIndicator
        users={currentTypingUsers}
        style={styles.typingIndicator}
      />
    );
  };

  const renderAttachmentPreview = () => {
    if (!selectedAttachment) return null;

    return (
      <View style={styles.attachmentPreview}>
        <View style={styles.attachmentInfo}>
          {selectedAttachment.type === 'image' ? (
            <Image source={{ uri: selectedAttachment.uri }} style={styles.attachmentImage} />
          ) : (
            <Icon name="attach-file" size={24} color={colors.primary} />
          )}
          <Text style={styles.attachmentName} numberOfLines={1}>
            {selectedAttachment.name}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setSelectedAttachment(null)}
          style={styles.removeAttachment}
        >
          <Icon name="close" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
    );
  };

  if (isLoading && messages.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
      />

      {/* Typing Indicator */}
      {renderTypingIndicator()}

      {/* Attachment Preview */}
      {renderAttachmentPreview()}

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TouchableOpacity
          onPress={() => setAttachmentPickerVisible(true)}
          style={styles.attachButton}
        >
          <Icon name="attach-file" size={24} color={colors.primary} />
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          value={messageText}
          onChangeText={handleTyping}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={1000}
          editable={!isSending}
        />

        <TouchableOpacity
          onPress={handleSendMessage}
          style={[
            styles.sendButton,
            (!messageText.trim() && !selectedAttachment) && styles.sendButtonDisabled,
          ]}
          disabled={(!messageText.trim() && !selectedAttachment) || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Icon name="send" size={24} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>

      {/* Attachment Picker Modal */}
      <AttachmentPicker
        visible={attachmentPickerVisible}
        onClose={() => setAttachmentPickerVisible(false)}
        onImageSelect={handleImagePicker}
        onDocumentSelect={handleDocumentPicker}
        onCameraSelect={openCamera}
      />

      {/* Connection Status */}
      {!isConnected && (
        <View style={styles.offlineIndicator}>
          <Text style={styles.offlineText}>
            Offline - Messages will be sent when reconnected
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: spacing.md,
  },
  typingIndicator: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachmentInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentImage: {
    width: 40,
    height: 40,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  attachmentName: {
    flex: 1,
    ...typography.body2,
    color: colors.textPrimary,
  },
  removeAttachment: {
    padding: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attachButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    ...typography.body1,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: spacing.sm,
    marginLeft: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
  },
  sendButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  offlineIndicator: {
    backgroundColor: colors.warning,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  offlineText: {
    ...typography.caption,
    color: colors.white,
    textAlign: 'center',
  },
});

export default GroupChatScreen;
