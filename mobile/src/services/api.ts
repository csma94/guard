import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

// API Configuration
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001/api' 
  : 'https://api.bahinlink.com/api';

const API_TIMEOUT = 30000; // 30 seconds

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

export const getAuthToken = () => authToken;

// Request interceptor
apiClient.interceptors.request.use(
  async (config) => {
    // Add auth token if available
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }

    // Add request timestamp for debugging
    config.metadata = { startTime: new Date() };

    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    const duration = new Date().getTime() - response.config.metadata?.startTime?.getTime();
    console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url} (${duration}ms)`);
    
    return response;
  },
  async (error) => {
    const duration = error.config?.metadata?.startTime 
      ? new Date().getTime() - error.config.metadata.startTime.getTime()
      : 0;
    
    console.error(`❌ API Error: ${error.config?.method?.toUpperCase()} ${error.config?.url} (${duration}ms)`, error.response?.data);

    // Handle specific error cases
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      await handleUnauthorized();
    } else if (error.response?.status === 403) {
      // Forbidden
      Alert.alert('Access Denied', 'You do not have permission to perform this action.');
    } else if (error.response?.status >= 500) {
      // Server error
      Alert.alert('Server Error', 'Something went wrong on our end. Please try again later.');
    } else if (error.code === 'ECONNABORTED') {
      // Timeout
      Alert.alert('Request Timeout', 'The request took too long to complete. Please check your connection and try again.');
    } else if (!error.response) {
      // Network error
      Alert.alert('Network Error', 'Please check your internet connection and try again.');
    }

    return Promise.reject(error);
  }
);

// Handle unauthorized access
const handleUnauthorized = async () => {
  try {
    // Clear stored token
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('refreshToken');
    
    // Clear in-memory token
    setAuthToken(null);
    
    // Note: Navigation to login should be handled by the auth slice
    console.log('🔐 User unauthorized - tokens cleared');
  } catch (error) {
    console.error('Error clearing auth tokens:', error);
  }
};

// API methods
export const api = {
  // Authentication
  auth: {
    login: (credentials: { username: string; password: string }) =>
      apiClient.post('/auth/login', credentials),
    
    logout: () =>
      apiClient.post('/auth/logout'),
    
    refreshToken: (refreshToken: string) =>
      apiClient.post('/auth/refresh', { refreshToken }),
    
    forgotPassword: (email: string) =>
      apiClient.post('/auth/forgot-password', { email }),
    
    resetPassword: (token: string, password: string) =>
      apiClient.post('/auth/reset-password', { token, password }),
  },

  // User profile
  user: {
    getProfile: () =>
      apiClient.get('/users/profile'),
    
    updateProfile: (data: any) =>
      apiClient.put('/users/profile', data),
    
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      apiClient.put('/users/change-password', data),
  },

  // Shifts
  shifts: {
    getMy: (params?: any) =>
      apiClient.get('/shifts/my-shifts', { params }),
    
    getById: (id: string) =>
      apiClient.get(`/shifts/${id}`),
    
    clockIn: (data: { shiftId: string; location: any; method?: string }) =>
      apiClient.post('/attendance/clock-in', data),
    
    clockOut: (data: { shiftId: string; location: any; method?: string }) =>
      apiClient.post('/attendance/clock-out', data),
  },

  // Reports
  reports: {
    getMy: (params?: any) =>
      apiClient.get('/reports/my-reports', { params }),
    
    getById: (id: string) =>
      apiClient.get(`/reports/${id}`),
    
    create: (data: any) =>
      apiClient.post('/reports', data),
    
    update: (id: string, data: any) =>
      apiClient.put(`/reports/${id}`, data),
    
    delete: (id: string) =>
      apiClient.delete(`/reports/${id}`),
    
    submit: (id: string) =>
      apiClient.post(`/reports/${id}/submit`),
    
    uploadAttachment: (id: string, formData: FormData) =>
      apiClient.post(`/reports/${id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
  },

  // Notifications
  notifications: {
    getAll: (params?: any) =>
      apiClient.get('/notifications', { params }),
    
    markAsRead: (id: string) =>
      apiClient.put(`/notifications/${id}/read`),
    
    markAllAsRead: () =>
      apiClient.put('/notifications/mark-all-read'),
    
    delete: (id: string) =>
      apiClient.delete(`/notifications/${id}`),
  },

  // Location tracking
  location: {
    update: (data: { latitude: number; longitude: number; accuracy?: number }) =>
      apiClient.post('/locations/update', data),
    
    getHistory: (params?: any) =>
      apiClient.get('/locations/history', { params }),
  },

  // Mobile specific
  mobile: {
    getDashboard: () =>
      apiClient.get('/mobile/dashboard'),
    
    getCurrentShift: () =>
      apiClient.get('/mobile/shifts/current'),
    
    sync: (data: any) =>
      apiClient.post('/sync/mobile', data),
    
    getSyncStatus: () =>
      apiClient.get('/sync/status'),
  },

  // Sites
  sites: {
    getAll: (params?: any) =>
      apiClient.get('/sites', { params }),
    
    getById: (id: string) =>
      apiClient.get(`/sites/${id}`),
  },

  // QR Code
  qr: {
    validate: (code: string) =>
      apiClient.post('/qr-code/validate', { code }),
  },
};

// Utility functions
export const isNetworkError = (error: any): boolean => {
  return !error.response && error.code !== 'ECONNABORTED';
};

export const getErrorMessage = (error: any): string => {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.message) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export { apiClient };
export default api;
