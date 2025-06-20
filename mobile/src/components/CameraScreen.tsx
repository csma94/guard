import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  Dimensions,
  Image,
} from 'react-native';
import { Camera, CameraType, FlashMode } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';

interface CameraScreenProps {
  onPhotoTaken?: (photoUri: string) => void;
  maxPhotos?: number;
  showGallery?: boolean;
}

const { width, height } = Dimensions.get('window');

const CameraScreen: React.FC<CameraScreenProps> = ({
  onPhotoTaken,
  maxPhotos = 10,
  showGallery = true,
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [type, setType] = useState(CameraType.back);
  const [flash, setFlash] = useState(FlashMode.off);
  const [isRecording, setIsRecording] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  
  const cameraRef = useRef<Camera>(null);
  const navigation = useNavigation();

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (showGallery) {
        await MediaLibrary.requestPermissionsAsync();
      }
    })();
  }, []);

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
          exif: true,
        });

        setLastPhoto(photo.uri);
        setPhotos(prev => [...prev, photo.uri]);

        if (onPhotoTaken) {
          onPhotoTaken(photo.uri);
        }

        // Save to device gallery if permission granted
        if (showGallery) {
          try {
            await MediaLibrary.saveToLibraryAsync(photo.uri);
          } catch (error) {
            console.log('Failed to save to gallery:', error);
          }
        }

        // Show success feedback
        Alert.alert('Photo Captured', 'Photo has been saved successfully!');
      } catch (error) {
        console.error('Failed to take picture:', error);
        Alert.alert('Error', 'Failed to capture photo. Please try again.');
      }
    }
  };

  const toggleCameraType = () => {
    setType(current => 
      current === CameraType.back ? CameraType.front : CameraType.back
    );
  };

  const toggleFlash = () => {
    setFlash(current => {
      switch (current) {
        case FlashMode.off:
          return FlashMode.on;
        case FlashMode.on:
          return FlashMode.auto;
        case FlashMode.auto:
          return FlashMode.off;
        default:
          return FlashMode.off;
      }
    });
  };

  const getFlashIcon = () => {
    switch (flash) {
      case FlashMode.on:
        return 'flash-on';
      case FlashMode.auto:
        return 'flash-auto';
      case FlashMode.off:
      default:
        return 'flash-off';
    }
  };

  const deletePhoto = (photoUri: string) => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setPhotos(prev => prev.filter(uri => uri !== photoUri));
            if (lastPhoto === photoUri) {
              setLastPhoto(photos.length > 1 ? photos[photos.length - 2] : null);
            }
          },
        },
      ]
    );
  };

  const retakePhoto = () => {
    if (photos.length > 0) {
      const lastPhotoUri = photos[photos.length - 1];
      setPhotos(prev => prev.slice(0, -1));
      setLastPhoto(photos.length > 1 ? photos[photos.length - 2] : null);
      
      // Delete the file
      FileSystem.deleteAsync(lastPhotoUri, { idempotent: true });
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={styles.camera}
        type={type}
        flashMode={flash}
        ref={cameraRef}
      >
        <View style={styles.overlay}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="close" size={30} color="white" />
            </TouchableOpacity>
            
            <Text style={styles.photoCounter}>
              {photos.length}/{maxPhotos}
            </Text>
            
            <TouchableOpacity
              style={styles.headerButton}
              onPress={toggleFlash}
            >
              <MaterialIcons name={getFlashIcon()} size={30} color="white" />
            </TouchableOpacity>
          </View>

          {/* Camera Controls */}
          <View style={styles.controls}>
            {/* Last Photo Preview */}
            <View style={styles.previewContainer}>
              {lastPhoto ? (
                <TouchableOpacity onPress={() => deletePhoto(lastPhoto)}>
                  <Image source={{ uri: lastPhoto }} style={styles.preview} />
                </TouchableOpacity>
              ) : (
                <View style={styles.previewPlaceholder} />
              )}
            </View>

            {/* Capture Button */}
            <TouchableOpacity
              style={[
                styles.captureButton,
                photos.length >= maxPhotos && styles.captureButtonDisabled
              ]}
              onPress={takePicture}
              disabled={photos.length >= maxPhotos}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>

            {/* Flip Camera */}
            <TouchableOpacity
              style={styles.flipButton}
              onPress={toggleCameraType}
            >
              <MaterialIcons name="flip-camera-ios" size={30} color="white" />
            </TouchableOpacity>
          </View>

          {/* Bottom Actions */}
          <View style={styles.bottomActions}>
            {photos.length > 0 && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={retakePhoto}
              >
                <MaterialIcons name="undo" size={24} color="white" />
                <Text style={styles.actionButtonText}>Retake</Text>
              </TouchableOpacity>
            )}
            
            {photos.length > 0 && (
              <TouchableOpacity
                style={[styles.actionButton, styles.doneButton]}
                onPress={() => navigation.goBack()}
              >
                <MaterialIcons name="check" size={24} color="white" />
                <Text style={styles.actionButtonText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Camera>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  headerButton: {
    padding: 10,
  },
  photoCounter: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  previewContainer: {
    width: 60,
    height: 60,
  },
  preview: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'white',
  },
  previewPlaceholder: {
    width: 60,
    height: 60,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  flipButton: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 30,
    gap: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    gap: 8,
  },
  doneButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.8)',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  text: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CameraScreen;
