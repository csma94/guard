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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/Card';
import { colors, typography, spacing } from '../theme';

interface Report {
  id: string;
  type: 'PATROL' | 'INCIDENT' | 'MAINTENANCE' | 'GENERAL';
  title: string;
  description: string;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  createdAt: string;
  submittedAt?: string;
  siteId: string;
  siteName: string;
  attachments: number;
  location?: string;
}

const ReportsScreen: React.FC = () => {
  const { getToken } = useAuth();
  
  // State management
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Data fetching
  const fetchReports = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/reports`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch reports');
      }

      const result = await response.json();
      const reportsData = result.data || [];
      setReports(reportsData);
      setFilteredReports(reportsData);

    } catch (err: any) {
      console.error('Failed to fetch reports:', err);
      setError('Failed to load reports. Please check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReports();
  }, [fetchReports]);

  // Filter functions
  const applyFilters = useCallback(() => {
    let filtered = reports;

    if (selectedFilter !== 'ALL') {
      filtered = filtered.filter(report => report.type === selectedFilter);
    }

    if (selectedStatus !== 'ALL') {
      filtered = filtered.filter(report => report.status === selectedStatus);
    }

    setFilteredReports(filtered);
  }, [reports, selectedFilter, selectedStatus]);

  // Report actions
  const createNewReport = () => {
    Alert.alert('Create Report', 'Navigate to report creation form');
    // Navigate to report form
  };

  const viewReport = (reportId: string) => {
    Alert.alert('View Report', `View report details for ${reportId}`);
    // Navigate to report details
  };

  const editReport = (reportId: string) => {
    Alert.alert('Edit Report', `Edit report ${reportId}`);
    // Navigate to report edit form
  };

  const deleteReport = async (reportId: string) => {
    Alert.alert(
      'Delete Report',
      'Are you sure you want to delete this report?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await getToken();
              if (!token) {
                throw new Error('No authentication token available');
              }

              const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/mobile/reports/${reportId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                throw new Error('Failed to delete report');
              }

              Alert.alert('Success', 'Report deleted successfully');
              fetchReports();

            } catch (err: any) {
              console.error('Failed to delete report:', err);
              Alert.alert('Error', 'Failed to delete report. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Utility functions
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'INCIDENT':
        return colors.error;
      case 'PATROL':
        return colors.primary;
      case 'MAINTENANCE':
        return colors.warning;
      default:
        return colors.info;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return colors.success;
      case 'SUBMITTED':
        return colors.info;
      case 'REVIEWED':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return colors.error;
      case 'HIGH':
        return colors.warning;
      case 'MEDIUM':
        return colors.info;
      default:
        return colors.textSecondary;
    }
  };

  // Effects
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // Render functions
  const renderReportCard = ({ item }: { item: Report }) => (
    <Card style={styles.reportCard}>
      <View style={styles.reportHeader}>
        <View style={styles.reportInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.reportTitle}>{item.title}</Text>
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
              <Text style={styles.priorityText}>{item.priority}</Text>
            </View>
          </View>
          <Text style={styles.reportDescription} numberOfLines={2}>
            {item.description}
          </Text>
        </View>
      </View>

      <View style={styles.reportMeta}>
        <View style={styles.metaRow}>
          <View style={[styles.typeBadge, { backgroundColor: getTypeColor(item.type) }]}>
            <Text style={styles.typeText}>{item.type}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        
        <View style={styles.detailsRow}>
          <Text style={styles.siteText}>{item.siteName}</Text>
          <Text style={styles.dateText}>
            {formatDate(item.createdAt)} {formatTime(item.createdAt)}
          </Text>
        </View>

        {item.attachments > 0 && (
          <View style={styles.attachmentRow}>
            <Icon name="attach-file" size={16} color={colors.textSecondary} />
            <Text style={styles.attachmentText}>
              {item.attachments} attachment{item.attachments > 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {item.location && (
          <View style={styles.locationRow}>
            <Icon name="location-on" size={16} color={colors.textSecondary} />
            <Text style={styles.locationText}>{item.location}</Text>
          </View>
        )}
      </View>

      <View style={styles.reportActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => viewReport(item.id)}
        >
          <Icon name="visibility" size={20} color={colors.primary} />
          <Text style={styles.actionText}>View</Text>
        </TouchableOpacity>
        
        {item.status === 'DRAFT' && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => editReport(item.id)}
          >
            <Icon name="edit" size={20} color={colors.info} />
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
        )}
        
        {item.status === 'DRAFT' && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => deleteReport(item.id)}
          >
            <Icon name="delete" size={20} color={colors.error} />
            <Text style={styles.actionText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );

  const renderFilterModal = () => (
    <Modal
      visible={filterModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setFilterModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter Reports</Text>
            <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
              <Icon name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Report Type</Text>
            <View style={styles.filterOptions}>
              {['ALL', 'PATROL', 'INCIDENT', 'MAINTENANCE', 'GENERAL'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.filterOption,
                    selectedFilter === type && styles.selectedFilterOption
                  ]}
                  onPress={() => setSelectedFilter(type)}
                >
                  <Text style={[
                    styles.filterOptionText,
                    selectedFilter === type && styles.selectedFilterOptionText
                  ]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Status</Text>
            <View style={styles.filterOptions}>
              {['ALL', 'DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterOption,
                    selectedStatus === status && styles.selectedFilterOption
                  ]}
                  onPress={() => setSelectedStatus(status)}
                >
                  <Text style={[
                    styles.filterOptionText,
                    selectedStatus === status && styles.selectedFilterOptionText
                  ]}>
                    {status}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                setSelectedFilter('ALL');
                setSelectedStatus('ALL');
              }}
            >
              <Text style={styles.clearButtonText}>Clear Filters</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={() => {
                setFilterModalVisible(false);
                applyFilters();
              }}
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setFilterModalVisible(true)} style={styles.filterButton}>
            <Icon name="filter-list" size={24} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={fetchReports} style={styles.refreshButton}>
            <Icon name="refresh" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchReports} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.summaryContainer}>
        <Text style={styles.summaryText}>
          Showing {filteredReports.length} of {reports.length} reports
        </Text>
      </View>

      <FlatList
        data={filteredReports}
        renderItem={renderReportCard}
        keyExtractor={(item) => item.id}
        style={styles.reportsList}
        contentContainerStyle={styles.reportsListContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity style={styles.fab} onPress={createNewReport}>
        <Icon name="add" size={24} color={colors.white} />
      </TouchableOpacity>

      {renderFilterModal()}
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
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterButton: {
    padding: spacing.sm,
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
  },
  reportsList: {
    flex: 1,
  },
  reportsListContent: {
    padding: spacing.lg,
  },
  reportCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  reportHeader: {
    marginBottom: spacing.md,
  },
  reportInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  reportTitle: {
    flex: 1,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  priorityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: typography.sizes.xs,
    color: colors.white,
    fontWeight: typography.weights.semibold,
  },
  reportDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  reportMeta: {
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
  },
  typeText: {
    fontSize: typography.sizes.xs,
    color: colors.white,
    fontWeight: typography.weights.semibold,
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
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  siteText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  dateText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  attachmentText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  reportActions: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  filterSection: {
    marginBottom: spacing.lg,
  },
  filterLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  selectedFilterOption: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterOptionText: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  selectedFilterOptionText: {
    color: colors.white,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  clearButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
  },
  applyButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: typography.sizes.md,
    color: colors.white,
    fontWeight: typography.weights.semibold,
  },
});

export default ReportsScreen;
