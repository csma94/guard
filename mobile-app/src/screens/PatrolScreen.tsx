import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/Card';
import { colors, typography, spacing } from '../theme';

interface Patrol {
  id: string;
  siteId: string;
  siteName: string;
  scheduledTime: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED';
  checkpoints: Checkpoint[];
  notes?: string;
  duration?: number;
}

interface Checkpoint {
  id: string;
  name: string;
  location: string;
  qrCode: string;
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  completedAt?: string;
  notes?: string;
}

const PatrolScreen: React.FC = () => {
  const { getToken } = useAuth();
  
  // State management
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [activePatrol, setActivePatrol] = useState<Patrol | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data fetching
  const fetchPatrols = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/patrols`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch patrols');
      }

      const result = await response.json();
      setPatrols(result.data || []);

      // Check for active patrol
      const active = result.data?.find((patrol: Patrol) => patrol.status === 'IN_PROGRESS');
      setActivePatrol(active || null);

    } catch (err: any) {
      console.error('Failed to fetch patrols:', err);
      setError('Failed to load patrols. Please check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPatrols();
  }, [fetchPatrols]);

  // Patrol actions
  const startPatrol = async (patrolId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/patrols/${patrolId}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to start patrol');
      }

      Alert.alert('Success', 'Patrol started successfully');
      fetchPatrols();

    } catch (err: any) {
      console.error('Failed to start patrol:', err);
      Alert.alert('Error', 'Failed to start patrol. Please try again.');
    }
  };

  const completePatrol = async (patrolId: string) => {
    Alert.alert(
      'Complete Patrol',
      'Are you sure you want to complete this patrol?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Complete', 
          onPress: async () => {
            try {
              const token = await getToken();
              if (!token) {
                throw new Error('No authentication token available');
              }

              const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/patrols/${patrolId}/complete`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error('Failed to complete patrol');
              }

              Alert.alert('Success', 'Patrol completed successfully');
              fetchPatrols();

            } catch (err: any) {
              console.error('Failed to complete patrol:', err);
              Alert.alert('Error', 'Failed to complete patrol. Please try again.');
            }
          }
        }
      ]
    );
  };

  const scanCheckpoint = (checkpointId: string) => {
    // Navigate to QR scanner
    Alert.alert('QR Scanner', 'QR code scanning functionality would be implemented here');
  };

  // Utility functions
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return colors.success;
      case 'IN_PROGRESS':
        return colors.info;
      case 'MISSED':
        return colors.error;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'check-circle';
      case 'IN_PROGRESS':
        return 'play-circle-filled';
      case 'MISSED':
        return 'error';
      default:
        return 'schedule';
    }
  };

  // Effects
  useEffect(() => {
    fetchPatrols();
  }, [fetchPatrols]);

  // Render functions
  const renderPatrolCard = ({ item }: { item: Patrol }) => (
    <Card style={styles.patrolCard}>
      <View style={styles.patrolHeader}>
        <View style={styles.patrolInfo}>
          <Text style={styles.siteName}>{item.siteName}</Text>
          <Text style={styles.scheduledTime}>
            Scheduled: {formatTime(item.scheduledTime)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Icon name={getStatusIcon(item.status)} size={16} color={colors.white} />
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.checkpointInfo}>
        <Text style={styles.checkpointText}>
          Checkpoints: {item.checkpoints.filter(c => c.status === 'COMPLETED').length}/{item.checkpoints.length}
        </Text>
        {item.duration && (
          <Text style={styles.durationText}>
            Duration: {Math.round(item.duration / 60)}min
          </Text>
        )}
      </View>

      <View style={styles.patrolActions}>
        {item.status === 'SCHEDULED' && (
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => startPatrol(item.id)}
          >
            <Icon name="play-arrow" size={20} color={colors.white} />
            <Text style={styles.buttonText}>Start Patrol</Text>
          </TouchableOpacity>
        )}
        
        {item.status === 'IN_PROGRESS' && (
          <>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => scanCheckpoint(item.checkpoints.find(c => c.status === 'PENDING')?.id || '')}
            >
              <Icon name="qr-code-scanner" size={20} color={colors.white} />
              <Text style={styles.buttonText}>Scan Checkpoint</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.completeButton}
              onPress={() => completePatrol(item.id)}
            >
              <Icon name="check" size={20} color={colors.white} />
              <Text style={styles.buttonText}>Complete</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {item.notes && (
        <View style={styles.notesSection}>
          <Text style={styles.notesLabel}>Notes:</Text>
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      )}
    </Card>
  );

  const renderActivePatrol = () => {
    if (!activePatrol) return null;

    return (
      <Card style={styles.activePatrolCard}>
        <View style={styles.activePatrolHeader}>
          <Icon name="security" size={24} color={colors.primary} />
          <Text style={styles.activePatrolTitle}>Active Patrol</Text>
        </View>
        
        <Text style={styles.activePatrolSite}>{activePatrol.siteName}</Text>
        
        <View style={styles.checkpointsList}>
          {activePatrol.checkpoints.map((checkpoint) => (
            <View key={checkpoint.id} style={styles.checkpointItem}>
              <Icon 
                name={checkpoint.status === 'COMPLETED' ? 'check-circle' : 'radio-button-unchecked'} 
                size={20} 
                color={checkpoint.status === 'COMPLETED' ? colors.success : colors.textSecondary} 
              />
              <Text style={[
                styles.checkpointName,
                checkpoint.status === 'COMPLETED' && styles.completedCheckpoint
              ]}>
                {checkpoint.name}
              </Text>
              {checkpoint.status === 'PENDING' && (
                <TouchableOpacity
                  style={styles.scanIconButton}
                  onPress={() => scanCheckpoint(checkpoint.id)}
                >
                  <Icon name="qr-code-scanner" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Patrols</Text>
        <TouchableOpacity onPress={fetchPatrols} style={styles.refreshButton}>
          <Icon name="refresh" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchPatrols} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {renderActivePatrol()}

        <View style={styles.patrolsSection}>
          <Text style={styles.sectionTitle}>All Patrols</Text>
          <FlatList
            data={patrols}
            renderItem={renderPatrolCard}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  refreshButton: {
    padding: spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  errorContainer: {
    backgroundColor: colors.error,
    padding: spacing.md,
    margin: spacing.lg,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: colors.white,
    flex: 1,
  },
  retryButton: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 4,
  },
  retryText: {
    color: colors.error,
    fontWeight: typography.weights.semibold,
  },
  activePatrolCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary,
    borderWidth: 1,
  },
  activePatrolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  activePatrolTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  activePatrolSite: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  checkpointsList: {
    gap: spacing.sm,
  },
  checkpointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkpointName: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  completedCheckpoint: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  scanIconButton: {
    padding: spacing.xs,
  },
  patrolsSection: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  patrolCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  patrolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  patrolInfo: {
    flex: 1,
  },
  siteName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  scheduledTime: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    gap: spacing.xs,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    color: colors.white,
    fontWeight: typography.weights.semibold,
  },
  checkpointInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  checkpointText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  durationText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  patrolActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  startButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    gap: spacing.xs,
  },
  scanButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.info,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    gap: spacing.xs,
  },
  completeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    gap: spacing.xs,
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  notesSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notesLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  notesText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
});

export default PatrolScreen;
