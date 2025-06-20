import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Vibration,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import { Button, Card, Title, Paragraph } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import * as Location from 'expo-location';

import { RootState, AppDispatch } from '../store';
import { triggerEmergencyAlert, cancelEmergencyAlert } from '../store/slices/emergencySlice';
import { getCurrentLocation } from '../store/slices/locationSlice';
import { theme } from '../theme';
import { logger } from '../utils/logger';

interface EmergencySOSButtonProps {
  size?: 'small' | 'medium' | 'large';
  style?: any;
  onEmergencyTriggered?: () => void;
}

const { width, height } = Dimensions.get('window');

const EmergencySOSButton: React.FC<EmergencySOSButtonProps> = ({
  size = 'medium',
  style,
  onEmergencyTriggered,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { currentLocation } = useSelector((state: RootState) => state.location);
  const { isEmergencyActive, emergencyId } = useSelector((state: RootState) => state.emergency);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isPressed, setIsPressed] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countdownRef = useRef<NodeJS.Timeout>();
  const pressTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (isEmergencyActive) {
      startPulseAnimation();
    } else {
      stopPulseAnimation();
    }

    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    };
  }, [isEmergencyActive]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  };

  const handleLongPress = () => {
    if (isEmergencyActive) {
      handleCancelEmergency();
      return;
    }

    setIsPressed(true);
    setCountdown(3);
    
    // Start countdown
    const startCountdown = (remaining: number) => {
      if (remaining <= 0) {
        triggerEmergency();
        return;
      }
      
      setCountdown(remaining);
      Vibration.vibrate(100);
      
      countdownRef.current = setTimeout(() => {
        startCountdown(remaining - 1);
      }, 1000);
    };

    startCountdown(3);
  };

  const handlePressOut = () => {
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
    }
    setIsPressed(false);
    setCountdown(0);
  };

  const triggerEmergency = async () => {
    try {
      setIsPressed(false);
      setCountdown(0);

      // Get current location
      let location = currentLocation;
      if (!location) {
        try {
          const result = await dispatch(getCurrentLocation()).unwrap();
          location = result;
        } catch (error) {
          logger.warn('Could not get location for emergency alert');
        }
      }

      // Trigger emergency alert
      const emergencyData = {
        agentId: user?.agent?.id,
        location: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        } : null,
        timestamp: new Date().toISOString(),
        deviceInfo: {
          platform: 'mobile',
          userAgent: 'BahinLink Mobile App',
        },
      };

      await dispatch(triggerEmergencyAlert(emergencyData)).unwrap();

      // Vibrate for emergency
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);

      onEmergencyTriggered?.();

      Alert.alert(
        'Emergency Alert Sent',
        'Your emergency alert has been sent to supervisors and emergency contacts. Help is on the way.',
        [{ text: 'OK' }]
      );

    } catch (error: any) {
      logger.error('Failed to trigger emergency alert:', error);
      Alert.alert(
        'Emergency Alert Failed',
        'Failed to send emergency alert. Please try again or contact emergency services directly.',
        [
          { text: 'Retry', onPress: triggerEmergency },
          { text: 'Cancel' },
        ]
      );
    }
  };

  const handleCancelEmergency = () => {
    Alert.alert(
      'Cancel Emergency Alert',
      'Are you sure you want to cancel the emergency alert?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: async () => {
            try {
              if (emergencyId) {
                await dispatch(cancelEmergencyAlert({ emergencyId })).unwrap();
              }
              Alert.alert('Emergency Cancelled', 'Emergency alert has been cancelled.');
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel emergency alert.');
            }
          }
        },
      ]
    );
  };

  const getButtonSize = () => {
    switch (size) {
      case 'small': return 60;
      case 'large': return 120;
      default: return 80;
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small': return 24;
      case 'large': return 48;
      default: return 32;
    }
  };

  const buttonSize = getButtonSize();
  const iconSize = getIconSize();

  return (
    <>
      <Animated.View style={[
        styles.container,
        style,
        { transform: [{ scale: pulseAnim }] }
      ]}>
        <TouchableOpacity
          style={[
            styles.button,
            {
              width: buttonSize,
              height: buttonSize,
              borderRadius: buttonSize / 2,
              backgroundColor: isEmergencyActive ? theme.colors.error : '#FF4444',
            },
            isPressed && styles.buttonPressed,
          ]}
          onLongPress={handleLongPress}
          onPressOut={handlePressOut}
          delayLongPress={100}
          activeOpacity={0.8}
        >
          <Icon 
            name={isEmergencyActive ? "alert-octagon" : "alert"} 
            size={iconSize} 
            color="white" 
          />
          {isPressed && countdown > 0 && (
            <View style={styles.countdownOverlay}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          )}
        </TouchableOpacity>

        {size !== 'small' && (
          <Text style={styles.label}>
            {isEmergencyActive ? 'Emergency Active' : 'Hold for SOS'}
          </Text>
        )}
      </Animated.View>

      {/* Emergency Status Modal */}
      <Modal
        visible={isEmergencyActive}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.emergencyCard}>
            <Card.Content>
              <View style={styles.emergencyHeader}>
                <Icon name="alert-octagon" size={32} color={theme.colors.error} />
                <Title style={styles.emergencyTitle}>Emergency Active</Title>
              </View>
              
              <Paragraph style={styles.emergencyText}>
                Emergency alert is active. Supervisors and emergency contacts have been notified.
              </Paragraph>

              <View style={styles.emergencyActions}>
                <Button
                  mode="outlined"
                  onPress={handleCancelEmergency}
                  style={styles.cancelButton}
                >
                  Cancel Alert
                </Button>
              </View>
            </Card.Content>
          </Card>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    position: 'relative',
  },
  buttonPressed: {
    backgroundColor: '#CC0000',
  },
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  label: {
    marginTop: 8,
    fontSize: 12,
    color: theme.colors.onSurface,
    textAlign: 'center',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emergencyCard: {
    width: '100%',
    maxWidth: 400,
  },
  emergencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  emergencyTitle: {
    marginLeft: 12,
    color: theme.colors.error,
  },
  emergencyText: {
    marginBottom: 20,
    textAlign: 'center',
  },
  emergencyActions: {
    alignItems: 'center',
  },
  cancelButton: {
    borderColor: theme.colors.error,
  },
});

export default EmergencySOSButton;
