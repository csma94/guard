import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Vibration,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { RNCamera } from 'react-native-camera';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Geolocation from '@react-native-community/geolocation';
import { useDispatch, useSelector } from 'react-redux';

import { RootState, AppDispatch } from '../store';
import { verifyQRCode } from '../store/slices/qrCodeSlice';
import { useOffline } from '../providers/OfflineProvider';
import { colors, typography, spacing } from '../theme';
import { logger } from '../utils/logger';

interface QRCodeScannerProps {
  onScanSuccess: (result: any) => void;
  onScanError: (error: string) => void;
  onClose: () => void;
  allowOfflineVerification?: boolean;
  securityLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const { width, height } = Dimensions.get('window');

const QRCodeScanner: React.FC<QRCodeScannerProps> = ({
  onScanSuccess,
  onScanError,
  onClose,
  allowOfflineVerification = true,
  securityLevel = 'HIGH',
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { isConnected, queueAction } = useOffline();
  const { user } = useSelector((state: RootState) => state.auth);
  
  const [isScanning, setIsScanning] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  
  const cameraRef = useRef<RNCamera>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    getCurrentLocation();
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  const getCurrentLocation = () => {
    Geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        setLocationError(null);
      },
      (error) => {
        logger.error('Failed to get location:', error);
        setLocationError(error.message);
        
        if (securityLevel === 'HIGH' || securityLevel === 'CRITICAL') {
          Alert.alert(
            'Location Required',
            'Location access is required for secure QR code verification. Please enable location services.',
            [
              { text: 'Cancel', onPress: onClose },
              { text: 'Retry', onPress: getCurrentLocation },
            ]
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  };

  const handleBarCodeRead = async (scanResult: any) => {
    if (!isScanning || isProcessing) return;

    setIsScanning(false);
    setIsProcessing(true);

    try {
      // Vibrate on scan
      Vibration.vibrate(100);

      logger.info('QR code scanned', {
        type: scanResult.type,
        dataLength: scanResult.data.length,
        hasLocation: !!currentLocation,
      });

      // Prepare scan context
      const scanContext = {
        scanLocation: currentLocation,
        agentId: user?.agent?.id,
        deviceId: await getDeviceId(),
        timestamp: new Date().toISOString(),
        allowOfflineVerification: allowOfflineVerification && !isConnected,
      };

      let verificationResult;

      if (isConnected) {
        // Online verification
        verificationResult = await dispatch(verifyQRCode({
          qrData: scanResult.data,
          scanContext,
        })).unwrap();
      } else if (allowOfflineVerification) {
        // Offline verification
        verificationResult = await verifyQRCodeOffline(scanResult.data, scanContext);
        
        // Queue for online verification when connection is restored
        await queueAction('VERIFY_QR_CODE', {
          qrData: scanResult.data,
          scanContext,
        }, 'HIGH');
      } else {
        throw new Error('No internet connection and offline verification is disabled');
      }

      if (verificationResult.valid) {
        onScanSuccess(verificationResult);
      } else {
        const errorMessage = verificationResult.errors?.join(', ') || 'QR code verification failed';
        onScanError(errorMessage);
      }

    } catch (error: any) {
      logger.error('QR code verification failed:', error);
      onScanError(error.message || 'Failed to verify QR code');
    } finally {
      setIsProcessing(false);
      
      // Resume scanning after a delay
      scanTimeoutRef.current = setTimeout(() => {
        setIsScanning(true);
      }, 2000);
    }
  };

  const verifyQRCodeOffline = async (qrData: string, scanContext: any) => {
    try {
      // Parse QR payload
      const qrPayload = JSON.parse(qrData);
      
      if (!qrPayload.v || qrPayload.v !== '2.0') {
        throw new Error('Unsupported QR code version for offline verification');
      }

      // Basic structure validation
      if (!qrPayload.d || !qrPayload.s || !qrPayload.t) {
        throw new Error('Invalid QR code structure');
      }

      // Check timestamp for replay protection
      const scanTime = new Date(scanContext.timestamp);
      const qrTime = new Date(qrPayload.t);
      const timeDiff = Math.abs(scanTime.getTime() - qrTime.getTime());
      
      if (timeDiff > 5 * 60 * 1000) { // 5 minutes tolerance
        throw new Error('QR code is too old (possible replay attack)');
      }

      // For offline verification, we'll do basic validation
      // Full cryptographic verification would require the encryption keys
      // which should be securely stored and managed
      
      const result = {
        valid: true,
        offline: true,
        qrCodeId: 'offline-verification',
        siteId: 'unknown',
        siteName: 'Site (Offline Verification)',
        scanTime: scanContext.timestamp,
        securityLevel: 'OFFLINE',
        locationValidation: {
          valid: true,
          note: 'Location validation deferred to online sync',
        },
        warning: 'This QR code was verified offline. Full verification will occur when connection is restored.',
      };

      logger.info('QR code verified offline', result);
      return result;

    } catch (error) {
      logger.error('Offline QR verification failed:', error);
      throw error;
    }
  };

  const getDeviceId = async (): Promise<string> => {
    // This should return a unique device identifier
    // Implementation depends on your device ID strategy
    return 'device-id-placeholder';
  };

  const toggleFlash = () => {
    setFlashOn(!flashOn);
  };

  const retryLocation = () => {
    setLocationError(null);
    getCurrentLocation();
  };

  const renderOverlay = () => (
    <View style={styles.overlay}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Icon name="close" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <TouchableOpacity onPress={toggleFlash} style={styles.flashButton}>
          <Icon 
            name={flashOn ? "flash-off" : "flash-on"} 
            size={24} 
            color={colors.white} 
          />
        </TouchableOpacity>
      </View>

      {/* Scanning Frame */}
      <View style={styles.scanFrame}>
        <View style={styles.scanCorner} />
        <View style={[styles.scanCorner, styles.topRight]} />
        <View style={[styles.scanCorner, styles.bottomLeft]} />
        <View style={[styles.scanCorner, styles.bottomRight]} />
        
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingText}>Verifying...</Text>
          </View>
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>
          Position the QR code within the frame
        </Text>
        
        {/* Connection Status */}
        <View style={styles.statusContainer}>
          <Icon 
            name={isConnected ? "wifi" : "wifi-off"} 
            size={16} 
            color={isConnected ? colors.success : colors.warning} 
          />
          <Text style={[
            styles.statusText,
            { color: isConnected ? colors.success : colors.warning }
          ]}>
            {isConnected ? 'Online' : 'Offline'}
          </Text>
          {!isConnected && allowOfflineVerification && (
            <Text style={styles.offlineNote}>
              (Offline verification enabled)
            </Text>
          )}
        </View>

        {/* Location Status */}
        {locationError ? (
          <View style={styles.locationError}>
            <Icon name="location-off" size={16} color={colors.error} />
            <Text style={styles.errorText}>Location unavailable</Text>
            <TouchableOpacity onPress={retryLocation} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : currentLocation ? (
          <View style={styles.locationSuccess}>
            <Icon name="location-on" size={16} color={colors.success} />
            <Text style={styles.successText}>
              Location ready (±{Math.round(currentLocation.accuracy)}m)
            </Text>
          </View>
        ) : (
          <View style={styles.locationLoading}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Getting location...</Text>
          </View>
        )}

        {/* Security Level Indicator */}
        <View style={styles.securityIndicator}>
          <Icon name="security" size={16} color={colors.primary} />
          <Text style={styles.securityText}>
            Security Level: {securityLevel}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <RNCamera
        ref={cameraRef}
        style={styles.camera}
        type={RNCamera.Constants.Type.back}
        flashMode={flashOn ? RNCamera.Constants.FlashMode.torch : RNCamera.Constants.FlashMode.off}
        onBarCodeRead={handleBarCodeRead}
        barCodeTypes={[RNCamera.Constants.BarCodeType.qr]}
        captureAudio={false}
      >
        {renderOverlay()}
      </RNCamera>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  closeButton: {
    padding: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.white,
  },
  flashButton: {
    padding: spacing.sm,
  },
  scanFrame: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: colors.primary,
    top: height * 0.3,
    left: width * 0.2,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    right: width * 0.2,
    left: 'auto',
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderLeftWidth: 0,
  },
  bottomLeft: {
    top: height * 0.5,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderTopWidth: 0,
  },
  bottomRight: {
    top: height * 0.5,
    right: width * 0.2,
    left: 'auto',
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  processingOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
  },
  processingText: {
    ...typography.body1,
    color: colors.white,
    marginTop: spacing.sm,
  },
  instructions: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  instructionText: {
    ...typography.body1,
    color: colors.white,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusText: {
    ...typography.body2,
    marginLeft: spacing.xs,
  },
  offlineNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  locationError: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  locationSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  locationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginLeft: spacing.xs,
  },
  successText: {
    ...typography.caption,
    color: colors.success,
    marginLeft: spacing.xs,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  retryButton: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  retryText: {
    ...typography.caption,
    color: colors.white,
  },
  securityIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  securityText: {
    ...typography.caption,
    color: colors.primary,
    marginLeft: spacing.xs,
  },
});

export default QRCodeScanner;
