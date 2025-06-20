import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Fullscreen as FullscreenIcon,
  FilterList as FilterIcon,
  Timeline as TimelineIcon,
  Speed as SpeedIcon,
  BatteryFull as BatteryIcon,
} from '@mui/icons-material';
// Temporary fallback for @react-google-maps/api
let GoogleMap: any, LoadScript: any, Marker: any, InfoWindow: any, Circle: any;
try {
  const googleMaps = require('@react-google-maps/api');
  GoogleMap = googleMaps.GoogleMap;
  LoadScript = googleMaps.LoadScript;
  Marker = googleMaps.Marker;
  InfoWindow = googleMaps.InfoWindow;
  Circle = googleMaps.Circle;
} catch (e) {
  // Fallback components if @react-google-maps/api is not available
  GoogleMap = ({ children, ...props }: any) => <div style={{ height: '400px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Map component not available</div>;
  LoadScript = ({ children }: any) => children;
  Marker = () => null;
  InfoWindow = () => null;
  Circle = () => null;
}
import io from 'socket.io-client';
type Socket = any;

import { useAuth } from '../../hooks/useAuth';
import { monitoringAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

interface AgentLocation {
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

interface Alert {
  id: string;
  agentId: string;
  agentName: string;
  type: 'geofence_violation' | 'no_movement' | 'low_battery' | 'offline' | 'panic';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  acknowledged: boolean;
}

const RealTimeMonitoringPage: React.FC = () => {
  const { user } = useAuth();
  const [agentLocations, setAgentLocations] = useState<AgentLocation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentLocation | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 }); // Default to NYC
  const [mapZoom, setMapZoom] = useState(10);
  const [activeTab, setActiveTab] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showGeofences, setShowGeofences] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001', {
      auth: {
        token: localStorage.getItem('token'),
      },
    });

    newSocket.on('connect', () => {
      console.log('Connected to monitoring socket');
      newSocket.emit('join_monitoring');
    });

    newSocket.on('real_time_location_update', (data: any) => {
      updateAgentLocation(data);
    });

    newSocket.on('monitoring_alert', (alert: Alert) => {
      setAlerts(prev => [alert, ...prev.slice(0, 49)]); // Keep last 50 alerts
    });

    newSocket.on('agent_status_change', (data: any) => {
      updateAgentStatus(data.agentId, data.status);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Load initial data
  useEffect(() => {
    loadMonitoringData();
  }, []);

  const loadMonitoringData = async () => {
    try {
      setIsLoading(true);
      const [locationsResponse, alertsResponse] = await Promise.all([
        monitoringAPI.getActiveAgentLocations(),
        monitoringAPI.getActiveAlerts(),
      ]);

      const agentsData = Array.isArray(locationsResponse.data) ? locationsResponse.data : [];
      const alertsData = Array.isArray(alertsResponse.data) ? alertsResponse.data : [];

      setAgentLocations(agentsData);
      setAlerts(alertsData);

      // Center map on agents if available
      if (Array.isArray(agentsData) && agentsData.length > 0) {
        const agents = agentsData as Array<{ latitude: number; longitude: number }>;
        const avgLat = agents.reduce((sum: number, agent) => sum + (agent.latitude || 0), 0) / agents.length;
        const avgLng = agents.reduce((sum: number, agent) => sum + (agent.longitude || 0), 0) / agents.length;
        setMapCenter({ lat: avgLat, lng: avgLng });
      }
    } catch (error) {
      console.error('Failed to load monitoring data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateAgentLocation = useCallback((data: any) => {
    setAgentLocations(prev => {
      const existingIndex = prev.findIndex(agent => agent.agentId === data.agentId);
      const updatedAgent: AgentLocation = {
        agentId: data.agentId,
        agentName: data.agentName || `Agent ${data.agentId}`,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy,
        timestamp: data.timestamp,
        batteryLevel: data.batteryLevel,
        speed: data.speed,
        shiftId: data.shiftId,
        siteName: data.siteName,
        status: data.status || 'active',
        geofenceStatus: data.geofenceStatus || 'unknown',
        lastUpdate: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        const newLocations = [...prev];
        newLocations[existingIndex] = updatedAgent;
        return newLocations;
      } else {
        return [...prev, updatedAgent];
      }
    });
  }, []);

  const updateAgentStatus = useCallback((agentId: string, status: string) => {
    setAgentLocations(prev =>
      prev.map(agent =>
        agent.agentId === agentId
          ? { ...agent, status: status as AgentLocation['status'] }
          : agent
      )
    );
  }, []);

  const getAgentMarkerColor = (agent: AgentLocation) => {
    if (agent.status === 'alert') return '#f44336'; // Red
    if (agent.geofenceStatus === 'violation') return '#ff9800'; // Orange
    if (agent.status === 'inactive') return '#9e9e9e'; // Gray
    return '#4caf50'; // Green
  };

  const getAlertSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      default: return 'success';
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      await monitoringAPI.acknowledgeAlert(alertId);
      setAlerts(prev =>
        prev.map(alert =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        )
      );
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const filteredAgents = agentLocations.filter(agent => {
    if (filterStatus === 'all') return true;
    return agent.status === filterStatus;
  });

  const unacknowledgedAlerts = alerts.filter(alert => !alert.acknowledged);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Real-Time Monitoring
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
            }
            label="Auto Refresh"
          />
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadMonitoringData}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Alert Summary */}
      {unacknowledgedAlerts.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {unacknowledgedAlerts.length} unacknowledged alert{unacknowledgedAlerts.length > 1 ? 's' : ''} require attention
        </Alert>
      )}

      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Live Map" />
        <Tab label="Agent List" />
        <Tab label="Alerts" />
        <Tab label="Analytics" />
      </Tabs>

      {activeTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Live Agent Locations</Typography>
                  <Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={showGeofences}
                          onChange={(e) => setShowGeofences(e.target.checked)}
                        />
                      }
                      label="Show Geofences"
                    />
                    <IconButton>
                      <FullscreenIcon />
                    </IconButton>
                  </Box>
                </Box>
                <Box sx={{ height: 600 }}>
                  <LoadScript googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY || ''}>
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '100%' }}
                      center={mapCenter}
                      zoom={mapZoom}
                      onZoomChanged={() => {
                        // Handle zoom change
                      }}
                    >
                      {filteredAgents.map((agent) => (
                        <Marker
                          key={agent.agentId}
                          position={{ lat: agent.latitude, lng: agent.longitude }}
                          icon={{
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: getAgentMarkerColor(agent),
                            fillOpacity: 0.8,
                            strokeColor: '#ffffff',
                            strokeWeight: 2,
                          }}
                          onClick={() => setSelectedAgent(agent)}
                        />
                      ))}

                      {selectedAgent && (
                        <InfoWindow
                          position={{ lat: selectedAgent.latitude, lng: selectedAgent.longitude }}
                          onCloseClick={() => setSelectedAgent(null)}
                        >
                          <Box sx={{ p: 1 }}>
                            <Typography variant="subtitle1" fontWeight="bold">
                              {selectedAgent.agentName}
                            </Typography>
                            <Typography variant="body2">
                              Site: {selectedAgent.siteName || 'N/A'}
                            </Typography>
                            <Typography variant="body2">
                              Status: <Chip size="small" label={selectedAgent.status} />
                            </Typography>
                            <Typography variant="body2">
                              Battery: {selectedAgent.batteryLevel || 'N/A'}%
                            </Typography>
                            <Typography variant="body2">
                              Last Update: {new Date(selectedAgent.lastUpdate).toLocaleTimeString()}
                            </Typography>
                          </Box>
                        </InfoWindow>
                      )}
                    </GoogleMap>
                  </LoadScript>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Active Agents ({filteredAgents.length})
                </Typography>
                <Box sx={{ maxHeight: 600, overflow: 'auto' }}>
                  {filteredAgents.map((agent) => (
                    <Box
                      key={agent.agentId}
                      sx={{
                        p: 2,
                        mb: 1,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                      onClick={() => {
                        setSelectedAgent(agent);
                        setMapCenter({ lat: agent.latitude, lng: agent.longitude });
                        setMapZoom(15);
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2">{agent.agentName}</Typography>
                        <Chip
                          size="small"
                          label={agent.status}
                          color={agent.status === 'active' ? 'success' : agent.status === 'alert' ? 'error' : 'default'}
                        />
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {agent.siteName || 'No active shift'}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <LocationIcon fontSize="small" color="action" />
                        <Typography variant="caption">
                          {new Date(agent.lastUpdate).toLocaleTimeString()}
                        </Typography>
                        {agent.batteryLevel && (
                          <>
                            <BatteryIcon fontSize="small" color="action" />
                            <Typography variant="caption">{agent.batteryLevel}%</Typography>
                          </>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Active Alerts ({alerts.length})
            </Typography>
            <Box sx={{ maxHeight: 600, overflow: 'auto' }}>
              {alerts.map((alert) => (
                <Box
                  key={alert.id}
                  sx={{
                    p: 2,
                    mb: 1,
                    border: 1,
                    borderColor: alert.acknowledged ? 'divider' : 'error.main',
                    borderRadius: 1,
                    bgcolor: alert.acknowledged ? 'transparent' : 'error.light',
                    opacity: alert.acknowledged ? 0.7 : 1,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <WarningIcon color={getAlertSeverityColor(alert.severity) as any} />
                        <Typography variant="subtitle2">{alert.agentName}</Typography>
                        <Chip size="small" label={alert.type.replace('_', ' ')} />
                        <Chip
                          size="small"
                          label={alert.severity}
                          color={getAlertSeverityColor(alert.severity) as any}
                        />
                      </Box>
                      <Typography variant="body2">{alert.message}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(alert.timestamp).toLocaleString()}
                      </Typography>
                    </Box>
                    {!alert.acknowledged && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => acknowledgeAlert(alert.id)}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default RealTimeMonitoringPage;
