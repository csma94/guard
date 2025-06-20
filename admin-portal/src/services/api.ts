import axios, { AxiosInstance, AxiosResponse } from 'axios';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add Clerk auth token
apiClient.interceptors.request.use(
  async (config) => {
    // Get Clerk session token
    try {
      // This will be set by the calling component using Clerk's getToken method
      const token = config.headers['Authorization'];
      if (!token) {
        // Token should be set by the calling component
        console.warn('No authorization token provided for API request');
      }
    } catch (error) {
      console.error('Error getting Clerk token:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - let Clerk handle authentication
      console.warn('Unauthorized request - user may need to sign in');
      // Don't redirect here, let the component handle it
    }
    return Promise.reject(error);
  }
);

// API Response Types
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Helper function to create authenticated API calls
export const createAuthenticatedRequest = async (token: string) => {
  return {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  };
};

// Users API
export const usersAPI = {
  getAll: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/users', { params }),
  
  getById: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get(`/users/${id}`),
  
  create: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/users', data),
  
  update: (id: string, data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.put(`/users/${id}`, data),
  
  delete: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.delete(`/users/${id}`),
};

// Agents API
export const agentsAPI = {
  getAll: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/agents', { params }),
  
  getById: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get(`/agents/${id}`),
  
  create: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/agents', data),
  
  update: (id: string, data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.put(`/agents/${id}`, data),
  
  delete: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.delete(`/agents/${id}`),
};

// Shifts API
export const shiftsAPI = {
  getAll: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/shifts', { params }),
  
  getById: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get(`/shifts/${id}`),
  
  create: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/shifts', data),
  
  update: (id: string, data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.put(`/shifts/${id}`, data),
  
  delete: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.delete(`/shifts/${id}`),
};

// Sites API
export const sitesAPI = {
  getAll: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/sites', { params }),
  
  getById: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get(`/sites/${id}`),
  
  create: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/sites', data),
  
  update: (id: string, data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.put(`/sites/${id}`, data),
  
  delete: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.delete(`/sites/${id}`),
};

// Reports API
export const reportsAPI = {
  getAll: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/reports', { params }),
  
  getById: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get(`/reports/${id}`),
  
  create: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/reports', data),
  
  update: (id: string, data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.put(`/reports/${id}`, data),
  
  delete: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.delete(`/reports/${id}`),
};

// Analytics API
export const analyticsAPI = {
  getDashboard: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/analytics/dashboard', { params }),

  getKPIMetrics: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/analytics/kpi', { params }),

  getDashboardWidgets: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/analytics/widgets', { params }),

  getRealtimeMetrics: (): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/analytics/realtime'),

  exportDashboard: (params: any): Promise<AxiosResponse<any>> =>
    apiClient.post('/analytics/export', params, { responseType: 'blob' }),

  getAvailableFields: (): Promise<AxiosResponse<ApiResponse<{ fields: any[] }>>> =>
    apiClient.get('/analytics/fields'),

  generateCustomReport: (config: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/analytics/custom-report', config),

  getOperationalAnalytics: (params: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/analytics/operational', { params }),

  exportAnalytics: (params: any): Promise<AxiosResponse<any>> =>
    apiClient.post('/analytics/export', params, { responseType: 'blob' }),
};

// Audit API
export const auditAPI = {
  getLogs: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/audit/logs', { params }),

  getLogById: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get(`/audit/logs/${id}`),

  exportLogs: (params: any): Promise<AxiosResponse<any>> =>
    apiClient.post('/audit/export', params, { responseType: 'blob' }),

  getAuditLogs: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/audit/logs', { params }),

  exportAuditLogs: (params: any): Promise<AxiosResponse<any>> =>
    apiClient.post('/audit/export', params, { responseType: 'blob' }),
};

// Compliance API
export const complianceAPI = {
  getReports: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/compliance/reports', { params }),

  generateReport: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/compliance/generate', data),

  getCompliance: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/compliance/status', { params }),

  getComplianceChecks: (): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/compliance/checks'),

  getComplianceReports: (): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/compliance/reports'),

  runComplianceCheck: (checkId: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post(`/compliance/checks/${checkId}/run`),

  generateComplianceReport: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/compliance/reports', data),
};

// Business Intelligence API
export const businessIntelligenceAPI = {
  getMetrics: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/bi/metrics', { params }),

  getPredictions: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/bi/predictions', { params }),

  getTrends: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/bi/trends', { params }),

  getBIMetrics: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/bi/metrics', { params }),

  exportInsights: (params: any): Promise<AxiosResponse<any>> =>
    apiClient.post('/bi/export', params, { responseType: 'blob' }),
};

// Monitoring API
export const monitoringAPI = {
  getAgentLocations: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/monitoring/locations', { params }),

  getSystemStatus: (): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/monitoring/status'),

  getAlerts: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/monitoring/alerts', { params }),

  acknowledgeAlert: (alertId: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post(`/monitoring/alerts/${alertId}/acknowledge`),

  getActiveAgentLocations: (): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/monitoring/agent-locations?active=true'),

  getActiveAlerts: (): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/monitoring/alerts?active=true'),
};

// Scheduling API
export const schedulingAPI = {
  getSchedule: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/scheduling/schedule', { params }),

  getCurrentSchedule: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/scheduling/current', { params }),

  createShift: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/scheduling/shifts', data),

  updateShift: (id: string, data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.put(`/scheduling/shifts/${id}`, data),

  deleteShift: (id: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.delete(`/scheduling/shifts/${id}`),

  getAvailability: (params?: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/scheduling/availability', { params }),

  checkConflicts: (params: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/scheduling/check-conflicts', params),

  optimizeSchedule: (requirements: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/scheduling/optimize', requirements),

  applyOptimizedSchedule: (scheduleId: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post(`/scheduling/apply/${scheduleId}`),

  exportSchedule: (params: any): Promise<AxiosResponse<any>> =>
    apiClient.post('/scheduling/export', params, { responseType: 'blob' }),
};

// System API
export const systemAPI = {
  getConfig: (): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/system/config'),

  updateConfig: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.put('/system/config', data),

  getHealth: (): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/system/health'),

  getLogs: (params?: any): Promise<AxiosResponse<ApiResponse<any[]>>> =>
    apiClient.get('/system/logs', { params }),

  getSystemConfig: (): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.get('/system/config'),

  updateSystemConfig: (data: any): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.put('/system/config', data),

  testConnection: (type: string): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post(`/system/test-connection/${type}`),

  createSystemBackup: (): Promise<AxiosResponse<ApiResponse<any>>> =>
    apiClient.post('/system/backup'),
};

// Export the main API client
export { apiClient };

// Default export
export default apiClient;
