import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Title, Paragraph, Button, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format } from 'date-fns';
import { theme } from '../theme';

interface ShiftStatusCardProps {
  shift: any;
  clockInStatus: string;
  onClockIn: () => void;
  onClockOut: () => void;
  onViewDetails: () => void;
}

const ShiftStatusCard: React.FC<ShiftStatusCardProps> = ({
  shift,
  clockInStatus,
  onClockIn,
  onClockOut,
  onViewDetails,
}) => {
  const getShiftStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return theme.colors.primary;
      case 'CONFIRMED': return theme.colors.success;
      case 'IN_PROGRESS': return theme.colors.warning;
      case 'COMPLETED': return theme.colors.success;
      default: return theme.colors.outline;
    }
  };

  const canClockIn = () => {
    return shift?.status === 'CONFIRMED' && !shift?.attendance?.clockInTime;
  };

  const canClockOut = () => {
    return shift?.status === 'IN_PROGRESS' && 
           shift?.attendance?.clockInTime && 
           !shift?.attendance?.clockOutTime;
  };

  if (!shift) {
    return (
      <Card style={styles.card}>
        <Card.Content style={styles.noShiftContent}>
          <Icon name="calendar-blank" size={48} color={theme.colors.outline} />
          <Title style={styles.noShiftTitle}>No Active Shift</Title>
          <Paragraph style={styles.noShiftText}>
            You don't have any active shifts at the moment
          </Paragraph>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <View style={styles.shiftInfo}>
            <Title style={styles.siteName}>{shift.site?.name}</Title>
            <Paragraph style={styles.clientName}>
              {shift.site?.client?.companyName}
            </Paragraph>
          </View>
          <Chip 
            style={[styles.statusChip, { backgroundColor: getShiftStatusColor(shift.status) + '20' }]}
            textStyle={{ color: getShiftStatusColor(shift.status) }}
          >
            {shift.status}
          </Chip>
        </View>

        <View style={styles.timeInfo}>
          <View style={styles.timeRow}>
            <Icon name="clock" size={16} color={theme.colors.outline} />
            <Paragraph style={styles.timeText}>
              {format(new Date(shift.startTime), 'HH:mm')} - {format(new Date(shift.endTime), 'HH:mm')}
            </Paragraph>
          </View>
          <View style={styles.timeRow}>
            <Icon name="calendar" size={16} color={theme.colors.outline} />
            <Paragraph style={styles.timeText}>
              {format(new Date(shift.startTime), 'EEEE, MMM dd')}
            </Paragraph>
          </View>
        </View>

        {shift.attendance?.clockInTime && (
          <View style={styles.attendanceInfo}>
            <Icon name="login" size={16} color={theme.colors.success} />
            <Paragraph style={styles.attendanceText}>
              Clocked in at {format(new Date(shift.attendance.clockInTime), 'HH:mm')}
            </Paragraph>
          </View>
        )}

        <View style={styles.actions}>
          {canClockIn() && (
            <Button
              mode="contained"
              onPress={onClockIn}
              style={styles.actionButton}
              icon="login"
            >
              Clock In
            </Button>
          )}
          
          {canClockOut() && (
            <Button
              mode="contained"
              onPress={onClockOut}
              style={styles.actionButton}
              icon="logout"
            >
              Clock Out
            </Button>
          )}
          
          <Button
            mode="outlined"
            onPress={onViewDetails}
            style={styles.actionButton}
            icon="eye"
          >
            View Details
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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  shiftInfo: {
    flex: 1,
  },
  siteName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  clientName: {
    fontSize: 14,
    color: theme.colors.outline,
  },
  statusChip: {
    marginLeft: 8,
  },
  timeInfo: {
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  timeText: {
    marginLeft: 8,
    fontSize: 14,
  },
  attendanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
  noShiftContent: {
    alignItems: 'center',
    padding: 32,
  },
  noShiftTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    color: theme.colors.onSurface,
  },
  noShiftText: {
    fontSize: 14,
    color: theme.colors.outline,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default ShiftStatusCard;
