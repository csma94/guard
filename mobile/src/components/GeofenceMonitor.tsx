import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Vibration,
  AppState,
} from 'react-native';
import { Card, Title, Chip, Button, ProgressBar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

import { RootState, AppDispatch } from '../store';
import { 
  validateGeofence, 
  submitLocationUpdate, 
  updateCurrentLocation,
  setGeofenceStatus 
} from '../store/slices/locationSlice';
import { theme } from '../theme';
import { logger } from '../utils/logger';

interface GeofenceMonitorProps {
  siteId?: string;
  siteName?: string;
  geofenceRadius?: number;
  centerLatitude?: number;
  centerLongitude?: number;
  onGeofenceViolation?: (violation: any) => void;
  onGeofenceEntry?: () => void;
  onGeofenceExit?: () => void;
  style?: any;
}

const LOCATION_TASK_NAME = 'background-location-task';
const GEOFENCE_CHECK_INTERVAL = 30000; // 30 seconds

// Register background task
TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    logger.error('Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data as any;
    logger.info('Background location update:', locations);
    // Handle background location updates
  }
});

const GeofenceMonitor: React.FC<GeofenceMonitorProps> = ({
  siteId,
  siteName,
  geofenceRadius = 100, // 100 meters default
  centerLatitude,
  centerLongitude,
  onGeofenceViolation,
  onGeofenceEntry,
  onGeofenceExit,
  style,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { 
    currentLocation, 
    geofenceStatus, 
    isTracking,
    hasLocationPermission 
  } = useSelector((state: RootState) => state.location);
  const { currentShift } = useSelector((state: RootState) => state.shift);

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [lastViolationTime, setLastViolationTime] = useState<Date | null>(null);
  const [monitoringStartTime, setMonitoringStartTime] = useState<Date | null>(null);

  const monitoringInterval = useRef<NodeJS.Timeout>();
  const lastGeofenceStatus = useRef<boolean | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    if (isMonitoring && currentLocation && centerLatitude && centerLongitude) {
      checkGeofenceStatus();
    }
  }, [currentLocation, isMonitoring, centerLatitude, centerLongitude]);

  useEffect(() => {
    if (currentShift && siteId) {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [currentShift, siteId]);

  const handleAppStateChange = (nextAppState: string) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App has come to the foreground
      if (isMonitoring) {
        resumeMonitoring();
      }
    }
    appState.current = nextAppState;
  };

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const checkGeofenceStatus = async () => {
    if (!currentLocation || !centerLatitude || !centerLongitude) return;

    const distance = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      centerLatitude,
      centerLongitude
    );

    const isWithinGeofence = distance <= geofenceRadius;
    const wasWithinGeofence = lastGeofenceStatus.current;

    // Update geofence status
    const newGeofenceStatus = {
      isWithin: isWithinGeofence,
      distance: Math.round(distance),
      siteId: siteId || '',
      siteName: siteName || '',
    };

    dispatch(setGeofenceStatus(newGeofenceStatus));

    // Check for geofence transitions
    if (wasWithinGeofence !== null && wasWithinGeofence !== isWithinGeofence) {
      if (isWithinGeofence) {
        handleGeofenceEntry();
      } else {
        handleGeofenceExit();
      }
    }

    // Check for violations (outside geofence during active shift)
    if (!isWithinGeofence && currentShift?.status === 'IN_PROGRESS') {
      handleGeofenceViolation(distance);
    }

    lastGeofenceStatus.current = isWithinGeofence;

    // Validate with server
    if (siteId) {
      try {
        await dispatch(validateGeofence({
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          siteId,
        }));
      } catch (error) {
        logger.error('Geofence validation failed:', error);
      }
    }
  };

  const handleGeofenceEntry = () => {
    logger.info('Geofence entry detected');
    Vibration.vibrate([0, 200, 100, 200]);
    onGeofenceEntry?.();
  };

  const handleGeofenceExit = () => {
    logger.info('Geofence exit detected');
    Vibration.vibrate([0, 500, 200, 500]);
    onGeofenceExit?.();
    
    if (currentShift?.status === 'IN_PROGRESS') {
      Alert.alert(
        'Geofence Alert',
        'You have left the designated work area. Please return to your assigned location.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleGeofenceViolation = (distance: number) => {
    const now = new Date();
    const timeSinceLastViolation = lastViolationTime 
      ? now.getTime() - lastViolationTime.getTime()
      : Infinity;

    // Only count as new violation if it's been more than 5 minutes
    if (timeSinceLastViolation > 5 * 60 * 1000) {
      setViolationCount(prev => prev + 1);
      setLastViolationTime(now);

      const violation = {
        timestamp: now.toISOString(),
        distance: Math.round(distance),
        location: currentLocation,
        siteId,
        siteName,
      };

      logger.warn('Geofence violation detected', violation);
      onGeofenceViolation?.(violation);

      // Send violation alert to server
      if (currentShift) {
        dispatch(submitLocationUpdate({
          location: currentLocation!,
          shiftId: currentShift.id,
        }));
      }
    }
  };

  const startMonitoring = async () => {
    if (!hasLocationPermission) {
      Alert.alert(
        'Permission Required',
        'Location permission is required for geofence monitoring'
      );
      return;
    }

    setIsMonitoring(true);
    setMonitoringStartTime(new Date());
    setViolationCount(0);
    setLastViolationTime(null);

    // Start background location updates
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: GEOFENCE_CHECK_INTERVAL,
        distanceInterval: 10,
        foregroundService: {
          notificationTitle: 'BahinLink Location Tracking',
          notificationBody: 'Monitoring your location for geofence compliance',
        },
      });

      logger.info('Geofence monitoring started', {
        siteId,
        siteName,
        radius: geofenceRadius,
      });
    } catch (error) {
      logger.error('Failed to start background location updates:', error);
    }
  };

  const stopMonitoring = async () => {
    setIsMonitoring(false);
    setMonitoringStartTime(null);
    lastGeofenceStatus.current = null;

    if (monitoringInterval.current) {
      clearInterval(monitoringInterval.current);
    }

    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      logger.info('Geofence monitoring stopped');
    } catch (error) {
      logger.error('Failed to stop background location updates:', error);
    }
  };

  const resumeMonitoring = () => {
    if (isMonitoring && currentLocation) {
      checkGeofenceStatus();
    }
  };

  const getStatusColor = () => {
    if (!geofenceStatus) return theme.colors.outline;
    return geofenceStatus.isWithin ? theme.colors.success : theme.colors.error;
  };

  const getStatusIcon = () => {
    if (!geofenceStatus) return 'map-marker-question';
    return geofenceStatus.isWithin ? 'map-marker-check' : 'map-marker-alert';
  };

  const getStatusText = () => {
    if (!geofenceStatus) return 'Unknown';
    return geofenceStatus.isWithin ? 'Inside Geofence' : 'Outside Geofence';
  };

  const formatDuration = (startTime: Date) => {
    const now = new Date();
    const diff = now.getTime() - startTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <Card style={[styles.container, style]}>
      <Card.Content>
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Title style={styles.title}>Geofence Monitor</Title>
            {siteName && (
              <Text style={styles.siteName}>{siteName}</Text>
            )}
          </View>
          <Chip
            icon={getStatusIcon()}
            style={[styles.statusChip, { backgroundColor: getStatusColor() + '20' }]}
            textStyle={{ color: getStatusColor() }}
          >
            {getStatusText()}
          </Chip>
        </View>

        {geofenceStatus && (
          <View style={styles.statusDetails}>
            <View style={styles.statusRow}>
              <Icon name="map-marker-distance" size={16} color={theme.colors.outline} />
              <Text style={styles.statusText}>
                Distance: {geofenceStatus.distance}m
              </Text>
            </View>
            
            <View style={styles.statusRow}>
              <Icon name="shield-check" size={16} color={theme.colors.outline} />
              <Text style={styles.statusText}>
                Radius: {geofenceRadius}m
              </Text>
            </View>
          </View>
        )}

        {isMonitoring && (
          <View style={styles.monitoringInfo}>
            <View style={styles.monitoringRow}>
              <Text style={styles.monitoringLabel}>Monitoring Time:</Text>
              <Text style={styles.monitoringValue}>
                {monitoringStartTime ? formatDuration(monitoringStartTime) : '0h 0m'}
              </Text>
            </View>
            
            <View style={styles.monitoringRow}>
              <Text style={styles.monitoringLabel}>Violations:</Text>
              <Text style={[
                styles.monitoringValue,
                { color: violationCount > 0 ? theme.colors.error : theme.colors.success }
              ]}>
                {violationCount}
              </Text>
            </View>
          </View>
        )}

        {!isMonitoring && siteId && (
          <Button
            mode="outlined"
            onPress={startMonitoring}
            icon="play"
            style={styles.actionButton}
          >
            Start Monitoring
          </Button>
        )}

        {isMonitoring && (
          <Button
            mode="outlined"
            onPress={stopMonitoring}
            icon="stop"
            style={styles.actionButton}
          >
            Stop Monitoring
          </Button>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    marginBottom: 4,
  },
  siteName: {
    fontSize: 14,
    color: theme.colors.outline,
  },
  statusChip: {
    marginLeft: 8,
  },
  statusDetails: {
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  monitoringInfo: {
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  monitoringRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  monitoringLabel: {
    fontSize: 14,
    color: theme.colors.outline,
  },
  monitoringValue: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.onSurface,
  },
  actionButton: {
    marginTop: 8,
  },
});

export default GeofenceMonitor;
