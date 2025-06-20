import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Client Portal specific API endpoints
export const clientPortalAPI = {
  // Dashboard
  getDashboard: () => apiClient.get('/client-portal/dashboard'),
  
  // Agent tracking and monitoring
  getAgentTracking: (siteId?: string) => 
    apiClient.get('/client-portal/tracking', { params: { siteId } }),
  
  getSiteStatuses: () => apiClient.get('/client-portal/sites/status'),
  
  // Reports
  getReports: (params?: any) => 
    apiClient.get('/client-portal/reports', { params }),
  
  getReport: (reportId: string) => 
    apiClient.get(`/client-portal/reports/${reportId}`),
  
  // Service requests
  getServiceRequests: (params?: any) => 
    apiClient.get('/client-portal/requests', { params }),
  
  createServiceRequest: (data: any) => 
    apiClient.post('/client-portal/requests', data),
  
  getServiceRequest: (requestId: string) => 
    apiClient.get(`/client-portal/requests/${requestId}`),
  
  updateServiceRequest: (requestId: string, data: any) => 
    apiClient.put(`/client-portal/requests/${requestId}`, data),
  
  // Sites
  getSites: () => apiClient.get('/client-portal/sites'),
  
  getSite: (siteId: string) => 
    apiClient.get(`/client-portal/sites/${siteId}`),
  
  // Analytics
  getAnalytics: (params?: any) => 
    apiClient.get('/client-portal/analytics', { params }),
  
  getPerformanceMetrics: (params?: any) => 
    apiClient.get('/client-portal/analytics/performance', { params }),
  
  getIncidentTrends: (params?: any) => 
    apiClient.get('/client-portal/analytics/incidents', { params }),
  
  // Communication
  getMessages: (params?: any) => 
    apiClient.get('/client-portal/messages', { params }),
  
  sendMessage: (data: any) => 
    apiClient.post('/client-portal/messages', data),
  
  getConversation: (conversationId: string) => 
    apiClient.get(`/client-portal/messages/conversations/${conversationId}`),
  
  // Notifications
  getNotifications: (params?: any) => 
    apiClient.get('/client-portal/notifications', { params }),
  
  markNotificationRead: (notificationId: string) => 
    apiClient.put(`/client-portal/notifications/${notificationId}/read`),
  
  markAllNotificationsRead: () => 
    apiClient.put('/client-portal/notifications/mark-all-read'),
  
  // Billing
  getBilling: (params?: any) => 
    apiClient.get('/client-portal/billing', { params }),
  
  getInvoices: (params?: any) => 
    apiClient.get('/client-portal/billing/invoices', { params }),
  
  getInvoice: (invoiceId: string) => 
    apiClient.get(`/client-portal/billing/invoices/${invoiceId}`),
  
  // Settings
  getSettings: () => apiClient.get('/client-portal/settings'),
  
  updateSettings: (data: any) => 
    apiClient.put('/client-portal/settings', data),
  
  // Emergency contacts
  getEmergencyContacts: () => 
    apiClient.get('/client-portal/emergency-contacts'),
  
  updateEmergencyContacts: (data: any) => 
    apiClient.put('/client-portal/emergency-contacts', data),
  
  // Incident reporting
  reportIncident: (data: any) => 
    apiClient.post('/client-portal/incidents', data),
  
  getIncidents: (params?: any) => 
    apiClient.get('/client-portal/incidents', { params }),
  
  getIncident: (incidentId: string) => 
    apiClient.get(`/client-portal/incidents/${incidentId}`),
  
  // Schedule requests
  requestScheduleChange: (data: any) => 
    apiClient.post('/client-portal/schedule-requests', data),
  
  getScheduleRequests: (params?: any) => 
    apiClient.get('/client-portal/schedule-requests', { params }),
  
  // Feedback
  submitFeedback: (data: any) => 
    apiClient.post('/client-portal/feedback', data),
  
  getFeedback: (params?: any) => 
    apiClient.get('/client-portal/feedback', { params }),
};

// Reports API
export const reportsAPI = {
  getAll: (params?: any) => apiClient.get('/reports', { params }),
  getById: (id: string) => apiClient.get(`/reports/${id}`),
  create: (data: any) => apiClient.post('/reports', data),
  update: (id: string, data: any) => apiClient.put(`/reports/${id}`, data),
  delete: (id: string) => apiClient.delete(`/reports/${id}`),
  submit: (id: string) => apiClient.post(`/reports/${id}/submit`),
  approve: (id: string, data?: any) => apiClient.post(`/reports/${id}/approve`, data),
  reject: (id: string, data?: any) => apiClient.post(`/reports/${id}/reject`, data),
  submitClientSignature: (id: string, data: any) => 
    apiClient.post(`/reports/${id}/client-signature`, data),
  getDeliveryStatus: (id: string) => 
    apiClient.get(`/reports/${id}/delivery-status`),
  scheduleDelivery: (id: string, data?: any) => 
    apiClient.post(`/reports/${id}/delivery`, data),
};

// Authentication API
export const authAPI = {
  login: (credentials: { username: string; password: string }) =>
    apiClient.post('/auth/login', credentials),
  
  logout: () => apiClient.post('/auth/logout'),
  
  refreshToken: () => apiClient.post('/auth/refresh'),
  
  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),
  
  resetPassword: (token: string, password: string) =>
    apiClient.post('/auth/reset-password', { token, password }),
  
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    apiClient.put('/auth/change-password', data),
  
  verifyToken: () => apiClient.get('/auth/verify'),
};

// User API
export const userAPI = {
  getProfile: () => apiClient.get('/users/profile'),
  
  updateProfile: (data: any) => apiClient.put('/users/profile', data),
  
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return apiClient.post('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Utility functions
export const setAuthToken = (token: string | null) => {
  if (token) {
    localStorage.setItem('token', token);
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem('token');
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

export const getAuthToken = () => {
  return localStorage.getItem('token');
};

export const isAuthenticated = () => {
  return !!getAuthToken();
};

// Initialize auth token on app start
const token = getAuthToken();
if (token) {
  setAuthToken(token);
}

export default apiClient;
