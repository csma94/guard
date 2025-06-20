import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
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
import { format } from 'date-fns';

import { RootState, AppDispatch } from '../../store';
import { fetchMyReports, clearError } from '../../store/slices/reportSlice';
import { theme } from '../../theme';
import LoadingScreen from '../../components/LoadingScreen';

interface ReportsScreenProps {
  navigation: any;
}

const ReportsScreen: React.FC<ReportsScreenProps> = ({ navigation }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  const { 
    reports, 
    isLoading, 
    error 
  } = useSelector((state: RootState) => state.report);

  const { currentShift } = useSelector((state: RootState) => state.shift);

  useFocusEffect(
    React.useCallback(() => {
      loadReports();
    }, [])
  );

  const loadReports = async () => {
    try {
      await dispatch(fetchMyReports()).unwrap();
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const getReportTypeColor = (type: string) => {
    switch (type) {
      case 'PATROL': return theme.colors.primary;
      case 'INCIDENT': return theme.colors.error;
      case 'INSPECTION': return theme.colors.warning;
      case 'MAINTENANCE': return theme.colors.info;
      case 'EMERGENCY': return theme.colors.error;
      default: return theme.colors.outline;
    }
  };

  const getReportTypeIcon = (type: string) => {
    switch (type) {
      case 'PATROL': return 'shield-check';
      case 'INCIDENT': return 'alert-circle';
      case 'INSPECTION': return 'clipboard-check';
      case 'MAINTENANCE': return 'wrench';
      case 'EMERGENCY': return 'alert';
      default: return 'file-document';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return theme.colors.outline;
      case 'SUBMITTED': return theme.colors.primary;
      case 'UNDER_REVIEW': return theme.colors.warning;
      case 'APPROVED': return theme.colors.success;
      case 'REJECTED': return theme.colors.error;
      case 'REQUIRES_REVISION': return theme.colors.warning;
      default: return theme.colors.outline;
    }
  };

  const getFilteredReports = () => {
    let filteredReports = reports;

    if (filterType !== 'all') {
      filteredReports = reports.filter(report => {
        switch (filterType) {
          case 'draft':
            return report.status === 'DRAFT';
          case 'submitted':
            return ['SUBMITTED', 'UNDER_REVIEW'].includes(report.status);
          case 'approved':
            return report.status === 'APPROVED';
          case 'incident':
            return report.reportType === 'INCIDENT';
          case 'patrol':
            return report.reportType === 'PATROL';
          default:
            return true;
        }
      });
    }

    if (searchQuery) {
      filteredReports = filteredReports.filter(report => 
        report.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.site?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filteredReports.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  };

  const renderReportCard = ({ item: report }: { item: any }) => (
    <Card 
      style={styles.reportCard} 
      onPress={() => navigation.navigate('ReportDetails', { reportId: report.id })}
    >
      <Card.Content>
        <View style={styles.reportHeader}>
          <View style={styles.reportInfo}>
            <Title style={styles.reportTitle}>{report.title}</Title>
            <Paragraph style={styles.siteName}>{report.site?.name}</Paragraph>
          </View>
          <View style={styles.chips}>
            <Chip 
              icon={getReportTypeIcon(report.reportType)}
              style={[styles.typeChip, { backgroundColor: getReportTypeColor(report.reportType) + '20' }]}
              textStyle={{ color: getReportTypeColor(report.reportType), fontSize: 12 }}
            >
              {report.reportType}
            </Chip>
            <Chip 
              style={[styles.statusChip, { backgroundColor: getStatusColor(report.status) + '20' }]}
              textStyle={{ color: getStatusColor(report.status), fontSize: 12 }}
            >
              {report.status}
            </Chip>
          </View>
        </View>

        <View style={styles.reportDetails}>
          <View style={styles.detailRow}>
            <Icon name="calendar" size={16} color={theme.colors.outline} />
            <Text style={styles.detailText}>
              {format(new Date(report.createdAt), 'MMM dd, yyyy HH:mm')}
            </Text>
          </View>
          
          {report.shift && (
            <View style={styles.detailRow}>
              <Icon name="clock" size={16} color={theme.colors.outline} />
              <Text style={styles.detailText}>
                Shift: {format(new Date(report.shift.startTime), 'HH:mm')} - {format(new Date(report.shift.endTime), 'HH:mm')}
              </Text>
            </View>
          )}

          {report.priority && (
            <View style={styles.detailRow}>
              <Icon name="flag" size={16} color={theme.colors.outline} />
              <Text style={styles.detailText}>Priority: {report.priority}</Text>
            </View>
          )}
        </View>

        {report.summary && (
          <Paragraph style={styles.summary} numberOfLines={2}>
            {report.summary}
          </Paragraph>
        )}

        {report.attachments && report.attachments.length > 0 && (
          <View style={styles.attachmentInfo}>
            <Icon name="attachment" size={16} color={theme.colors.primary} />
            <Text style={styles.attachmentText}>
              {report.attachments.length} attachment{report.attachments.length > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );

  if (isLoading && !refreshing) {
    return <LoadingScreen />;
  }

  const filteredReports = getFilteredReports();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Title style={styles.title}>My Reports</Title>
        <Searchbar
          placeholder="Search reports..."
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
          { value: 'draft', label: 'Draft' },
          { value: 'submitted', label: 'Submitted' },
          { value: 'approved', label: 'Approved' },
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
        data={filteredReports}
        renderItem={renderReportCard}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="file-document-outline" size={64} color={theme.colors.outline} />
            <Text style={styles.emptyText}>No reports found</Text>
            <Text style={styles.emptySubtext}>
              {filterType === 'all' ? 'You have no reports yet' : `No ${filterType} reports`}
            </Text>
            {currentShift && (
              <Button
                mode="contained"
                onPress={() => navigation.navigate('CreateReport', { shiftId: currentShift.id })}
                style={styles.createButton}
                icon="plus"
              >
                Create Report
              </Button>
            )}
          </View>
        }
      />

      {currentShift && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => navigation.navigate('CreateReport', { shiftId: currentShift.id })}
        />
      )}
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
  reportCard: {
    marginBottom: 12,
    elevation: 2,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reportInfo: {
    flex: 1,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  siteName: {
    fontSize: 14,
    color: theme.colors.outline,
  },
  chips: {
    alignItems: 'flex-end',
    gap: 4,
  },
  typeChip: {
    height: 24,
  },
  statusChip: {
    height: 24,
  },
  reportDetails: {
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
  summary: {
    fontSize: 14,
    color: theme.colors.onSurface,
    marginTop: 8,
    fontStyle: 'italic',
  },
  attachmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 8,
  },
  attachmentText: {
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.primary,
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
  createButton: {
    marginTop: 16,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

export default ReportsScreen;
