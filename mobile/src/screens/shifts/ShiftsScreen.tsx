import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Chip,
  Button,
  FAB,
  Searchbar,
  SegmentedButtons,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';

import { RootState, AppDispatch } from '../../store';
import { fetchMyShifts, clearError } from '../../store/slices/shiftSlice';
import { theme } from '../../theme';
import LoadingScreen from '../../components/LoadingScreen';

interface ShiftsScreenProps {
  navigation: any;
}

const ShiftsScreen: React.FC<ShiftsScreenProps> = ({ navigation }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  const { 
    upcomingShifts, 
    pastShifts, 
    currentShift,
    isLoading, 
    error 
  } = useSelector((state: RootState) => state.shift);

  useFocusEffect(
    React.useCallback(() => {
      loadShifts();
    }, [])
  );

  const loadShifts = async () => {
    try {
      await dispatch(fetchMyShifts()).unwrap();
    } catch (error) {
      console.error('Failed to load shifts:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadShifts();
    setRefreshing(false);
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

  const getShiftStatusIcon = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return 'calendar-clock';
      case 'CONFIRMED': return 'check-circle';
      case 'IN_PROGRESS': return 'play-circle';
      case 'COMPLETED': return 'check-circle-outline';
      case 'CANCELLED': return 'cancel';
      case 'NO_SHOW': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  const formatShiftDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM dd, yyyy');
  };

  const formatShiftTime = (startTime: string, endTime: string) => {
    return `${format(new Date(startTime), 'HH:mm')} - ${format(new Date(endTime), 'HH:mm')}`;
  };

  const getFilteredShifts = () => {
    let shifts = [];
    
    switch (filterType) {
      case 'upcoming':
        shifts = upcomingShifts;
        break;
      case 'past':
        shifts = pastShifts;
        break;
      case 'current':
        shifts = currentShift ? [currentShift] : [];
        break;
      default:
        shifts = [...(currentShift ? [currentShift] : []), ...upcomingShifts, ...pastShifts];
    }

    if (searchQuery) {
      shifts = shifts.filter(shift => 
        shift.site?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shift.site?.client?.companyName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return shifts;
  };

  const renderShiftCard = ({ item: shift }: { item: any }) => (
    <Card style={styles.shiftCard} onPress={() => navigation.navigate('ShiftDetails', { shiftId: shift.id })}>
      <Card.Content>
        <View style={styles.shiftHeader}>
          <View style={styles.shiftInfo}>
            <Title style={styles.siteName}>{shift.site?.name}</Title>
            <Paragraph style={styles.clientName}>{shift.site?.client?.companyName}</Paragraph>
          </View>
          <Chip 
            icon={getShiftStatusIcon(shift.status)}
            style={[styles.statusChip, { backgroundColor: getShiftStatusColor(shift.status) + '20' }]}
            textStyle={{ color: getShiftStatusColor(shift.status) }}
          >
            {shift.status}
          </Chip>
        </View>

        <View style={styles.shiftDetails}>
          <View style={styles.detailRow}>
            <Icon name="calendar" size={16} color={theme.colors.outline} />
            <Text style={styles.detailText}>{formatShiftDate(shift.startTime)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Icon name="clock" size={16} color={theme.colors.outline} />
            <Text style={styles.detailText}>{formatShiftTime(shift.startTime, shift.endTime)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Icon name="map-marker" size={16} color={theme.colors.outline} />
            <Text style={styles.detailText}>{shift.site?.address}</Text>
          </View>
        </View>

        {shift.attendance && (
          <View style={styles.attendanceInfo}>
            <Icon name="check-circle" size={16} color={theme.colors.success} />
            <Text style={styles.attendanceText}>
              Clocked in at {format(new Date(shift.attendance.clockInTime), 'HH:mm')}
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );

  if (isLoading && !refreshing) {
    return <LoadingScreen />;
  }

  const filteredShifts = getFilteredShifts();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Title style={styles.title}>My Shifts</Title>
        <Searchbar
          placeholder="Search shifts..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      <SegmentedButtons
        value={filterType}
        onValueChange={setFilterType}
        buttons={[
          { value: 'all', label: 'All' },
          { value: 'current', label: 'Current' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
        style={styles.segmentedButtons}
      />

      {error && (
        <Card style={styles.errorCard}>
          <Card.Content>
            <Text style={styles.errorText}>{error}</Text>
            <Button onPress={() => dispatch(clearError())}>Dismiss</Button>
          </Card.Content>
        </Card>
      )}

      <FlatList
        data={filteredShifts}
        renderItem={renderShiftCard}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="calendar-blank" size={64} color={theme.colors.outline} />
            <Text style={styles.emptyText}>No shifts found</Text>
            <Text style={styles.emptySubtext}>
              {filterType === 'all' ? 'You have no shifts scheduled' : `No ${filterType} shifts`}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: 16,
    backgroundColor: theme.colors.surface,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  searchbar: {
    marginBottom: 8,
  },
  segmentedButtons: {
    margin: 16,
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
  },
  shiftCard: {
    marginBottom: 12,
    elevation: 2,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  shiftInfo: {
    flex: 1,
  },
  siteName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  clientName: {
    fontSize: 14,
    color: theme.colors.outline,
  },
  statusChip: {
    marginLeft: 8,
  },
  shiftDetails: {
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailText: {
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  attendanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: theme.colors.success + '10',
    borderRadius: 8,
  },
  attendanceText: {
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.success,
    fontWeight: '500',
  },
  errorCard: {
    margin: 16,
    backgroundColor: theme.colors.errorContainer,
  },
  errorText: {
    color: theme.colors.error,
    marginBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    color: theme.colors.onSurface,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.outline,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default ShiftsScreen;
