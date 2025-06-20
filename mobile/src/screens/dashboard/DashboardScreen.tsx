import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Chip,
  Surface,
  Text,
  IconButton,
  ProgressBar,
} from 'react-native-paper';
import { useSelector, useDispatch } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { RootState, AppDispatch } from '../../store';
import { fetchCurrentShift, fetchMyShifts, clockIn, clockOut } from '../../store/slices/shiftSlice';
import { getCurrentLocation, requestLocationPermission } from '../../store/slices/locationSlice';
import { theme } from '../../theme';
import LoadingScreen from '../../components/LoadingScreen';
import QuickActionCard from '../../components/QuickActionCard';
import ShiftStatusCard from '../../components/ShiftStatusCard';
import LocationStatusCard from '../../components/LocationStatusCard';

const DashboardScreen = ({ navigation }: any) => {
  const dispatch = useDispatch<AppDispatch>();
  const [refreshing, setRefreshing] = useState(false);

  const { user } = useSelector((state: RootState) => state.auth);
  const { 
    currentShift, 
    upcomingShifts, 
    isLoading: shiftLoading, 
    clockInStatus,
    error: shiftError 
  } = useSelector((state: RootState) => state.shift);
  const { 
    currentLocation, 
    hasLocationPermission, 
    geofenceStatus,
    isTracking 
  } = useSelector((state: RootState) => state.location);

  useFocusEffect(
    React.useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    try {
      await Promise.all([
        dispatch(fetchCurrentShift()),
        dispatch(fetchMyShifts()),
        hasLocationPermission && dispatch(getCurrentLocation()),
      ]);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleClockIn = async () => {
    if (!currentShift) {
      Alert.alert('Error', 'No active shift found');
      return;
    }

    if (!hasLocationPermission) {
      const result = await dispatch(requestLocationPermission());
      if (!result.payload) {
        Alert.alert('Permission Required', 'Location permission is required to clock in');
        return;
      }
    }

    if (!currentLocation) {
      Alert.alert('Location Required', 'Please wait for location to be detected');
      return;
    }

    try {
      await dispatch(clockIn({
        shiftId: currentShift.id,
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
      }));
      Alert.alert('Success', 'Clocked in successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to clock in');
    }
  };

  const handleClockOut = async () => {
    if (!currentShift?.id) {
      Alert.alert('Error', 'No active shift found');
      return;
    }

    if (!currentLocation) {
      Alert.alert('Location Required', 'Please wait for location to be detected');
      return;
    }

    try {
      await dispatch(clockOut({
        shiftId: currentShift.id,
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
      }));
      Alert.alert('Success', 'Clocked out successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to clock out');
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getShiftStatusColor = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS': return theme.colors.primary;
      case 'COMPLETED': return theme.colors.success;
      case 'SCHEDULED': return theme.colors.warning;
      default: return theme.colors.outline;
    }
  };

  if (shiftLoading && !currentShift) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <Surface style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text variant="headlineSmall" style={styles.greeting}>
              {getGreeting()}, {user?.profile?.firstName || user?.username}!
            </Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Text>
          </View>
          <IconButton
            icon="cog"
            size={24}
            onPress={() => navigation.navigate('Settings')}
          />
        </View>
      </Surface>

      {/* Current Shift Status */}
      <ShiftStatusCard
        shift={currentShift}
        clockInStatus={clockInStatus}
        onClockIn={handleClockIn}
        onClockOut={handleClockOut}
        onViewDetails={() => currentShift && navigation.navigate('ShiftDetails', { shiftId: currentShift.id })}
      />

      {/* Location Status */}
      <LocationStatusCard
        currentLocation={currentLocation}
        geofenceStatus={geofenceStatus}
        isTracking={isTracking}
        hasPermission={hasLocationPermission}
        onRequestPermission={() => dispatch(requestLocationPermission())}
        onViewMap={() => navigation.navigate('Map', { siteId: currentShift?.siteId })}
      />

      {/* Quick Actions */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Quick Actions</Title>
          <View style={styles.quickActions}>
            <QuickActionCard
              icon="file-document-plus"
              title="Create Report"
              subtitle="Submit incident or patrol report"
              onPress={() => navigation.navigate('CreateReport', { shiftId: currentShift?.id })}
            />
            <QuickActionCard
              icon="calendar-clock"
              title="View Shifts"
              subtitle="Check upcoming shifts"
              onPress={() => navigation.navigate('Shifts')}
            />
            <QuickActionCard
              icon="map-marker"
              title="Site Map"
              subtitle="View site location"
              onPress={() => navigation.navigate('Map', { siteId: currentShift?.siteId })}
            />
            <QuickActionCard
              icon="file-document"
              title="My Reports"
              subtitle="View submitted reports"
              onPress={() => navigation.navigate('Reports')}
            />
          </View>
        </Card.Content>
      </Card>

      {/* Upcoming Shifts */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <Title>Upcoming Shifts</Title>
            <Button
              mode="text"
              onPress={() => navigation.navigate('Shifts')}
            >
              View All
            </Button>
          </View>
          {upcomingShifts.length === 0 ? (
            <Paragraph style={styles.emptyText}>
              No upcoming shifts scheduled
            </Paragraph>
          ) : (
            upcomingShifts.slice(0, 3).map((shift) => (
              <Surface key={shift.id} style={styles.shiftItem}>
                <View style={styles.shiftInfo}>
                  <Text variant="titleMedium">{shift.site.name}</Text>
                  <Text variant="bodyMedium" style={styles.shiftTime}>
                    {new Date(shift.startTime).toLocaleDateString()} • {' '}
                    {new Date(shift.startTime).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })} - {' '}
                    {new Date(shift.endTime).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </Text>
                  <Text variant="bodySmall" style={styles.clientName}>
                    {shift.site.client.companyName}
                  </Text>
                </View>
                <View style={styles.shiftActions}>
                  <Chip
                    mode="outlined"
                    style={[styles.statusChip, { borderColor: getShiftStatusColor(shift.status) }]}
                  >
                    {shift.status}
                  </Chip>
                  <IconButton
                    icon="chevron-right"
                    size={20}
                    onPress={() => navigation.navigate('ShiftDetails', { shiftId: shift.id })}
                  />
                </View>
              </Surface>
            ))
          )}
        </Card.Content>
      </Card>

      {/* Performance Summary */}
      {user?.agent?.performanceMetrics && (
        <Card style={styles.card}>
          <Card.Content>
            <Title>Performance Summary</Title>
            <View style={styles.performanceGrid}>
              <View style={styles.performanceItem}>
                <Text variant="headlineMedium" style={styles.performanceValue}>
                  {user.agent.performanceMetrics.shiftsCompleted || 0}
                </Text>
                <Text variant="bodySmall">Shifts Completed</Text>
              </View>
              <View style={styles.performanceItem}>
                <Text variant="headlineMedium" style={styles.performanceValue}>
                  {user.agent.performanceMetrics.reportsSubmitted || 0}
                </Text>
                <Text variant="bodySmall">Reports Submitted</Text>
              </View>
              <View style={styles.performanceItem}>
                <Text variant="headlineMedium" style={styles.performanceValue}>
                  {user.agent.performanceMetrics.attendanceRate || 0}%
                </Text>
                <Text variant="bodySmall">Attendance Rate</Text>
              </View>
            </View>
            {user.agent.performanceMetrics.overallRating && (
              <View style={styles.ratingContainer}>
                <Text variant="bodyMedium">Overall Rating</Text>
                <ProgressBar
                  progress={user.agent.performanceMetrics.overallRating / 5}
                  color={theme.colors.primary}
                  style={styles.ratingBar}
                />
                <Text variant="bodySmall">
                  {user.agent.performanceMetrics.overallRating}/5.0
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontWeight: 'bold',
  },
  subtitle: {
    opacity: 0.7,
    marginTop: 4,
  },
  card: {
    margin: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  shiftItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  shiftInfo: {
    flex: 1,
  },
  shiftTime: {
    marginTop: 4,
    opacity: 0.7,
  },
  clientName: {
    marginTop: 2,
    opacity: 0.5,
  },
  shiftActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusChip: {
    marginRight: 8,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.6,
    marginVertical: 16,
  },
  performanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  performanceItem: {
    alignItems: 'center',
  },
  performanceValue: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  ratingContainer: {
    marginTop: 16,
  },
  ratingBar: {
    marginVertical: 8,
    height: 8,
  },
});

export default DashboardScreen;
