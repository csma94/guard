import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Chip,
  List,
  ProgressBar,
  IconButton,
  Divider,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import NetInfo from '@react-native-community/netinfo';

import { theme } from '../theme';
import offlineStorageService from '../services/offlineStorageService';
import syncService, { SyncResult } from '../services/syncService';
import { logger } from '../utils/logger';

interface QueueStats {
  unsyncedRecords: number;
  cachedItems: number;
  conflicts: number;
  totalSize: number;
}

interface OfflineQueueManagerProps {
  style?: any;
  onSyncComplete?: (result: SyncResult) => void;
}

const OfflineQueueManager: React.FC<OfflineQueueManagerProps> = ({
  style,
  onSyncComplete,
}) => {
  const [stats, setStats] = useState<QueueStats>({
    unsyncedRecords: 0,
    cachedItems: 0,
    conflicts: 0,
    totalSize: 0,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    loadStats();
    setupNetworkListener();
    setupSyncListener();
    
    return () => {
      // Cleanup listeners
    };
  }, []);

  const setupNetworkListener = () => {
    NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected && state.isInternetReachable);
    });
  };

  const setupSyncListener = () => {
    const unsubscribe = syncService.onSyncEvent((event: string, data: any) => {
      switch (event) {
        case 'sync_started':
          setIsSyncing(true);
          setSyncProgress(0);
          setSyncResult(null);
          break;
          
        case 'sync_progress':
          setSyncProgress(data.progress || 0);
          break;
          
        case 'sync_completed':
          setIsSyncing(false);
          setSyncProgress(100);
          setSyncResult(data);
          setLastSyncTime(new Date());
          loadStats();
          onSyncComplete?.(data);
          break;
          
        case 'sync_failed':
          setIsSyncing(false);
          setSyncProgress(0);
          setSyncResult(data);
          break;
      }
    });

    return unsubscribe;
  };

  const loadStats = async () => {
    try {
      const storageStats = await offlineStorageService.getStorageStats();
      setStats(storageStats);
      
      const lastSync = syncService.getLastSyncTime();
      setLastSyncTime(lastSync);
    } catch (error) {
      logger.error('Failed to load queue stats:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const handleSyncNow = async () => {
    if (!isConnected) {
      Alert.alert(
        'No Connection',
        'Internet connection is required to sync data. Please check your connection and try again.'
      );
      return;
    }

    if (isSyncing) {
      Alert.alert('Sync in Progress', 'Data synchronization is already in progress.');
      return;
    }

    try {
      const result = await syncService.triggerSync({ priorityOnly: false });
      
      if (result.success) {
        Alert.alert(
          'Sync Complete',
          `Successfully synced ${result.syncedRecords} records.`
        );
      } else {
        Alert.alert(
          'Sync Issues',
          `Synced ${result.syncedRecords} records, but ${result.failedRecords} failed. ${result.conflicts} conflicts detected.`
        );
      }
    } catch (error) {
      Alert.alert('Sync Failed', 'Failed to synchronize data. Please try again.');
    }
  };

  const handleSyncPriority = async () => {
    if (!isConnected) {
      Alert.alert('No Connection', 'Internet connection is required to sync data.');
      return;
    }

    try {
      await syncService.triggerSync({ priorityOnly: true });
    } catch (error) {
      Alert.alert('Sync Failed', 'Failed to sync priority data.');
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will remove all cached data. Unsynced changes will be preserved. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await offlineStorageService.cleanupExpiredData();
              await loadStats();
              Alert.alert('Success', 'Cache cleared successfully.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear cache.');
            }
          },
        },
      ]
    );
  };

  const getConnectionStatusColor = () => {
    return isConnected ? theme.colors.success : theme.colors.error;
  };

  const getConnectionStatusIcon = () => {
    return isConnected ? 'wifi' : 'wifi-off';
  };

  const getConnectionStatusText = () => {
    return isConnected ? 'Connected' : 'Offline';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return theme.colors.error;
      case 'HIGH': return theme.colors.warning;
      case 'NORMAL': return theme.colors.primary;
      case 'LOW': return theme.colors.outline;
      default: return theme.colors.outline;
    }
  };

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return 'Never';
    
    const now = new Date();
    const diff = now.getTime() - lastSyncTime.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  return (
    <ScrollView
      style={[styles.container, style]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Connection Status */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.statusHeader}>
            <View style={styles.statusInfo}>
              <Title style={styles.statusTitle}>Connection Status</Title>
              <View style={styles.statusRow}>
                <Icon 
                  name={getConnectionStatusIcon()} 
                  size={20} 
                  color={getConnectionStatusColor()} 
                />
                <Text style={[styles.statusText, { color: getConnectionStatusColor() }]}>
                  {getConnectionStatusText()}
                </Text>
              </View>
            </View>
            <Chip
              icon={getConnectionStatusIcon()}
              style={[styles.statusChip, { backgroundColor: getConnectionStatusColor() + '20' }]}
              textStyle={{ color: getConnectionStatusColor() }}
            >
              {getConnectionStatusText()}
            </Chip>
          </View>
        </Card.Content>
      </Card>

      {/* Queue Statistics */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Offline Queue</Title>
          
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.unsyncedRecords}</Text>
              <Text style={styles.statLabel}>Pending Sync</Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.cachedItems}</Text>
              <Text style={styles.statLabel}>Cached Items</Text>
            </View>
            
            <View style={styles.statItem}>
              <Text style={[
                styles.statNumber,
                { color: stats.conflicts > 0 ? theme.colors.error : theme.colors.onSurface }
              ]}>
                {stats.conflicts}
              </Text>
              <Text style={styles.statLabel}>Conflicts</Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.syncInfo}>
            <Text style={styles.syncLabel}>Last Sync:</Text>
            <Text style={styles.syncTime}>{formatLastSyncTime()}</Text>
          </View>

          {isSyncing && (
            <View style={styles.syncProgress}>
              <Text style={styles.syncProgressText}>Syncing...</Text>
              <ProgressBar
                progress={syncProgress / 100}
                color={theme.colors.primary}
                style={styles.progressBar}
              />
            </View>
          )}

          {syncResult && !isSyncing && (
            <View style={styles.syncResult}>
              <Text style={[
                styles.syncResultText,
                { color: syncResult.success ? theme.colors.success : theme.colors.error }
              ]}>
                {syncResult.success ? 'Sync Successful' : 'Sync Issues'}
              </Text>
              <Text style={styles.syncResultDetails}>
                Synced: {syncResult.syncedRecords}, Failed: {syncResult.failedRecords}, Conflicts: {syncResult.conflicts}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Sync Actions */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Sync Actions</Title>
          
          <View style={styles.actionButtons}>
            <Button
              mode="contained"
              onPress={handleSyncNow}
              disabled={!isConnected || isSyncing}
              loading={isSyncing}
              icon="sync"
              style={styles.actionButton}
            >
              Sync All Data
            </Button>
            
            <Button
              mode="outlined"
              onPress={handleSyncPriority}
              disabled={!isConnected || isSyncing}
              icon="priority-high"
              style={styles.actionButton}
            >
              Sync Priority Only
            </Button>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.utilityActions}>
            <Button
              mode="text"
              onPress={handleClearCache}
              icon="delete-sweep"
              style={styles.utilityButton}
            >
              Clear Cache
            </Button>
            
            <Button
              mode="text"
              onPress={loadStats}
              icon="refresh"
              style={styles.utilityButton}
            >
              Refresh Stats
            </Button>
          </View>
        </Card.Content>
      </Card>

      {/* Conflicts Warning */}
      {stats.conflicts > 0 && (
        <Card style={[styles.card, styles.warningCard]}>
          <Card.Content>
            <View style={styles.warningHeader}>
              <Icon name="alert-circle" size={24} color={theme.colors.error} />
              <Title style={[styles.warningTitle, { color: theme.colors.error }]}>
                Sync Conflicts Detected
              </Title>
            </View>
            
            <Paragraph style={styles.warningText}>
              {stats.conflicts} data conflict{stats.conflicts > 1 ? 's' : ''} require{stats.conflicts === 1 ? 's' : ''} your attention. 
              These occur when the same data has been modified both locally and on the server.
            </Paragraph>
            
            <Button
              mode="outlined"
              onPress={() => {
                // Navigate to conflicts resolution screen
                Alert.alert('Feature Coming Soon', 'Conflict resolution interface will be available in the next update.');
              }}
              icon="account-supervisor"
              style={styles.resolveButton}
            >
              Resolve Conflicts
            </Button>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  warningCard: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  statusChip: {
    marginLeft: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.outline,
    marginTop: 4,
  },
  divider: {
    marginVertical: 16,
  },
  syncInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncLabel: {
    fontSize: 14,
    color: theme.colors.outline,
  },
  syncTime: {
    fontSize: 14,
    color: theme.colors.onSurface,
    fontWeight: '500',
  },
  syncProgress: {
    marginTop: 16,
  },
  syncProgressText: {
    fontSize: 14,
    color: theme.colors.primary,
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
  },
  syncResult: {
    marginTop: 16,
  },
  syncResultText: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  syncResultDetails: {
    fontSize: 12,
    color: theme.colors.outline,
  },
  actionButtons: {
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 8,
  },
  utilityActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  utilityButton: {
    flex: 1,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  warningTitle: {
    marginLeft: 12,
    fontSize: 16,
  },
  warningText: {
    marginBottom: 16,
    color: theme.colors.onSurface,
  },
  resolveButton: {
    borderColor: theme.colors.error,
  },
});

export default OfflineQueueManager;
