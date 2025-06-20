import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/Card';
import { colors, typography, spacing } from '../theme';

interface Incident {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  title: string;
  description: string;
  location: string;
  reportedAt: string;
  reportedBy: string;
  assignedTo?: string;
  siteId: string;
  siteName: string;
  priority: number;
  responseTime?: number;
}

const IncidentsScreen: React.FC = () => {
  const { getToken } = useAuth();
  
  // State management
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data fetching
  const fetchIncidents = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/incidents`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch incidents');
      }

      const result = await response.json();
      setIncidents(result.data || []);

    } catch (err: any) {
      console.error('Failed to fetch incidents:', err);
      setError('Failed to load incidents. Please check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchIncidents();
  }, [fetchIncidents]);

  // Incident actions
  const reportIncident = () => {
    Alert.alert('Report Incident', 'Navigate to incident reporting form');
    // Navigate to incident form
  };

  const viewIncident = (incidentId: string) => {
    Alert.alert('View Incident', `View incident details for ${incidentId}`);
    // Navigate to incident details
  };

  const updateIncidentStatus = async (incidentId: string, newStatus: string) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/incidents/${incidentId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update incident status');
      }

      Alert.alert('Success', 'Incident status updated successfully');
      fetchIncidents();

    } catch (err: any) {
      console.error('Failed to update incident status:', err);
      Alert.alert('Error', 'Failed to update incident status. Please try again.');
    }
  };

  // Utility functions
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return colors.error;
      case 'HIGH':
        return colors.warning;
      case 'MEDIUM':
        return colors.info;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RESOLVED':
      case 'CLOSED':
        return colors.success;
      case 'IN_PROGRESS':
        return colors.info;
      case 'OPEN':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'error';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      default:
        return 'help';
    }
  };

  // Effects
  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Render functions
  const renderIncidentCard = ({ item }: { item: Incident }) => (
    <Card style={styles.incidentCard}>
      <View style={styles.incidentHeader}>
        <View style={styles.incidentInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.incidentTitle}>{item.title}</Text>
            <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(item.severity) }]}>
              <Icon name={getSeverityIcon(item.severity)} size={14} color={colors.white} />
              <Text style={styles.severityText}>{item.severity}</Text>
            </View>
          </View>
          <Text style={styles.incidentType}>{item.type}</Text>
          <Text style={styles.incidentDescription} numberOfLines={2}>
            {item.description}
          </Text>
        </View>
      </View>

      <View style={styles.incidentMeta}>
        <View style={styles.metaRow}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
          <Text style={styles.priorityText}>Priority: {item.priority}</Text>
        </View>
        
        <View style={styles.detailsRow}>
          <View style={styles.locationRow}>
            <Icon name="location-on" size={16} color={colors.textSecondary} />
            <Text style={styles.locationText}>{item.location}</Text>
          </View>
          <Text style={styles.siteText}>{item.siteName}</Text>
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>
            Reported: {formatDate(item.reportedAt)} {formatTime(item.reportedAt)}
          </Text>
          {item.responseTime && (
            <Text style={styles.responseTimeText}>
              Response: {item.responseTime}min
            </Text>
          )}
        </View>

        <View style={styles.assignmentRow}>
          <Text style={styles.reportedByText}>
            Reported by: {item.reportedBy}
          </Text>
          {item.assignedTo && (
            <Text style={styles.assignedToText}>
              Assigned to: {item.assignedTo}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.incidentActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => viewIncident(item.id)}
        >
          <Icon name="visibility" size={20} color={colors.primary} />
          <Text style={styles.actionText}>View</Text>
        </TouchableOpacity>
        
        {item.status === 'OPEN' && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => updateIncidentStatus(item.id, 'IN_PROGRESS')}
          >
            <Icon name="play-arrow" size={20} color={colors.info} />
            <Text style={styles.actionText}>Start</Text>
          </TouchableOpacity>
        )}
        
        {item.status === 'IN_PROGRESS' && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => updateIncidentStatus(item.id, 'RESOLVED')}
          >
            <Icon name="check" size={20} color={colors.success} />
            <Text style={styles.actionText}>Resolve</Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="security" size={64} color={colors.textSecondary} />
      <Text style={styles.emptyStateTitle}>No Incidents</Text>
      <Text style={styles.emptyStateText}>
        No incidents have been reported yet. Tap the + button to report a new incident.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Incidents</Text>
        <TouchableOpacity onPress={fetchIncidents} style={styles.refreshButton}>
          <Icon name="refresh" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchIncidents} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.summaryContainer}>
        <Text style={styles.summaryText}>
          {incidents.length} incident{incidents.length !== 1 ? 's' : ''} total
        </Text>
        <View style={styles.statusSummary}>
          <Text style={styles.statusSummaryText}>
            Open: {incidents.filter(i => i.status === 'OPEN').length} • 
            In Progress: {incidents.filter(i => i.status === 'IN_PROGRESS').length} • 
            Resolved: {incidents.filter(i => i.status === 'RESOLVED').length}
          </Text>
        </View>
      </View>

      <FlatList
        data={incidents}
        renderItem={renderIncidentCard}
        keyExtractor={(item) => item.id}
        style={styles.incidentsList}
        contentContainerStyle={[
          styles.incidentsListContent,
          incidents.length === 0 && styles.emptyListContent
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
      />

      <TouchableOpacity style={styles.fab} onPress={reportIncident}>
        <Icon name="add" size={24} color={colors.white} />
      </TouchableOpacity>
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
  summaryContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  summaryText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statusSummary: {
    flexDirection: 'row',
  },
  statusSummaryText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  incidentsList: {
    flex: 1,
  },
  incidentsListContent: {
    padding: spacing.lg,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  incidentCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  incidentHeader: {
    marginBottom: spacing.md,
  },
  incidentInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  incidentTitle: {
    flex: 1,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    gap: spacing.xs,
  },
  severityText: {
    fontSize: typography.sizes.xs,
    color: colors.white,
    fontWeight: typography.weights.semibold,
  },
  incidentType: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs,
  },
  incidentDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  incidentMeta: {
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    color: colors.white,
    fontWeight: typography.weights.semibold,
  },
  priorityText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  locationText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  siteText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  timeText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  responseTimeText: {
    fontSize: typography.sizes.sm,
    color: colors.info,
    fontWeight: typography.weights.semibold,
  },
  assignmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reportedByText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  assignedToText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  incidentActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyStateTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyStateText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 22,
  },
});

export default IncidentsScreen;
