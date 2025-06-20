import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import * as Location from 'expo-location';
import { apiClient } from '../../services/api';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
}

interface GeofenceStatus {
  isWithin: boolean;
  distance: number;
  siteId: string;
  siteName: string;
}

interface LocationState {
  currentLocation: LocationData | null;
  isTracking: boolean;
  isLocationEnabled: boolean;
  hasLocationPermission: boolean;
  geofenceStatus: GeofenceStatus | null;
  locationHistory: LocationData[];
  error: string | null;
  lastUpdate: string | null;
  trackingStartTime: string | null;
  backgroundTaskId: string | null;
}

const initialState: LocationState = {
  currentLocation: null,
  isTracking: false,
  isLocationEnabled: false,
  hasLocationPermission: false,
  geofenceStatus: null,
  locationHistory: [],
  error: null,
  lastUpdate: null,
  trackingStartTime: null,
  backgroundTaskId: null,
};

// Async thunks
export const requestLocationPermission = createAsyncThunk(
  'location/requestPermission',
  async (_, { rejectWithValue }) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return rejectWithValue('Location permission denied');
      }

      // Also request background permission for tracking
      const backgroundStatus = await Location.requestBackgroundPermissionsAsync();
      
      return {
        foreground: status === 'granted',
        background: backgroundStatus.status === 'granted',
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to request location permission');
    }
  }
);

export const getCurrentLocation = createAsyncThunk(
  'location/getCurrent',
  async (_, { rejectWithValue }) => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        maximumAge: 10000, // 10 seconds
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
        altitude: location.coords.altitude || undefined,
        speed: location.coords.speed || undefined,
        heading: location.coords.heading || undefined,
        timestamp: location.timestamp,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to get current location');
    }
  }
);

export const submitLocationUpdate = createAsyncThunk(
  'location/submitUpdate',
  async (data: {
    location: LocationData;
    shiftId?: string;
    batteryLevel?: number;
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/locations', {
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        accuracy: data.location.accuracy,
        altitude: data.location.altitude,
        speed: data.location.speed,
        heading: data.location.heading,
        timestamp: new Date(data.location.timestamp).toISOString(),
        shiftId: data.shiftId,
        batteryLevel: data.batteryLevel,
      });

      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to submit location');
    }
  }
);

export const validateGeofence = createAsyncThunk(
  'location/validateGeofence',
  async (data: {
    latitude: number;
    longitude: number;
    siteId: string;
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/locations/geofence/validate', data);
      return response.data.validation;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Geofence validation failed');
    }
  }
);

export const startLocationTracking = createAsyncThunk(
  'location/startTracking',
  async (options: {
    shiftId?: string;
    interval?: number;
    accuracy?: Location.Accuracy;
  } = {}, { dispatch, rejectWithValue }) => {
    try {
      // Check permissions first
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission required');
      }

      // Start watching position
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: options.accuracy || Location.Accuracy.High,
          timeInterval: options.interval || 30000, // 30 seconds
          distanceInterval: 10, // 10 meters
        },
        (location) => {
          const locationData: LocationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy || 0,
            altitude: location.coords.altitude || undefined,
            speed: location.coords.speed || undefined,
            heading: location.coords.heading || undefined,
            timestamp: location.timestamp,
          };

          dispatch(updateCurrentLocation(locationData));
          
          // Submit location update if shift is active
          if (options.shiftId) {
            dispatch(submitLocationUpdate({
              location: locationData,
              shiftId: options.shiftId,
            }));
          }
        }
      );

      return {
        subscriptionId: subscription.toString(),
        startTime: new Date().toISOString(),
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to start location tracking');
    }
  }
);

export const stopLocationTracking = createAsyncThunk(
  'location/stopTracking',
  async (subscriptionId: string, { rejectWithValue }) => {
    try {
      // In a real implementation, you would stop the location subscription
      // For now, we'll just return success
      return { stopped: true };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to stop location tracking');
    }
  }
);

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    updateCurrentLocation: (state, action: PayloadAction<LocationData>) => {
      state.currentLocation = action.payload;
      state.lastUpdate = new Date().toISOString();
      
      // Add to history (keep last 100 points)
      state.locationHistory.push(action.payload);
      if (state.locationHistory.length > 100) {
        state.locationHistory.shift();
      }
    },
    setGeofenceStatus: (state, action: PayloadAction<GeofenceStatus>) => {
      state.geofenceStatus = action.payload;
    },
    clearLocationHistory: (state) => {
      state.locationHistory = [];
    },
    clearError: (state) => {
      state.error = null;
    },
    setLocationEnabled: (state, action: PayloadAction<boolean>) => {
      state.isLocationEnabled = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Request permission
      .addCase(requestLocationPermission.fulfilled, (state, action) => {
        state.hasLocationPermission = action.payload.foreground;
        state.error = null;
      })
      .addCase(requestLocationPermission.rejected, (state, action) => {
        state.hasLocationPermission = false;
        state.error = action.payload as string;
      })
      // Get current location
      .addCase(getCurrentLocation.fulfilled, (state, action) => {
        state.currentLocation = action.payload;
        state.lastUpdate = new Date().toISOString();
        state.error = null;
      })
      .addCase(getCurrentLocation.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // Submit location update
      .addCase(submitLocationUpdate.fulfilled, (state, action) => {
        // Update geofence status from server response
        if (action.payload.geofenceStatus) {
          state.geofenceStatus = {
            isWithin: action.payload.compliance,
            distance: action.payload.distance,
            siteId: action.payload.geofenceStatus.siteId || '',
            siteName: action.payload.geofenceStatus.siteName || '',
          };
        }
      })
      .addCase(submitLocationUpdate.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // Validate geofence
      .addCase(validateGeofence.fulfilled, (state, action) => {
        state.geofenceStatus = {
          isWithin: action.payload.isWithin,
          distance: action.payload.distance,
          siteId: action.payload.siteId,
          siteName: action.payload.siteName,
        };
      })
      // Start tracking
      .addCase(startLocationTracking.pending, (state) => {
        state.error = null;
      })
      .addCase(startLocationTracking.fulfilled, (state, action) => {
        state.isTracking = true;
        state.trackingStartTime = action.payload.startTime;
        state.backgroundTaskId = action.payload.subscriptionId;
        state.error = null;
      })
      .addCase(startLocationTracking.rejected, (state, action) => {
        state.isTracking = false;
        state.error = action.payload as string;
      })
      // Stop tracking
      .addCase(stopLocationTracking.fulfilled, (state) => {
        state.isTracking = false;
        state.trackingStartTime = null;
        state.backgroundTaskId = null;
      });
  },
});

export const {
  updateCurrentLocation,
  setGeofenceStatus,
  clearLocationHistory,
  clearError,
  setLocationEnabled,
} = locationSlice.actions;

export default locationSlice.reducer;
