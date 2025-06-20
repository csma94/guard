import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  Card,
  Title,
  Button,
  Switch,
  Chip,
  TimePicker,
  DatePicker,
  List,
  Divider,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';

import { RootState, AppDispatch } from '../store';
import { updateAvailability, getMyAvailability } from '../store/slices/shiftSlice';
import { theme } from '../theme';
import { logger } from '../utils/logger';

interface AvailabilitySlot {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  notes?: string;
}

interface AvailabilityManagerProps {
  style?: any;
}

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const AvailabilityManager: React.FC<AvailabilityManagerProps> = ({ style }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { availability, isLoading } = useSelector((state: RootState) => state.shift);
  const { user } = useSelector((state: RootState) => state.auth);

  const [weeklyAvailability, setWeeklyAvailability] = useState<AvailabilitySlot[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadAvailability();
  }, []);

  useEffect(() => {
    if (availability) {
      setWeeklyAvailability(availability.weeklySlots || getDefaultAvailability());
    }
  }, [availability]);

  const getDefaultAvailability = (): AvailabilitySlot[] => {
    return DAYS_OF_WEEK.map((_, index) => ({
      dayOfWeek: index,
      startTime: '09:00',
      endTime: '17:00',
      isAvailable: index >= 1 && index <= 5, // Monday to Friday by default
    }));
  };

  const loadAvailability = async () => {
    try {
      await dispatch(getMyAvailability()).unwrap();
    } catch (error) {
      logger.error('Failed to load availability:', error);
    }
  };

  const handleToggleDay = (dayIndex: number) => {
    const updated = weeklyAvailability.map((slot, index) =>
      index === dayIndex
        ? { ...slot, isAvailable: !slot.isAvailable }
        : slot
    );
    setWeeklyAvailability(updated);
    setHasChanges(true);
  };

  const handleTimeChange = (dayIndex: number, field: 'startTime' | 'endTime', time: string) => {
    const updated = weeklyAvailability.map((slot, index) =>
      index === dayIndex
        ? { ...slot, [field]: time }
        : slot
    );
    setWeeklyAvailability(updated);
    setHasChanges(true);
  };

  const handleSaveAvailability = async () => {
    try {
      await dispatch(updateAvailability({
        agentId: user?.agent?.id,
        weeklySlots: weeklyAvailability,
        effectiveDate: selectedDate.toISOString(),
      })).unwrap();

      setHasChanges(false);
      setIsEditing(false);
      
      Alert.alert('Success', 'Your availability has been updated successfully');
      logger.info('Availability updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update availability');
      logger.error('Failed to update availability:', error);
    }
  };

  const handleCancelEdit = () => {
    if (hasChanges) {
      Alert.alert(
        'Discard Changes',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setWeeklyAvailability(availability?.weeklySlots || getDefaultAvailability());
              setHasChanges(false);
              setIsEditing(false);
            },
          },
        ]
      );
    } else {
      setIsEditing(false);
    }
  };

  const getAvailabilityStatus = () => {
    const availableDays = weeklyAvailability.filter(slot => slot.isAvailable).length;
    if (availableDays === 0) return { text: 'Not Available', color: theme.colors.error };
    if (availableDays <= 2) return { text: 'Limited Availability', color: theme.colors.warning };
    if (availableDays <= 5) return { text: 'Good Availability', color: theme.colors.success };
    return { text: 'Full Availability', color: theme.colors.success };
  };

  const renderDaySlot = (slot: AvailabilitySlot, index: number) => {
    const dayName = DAYS_OF_WEEK[slot.dayOfWeek];
    const status = getAvailabilityStatus();

    return (
      <Card key={index} style={styles.dayCard}>
        <Card.Content>
          <View style={styles.dayHeader}>
            <View style={styles.dayInfo}>
              <Text style={styles.dayName}>{dayName}</Text>
              {slot.isAvailable && (
                <Text style={styles.timeRange}>
                  {slot.startTime} - {slot.endTime}
                </Text>
              )}
            </View>
            <Switch
              value={slot.isAvailable}
              onValueChange={() => handleToggleDay(index)}
              disabled={!isEditing}
            />
          </View>

          {slot.isAvailable && isEditing && (
            <View style={styles.timeControls}>
              <View style={styles.timeControl}>
                <Text style={styles.timeLabel}>Start Time</Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => {
                    // In a real implementation, you'd show a time picker
                    // For now, we'll use a simple prompt
                    Alert.prompt(
                      'Start Time',
                      'Enter start time (HH:MM)',
                      (text) => {
                        if (text && /^\d{2}:\d{2}$/.test(text)) {
                          handleTimeChange(index, 'startTime', text);
                        }
                      },
                      'plain-text',
                      slot.startTime
                    );
                  }}
                >
                  <Text style={styles.timeButtonText}>{slot.startTime}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.timeControl}>
                <Text style={styles.timeLabel}>End Time</Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => {
                    Alert.prompt(
                      'End Time',
                      'Enter end time (HH:MM)',
                      (text) => {
                        if (text && /^\d{2}:\d{2}$/.test(text)) {
                          handleTimeChange(index, 'endTime', text);
                        }
                      },
                      'plain-text',
                      slot.endTime
                    );
                  }}
                >
                  <Text style={styles.timeButtonText}>{slot.endTime}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!slot.isAvailable && (
            <View style={styles.unavailableIndicator}>
              <Icon name="close-circle" size={16} color={theme.colors.error} />
              <Text style={styles.unavailableText}>Not Available</Text>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const status = getAvailabilityStatus();

  return (
    <View style={[styles.container, style]}>
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.header}>
            <View style={styles.headerInfo}>
              <Title>Weekly Availability</Title>
              <View style={styles.statusContainer}>
                <Chip
                  mode="outlined"
                  style={[styles.statusChip, { borderColor: status.color }]}
                  textStyle={{ color: status.color }}
                >
                  {status.text}
                </Chip>
              </View>
            </View>
            
            {!isEditing ? (
              <Button
                mode="outlined"
                onPress={() => setIsEditing(true)}
                icon="pencil"
              >
                Edit
              </Button>
            ) : (
              <View style={styles.editActions}>
                <Button
                  mode="text"
                  onPress={handleCancelEdit}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSaveAvailability}
                  loading={isLoading}
                  disabled={isLoading || !hasChanges}
                  icon="check"
                >
                  Save
                </Button>
              </View>
            )}
          </View>

          {isEditing && (
            <Text style={styles.editNote}>
              Toggle days on/off and adjust times as needed. Changes will apply from the selected date forward.
            </Text>
          )}
        </Card.Content>
      </Card>

      <ScrollView style={styles.daysContainer} showsVerticalScrollIndicator={false}>
        {weeklyAvailability.map(renderDaySlot)}
      </ScrollView>

      {/* Quick Actions */}
      {isEditing && (
        <Card style={styles.quickActionsCard}>
          <Card.Content>
            <Title style={styles.quickActionsTitle}>Quick Actions</Title>
            <View style={styles.quickActions}>
              <Button
                mode="outlined"
                onPress={() => {
                  const updated = weeklyAvailability.map(slot => ({
                    ...slot,
                    isAvailable: slot.dayOfWeek >= 1 && slot.dayOfWeek <= 5,
                  }));
                  setWeeklyAvailability(updated);
                  setHasChanges(true);
                }}
                style={styles.quickActionButton}
              >
                Weekdays Only
              </Button>
              
              <Button
                mode="outlined"
                onPress={() => {
                  const updated = weeklyAvailability.map(slot => ({
                    ...slot,
                    isAvailable: true,
                  }));
                  setWeeklyAvailability(updated);
                  setHasChanges(true);
                }}
                style={styles.quickActionButton}
              >
                All Days
              </Button>
              
              <Button
                mode="outlined"
                onPress={() => {
                  const updated = weeklyAvailability.map(slot => ({
                    ...slot,
                    isAvailable: false,
                  }));
                  setWeeklyAvailability(updated);
                  setHasChanges(true);
                }}
                style={styles.quickActionButton}
              >
                Clear All
              </Button>
            </View>
          </Card.Content>
        </Card>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerCard: {
    margin: 16,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
  },
  statusContainer: {
    marginTop: 8,
  },
  statusChip: {
    alignSelf: 'flex-start',
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editNote: {
    fontSize: 14,
    color: theme.colors.outline,
    marginTop: 12,
    fontStyle: 'italic',
  },
  daysContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  dayCard: {
    marginBottom: 8,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayInfo: {
    flex: 1,
  },
  dayName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  timeRange: {
    fontSize: 14,
    color: theme.colors.outline,
    marginTop: 2,
  },
  timeControls: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  timeControl: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    color: theme.colors.outline,
    marginBottom: 4,
  },
  timeButton: {
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 16,
    color: theme.colors.onSurface,
  },
  unavailableIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  unavailableText: {
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.error,
  },
  quickActionsCard: {
    margin: 16,
    marginTop: 8,
  },
  quickActionsTitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
  },
});

export default AvailabilityManager;
