import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../services/api';
import { logger } from '../../utils/logger';

interface EmergencyState {
  isLoading: boolean;
  error: string | null;
  isEmergencyActive: boolean;
  emergencyId: string | null;
  emergencyHistory: any[];
  emergencyContacts: any[];
  escalationLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const initialState: EmergencyState = {
  isLoading: false,
  error: null,
  isEmergencyActive: false,
  emergencyId: null,
  emergencyHistory: [],
  emergencyContacts: [],
  escalationLevel: 'LOW',
};

// Async thunks
export const triggerEmergencyAlert = createAsyncThunk(
  'emergency/triggerAlert',
  async (emergencyData: {
    agentId: string;
    location?: { latitude: number; longitude: number; accuracy?: number };
    timestamp: string;
    deviceInfo: any;
    emergencyType?: string;
    description?: string;
  }, { rejectWithValue }) => {
    try {
      logger.info('Triggering emergency alert', {
        agentId: emergencyData.agentId,
        hasLocation: !!emergencyData.location,
        emergencyType: emergencyData.emergencyType || 'SOS',
      });

      const response = await apiClient.post('/mobile/emergency/trigger', {
        ...emergencyData,
        emergencyType: emergencyData.emergencyType || 'SOS',
        priority: 'CRITICAL',
        autoEscalate: true,
      });

      const result = response.data;
      
      logger.info('Emergency alert triggered', {
        emergencyId: result.emergencyId,
        escalationLevel: result.escalationLevel,
        notificationsSent: result.notificationsSent,
      });

      return result;
    } catch (error: any) {
      logger.error('Failed to trigger emergency alert:', error);
      return rejectWithValue(error.response?.data?.message || 'Emergency alert failed');
    }
  }
);

export const cancelEmergencyAlert = createAsyncThunk(
  'emergency/cancelAlert',
  async (payload: { emergencyId: string; reason?: string }, { rejectWithValue }) => {
    try {
      logger.info('Cancelling emergency alert', { emergencyId: payload.emergencyId });

      const response = await apiClient.post(`/mobile/emergency/${payload.emergencyId}/cancel`, {
        reason: payload.reason || 'Cancelled by agent',
        timestamp: new Date().toISOString(),
      });

      logger.info('Emergency alert cancelled', { emergencyId: payload.emergencyId });
      return response.data;
    } catch (error: any) {
      logger.error('Failed to cancel emergency alert:', error);
      return rejectWithValue(error.response?.data?.message || 'Failed to cancel emergency');
    }
  }
);

export const updateEmergencyStatus = createAsyncThunk(
  'emergency/updateStatus',
  async (payload: { 
    emergencyId: string; 
    status: string; 
    location?: any; 
    notes?: string 
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.patch(`/mobile/emergency/${payload.emergencyId}/status`, {
        status: payload.status,
        location: payload.location,
        notes: payload.notes,
        timestamp: new Date().toISOString(),
      });

      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update emergency status');
    }
  }
);

export const getEmergencyHistory = createAsyncThunk(
  'emergency/getHistory',
  async (params: { limit?: number; offset?: number } = {}, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/mobile/emergency/history', { params });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch emergency history');
    }
  }
);

export const getEmergencyContacts = createAsyncThunk(
  'emergency/getContacts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/mobile/emergency/contacts');
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch emergency contacts');
    }
  }
);

export const testEmergencySystem = createAsyncThunk(
  'emergency/testSystem',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/mobile/emergency/test');
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Emergency system test failed');
    }
  }
);

const emergencySlice = createSlice({
  name: 'emergency',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setEscalationLevel: (state, action: PayloadAction<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>) => {
      state.escalationLevel = action.payload;
    },
    resetEmergencyState: (state) => {
      state.isEmergencyActive = false;
      state.emergencyId = null;
      state.escalationLevel = 'LOW';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Trigger Emergency Alert
      .addCase(triggerEmergencyAlert.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(triggerEmergencyAlert.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isEmergencyActive = true;
        state.emergencyId = action.payload.emergencyId;
        state.escalationLevel = action.payload.escalationLevel || 'CRITICAL';
        
        // Add to history
        state.emergencyHistory.unshift({
          ...action.payload,
          triggeredAt: new Date().toISOString(),
        });
      })
      .addCase(triggerEmergencyAlert.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      
      // Cancel Emergency Alert
      .addCase(cancelEmergencyAlert.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(cancelEmergencyAlert.fulfilled, (state) => {
        state.isLoading = false;
        state.isEmergencyActive = false;
        state.emergencyId = null;
        state.escalationLevel = 'LOW';
      })
      .addCase(cancelEmergencyAlert.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      
      // Update Emergency Status
      .addCase(updateEmergencyStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateEmergencyStatus.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload.status === 'RESOLVED' || action.payload.status === 'CANCELLED') {
          state.isEmergencyActive = false;
          state.emergencyId = null;
          state.escalationLevel = 'LOW';
        }
      })
      .addCase(updateEmergencyStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      
      // Get Emergency History
      .addCase(getEmergencyHistory.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getEmergencyHistory.fulfilled, (state, action) => {
        state.isLoading = false;
        state.emergencyHistory = action.payload.emergencies || [];
      })
      .addCase(getEmergencyHistory.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      
      // Get Emergency Contacts
      .addCase(getEmergencyContacts.fulfilled, (state, action) => {
        state.emergencyContacts = action.payload.contacts || [];
      })
      
      // Test Emergency System
      .addCase(testEmergencySystem.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(testEmergencySystem.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(testEmergencySystem.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearError, setEscalationLevel, resetEmergencyState } = emergencySlice.actions;

export default emergencySlice.reducer;
