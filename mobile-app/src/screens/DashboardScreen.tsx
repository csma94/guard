import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/Card';
import { StatusCard } from '../components/StatusCard';
import { QuickActionButton } from '../components/QuickActionButton';
import { colors, typography, spacing } from '../theme';

const { width } = Dimensions.get('window');

interface DashboardStats {
  currentShift?: {
    id: string;
    siteId: string;
    siteName: string;
    startTime: string;
    endTime: string;
    status: 'ACTIVE' | 'BREAK' | 'COMPLETED';
  };
  todayStats: {
    hoursWorked: number;
    patrolsCompleted: number;
    reportsSubmitted: number;
    incidentsReported: number;
  };
  notifications: {
    unreadCount: number;
    urgentCount: number;
  };
  weather?: {
    temperature: number;
    condition: string;
    icon: string;
  };
}

interface RecentActivity {
  id: string;
  type: 'PATROL' | 'INCIDENT' | 'REPORT' | 'BREAK' | 'CHECKPOINT';
  title: string;
  description: string;
  timestamp: string;
  location?: string;
  status?: string;
}

const DashboardScreen: React.FC = () => {
  const { user, getToken } = useAuth();
  
  // State management
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data fetching functions
  const fetchDashboardData = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [statsResponse, activityResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/dashboard/stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/dashboard/activity`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!statsResponse.ok || !activityResponse.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const statsResult = await statsResponse.json();
      const activityResult = await activityResponse.json();

      setStats(statsResult.data || {
        todayStats: {
          hoursWorked: 0,
          patrolsCompleted: 0,
          reportsSubmitted: 0,
          incidentsReported: 0,
        },
        notifications: {
          unreadCount: 0,
          urgentCount: 0,
        },
      });
      setRecentActivity(activityResult.data || []);

    } catch (err: any) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to load dashboard data. Please check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Quick actions
  const startShift = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/shifts/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to start shift');
      }

      Alert.alert('Success', 'Shift started successfully');
      fetchDashboardData();

    } catch (err: any) {
      console.error('Failed to start shift:', err);
      Alert.alert('Error', 'Failed to start shift. Please try again.');
    }
  };

  const endShift = async () => {
    Alert.alert(
      'End Shift',
      'Are you sure you want to end your current shift?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'End Shift', 
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await getToken();
              if (!token) {
                throw new Error('No authentication token available');
              }

              const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/shifts/end`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error('Failed to end shift');
              }

              Alert.alert('Success', 'Shift ended successfully');
              fetchDashboardData();

            } catch (err: any) {
              console.error('Failed to end shift:', err);
              Alert.alert('Error', 'Failed to end shift. Please try again.');
            }
          }
        }
      ]
    );
  };

  const takeBreak = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/shifts/break`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to start break');
      }

      Alert.alert('Success', 'Break started successfully');
      fetchDashboardData();

    } catch (err: any) {
      console.error('Failed to start break:', err);
      Alert.alert('Error', 'Failed to start break. Please try again.');
    }
  };

  // Utility functions
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'PATROL':
        return 'security';
      case 'INCIDENT':
        return 'warning';
      case 'REPORT':
        return 'assignment';
      case 'BREAK':
        return 'coffee';
      case 'CHECKPOINT':
        return 'location-on';
      default:
        return 'info';
    }
  };

  // Effects
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}</Text>
            <Text style={styles.userName}>{user?.firstName} {user?.lastName}</Text>
          </View>
          <TouchableOpacity style={styles.notificationButton}>
            <Icon name="notifications" size={24} color={colors.primary} />
            {stats?.notifications.unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {stats.notifications.unreadCount > 99 ? '99+' : stats.notifications.unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Current Shift Status */}
        {stats?.currentShift ? (
          <Card style={styles.shiftCard}>
            <View style={styles.shiftHeader}>
              <View style={styles.shiftStatus}>
                <Icon name="work" size={20} color={colors.success} />
                <Text style={styles.shiftStatusText}>On Duty</Text>
              </View>
              <Text style={styles.shiftTime}>
                {formatTime(stats.currentShift.startTime)} - {formatTime(stats.currentShift.endTime)}
              </Text>
            </View>
            <Text style={styles.shiftSite}>{stats.currentShift.siteName}</Text>
            <View style={styles.shiftActions}>
              <TouchableOpacity style={styles.breakButton} onPress={takeBreak}>
                <Icon name="coffee" size={16} color={colors.white} />
                <Text style={styles.breakButtonText}>Take Break</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.endShiftButton} onPress={endShift}>
                <Icon name="stop" size={16} color={colors.white} />
                <Text style={styles.endShiftButtonText}>End Shift</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
          <Card style={styles.noShiftCard}>
            <Icon name="work-off" size={48} color={colors.textSecondary} />
            <Text style={styles.noShiftText}>No Active Shift</Text>
            <TouchableOpacity style={styles.startShiftButton} onPress={startShift}>
              <Icon name="play-arrow" size={20} color={colors.white} />
              <Text style={styles.startShiftButtonText}>Start Shift</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Today's Stats */}
        {stats && (
          <View style={styles.statsContainer}>
            <Text style={styles.sectionTitle}>Today's Activity</Text>
            <View style={styles.statsGrid}>
              <StatusCard
                title="Hours Worked"
                value={formatDuration(stats.todayStats.hoursWorked)}
                icon="schedule"
                color={colors.primary}
              />
              <StatusCard
                title="Patrols"
                value={stats.todayStats.patrolsCompleted.toString()}
                icon="security"
                color={colors.success}
              />
              <StatusCard
                title="Reports"
                value={stats.todayStats.reportsSubmitted.toString()}
                icon="assignment"
                color={colors.info}
              />
              <StatusCard
                title="Incidents"
                value={stats.todayStats.incidentsReported.toString()}
                icon="warning"
                color={colors.warning}
              />
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <QuickActionButton
              title="Start Patrol"
              icon="security"
              color={colors.primary}
              onPress={() => {/* Navigate to patrol screen */}}
            />
            <QuickActionButton
              title="Report Incident"
              icon="warning"
              color={colors.error}
              onPress={() => {/* Navigate to incident report */}}
            />
            <QuickActionButton
              title="Submit Report"
              icon="assignment"
              color={colors.info}
              onPress={() => {/* Navigate to report form */}}
            />
            <QuickActionButton
              title="Check In"
              icon="location-on"
              color={colors.success}
              onPress={() => {/* Navigate to check-in */}}
            />
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.recentActivityContainer}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {recentActivity.length > 0 ? (
            recentActivity.slice(0, 5).map((activity) => (
              <Card key={activity.id} style={styles.activityCard}>
                <View style={styles.activityHeader}>
                  <Icon 
                    name={getActivityIcon(activity.type)} 
                    size={20} 
                    color={colors.primary} 
                  />
                  <Text style={styles.activityTitle}>{activity.title}</Text>
                  <Text style={styles.activityTime}>
                    {formatTime(activity.timestamp)}
                  </Text>
                </View>
                <Text style={styles.activityDescription}>{activity.description}</Text>
                {activity.location && (
                  <Text style={styles.activityLocation}>📍 {activity.location}</Text>
                )}
              </Card>
            ))
          ) : (
            <Card style={styles.noActivityCard}>
              <Icon name="history" size={48} color={colors.textSecondary} />
              <Text style={styles.noActivityText}>No recent activity</Text>
            </Card>
          )}
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
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  greeting: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  userName: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  notificationButton: {
    position: 'relative',
    padding: spacing.sm,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: typography.weights.bold,
  },
  shiftCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  shiftStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shiftStatusText: {
    marginLeft: spacing.xs,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.success,
  },
  shiftTime: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  shiftSite: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  shiftActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  breakButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  breakButtonText: {
    marginLeft: spacing.xs,
    color: colors.white,
    fontWeight: typography.weights.semibold,
  },
  endShiftButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  endShiftButtonText: {
    marginLeft: spacing.xs,
    color: colors.white,
    fontWeight: typography.weights.semibold,
  },
  noShiftCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.xl,
    alignItems: 'center',
  },
  noShiftText: {
    fontSize: typography.sizes.lg,
    color: colors.textSecondary,
    marginVertical: spacing.md,
  },
  startShiftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  startShiftButtonText: {
    marginLeft: spacing.xs,
    color: colors.white,
    fontWeight: typography.weights.semibold,
  },
  statsContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickActionsContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  recentActivityContainer: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  activityCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  activityTitle: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  activityTime: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  activityDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  activityLocation: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  noActivityCard: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  noActivityText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});

export default DashboardScreen;
