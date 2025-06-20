import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../services/api';
import { logger } from '../../utils/logger';

interface QRCodeState {
  isLoading: boolean;
  error: string | null;
  lastScanResult: any | null;
  scanHistory: any[];
  verificationCache: Record<string, any>;
}

const initialState: QRCodeState = {
  isLoading: false,
  error: null,
  lastScanResult: null,
  scanHistory: [],
  verificationCache: {},
};

// Async thunks
export const verifyQRCode = createAsyncThunk(
  'qrCode/verify',
  async (payload: { qrData: string; scanContext: any }, { rejectWithValue }) => {
    try {
      logger.info('Verifying QR code', { 
        dataLength: payload.qrData.length,
        hasLocation: !!payload.scanContext.scanLocation 
      });

      const response = await apiClient.post('/mobile/qr/verify', {
        qrData: payload.qrData,
        scanContext: payload.scanContext,
      });

      const result = response.data;
      
      logger.info('QR code verification result', {
        valid: result.valid,
        siteId: result.siteId,
        securityLevel: result.securityLevel,
      });

      return result;
    } catch (error: any) {
      logger.error('QR code verification failed:', error);
      return rejectWithValue(error.response?.data?.message || 'QR verification failed');
    }
  }
);

export const generateQRCode = createAsyncThunk(
  'qrCode/generate',
  async (payload: { siteId: string; purpose: string; validityMinutes?: number }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/mobile/qr/generate', payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'QR generation failed');
    }
  }
);

export const getScanHistory = createAsyncThunk(
  'qrCode/getScanHistory',
  async (params: { limit?: number; offset?: number } = {}, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/mobile/qr/scan-history', { params });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch scan history');
    }
  }
);

const qrCodeSlice = createSlice({
  name: 'qrCode',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearLastScanResult: (state) => {
      state.lastScanResult = null;
    },
    addToVerificationCache: (state, action: PayloadAction<{ key: string; result: any }>) => {
      state.verificationCache[action.payload.key] = {
        ...action.payload.result,
        cachedAt: new Date().toISOString(),
      };
    },
    clearVerificationCache: (state) => {
      state.verificationCache = {};
    },
  },
  extraReducers: (builder) => {
    builder
      // Verify QR Code
      .addCase(verifyQRCode.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyQRCode.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastScanResult = action.payload;
        state.scanHistory.unshift(action.payload);
        
        // Keep only last 50 scans in memory
        if (state.scanHistory.length > 50) {
          state.scanHistory = state.scanHistory.slice(0, 50);
        }
      })
      .addCase(verifyQRCode.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      
      // Generate QR Code
      .addCase(generateQRCode.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(generateQRCode.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(generateQRCode.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      
      // Get Scan History
      .addCase(getScanHistory.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getScanHistory.fulfilled, (state, action) => {
        state.isLoading = false;
        state.scanHistory = action.payload.scans || [];
      })
      .addCase(getScanHistory.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { 
  clearError, 
  clearLastScanResult, 
  addToVerificationCache, 
  clearVerificationCache 
} = qrCodeSlice.actions;

export default qrCodeSlice.reducer;
