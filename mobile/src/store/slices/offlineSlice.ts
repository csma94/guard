import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../../services/api';

interface OfflineAction {
  id: string;
  type: string;
  data: any;
  timestamp: string;
  retryCount: number;
  maxRetries: number;
}

interface OfflineState {
  isOnline: boolean;
  syncInProgress: boolean;
  queuedActions: OfflineAction[];
  lastSyncTime: string | null;
  syncErrors: string[];
  pendingUploads: string[];
}

const initialState: OfflineState = {
  isOnline: true,
  syncInProgress: false,
  queuedActions: [],
  lastSyncTime: null,
  syncErrors: [],
  pendingUploads: [],
};

// Async thunks
export const syncOfflineData = createAsyncThunk(
  'offline/syncData',
  async (queuedActions: OfflineAction[], { rejectWithValue }) => {
    try {
      const syncResults = {
        successful: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const action of queuedActions) {
        try {
          await processOfflineAction(action);
          syncResults.successful++;
        } catch (error: any) {
          syncResults.failed++;
          syncResults.errors.push(`${action.type}: ${error.message}`);
          
          // Retry logic
          if (action.retryCount < action.maxRetries) {
            action.retryCount++;
            // Re-queue for retry
            await queueOfflineAction(action);
          }
        }
      }

      return syncResults;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Sync failed');
    }
  }
);

export const queueOfflineAction = async (action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>) => {
  const offlineAction: OfflineAction = {
    ...action,
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    retryCount: 0,
    maxRetries: action.maxRetries || 3,
  };

  try {
    const existingQueue = await getOfflineQueue();
    const newQueue = [...existingQueue, offlineAction];
    await AsyncStorage.setItem('@offline_queue', JSON.stringify(newQueue));
    return offlineAction;
  } catch (error) {
    console.error('Failed to queue offline action:', error);
    throw error;
  }
};

export const getOfflineQueue = async (): Promise<OfflineAction[]> => {
  try {
    const queueData = await AsyncStorage.getItem('@offline_queue');
    return queueData ? JSON.parse(queueData) : [];
  } catch (error) {
    console.error('Failed to get offline queue:', error);
    return [];
  }
};

export const clearOfflineQueue = async () => {
  try {
    await AsyncStorage.removeItem('@offline_queue');
  } catch (error) {
    console.error('Failed to clear offline queue:', error);
  }
};

const processOfflineAction = async (action: OfflineAction) => {
  switch (action.type) {
    case 'LOCATION_UPDATE':
      await apiClient.post('/locations', action.data);
      break;
    
    case 'CLOCK_IN':
      await apiClient.post('/attendance/clock-in', action.data);
      break;
    
    case 'CLOCK_OUT':
      await apiClient.post('/attendance/clock-out', action.data);
      break;
    
    case 'SUBMIT_REPORT':
      await apiClient.post('/reports', action.data);
      break;
    
    case 'UPDATE_SHIFT_STATUS':
      await apiClient.patch(`/shifts/${action.data.shiftId}/status`, {
        status: action.data.status,
        metadata: action.data.metadata,
      });
      break;
    
    case 'UPLOAD_MEDIA':
      const formData = new FormData();
      formData.append('file', action.data.file);
      formData.append('type', action.data.type);
      formData.append('metadata', JSON.stringify(action.data.metadata));
      
      await apiClient.post('/media/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      break;
    
    default:
      throw new Error(`Unknown offline action type: ${action.type}`);
  }
};

const offlineSlice = createSlice({
  name: 'offline',
  initialState,
  reducers: {
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    addQueuedAction: (state, action: PayloadAction<OfflineAction>) => {
      state.queuedActions.push(action.payload);
    },
    removeQueuedAction: (state, action: PayloadAction<string>) => {
      state.queuedActions = state.queuedActions.filter(
        action => action.id !== action.payload
      );
    },
    clearQueuedActions: (state) => {
      state.queuedActions = [];
    },
    addSyncError: (state, action: PayloadAction<string>) => {
      state.syncErrors.push(action.payload);
    },
    clearSyncErrors: (state) => {
      state.syncErrors = [];
    },
    addPendingUpload: (state, action: PayloadAction<string>) => {
      state.pendingUploads.push(action.payload);
    },
    removePendingUpload: (state, action: PayloadAction<string>) => {
      state.pendingUploads = state.pendingUploads.filter(
        upload => upload !== action.payload
      );
    },
    setLastSyncTime: (state, action: PayloadAction<string>) => {
      state.lastSyncTime = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncOfflineData.pending, (state) => {
        state.syncInProgress = true;
        state.syncErrors = [];
      })
      .addCase(syncOfflineData.fulfilled, (state, action) => {
        state.syncInProgress = false;
        state.lastSyncTime = new Date().toISOString();
        
        if (action.payload.errors.length > 0) {
          state.syncErrors = action.payload.errors;
        }
        
        // Remove successfully synced actions
        if (action.payload.successful > 0) {
          state.queuedActions = state.queuedActions.slice(action.payload.successful);
        }
      })
      .addCase(syncOfflineData.rejected, (state, action) => {
        state.syncInProgress = false;
        state.syncErrors.push(action.payload as string);
      });
  },
});

export const {
  setOnlineStatus,
  addQueuedAction,
  removeQueuedAction,
  clearQueuedActions,
  addSyncError,
  clearSyncErrors,
  addPendingUpload,
  removePendingUpload,
  setLastSyncTime,
} = offlineSlice.actions;

export default offlineSlice.reducer;
