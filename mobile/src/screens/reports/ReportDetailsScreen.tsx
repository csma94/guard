import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Linking,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Chip,
  Button,
  Divider,
  List,
  IconButton,
} from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { format } from 'date-fns';

import { RootState, AppDispatch } from '../../store';
import { fetchReportDetails, deleteReport } from '../../store/slices/reportSlice';
import { theme } from '../../theme';
import LoadingScreen from '../../components/LoadingScreen';

const ReportDetailsScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const dispatch = useDispatch<AppDispatch>();
  const { reportId } = route.params as { reportId: string };

  const { selectedReport, isLoading, error } = useSelector((state: RootState) => state.report);

  useEffect(() => {
    loadReportDetails();
  }, [reportId]);

  const loadReportDetails = async () => {
    try {
      await dispatch(fetchReportDetails(reportId)).unwrap();
    } catch (error) {
      console.error('Failed to load report details:', error);
      Alert.alert('Error', 'Failed to load report details');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Report',
      'Are you sure you want to delete this report? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(deleteReport(reportId)).unwrap();
              Alert.alert('Success', 'Report deleted successfully');
              navigation.goBack();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete report');
            }
          },
        },
      ]
    );
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW': return theme.colors.success;
      case 'NORMAL': return theme.colors.primary;
      case 'HIGH': return theme.colors.warning;
      case 'CRITICAL': return theme.colors.error;
      default: return theme.colors.outline;
    }
  };

  const openLocation = () => {
    if (selectedReport?.content?.location) {
      const { latitude, longitude } = selectedReport.content.location;
      const url = `https://maps.google.com/?q=${latitude},${longitude}`;
      Linking.openURL(url);
    }
  };

  const canEdit = () => {
    return selectedReport?.status === 'DRAFT' || selectedReport?.status === 'REQUIRES_REVISION';
  };

  const canDelete = () => {
    return selectedReport?.status === 'DRAFT';
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!selectedReport) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle" size={64} color={theme.colors.error} />
        <Text style={styles.errorText}>Report not found</Text>
        <Button onPress={() => navigation.goBack()}>Go Back</Button>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Report Header */}
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerContent}>
            <View style={styles.reportInfo}>
              <Title style={styles.reportTitle}>{selectedReport.title}</Title>
              <Paragraph style={styles.siteName}>{selectedReport.site?.name}</Paragraph>
            </View>
            <View style={styles.chips}>
              <Chip 
                icon={getReportTypeIcon(selectedReport.reportType)}
                style={[styles.typeChip, { backgroundColor: getReportTypeColor(selectedReport.reportType) + '20' }]}
                textStyle={{ color: getReportTypeColor(selectedReport.reportType) }}
              >
                {selectedReport.reportType}
              </Chip>
              <Chip 
                style={[styles.statusChip, { backgroundColor: getStatusColor(selectedReport.status) + '20' }]}
                textStyle={{ color: getStatusColor(selectedReport.status) }}
              >
                {selectedReport.status}
              </Chip>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Report Details */}
      <Card style={styles.detailsCard}>
        <Card.Content>
          <Title>Report Information</Title>
          <Divider style={styles.divider} />
          
          <List.Item
            title="Created"
            description={format(new Date(selectedReport.createdAt), 'EEEE, MMMM dd, yyyy HH:mm')}
            left={(props) => <List.Icon {...props} icon="calendar" />}
          />
          
          {selectedReport.updatedAt !== selectedReport.createdAt && (
            <List.Item
              title="Last Updated"
              description={format(new Date(selectedReport.updatedAt), 'EEEE, MMMM dd, yyyy HH:mm')}
              left={(props) => <List.Icon {...props} icon="update" />}
            />
          )}
          
          <List.Item
            title="Priority"
            description={selectedReport.priority || 'Normal'}
            left={(props) => <List.Icon {...props} icon="flag" color={getPriorityColor(selectedReport.priority)} />}
          />
          
          {selectedReport.shift && (
            <List.Item
              title="Shift"
              description={`${format(new Date(selectedReport.shift.startTime), 'HH:mm')} - ${format(new Date(selectedReport.shift.endTime), 'HH:mm')}`}
              left={(props) => <List.Icon {...props} icon="clock" />}
            />
          )}
        </Card.Content>
      </Card>

      {/* Report Content */}
      <Card style={styles.contentCard}>
        <Card.Content>
          <Title>Description</Title>
          <Divider style={styles.divider} />
          <Paragraph style={styles.description}>
            {selectedReport.content?.description || 'No description provided.'}
          </Paragraph>
        </Card.Content>
      </Card>

      {/* Location Information */}
      {selectedReport.content?.location && (
        <Card style={styles.locationCard}>
          <Card.Content>
            <Title>Location</Title>
            <Divider style={styles.divider} />
            
            <List.Item
              title="GPS Coordinates"
              description={`${selectedReport.content.location.latitude?.toFixed(6)}, ${selectedReport.content.location.longitude?.toFixed(6)}`}
              left={(props) => <List.Icon {...props} icon="map-marker" />}
              right={(props) => (
                <IconButton
                  {...props}
                  icon="directions"
                  onPress={openLocation}
                />
              )}
            />
            
            {selectedReport.content.location.accuracy && (
              <List.Item
                title="Accuracy"
                description={`±${Math.round(selectedReport.content.location.accuracy)}m`}
                left={(props) => <List.Icon {...props} icon="crosshairs-gps" />}
              />
            )}
          </Card.Content>
        </Card>
      )}

      {/* Attachments */}
      {selectedReport.attachments && selectedReport.attachments.length > 0 && (
        <Card style={styles.attachmentsCard}>
          <Card.Content>
            <Title>Attachments ({selectedReport.attachments.length})</Title>
            <Divider style={styles.divider} />
            
            <View style={styles.attachmentsList}>
              {selectedReport.attachments.map((attachment: any, index: number) => (
                <View key={index} style={styles.attachmentItem}>
                  {attachment.type === 'image' && attachment.url && (
                    <Image source={{ uri: attachment.url }} style={styles.attachmentImage} />
                  )}
                  <View style={styles.attachmentInfo}>
                    <Text style={styles.attachmentName}>{attachment.filename || `Attachment ${index + 1}`}</Text>
                    <Text style={styles.attachmentType}>{attachment.type}</Text>
                    {attachment.size && (
                      <Text style={styles.attachmentSize}>
                        {(attachment.size / 1024).toFixed(1)} KB
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Review Information */}
      {selectedReport.reviewedBy && (
        <Card style={styles.reviewCard}>
          <Card.Content>
            <Title>Review Information</Title>
            <Divider style={styles.divider} />
            
            <List.Item
              title="Reviewed By"
              description={selectedReport.reviewedBy.username}
              left={(props) => <List.Icon {...props} icon="account-check" />}
            />
            
            {selectedReport.reviewedAt && (
              <List.Item
                title="Reviewed At"
                description={format(new Date(selectedReport.reviewedAt), 'EEEE, MMMM dd, yyyy HH:mm')}
                left={(props) => <List.Icon {...props} icon="calendar-check" />}
              />
            )}
            
            {selectedReport.reviewNotes && (
              <View style={styles.reviewNotes}>
                <Text style={styles.reviewNotesTitle}>Review Notes:</Text>
                <Paragraph style={styles.reviewNotesText}>
                  {selectedReport.reviewNotes}
                </Paragraph>
              </View>
            )}
          </Card.Content>
        </Card>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {canEdit() && (
          <Button
            mode="outlined"
            onPress={() => navigation.navigate('EditReport', { reportId })}
            style={styles.actionButton}
            icon="pencil"
          >
            Edit Report
          </Button>
        )}
        
        {canDelete() && (
          <Button
            mode="outlined"
            onPress={handleDelete}
            style={[styles.actionButton, styles.deleteButton]}
            icon="delete"
            textColor={theme.colors.error}
          >
            Delete Report
          </Button>
        )}
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
  reportInfo: {
    flex: 1,
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  siteName: {
    fontSize: 14,
    color: theme.colors.outline,
  },
  chips: {
    alignItems: 'flex-end',
    gap: 8,
  },
  typeChip: {
    marginLeft: 16,
  },
  statusChip: {
    marginLeft: 16,
  },
  detailsCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  contentCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  locationCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  attachmentsCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  reviewCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  divider: {
    marginVertical: 8,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.onSurface,
  },
  attachmentsList: {
    marginTop: 8,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    marginBottom: 8,
  },
  attachmentImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  attachmentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  attachmentName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.onSurface,
  },
  attachmentType: {
    fontSize: 12,
    color: theme.colors.outline,
    marginTop: 2,
  },
  attachmentSize: {
    fontSize: 12,
    color: theme.colors.outline,
    marginTop: 2,
  },
  reviewNotes: {
    marginTop: 8,
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
  },
  reviewNotesTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    color: theme.colors.onSurface,
  },
  reviewNotesText: {
    fontSize: 14,
    color: theme.colors.onSurface,
  },
  actionButtons: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 8,
  },
  deleteButton: {
    borderColor: theme.colors.error,
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

export default ReportDetailsScreen;
