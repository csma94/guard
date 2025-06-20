import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Title, Paragraph, Button, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';

interface LocationStatusCardProps {
  currentLocation: any;
  geofenceStatus: any;
  isTracking: boolean;
  hasPermission: boolean;
  onRequestPermission: () => void;
  onViewMap: () => void;
}

const LocationStatusCard: React.FC<LocationStatusCardProps> = ({
  currentLocation,
  geofenceStatus,
  isTracking,
  hasPermission,
  onRequestPermission,
  onViewMap,
}) => {
  const getLocationStatusColor = () => {
    if (!hasPermission) return theme.colors.error;
    if (!currentLocation) return theme.colors.warning;
    if (geofenceStatus?.isWithin) return theme.colors.success;
    return theme.colors.warning;
  };

  const getLocationStatusText = () => {
    if (!hasPermission) return 'Permission Required';
    if (!currentLocation) return 'Location Not Available';
    if (geofenceStatus?.isWithin) return 'Within Site Boundary';
    if (geofenceStatus) return 'Outside Site Boundary';
    return 'Location Available';
  };

  const getLocationIcon = () => {
    if (!hasPermission) return 'map-marker-off';
    if (!currentLocation) return 'map-marker-question';
    if (geofenceStatus?.isWithin) return 'map-marker-check';
    if (geofenceStatus) return 'map-marker-alert';
    return 'map-marker';
  };

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <Title style={styles.title}>Location Status</Title>
          <Chip 
            icon={getLocationIcon()}
            style={[styles.statusChip, { backgroundColor: getLocationStatusColor() + '20' }]}
            textStyle={{ color: getLocationStatusColor() }}
          >
            {getLocationStatusText()}
          </Chip>
        </View>

        {!hasPermission && (
          <View style={styles.permissionSection}>
            <Paragraph style={styles.permissionText}>
              Location permission is required for shift tracking and geofencing
            </Paragraph>
            <Button
              mode="contained"
              onPress={onRequestPermission}
              style={styles.permissionButton}
              icon="map-marker"
            >
              Grant Permission
            </Button>
          </View>
        )}

        {hasPermission && currentLocation && (
          <View style={styles.locationInfo}>
            <View style={styles.infoRow}>
              <Icon name="crosshairs-gps" size={16} color={theme.colors.outline} />
              <Paragraph style={styles.infoText}>
                {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
              </Paragraph>
            </View>
            
            <View style={styles.infoRow}>
              <Icon name="target" size={16} color={theme.colors.outline} />
              <Paragraph style={styles.infoText}>
                Accuracy: ±{Math.round(currentLocation.accuracy || 0)}m
              </Paragraph>
            </View>

            {isTracking && (
              <View style={styles.trackingInfo}>
                <Icon name="radar" size={16} color={theme.colors.success} />
                <Paragraph style={styles.trackingText}>
                  Location tracking active
                </Paragraph>
              </View>
            )}

            {geofenceStatus && (
              <View style={styles.geofenceInfo}>
                <View style={styles.infoRow}>
                  <Icon name="map-marker-distance" size={16} color={theme.colors.outline} />
                  <Paragraph style={styles.infoText}>
                    Distance to {geofenceStatus.siteName}: {Math.round(geofenceStatus.distance)}m
                  </Paragraph>
                </View>
              </View>
            )}
          </View>
        )}

        {hasPermission && !currentLocation && (
          <View style={styles.noLocationSection}>
            <Icon name="map-marker-question" size={32} color={theme.colors.warning} />
            <Paragraph style={styles.noLocationText}>
              Waiting for location signal...
            </Paragraph>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={onViewMap}
            style={styles.actionButton}
            icon="map"
            disabled={!currentLocation}
          >
            View Map
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    margin: 16,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusChip: {
    marginLeft: 8,
  },
  permissionSection: {
    alignItems: 'center',
    padding: 16,
  },
  permissionText: {
    fontSize: 14,
    color: theme.colors.outline,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    marginTop: 8,
  },
  locationInfo: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  trackingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: theme.colors.success + '10',
    borderRadius: 8,
  },
  trackingText: {
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.success,
    fontWeight: '500',
  },
  geofenceInfo: {
    marginTop: 8,
    padding: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
  },
  noLocationSection: {
    alignItems: 'center',
    padding: 16,
  },
  noLocationText: {
    fontSize: 14,
    color: theme.colors.warning,
    textAlign: 'center',
    marginTop: 8,
  },
  actions: {
    marginTop: 8,
  },
  actionButton: {
    width: '100%',
  },
});

export default LocationStatusCard;
