import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  TextInput,
  List,
  Chip,
  RadioButton,
  Divider,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { format } from 'date-fns';

import { RootState, AppDispatch } from '../store';
import { requestShiftSwap, getAvailableAgents } from '../store/slices/shiftSlice';
import { theme } from '../theme';
import { logger } from '../utils/logger';

interface ShiftSwapRequestProps {
  visible: boolean;
  onClose: () => void;
  shift: any;
}

const ShiftSwapRequest: React.FC<ShiftSwapRequestProps> = ({
  visible,
  onClose,
  shift,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { availableAgents, isLoading } = useSelector((state: RootState) => state.shift);
  const { user } = useSelector((state: RootState) => state.auth);

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [swapType, setSwapType] = useState<'PERMANENT' | 'TEMPORARY'>('PERMANENT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && shift) {
      loadAvailableAgents();
    }
  }, [visible, shift]);

  const loadAvailableAgents = async () => {
    try {
      await dispatch(getAvailableAgents({
        shiftId: shift.id,
        startTime: shift.startTime,
        endTime: shift.endTime,
        siteId: shift.siteId,
      })).unwrap();
    } catch (error) {
      logger.error('Failed to load available agents:', error);
    }
  };

  const handleSubmitRequest = async () => {
    if (!selectedAgent) {
      Alert.alert('Selection Required', 'Please select an agent to swap with');
      return;
    }

    if (!reason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for the shift swap');
      return;
    }

    setIsSubmitting(true);
    try {
      await dispatch(requestShiftSwap({
        shiftId: shift.id,
        requestedAgentId: selectedAgent,
        reason: reason.trim(),
        swapType,
        requestedBy: user?.id,
      })).unwrap();

      Alert.alert(
        'Request Sent',
        'Your shift swap request has been sent. You will be notified when the other agent responds.',
        [{ text: 'OK', onPress: onClose }]
      );

      logger.info('Shift swap request submitted', {
        shiftId: shift.id,
        requestedAgentId: selectedAgent,
        swapType,
      });
    } catch (error: any) {
      Alert.alert('Request Failed', error.message || 'Failed to submit shift swap request');
      logger.error('Shift swap request failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAgentSkillsMatch = (agent: any) => {
    if (!shift.requiredSkills || shift.requiredSkills.length === 0) {
      return 100; // No specific skills required
    }

    const agentSkills = agent.skills || [];
    const matchingSkills = shift.requiredSkills.filter((skill: string) =>
      agentSkills.includes(skill)
    );

    return Math.round((matchingSkills.length / shift.requiredSkills.length) * 100);
  };

  const getSkillsMatchColor = (percentage: number) => {
    if (percentage >= 80) return theme.colors.success;
    if (percentage >= 60) return theme.colors.warning;
    return theme.colors.error;
  };

  const renderAgentItem = (agent: any) => {
    const skillsMatch = getAgentSkillsMatch(agent);
    const isSelected = selectedAgent === agent.id;

    return (
      <Card
        key={agent.id}
        style={[
          styles.agentCard,
          isSelected && styles.selectedAgentCard
        ]}
        onPress={() => setSelectedAgent(agent.id)}
      >
        <Card.Content>
          <View style={styles.agentHeader}>
            <View style={styles.agentInfo}>
              <Text style={styles.agentName}>
                {agent.profile?.firstName} {agent.profile?.lastName}
              </Text>
              <Text style={styles.agentId}>ID: {agent.employeeId}</Text>
            </View>
            <RadioButton
              value={agent.id}
              status={isSelected ? 'checked' : 'unchecked'}
              onPress={() => setSelectedAgent(agent.id)}
            />
          </View>

          <View style={styles.agentDetails}>
            <View style={styles.detailRow}>
              <Icon name="star" size={16} color={theme.colors.warning} />
              <Text style={styles.detailText}>
                Rating: {agent.performanceMetrics?.overallRating || 'N/A'}/5.0
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Icon name="check-circle" size={16} color={getSkillsMatchColor(skillsMatch)} />
              <Text style={[styles.detailText, { color: getSkillsMatchColor(skillsMatch) }]}>
                Skills Match: {skillsMatch}%
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Icon name="map-marker-distance" size={16} color={theme.colors.outline} />
              <Text style={styles.detailText}>
                Distance: {agent.distanceFromSite ? `${agent.distanceFromSite.toFixed(1)}km` : 'Unknown'}
              </Text>
            </View>
          </View>

          {agent.skills && agent.skills.length > 0 && (
            <View style={styles.skillsContainer}>
              <Text style={styles.skillsLabel}>Skills:</Text>
              <View style={styles.skillsChips}>
                {agent.skills.slice(0, 3).map((skill: string, index: number) => (
                  <Chip
                    key={index}
                    mode="outlined"
                    style={styles.skillChip}
                    textStyle={styles.skillChipText}
                  >
                    {skill}
                  </Chip>
                ))}
                {agent.skills.length > 3 && (
                  <Text style={styles.moreSkills}>+{agent.skills.length - 3} more</Text>
                )}
              </View>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Title style={styles.headerTitle}>Request Shift Swap</Title>
          <Button mode="text" onPress={onClose}>
            Cancel
          </Button>
        </View>

        <ScrollView style={styles.content}>
          {/* Shift Information */}
          <Card style={styles.shiftCard}>
            <Card.Content>
              <Title>Shift Details</Title>
              <List.Item
                title={shift?.site?.name}
                description={shift?.site?.client?.companyName}
                left={(props) => <List.Icon {...props} icon="office-building" />}
              />
              <List.Item
                title={format(new Date(shift?.startTime), 'MMM dd, yyyy')}
                description={`${format(new Date(shift?.startTime), 'HH:mm')} - ${format(new Date(shift?.endTime), 'HH:mm')}`}
                left={(props) => <List.Icon {...props} icon="calendar-clock" />}
              />
            </Card.Content>
          </Card>

          {/* Swap Type Selection */}
          <Card style={styles.card}>
            <Card.Content>
              <Title>Swap Type</Title>
              <RadioButton.Group
                onValueChange={(value) => setSwapType(value as 'PERMANENT' | 'TEMPORARY')}
                value={swapType}
              >
                <RadioButton.Item
                  label="Permanent Swap"
                  value="PERMANENT"
                  labelStyle={styles.radioLabel}
                />
                <RadioButton.Item
                  label="Temporary Coverage"
                  value="TEMPORARY"
                  labelStyle={styles.radioLabel}
                />
              </RadioButton.Group>
            </Card.Content>
          </Card>

          {/* Reason Input */}
          <Card style={styles.card}>
            <Card.Content>
              <Title>Reason for Swap</Title>
              <TextInput
                label="Explain why you need this shift swap"
                value={reason}
                onChangeText={setReason}
                mode="outlined"
                multiline
                numberOfLines={3}
                placeholder="e.g., Personal emergency, medical appointment, family commitment..."
                style={styles.reasonInput}
              />
            </Card.Content>
          </Card>

          {/* Available Agents */}
          <Card style={styles.card}>
            <Card.Content>
              <Title>Available Agents</Title>
              <Paragraph style={styles.subtitle}>
                Select an agent who can cover your shift
              </Paragraph>
              
              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <Text>Loading available agents...</Text>
                </View>
              ) : availableAgents.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Icon name="account-off" size={48} color={theme.colors.outline} />
                  <Text style={styles.emptyText}>No agents available</Text>
                  <Text style={styles.emptySubtext}>
                    No agents are available for this shift time
                  </Text>
                </View>
              ) : (
                <View style={styles.agentsList}>
                  {availableAgents.map(renderAgentItem)}
                </View>
              )}
            </Card.Content>
          </Card>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            mode="outlined"
            onPress={onClose}
            style={styles.footerButton}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmitRequest}
            style={styles.footerButton}
            loading={isSubmitting}
            disabled={isSubmitting || !selectedAgent || !reason.trim()}
          >
            Send Request
          </Button>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  shiftCard: {
    marginBottom: 16,
  },
  card: {
    marginBottom: 16,
  },
  subtitle: {
    color: theme.colors.outline,
    marginBottom: 16,
  },
  radioLabel: {
    fontSize: 16,
  },
  reasonInput: {
    marginTop: 8,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
    color: theme.colors.onSurface,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.outline,
    marginTop: 4,
    textAlign: 'center',
  },
  agentsList: {
    gap: 12,
  },
  agentCard: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedAgentCard: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  agentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  agentId: {
    fontSize: 12,
    color: theme.colors.outline,
  },
  agentDetails: {
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
  skillsContainer: {
    marginTop: 8,
  },
  skillsLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    color: theme.colors.onSurface,
  },
  skillsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  skillChip: {
    marginRight: 4,
    marginBottom: 4,
  },
  skillChipText: {
    fontSize: 12,
  },
  moreSkills: {
    fontSize: 12,
    color: theme.colors.outline,
    marginLeft: 4,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
  },
  footerButton: {
    flex: 1,
    marginHorizontal: 8,
  },
});

export default ShiftSwapRequest;
