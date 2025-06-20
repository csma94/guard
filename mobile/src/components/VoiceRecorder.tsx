import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { Button, Card, ProgressBar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

import { theme } from '../theme';
import { logger } from '../utils/logger';

interface VoiceRecorderProps {
  onRecordingComplete: (recording: {
    uri: string;
    duration: number;
    size: number;
    name: string;
  }) => void;
  onRecordingCancel?: () => void;
  maxDuration?: number; // in seconds
  style?: any;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onRecordingComplete,
  onRecordingCancel,
  maxDuration = 300, // 5 minutes default
  style,
}) => {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationInterval = useRef<NodeJS.Timeout>();

  useEffect(() => {
    requestPermissions();
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      startPulseAnimation();
      startDurationTimer();
    } else {
      stopPulseAnimation();
      stopDurationTimer();
    }
  }, [isRecording]);

  const requestPermissions = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Microphone permission is required to record voice notes.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      logger.error('Failed to request audio permissions:', error);
      setHasPermission(false);
    }
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  const startDurationTimer = () => {
    durationInterval.current = setInterval(() => {
      setRecordingDuration(prev => {
        const newDuration = prev + 1;
        if (newDuration >= maxDuration) {
          stopRecording();
          return maxDuration;
        }
        return newDuration;
      });
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
    }
  };

  const startRecording = async () => {
    if (!hasPermission) {
      await requestPermissions();
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recordingOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      };

      const { recording: newRecording } = await Audio.Recording.createAsync(recordingOptions);
      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);

      // Monitor audio levels
      newRecording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording && status.metering !== undefined) {
          setAudioLevel(Math.max(0, (status.metering + 160) / 160));
        }
      });

      logger.info('Voice recording started');
    } catch (error) {
      logger.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      
      const uri = recording.getURI();
      if (uri) {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        const fileName = `voice_note_${Date.now()}.m4a`;
        
        onRecordingComplete({
          uri,
          duration: recordingDuration,
          size: fileInfo.size || 0,
          name: fileName,
        });

        logger.info('Voice recording completed', {
          duration: recordingDuration,
          size: fileInfo.size,
        });
      }
      
      setRecording(null);
      setRecordingDuration(0);
      setAudioLevel(0);
    } catch (error) {
      logger.error('Failed to stop recording:', error);
      Alert.alert('Error', 'Failed to stop recording.');
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      setRecording(null);
      setRecordingDuration(0);
      setAudioLevel(0);
      
      onRecordingCancel?.();
      logger.info('Voice recording cancelled');
    } catch (error) {
      logger.error('Failed to cancel recording:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    return recordingDuration / maxDuration;
  };

  if (hasPermission === false) {
    return (
      <Card style={[styles.container, style]}>
        <Card.Content style={styles.permissionContent}>
          <Icon name="microphone-off" size={32} color={theme.colors.outline} />
          <Text style={styles.permissionText}>
            Microphone permission is required for voice notes
          </Text>
          <Button mode="outlined" onPress={requestPermissions}>
            Grant Permission
          </Button>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card style={[styles.container, style]}>
      <Card.Content>
        <View style={styles.header}>
          <Icon name="microphone" size={24} color={theme.colors.primary} />
          <Text style={styles.title}>Voice Note</Text>
        </View>

        {isRecording && (
          <View style={styles.recordingInfo}>
            <Text style={styles.duration}>{formatDuration(recordingDuration)}</Text>
            <Text style={styles.maxDuration}>/ {formatDuration(maxDuration)}</Text>
            
            <ProgressBar
              progress={getProgressPercentage()}
              color={theme.colors.primary}
              style={styles.progressBar}
            />
            
            <View style={styles.audioLevelContainer}>
              <Text style={styles.audioLevelLabel}>Audio Level:</Text>
              <ProgressBar
                progress={audioLevel}
                color={theme.colors.success}
                style={styles.audioLevelBar}
              />
            </View>
          </View>
        )}

        <View style={styles.controls}>
          {!isRecording ? (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={styles.recordButton}
                onPress={startRecording}
                disabled={hasPermission === false}
              >
                <Icon name="microphone" size={32} color="white" />
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <View style={styles.recordingControls}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={cancelRecording}
              >
                <Icon name="close" size={24} color="white" />
              </TouchableOpacity>
              
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={styles.stopButton}
                  onPress={stopRecording}
                >
                  <Icon name="stop" size={32} color="white" />
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
        </View>

        <Text style={styles.instruction}>
          {!isRecording 
            ? 'Tap to start recording' 
            : 'Tap stop when finished, or cancel to discard'
          }
        </Text>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  permissionContent: {
    alignItems: 'center',
    padding: 16,
  },
  permissionText: {
    textAlign: 'center',
    marginVertical: 16,
    color: theme.colors.outline,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
    color: theme.colors.onSurface,
  },
  recordingInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  duration: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  maxDuration: {
    fontSize: 14,
    color: theme.colors.outline,
    marginBottom: 8,
  },
  progressBar: {
    width: '100%',
    height: 4,
    marginBottom: 12,
  },
  audioLevelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  audioLevelLabel: {
    fontSize: 12,
    color: theme.colors.outline,
    marginRight: 8,
  },
  audioLevelBar: {
    flex: 1,
    height: 2,
  },
  controls: {
    alignItems: 'center',
    marginBottom: 16,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  cancelButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  instruction: {
    textAlign: 'center',
    fontSize: 14,
    color: theme.colors.outline,
  },
});

export default VoiceRecorder;
