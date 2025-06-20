import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../services/api';

interface Report {
  id: string;
  title: string;
  reportType: string;
  status: string;
  priority: string;
  content: any;
  attachments: any[];
  site: any;
  shift: any;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: any;
  reviewedAt?: string;
  reviewNotes?: string;
}

interface ReportState {
  reports: Report[];
  selectedReport: Report | null;
  templates: any[];
  drafts: any[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const initialState: ReportState = {
  reports: [],
  selectedReport: null,
  templates: [],
  drafts: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
};

// Async thunks
export const fetchMyReports = createAsyncThunk(
  'report/fetchMyReports',
  async (params: { 
    startDate?: string; 
    endDate?: string; 
    status?: string;
    reportType?: string;
  } = {}, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/reports/my-reports', { params });
      return response.data.reports;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch reports');
    }
  }
);

export const fetchReportDetails = createAsyncThunk(
  'report/fetchReportDetails',
  async (reportId: string, { rejectWithValue }) => {
    try {
      const response = await apiClient.get(`/reports/${reportId}`);
      return response.data.report;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch report details');
    }
  }
);

export const createReport = createAsyncThunk(
  'report/createReport',
  async (reportData: {
    shiftId: string;
    siteId: string;
    reportType: string;
    title: string;
    content: any;
    priority: string;
    status?: string;
    attachments?: any[];
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/reports', reportData);
      return response.data.report;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create report');
    }
  }
);

export const updateReport = createAsyncThunk(
  'report/updateReport',
  async ({ reportId, ...updateData }: {
    reportId: string;
    title?: string;
    content?: any;
    priority?: string;
    attachments?: any[];
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.put(`/reports/${reportId}`, updateData);
      return response.data.report;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update report');
    }
  }
);

export const deleteReport = createAsyncThunk(
  'report/deleteReport',
  async (reportId: string, { rejectWithValue }) => {
    try {
      await apiClient.delete(`/reports/${reportId}`);
      return reportId;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete report');
    }
  }
);

export const submitReport = createAsyncThunk(
  'report/submitReport',
  async (reportId: string, { rejectWithValue }) => {
    try {
      const response = await apiClient.post(`/reports/${reportId}/submit`);
      return response.data.report;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to submit report');
    }
  }
);

export const uploadAttachment = createAsyncThunk(
  'report/uploadAttachment',
  async ({ reportId, file }: {
    reportId: string;
    file: {
      uri: string;
      type: string;
      name: string;
    };
  }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        type: file.type,
        name: file.name,
      } as any);

      const response = await apiClient.post(`/reports/${reportId}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data.attachment;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to upload attachment');
    }
  }
);

export const getReportTemplates = createAsyncThunk(
  'report/getTemplates',
  async (params: { reportType?: string; category?: string } = {}, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/mobile/reports/templates', { params });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch templates');
    }
  }
);

export const createReportFromTemplate = createAsyncThunk(
  'report/createFromTemplate',
  async (payload: { templateId: string; data: any }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/mobile/reports/from-template', payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create report from template');
    }
  }
);

export const saveReportDraft = createAsyncThunk(
  'report/saveDraft',
  async (payload: any, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/mobile/reports/draft', payload);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to save draft');
    }
  }
);

export const getDrafts = createAsyncThunk(
  'report/getDrafts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get('/mobile/reports/drafts');
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch drafts');
    }
  }
);

const reportSlice = createSlice({
  name: 'report',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setSelectedReport: (state, action: PayloadAction<Report | null>) => {
      state.selectedReport = action.payload;
    },
    clearSelectedReport: (state) => {
      state.selectedReport = null;
    },
    updateReportInList: (state, action: PayloadAction<Report>) => {
      const index = state.reports.findIndex(report => report.id === action.payload.id);
      if (index !== -1) {
        state.reports[index] = action.payload;
      }
    },
    addReportToList: (state, action: PayloadAction<Report>) => {
      state.reports.unshift(action.payload);
    },
    removeReportFromList: (state, action: PayloadAction<string>) => {
      state.reports = state.reports.filter(report => report.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch my reports
      .addCase(fetchMyReports.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchMyReports.fulfilled, (state, action) => {
        state.isLoading = false;
        state.reports = action.payload;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchMyReports.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch report details
      .addCase(fetchReportDetails.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchReportDetails.fulfilled, (state, action) => {
        state.isLoading = false;
        state.selectedReport = action.payload;
      })
      .addCase(fetchReportDetails.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Create report
      .addCase(createReport.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createReport.fulfilled, (state, action) => {
        state.isLoading = false;
        state.reports.unshift(action.payload);
      })
      .addCase(createReport.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Update report
      .addCase(updateReport.fulfilled, (state, action) => {
        const index = state.reports.findIndex(report => report.id === action.payload.id);
        if (index !== -1) {
          state.reports[index] = action.payload;
        }
        if (state.selectedReport?.id === action.payload.id) {
          state.selectedReport = action.payload;
        }
      })
      .addCase(updateReport.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // Delete report
      .addCase(deleteReport.fulfilled, (state, action) => {
        state.reports = state.reports.filter(report => report.id !== action.payload);
        if (state.selectedReport?.id === action.payload) {
          state.selectedReport = null;
        }
      })
      .addCase(deleteReport.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // Submit report
      .addCase(submitReport.fulfilled, (state, action) => {
        const index = state.reports.findIndex(report => report.id === action.payload.id);
        if (index !== -1) {
          state.reports[index] = action.payload;
        }
        if (state.selectedReport?.id === action.payload.id) {
          state.selectedReport = action.payload;
        }
      })
      .addCase(submitReport.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // Upload attachment
      .addCase(uploadAttachment.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const {
  clearError,
  setSelectedReport,
  clearSelectedReport,
  updateReportInList,
  addReportToList,
  removeReportFromList,
} = reportSlice.actions;

export default reportSlice.reducer;
