import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
} from 'react-native';
import {
  Card,
  Title,
  TextInput,
  Button,
  Chip,
  SegmentedButtons,
  List,
  IconButton,
} from 'react-native-paper';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { RootState, AppDispatch } from '../../store';
import { createReport, uploadAttachment } from '../../store/slices/reportSlice';
import { theme } from '../../theme';

const CreateReportScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const dispatch = useDispatch<AppDispatch>();
  const { shiftId } = route.params as { shiftId: string };

  const [reportType, setReportType] = useState('PATROL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [location, setLocation] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { currentShift } = useSelector((state: RootState) => state.shift);
  const { currentLocation } = useSelector((state: RootState) => state.location);

  useEffect(() => {
    getCurrentLocation();
    setDefaultTitle();
  }, [reportType]);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required for reports');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const setDefaultTitle = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    switch (reportType) {
      case 'PATROL':
        setTitle(`Patrol Report - ${timeStr}`);
        break;
      case 'INCIDENT':
        setTitle(`Incident Report - ${timeStr}`);
        break;
      case 'INSPECTION':
        setTitle(`Inspection Report - ${timeStr}`);
        break;
      case 'MAINTENANCE':
        setTitle(`Maintenance Report - ${timeStr}`);
        break;
      case 'EMERGENCY':
        setTitle(`Emergency Report - ${timeStr}`);
        break;
      default:
        setTitle(`Report - ${timeStr}`);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Camera permission is required to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setAttachments(prev => [...prev, {
          id: Date.now().toString(),
          uri: asset.uri,
          type: 'image',
          name: `photo_${Date.now()}.jpg`,
        }]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Media library permission is required to select photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setAttachments(prev => [...prev, {
          id: Date.now().toString(),
          uri: asset.uri,
          type: 'image',
          name: `image_${Date.now()}.jpg`,
        }]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const validateForm = () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter a title');
      return false;
    }
    if (!description.trim()) {
      Alert.alert('Validation Error', 'Please enter a description');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const reportData = {
        shiftId,
        siteId: currentShift?.siteId,
        reportType,
        title: title.trim(),
        content: {
          description: description.trim(),
          location: location || currentLocation,
          timestamp: new Date().toISOString(),
        },
        priority,
        attachments: attachments.map(att => ({
          type: att.type,
          name: att.name,
          uri: att.uri,
        })),
      };

      await dispatch(createReport(reportData)).unwrap();
      
      Alert.alert(
        'Success',
        'Report created successfully',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create report');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveDraft = async () => {
    if (!title.trim() && !description.trim()) {
      Alert.alert('Nothing to Save', 'Please enter some content before saving as draft');
      return;
    }

    setIsSubmitting(true);
    try {
      const reportData = {
        shiftId,
        siteId: currentShift?.siteId,
        reportType,
        title: title.trim() || 'Draft Report',
        content: {
          description: description.trim(),
          location: location || currentLocation,
          timestamp: new Date().toISOString(),
        },
        priority,
        status: 'DRAFT',
        attachments: attachments.map(att => ({
          type: att.type,
          name: att.name,
          uri: att.uri,
        })),
      };

      await dispatch(createReport(reportData)).unwrap();
      
      Alert.alert(
        'Draft Saved',
        'Report saved as draft',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save draft');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Report Type Selection */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Report Type</Title>
          <SegmentedButtons
            value={reportType}
            onValueChange={setReportType}
            buttons={[
              { value: 'PATROL', label: 'Patrol' },
              { value: 'INCIDENT', label: 'Incident' },
              { value: 'INSPECTION', label: 'Inspection' },
              { value: 'MAINTENANCE', label: 'Maintenance' },
              { value: 'EMERGENCY', label: 'Emergency' },
            ]}
            style={styles.segmentedButtons}
          />
        </Card.Content>
      </Card>

      {/* Basic Information */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Report Details</Title>
          
          <TextInput
            label="Title"
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            mode="outlined"
          />
          
          <TextInput
            label="Description"
            value={description}
            onChangeText={setDescription}
            style={styles.input}
            mode="outlined"
            multiline
            numberOfLines={4}
            placeholder="Describe what happened, what you observed, or any relevant details..."
          />

          <View style={styles.prioritySection}>
            <Text style={styles.sectionTitle}>Priority</Text>
            <SegmentedButtons
              value={priority}
              onValueChange={setPriority}
              buttons={[
                { value: 'LOW', label: 'Low' },
                { value: 'NORMAL', label: 'Normal' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
              style={styles.priorityButtons}
            />
          </View>
        </Card.Content>
      </Card>

      {/* Attachments */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Attachments</Title>
          
          <View style={styles.attachmentButtons}>
            <Button
              mode="outlined"
              onPress={takePhoto}
              icon="camera"
              style={styles.attachmentButton}
            >
              Take Photo
            </Button>
            <Button
              mode="outlined"
              onPress={pickImage}
              icon="image"
              style={styles.attachmentButton}
            >
              Select Image
            </Button>
          </View>

          {attachments.length > 0 && (
            <View style={styles.attachmentsList}>
              {attachments.map((attachment) => (
                <View key={attachment.id} style={styles.attachmentItem}>
                  <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} />
                  <View style={styles.attachmentInfo}>
                    <Text style={styles.attachmentName}>{attachment.name}</Text>
                    <Text style={styles.attachmentType}>{attachment.type}</Text>
                  </View>
                  <IconButton
                    icon="close"
                    size={20}
                    onPress={() => removeAttachment(attachment.id)}
                  />
                </View>
              ))}
            </View>
          )}
        </Card.Content>
      </Card>

      {/* Location Information */}
      {location && (
        <Card style={styles.card}>
          <Card.Content>
            <Title>Location</Title>
            <List.Item
              title="GPS Coordinates"
              description={`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}
              left={(props) => <List.Icon {...props} icon="map-marker" />}
            />
            {location.accuracy && (
              <List.Item
                title="Accuracy"
                description={`±${Math.round(location.accuracy)}m`}
                left={(props) => <List.Icon {...props} icon="crosshairs-gps" />}
              />
            )}
          </Card.Content>
        </Card>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <Button
          mode="outlined"
          onPress={saveDraft}
          disabled={isSubmitting}
          style={styles.actionButton}
          icon="content-save"
        >
          Save Draft
        </Button>
        
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.actionButton}
          icon="send"
        >
          Submit Report
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
  card: {
    margin: 16,
    marginBottom: 8,
  },
  input: {
    marginBottom: 16,
  },
  segmentedButtons: {
    marginTop: 8,
  },
  prioritySection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: theme.colors.onSurface,
  },
  priorityButtons: {
    marginTop: 8,
  },
  attachmentButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  attachmentButton: {
    flex: 1,
  },
  attachmentsList: {
    marginTop: 16,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    marginBottom: 8,
  },
  attachmentImage: {
    width: 50,
    height: 50,
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
  },
  actionButtons: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    marginBottom: 8,
  },
});

export default CreateReportScreen;
