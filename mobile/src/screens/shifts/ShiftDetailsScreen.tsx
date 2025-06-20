import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Chip,
  Divider,
  List,
  IconButton,
} from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format } from 'date-fns';

import { RootState, AppDispatch } from '../../store';
import { fetchShiftDetails, clockIn, clockOut } from '../../store/slices/shiftSlice';
import { getCurrentLocation } from '../../store/slices/locationSlice';
import { theme } from '../../theme';
import LoadingScreen from '../../components/LoadingScreen';

const ShiftDetailsScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const dispatch = useDispatch<AppDispatch>();
  const { shiftId } = route.params as { shiftId: string };

  const [isClockingIn, setIsClockingIn] = useState(false);
  const [isClockingOut, setIsClockingOut] = useState(false);

  const { currentShift, isLoading, error } = useSelector((state: RootState) => state.shift);
  const { currentLocation } = useSelector((state: RootState) => state.location);

  useEffect(() => {
    loadShiftDetails();
  }, [shiftId]);

  const loadShiftDetails = async () => {
    try {
      await dispatch(fetchShiftDetails(shiftId)).unwrap();
    } catch (error) {
      console.error('Failed to load shift details:', error);
      Alert.alert('Error', 'Failed to load shift details');
    }
  };

  const handleClockIn = async () => {
    if (!currentLocation) {
      Alert.alert('Location Required', 'Please wait for location to be detected');
      return;
    }

    setIsClockingIn(true);
    try {
      await dispatch(clockIn({
        shiftId,
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
      })).unwrap();
      
      Alert.alert('Success', 'Clocked in successfully');
      loadShiftDetails();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to clock in');
    } finally {
      setIsClockingIn(false);
    }
  };

  const handleClockOut = async () => {
    if (!currentLocation) {
      Alert.alert('Location Required', 'Please wait for location to be detected');
      return;
    }

    setIsClockingOut(true);
    try {
      await dispatch(clockOut({
        shiftId,
        location: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
      })).unwrap();
      
      Alert.alert('Success', 'Clocked out successfully');
      loadShiftDetails();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to clock out');
    } finally {
      setIsClockingOut(false);
    }
  };

  const openMaps = () => {
    if (currentShift?.site?.coordinates) {
      const { latitude, longitude } = currentShift.site.coordinates;
      const url = `https://maps.google.com/?q=${latitude},${longitude}`;
      Linking.openURL(url);
    }
  };

  const getShiftStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return theme.colors.primary;
      case 'CONFIRMED': return theme.colors.success;
      case 'IN_PROGRESS': return theme.colors.warning;
      case 'COMPLETED': return theme.colors.success;
      case 'CANCELLED': return theme.colors.error;
      case 'NO_SHOW': return theme.colors.error;
      default: return theme.colors.outline;
    }
  };

  const canClockIn = () => {
    return currentShift?.status === 'CONFIRMED' && !currentShift?.attendance?.clockInTime;
  };

  const canClockOut = () => {
    return currentShift?.status === 'IN_PROGRESS' && 
           currentShift?.attendance?.clockInTime && 
           !currentShift?.attendance?.clockOutTime;
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!currentShift) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={64} color={theme.colors.error} />
        <Text style={styles.errorText}>Shift not found</Text>
        <Button onPress={() => navigation.goBack()}>Go Back</Button>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Shift Header */}
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerContent}>
            <View style={styles.shiftInfo}>
              <Title style={styles.siteName}>{currentShift.site?.name}</Title>
              <Paragraph style={styles.clientName}>
                {currentShift.site?.client?.companyName}
              </Paragraph>
            </View>
            <Chip 
              style={[styles.statusChip, { backgroundColor: getShiftStatusColor(currentShift.status) + '20' }]}
              textStyle={{ color: getShiftStatusColor(currentShift.status) }}
            >
              {currentShift.status}
            </Chip>
          </View>
        </Card.Content>
      </Card>

      {/* Shift Details */}
      <Card style={styles.detailsCard}>
        <Card.Content>
          <Title>Shift Details</Title>
          <Divider style={styles.divider} />
          
          <List.Item
            title="Date"
            description={format(new Date(currentShift.startTime), 'EEEE, MMMM dd, yyyy')}
            left={(props) => <List.Icon {...props} icon="calendar" />}
          />
          
          <List.Item
            title="Time"
            description={`${format(new Date(currentShift.startTime), 'HH:mm')} - ${format(new Date(currentShift.endTime), 'HH:mm')}`}
            left={(props) => <List.Icon {...props} icon="clock" />}
          />
          
          <List.Item
            title="Duration"
            description={`${Math.round((new Date(currentShift.endTime).getTime() - new Date(currentShift.startTime).getTime()) / (1000 * 60 * 60))} hours`}
            left={(props) => <List.Icon {...props} icon="timer" />}
          />
          
          <List.Item
            title="Shift Type"
            description={currentShift.shiftType || 'Regular'}
            left={(props) => <List.Icon {...props} icon="briefcase" />}
          />
        </Card.Content>
      </Card>

      {/* Site Information */}
      <Card style={styles.siteCard}>
        <Card.Content>
          <Title>Site Information</Title>
          <Divider style={styles.divider} />
          
          <List.Item
            title="Address"
            description={currentShift.site?.address}
            left={(props) => <List.Icon {...props} icon="map-marker" />}
            right={(props) => (
              <IconButton
                {...props}
                icon="directions"
                onPress={openMaps}
              />
            )}
          />
          
          {currentShift.site?.contactInfo && (
            <List.Item
              title="Contact"
              description={currentShift.site.contactInfo}
              left={(props) => <List.Icon {...props} icon="phone" />}
            />
          )}
          
          {currentShift.site?.instructions && (
            <List.Item
              title="Instructions"
              description={currentShift.site.instructions}
              left={(props) => <List.Icon {...props} icon="information" />}
            />
          )}
        </Card.Content>
      </Card>

      {/* Attendance Information */}
      {currentShift.attendance && (
        <Card style={styles.attendanceCard}>
          <Card.Content>
            <Title>Attendance</Title>
            <Divider style={styles.divider} />
            
            {currentShift.attendance.clockInTime && (
              <List.Item
                title="Clock In"
                description={format(new Date(currentShift.attendance.clockInTime), 'HH:mm:ss')}
                left={(props) => <List.Icon {...props} icon="login" color={theme.colors.success} />}
              />
            )}
            
            {currentShift.attendance.clockOutTime && (
              <List.Item
                title="Clock Out"
                description={format(new Date(currentShift.attendance.clockOutTime), 'HH:mm:ss')}
                left={(props) => <List.Icon {...props} icon="logout" color={theme.colors.error} />}
              />
            )}
            
            {currentShift.attendance.totalHours && (
              <List.Item
                title="Total Hours"
                description={`${currentShift.attendance.totalHours} hours`}
                left={(props) => <List.Icon {...props} icon="clock-outline" />}
              />
            )}
          </Card.Content>
        </Card>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {canClockIn() && (
          <Button
            mode="contained"
            onPress={handleClockIn}
            loading={isClockingIn}
            disabled={isClockingIn}
            style={styles.actionButton}
            icon="login"
          >
            Clock In
          </Button>
        )}
        
        {canClockOut() && (
          <Button
            mode="contained"
            onPress={handleClockOut}
            loading={isClockingOut}
            disabled={isClockingOut}
            style={styles.actionButton}
            icon="logout"
          >
            Clock Out
          </Button>
        )}
        
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('CreateReport', { shiftId })}
          style={styles.actionButton}
          icon="file-document-plus"
        >
          Create Report
        </Button>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerCard: {
    margin: 16,
    marginBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  shiftInfo: {
    flex: 1,
  },
  siteName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  clientName: {
    fontSize: 16,
    color: theme.colors.outline,
  },
  statusChip: {
    marginLeft: 16,
  },
  detailsCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  siteCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  attendanceCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  divider: {
    marginVertical: 8,
  },
  actionButtons: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 16,
    color: theme.colors.error,
  },
});

export default ShiftDetailsScreen;
