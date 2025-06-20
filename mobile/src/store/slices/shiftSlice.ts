import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../services/api';

interface Shift {
  id: string;
  siteId: string;
  agentId: string;
  supervisorId?: string;
  startTime: string;
  endTime: string;
  actualStartTime?: string;
  actualEndTime?: string;
  shiftType: string;
  status: string;
  priority: string;
  requirements: any;
  notes?: string;
  site: {
    id: string;
    name: string;
    address: string;
    coordinates: string;
    client: {
      id: string;
      companyName: string;
    };
  };
  attendance?: {
    id: string;
    clockInTime?: string;
    clockOutTime?: string;
    clockInLocation?: string;
    clockOutLocation?: string;
    status: string;
  };
}

interface ShiftState {
  currentShift: Shift | null;
  upcomingShifts: Shift[];
  pastShifts: Shift[];
  availableAgents: any[];
  availability: any | null;
  swapRequests: any[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  clockInStatus: 'idle' | 'clocking_in' | 'clocked_in' | 'clocking_out' | 'clocked_out';
}

const initialState: ShiftState = {
  currentShift: null,
  upcomingShifts: [],
  pastShifts: [],
  availableAgents: [],
  availability: null,
  swapRequests: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
  clockInStatus: 'idle',
};

// Async thunks
export const fetchMyShifts = createAsyncThunk(
  'shift/fetchMyShifts',
  async (params: { startDate?: string; endDate?: string } = {}, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/shifts/my-shifts', { params });
      return response.data.shifts;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch shifts');
    }
  }
);

export const fetchCurrentShift = createAsyncThunk(
  'shift/fetchCurrent',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/shifts/current');
      return response.data.shift;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // No current shift
      }
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch current shift');
    }
  }
);

export const fetchShiftDetails = createAsyncThunk(
  'shift/fetchDetails',
  async (shiftId: string, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/shifts/${shiftId}`);
      return response.data.shift;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch shift details');
    }
  }
);

export const clockIn = createAsyncThunk(
  'shift/clockIn',
  async (data: { shiftId: string; location: { latitude: number; longitude: number } }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/attendance/clock-in', data);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Clock in failed');
    }
  }
);

export const clockOut = createAsyncThunk(
  'shift/clockOut',
  async (data: { shiftId: string; location: { latitude: number; longitude: number } }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/attendance/clock-out', data);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Clock out failed');
    }
  }
);

export const updateShiftStatus = createAsyncThunk(
  'shift/updateStatus',
  async (data: { shiftId: string; status: string; metadata?: any }, { rejectWithValue }) => {
    try {
      const response = await apiClient.patch(`/shifts/${data.shiftId}/status`, {
        status: data.status,
        metadata: data.metadata,
      });
      return response.data.shift;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update shift status');
    }
  }
);

export const submitShiftReport = createAsyncThunk(
  'shift/submitReport',
  async (data: { shiftId: string; reportData: any }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/reports', {
        shiftId: data.shiftId,
        ...data.reportData,
      });
      return response.data.report;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to submit report');
    }
  }
);

export const requestShiftSwap = createAsyncThunk(
  'shift/requestSwap',
  async (payload: {
    shiftId: string;
    requestedAgentId: string;
    reason: string;
    swapType: 'PERMANENT' | 'TEMPORARY';
    requestedBy: string;
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/mobile/shifts/swap-request', payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Shift swap request failed');
    }
  }
);

export const getAvailableAgents = createAsyncThunk(
  'shift/getAvailableAgents',
  async (payload: {
    shiftId: string;
    startTime: string;
    endTime: string;
    siteId: string;
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/mobile/shifts/available-agents', { params: payload });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch available agents');
    }
  }
);

export const updateAvailability = createAsyncThunk(
  'shift/updateAvailability',
  async (payload: {
    agentId: string;
    weeklySlots: any[];
    effectiveDate: string;
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.put('/mobile/agents/availability', payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update availability');
    }
  }
);

export const getMyAvailability = createAsyncThunk(
  'shift/getMyAvailability',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/mobile/agents/my-availability');
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch availability');
    }
  }
);

const shiftSlice = createSlice({
  name: 'shift',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentShift: (state, action: PayloadAction<Shift | null>) => {
      state.currentShift = action.payload;
    },
    updateCurrentShift: (state, action: PayloadAction<Partial<Shift>>) => {
      if (state.currentShift) {
        state.currentShift = { ...state.currentShift, ...action.payload };
      }
    },
    setClockInStatus: (state, action: PayloadAction<ShiftState['clockInStatus']>) => {
      state.clockInStatus = action.payload;
    },
    addUpcomingShift: (state, action: PayloadAction<Shift>) => {
      const existingIndex = state.upcomingShifts.findIndex(shift => shift.id === action.payload.id);
      if (existingIndex >= 0) {
        state.upcomingShifts[existingIndex] = action.payload;
      } else {
        state.upcomingShifts.push(action.payload);
        state.upcomingShifts.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      }
    },
    removeUpcomingShift: (state, action: PayloadAction<string>) => {
      state.upcomingShifts = state.upcomingShifts.filter(shift => shift.id !== action.payload);
    },
    moveShiftToPast: (state, action: PayloadAction<string>) => {
      const shiftIndex = state.upcomingShifts.findIndex(shift => shift.id === action.payload);
      if (shiftIndex >= 0) {
        const shift = state.upcomingShifts[shiftIndex];
        state.upcomingShifts.splice(shiftIndex, 1);
        state.pastShifts.unshift(shift);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch my shifts
      .addCase(fetchMyShifts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchMyShifts.fulfilled, (state, action) => {
        state.isLoading = false;
        const now = new Date();
        const shifts = action.payload;

        // Categorize shifts
        state.upcomingShifts = shifts.filter((shift: Shift) => 
          new Date(shift.startTime) > now
        ).sort((a: Shift, b: Shift) => 
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );

        state.pastShifts = shifts.filter((shift: Shift) => 
          new Date(shift.endTime) < now
        ).sort((a: Shift, b: Shift) => 
          new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
        );

        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchMyShifts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch current shift
      .addCase(fetchCurrentShift.fulfilled, (state, action) => {
        state.currentShift = action.payload;
        if (action.payload?.attendance) {
          if (action.payload.attendance.clockInTime && !action.payload.attendance.clockOutTime) {
            state.clockInStatus = 'clocked_in';
          } else if (action.payload.attendance.clockOutTime) {
            state.clockInStatus = 'clocked_out';
          }
        }
      })
      // Fetch shift details
      .addCase(fetchShiftDetails.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchShiftDetails.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentShift = action.payload;
        if (action.payload?.attendance) {
          if (action.payload.attendance.clockInTime && !action.payload.attendance.clockOutTime) {
            state.clockInStatus = 'clocked_in';
          } else if (action.payload.attendance.clockOutTime) {
            state.clockInStatus = 'clocked_out';
          }
        }
      })
      .addCase(fetchShiftDetails.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Clock in
      .addCase(clockIn.pending, (state) => {
        state.clockInStatus = 'clocking_in';
        state.error = null;
      })
      .addCase(clockIn.fulfilled, (state, action) => {
        state.clockInStatus = 'clocked_in';
        if (state.currentShift) {
          state.currentShift.attendance = action.payload.attendance;
          state.currentShift.status = 'IN_PROGRESS';
        }
      })
      .addCase(clockIn.rejected, (state, action) => {
        state.clockInStatus = 'idle';
        state.error = action.payload as string;
      })
      // Clock out
      .addCase(clockOut.pending, (state) => {
        state.clockInStatus = 'clocking_out';
        state.error = null;
      })
      .addCase(clockOut.fulfilled, (state, action) => {
        state.clockInStatus = 'clocked_out';
        if (state.currentShift) {
          state.currentShift.attendance = action.payload.attendance;
          state.currentShift.status = 'COMPLETED';
        }
      })
      .addCase(clockOut.rejected, (state, action) => {
        state.clockInStatus = 'clocked_in';
        state.error = action.payload as string;
      })
      // Update shift status
      .addCase(updateShiftStatus.fulfilled, (state, action) => {
        const updatedShift = action.payload;
        if (state.currentShift?.id === updatedShift.id) {
          state.currentShift = updatedShift;
        }
        
        // Update in upcoming shifts
        const upcomingIndex = state.upcomingShifts.findIndex(shift => shift.id === updatedShift.id);
        if (upcomingIndex >= 0) {
          state.upcomingShifts[upcomingIndex] = updatedShift;
        }
      })
      // Submit shift report
      .addCase(submitShiftReport.fulfilled, (state, action) => {
        // Report submitted successfully
        // Could update shift status or add report reference
      });
  },
});

export const {
  clearError,
  setCurrentShift,
  updateCurrentShift,
  setClockInStatus,
  addUpcomingShift,
  removeUpcomingShift,
  moveShiftToPast,
} = shiftSlice.actions;

export default shiftSlice.reducer;
