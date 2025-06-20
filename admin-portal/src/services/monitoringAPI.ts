import { apiClient } from './api';

export interface AgentLocation {
  agentId: string;
  agentName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  batteryLevel?: number;
  speed?: number;
  shiftId?: string;
  siteName?: string;
  status: 'active' | 'inactive' | 'alert';
  geofenceStatus: 'compliant' | 'violation' | 'unknown';
  lastUpdate: string;
}

export interface MonitoringAlert {
  id: string;
  agentId: string;
  agentName: string;
  type: 'geofence_violation' | 'no_movement' | 'low_battery' | 'offline' | 'panic';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface MonitoringMetrics {
  totalAgents: number;
  activeAgents: number;
  agentsOnShift: number;
  alertCount: number;
  geofenceViolations: number;
  averageResponseTime: number;
  systemUptime: number;
}

export interface GeofenceEvent {
  id: string;
  agentId: string;
  agentName: string;
  siteId: string;
  siteName: string;
  eventType: 'entry' | 'exit' | 'violation';
  latitude: number;
  longitude: number;
  distance: number;
  timestamp: string;
}

export interface LocationHistory {
  agentId: string;
  locations: Array<{
    latitude: number;
    longitude: number;
    timestamp: string;
    accuracy: number;
    speed?: number;
  }>;
  startTime: string;
  endTime: string;
  totalDistance: number;
  averageSpeed: number;
}

class MonitoringAPI {
  // Real-time monitoring
  async getActiveAgentLocations() {
    return apiClient.get('/monitoring/agents/locations');
  }

  async getAgentLocation(agentId: string) {
    return apiClient.get(`/monitoring/agents/${agentId}/location`);
  }

  async getAgentLocationHistory(agentId: string, startDate: string, endDate: string) {
    return apiClient.get(`/monitoring/agents/${agentId}/location-history`, {
      params: { startDate, endDate },
    });
  }

  // Alerts and notifications
  async getActiveAlerts() {
    return apiClient.get('/monitoring/alerts');
  }

  async getAlertHistory(params?: {
    startDate?: string;
    endDate?: string;
    agentId?: string;
    severity?: string;
    type?: string;
  }) {
    return apiClient.get('/monitoring/alerts/history', { params });
  }

  async acknowledgeAlert(alertId: string) {
    return apiClient.post(`/monitoring/alerts/${alertId}/acknowledge`);
  }

  async acknowledgeMultipleAlerts(alertIds: string[]) {
    return apiClient.post('/monitoring/alerts/acknowledge-multiple', { alertIds });
  }

  async createManualAlert(data: {
    agentId: string;
    type: string;
    message: string;
    severity: string;
  }) {
    return apiClient.post('/monitoring/alerts', data);
  }

  // Geofencing
  async getGeofenceEvents(params?: {
    startDate?: string;
    endDate?: string;
    siteId?: string;
    agentId?: string;
    eventType?: string;
  }) {
    return apiClient.get('/monitoring/geofence-events', { params });
  }

  async validateGeofence(latitude: number, longitude: number, siteId: string) {
    return apiClient.post('/locations/validate-geofence', {
      latitude,
      longitude,
      siteId,
    });
  }

  // Monitoring dashboard
  async getDashboardData() {
    return apiClient.get('/monitoring/dashboard');
  }

  async getMonitoringMetrics(timeRange?: string) {
    return apiClient.get('/monitoring/metrics', {
      params: { timeRange },
    });
  }

  async getSystemStatus() {
    return apiClient.get('/monitoring/system-status');
  }

  // Agent monitoring controls
  async startAgentMonitoring(agentId: string, shiftId: string) {
    return apiClient.post(`/monitoring/agents/${agentId}/start`, { shiftId });
  }

  async stopAgentMonitoring(agentId: string) {
    return apiClient.post(`/monitoring/agents/${agentId}/stop`);
  }

  async getAgentMonitoringStatus(agentId: string) {
    return apiClient.get(`/monitoring/agents/${agentId}/status`);
  }

  // Location analytics
  async getLocationAnalytics(params: {
    agentId?: string;
    siteId?: string;
    startDate: string;
    endDate: string;
  }) {
    return apiClient.get('/monitoring/analytics/location', { params });
  }

  async getPatrolAnalytics(params: {
    agentId?: string;
    siteId?: string;
    startDate: string;
    endDate: string;
  }) {
    return apiClient.get('/monitoring/analytics/patrol', { params });
  }

  async getPerformanceAnalytics(params: {
    agentId?: string;
    startDate: string;
    endDate: string;
  }) {
    return apiClient.get('/monitoring/analytics/performance', { params });
  }

  // Emergency and panic alerts
  async triggerPanicAlert(agentId: string, location: {
    latitude: number;
    longitude: number;
  }) {
    return apiClient.post('/monitoring/panic-alert', {
      agentId,
      ...location,
    });
  }

  async respondToPanicAlert(alertId: string, response: {
    responderId: string;
    action: string;
    notes?: string;
  }) {
    return apiClient.post(`/monitoring/panic-alert/${alertId}/respond`, response);
  }

  // Monitoring configuration
  async getMonitoringSettings() {
    return apiClient.get('/monitoring/settings');
  }

  async updateMonitoringSettings(settings: {
    locationUpdateInterval?: number;
    geofenceAlertThreshold?: number;
    inactivityAlertThreshold?: number;
    lowBatteryThreshold?: number;
    enableRealTimeTracking?: boolean;
    enableGeofenceAlerts?: boolean;
  }) {
    return apiClient.put('/monitoring/settings', settings);
  }

  // Bulk operations
  async exportLocationData(params: {
    agentIds?: string[];
    startDate: string;
    endDate: string;
    format: 'csv' | 'json' | 'kml';
  }) {
    return apiClient.get('/monitoring/export/locations', {
      params,
      responseType: 'blob',
    });
  }

  async exportAlertData(params: {
    startDate: string;
    endDate: string;
    format: 'csv' | 'json';
  }) {
    return apiClient.get('/monitoring/export/alerts', {
      params,
      responseType: 'blob',
    });
  }

  // Real-time subscriptions (for WebSocket management)
  async subscribeToAgentUpdates(agentIds: string[]) {
    return apiClient.post('/monitoring/subscribe/agents', { agentIds });
  }

  async subscribeToSiteUpdates(siteIds: string[]) {
    return apiClient.post('/monitoring/subscribe/sites', { siteIds });
  }

  async unsubscribeFromUpdates() {
    return apiClient.post('/monitoring/unsubscribe');
  }

  // Advanced monitoring features
  async getHeatmapData(params: {
    siteId?: string;
    startDate: string;
    endDate: string;
    resolution?: 'high' | 'medium' | 'low';
  }) {
    return apiClient.get('/monitoring/heatmap', { params });
  }

  async getRouteOptimization(params: {
    siteId: string;
    agentId: string;
    startDate: string;
    endDate: string;
  }) {
    return apiClient.get('/monitoring/route-optimization', { params });
  }

  async getComplianceReport(params: {
    siteId?: string;
    agentId?: string;
    startDate: string;
    endDate: string;
  }) {
    return apiClient.get('/monitoring/compliance-report', { params });
  }

  // Predictive analytics
  async getPredictiveAlerts() {
    return apiClient.get('/monitoring/predictive-alerts');
  }

  async getAnomalyDetection(agentId: string, timeRange: string) {
    return apiClient.get(`/monitoring/agents/${agentId}/anomalies`, {
      params: { timeRange },
    });
  }

  async getPatternAnalysis(params: {
    agentId?: string;
    siteId?: string;
    analysisType: 'movement' | 'timing' | 'behavior';
    timeRange: string;
  }) {
    return apiClient.get('/monitoring/pattern-analysis', { params });
  }
}

export const monitoringAPI = new MonitoringAPI();
export default monitoringAPI;
