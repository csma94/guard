import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { analyticsAPI } from '../../services/api';

export interface DashboardMetrics {
  totalAgents: number;
  activeShifts: number;
  totalSites: number;
  incidentsToday: number;
  responseTime: number;
  complianceScore: number;
  totalUsers?: number;
  activeAgents?: number;
  reportsToday?: number;
  completionRate?: number;
  avgResponseTime?: number;
  usersTrend?: number;
  agentsTrend?: number;
  sitesTrend?: number;
  shiftsTrend?: number;
  reportsTrend?: number;
  incidentsTrend?: number;
  completionTrend?: number;
  responseTrend?: number;
}

export interface DashboardState {
  metrics: DashboardMetrics | null;
  widgets: any[];
  realtimeData: any;
  recentActivity: any[];
  systemStatus: any;
  alerts: any[];
  performanceData: any[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const initialState: DashboardState = {
  metrics: null,
  widgets: [],
  realtimeData: null,
  recentActivity: [],
  systemStatus: null,
  alerts: [],
  performanceData: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
};

// Async thunks
export const fetchDashboardData = createAsyncThunk(
  'dashboard/fetchData',
  async (params?: any) => {
    const [metricsResponse, widgetsResponse, realtimeResponse] = await Promise.all([
      analyticsAPI.getKPIMetrics(params),
      analyticsAPI.getDashboardWidgets(params),
      analyticsAPI.getRealtimeMetrics(),
    ]);

    return {
      metrics: metricsResponse.data.data || metricsResponse.data,
      widgets: widgetsResponse.data.data || widgetsResponse.data || [],
      realtimeData: realtimeResponse.data.data || realtimeResponse.data,
      recentActivity: metricsResponse.data.data?.recentActivity || [],
      systemStatus: metricsResponse.data.data?.systemHealth || null,
      alerts: realtimeResponse.data.data?.alerts || [],
      performanceData: realtimeResponse.data.data?.performanceData || [],
    };
  }
);

export const refreshRealtimeData = createAsyncThunk(
  'dashboard/refreshRealtime',
  async () => {
    const response = await analyticsAPI.getRealtimeMetrics();
    return response.data;
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    updateRealtimeData: (state, action: PayloadAction<any>) => {
      state.realtimeData = action.payload;
      state.lastUpdated = new Date().toISOString();
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardData.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        state.isLoading = false;
        state.metrics = action.payload.metrics;
        state.widgets = action.payload.widgets;
        state.realtimeData = action.payload.realtimeData;
        state.recentActivity = action.payload.recentActivity;
        state.systemStatus = action.payload.systemStatus;
        state.alerts = action.payload.alerts;
        state.performanceData = action.payload.performanceData;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchDashboardData.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch dashboard data';
      })
      .addCase(refreshRealtimeData.fulfilled, (state, action) => {
        state.realtimeData = action.payload;
        state.lastUpdated = new Date().toISOString();
      });
  },
});

export const { updateRealtimeData, clearError } = dashboardSlice.actions;
export default dashboardSlice.reducer;
