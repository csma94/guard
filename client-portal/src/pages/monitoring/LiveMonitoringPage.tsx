import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  Security as SecurityIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  Fullscreen as FullscreenIcon,
} from '@mui/icons-material';
import { GoogleMap, LoadScript, Marker, InfoWindow, Circle } from '@react-google-maps/api';
import { io, Socket } from 'socket.io-client';

import { useAuth } from '../../hooks/useAuth';
import { clientPortalAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

interface AgentLocation {
  agentId: string;
  agentName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  shiftId?: string;
  siteName?: string;
  status: 'active' | 'inactive' | 'alert';
  lastUpdate: string;
}

interface SiteStatus {
  siteId: string;
  siteName: string;
  status: 'covered' | 'uncovered' | 'partial';
  agentCount: number;
  requiredAgents: number;
  lastActivity: string;
}

const LiveMonitoringPage: React.FC = () => {
  const { user } = useAuth();
  const [agentLocations, setAgentLocations] = useState<AgentLocation[]>([]);
  const [siteStatuses, setSiteStatuses] = useState<SiteStatus[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedAgent, setSelectedAgent] = useState<AgentLocation | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 });
  const [mapZoom, setMapZoom] = useState(10);
  const [activeTab, setActiveTab] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showGeofences, setShowGeofences] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001', {
      auth: {
        token: localStorage.getItem('token'),
      },
    });

    newSocket.on('connect', () => {
      console.log('Connected to client monitoring socket');
      newSocket.emit('join_client_monitoring', { clientId: user?.clientId });
    });

    newSocket.on('agent_location_update', (data: any) => {
      updateAgentLocation(data);
    });

    newSocket.on('site_status_update', (data: any) => {
      updateSiteStatus(data);
    });

    newSocket.on('client_alert', (alert: any) => {
      setAlerts(prev => [alert, ...prev.slice(0, 19)]); // Keep last 20 alerts
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user?.clientId]);

  // Load initial data
  useEffect(() => {
    loadMonitoringData();
  }, [selectedSite]);

  const loadMonitoringData = async () => {
    try {
      setIsLoading(true);
      const [trackingResponse, sitesResponse] = await Promise.all([
        clientPortalAPI.getAgentTracking(selectedSite !== 'all' ? selectedSite : undefined),
        clientPortalAPI.getSiteStatuses(),
      ]);

      setAgentLocations(trackingResponse.data.agents || []);
      setSiteStatuses(sitesResponse.data.sites || []);

      // Center map on agents if available
      if (trackingResponse.data.agents?.length > 0) {
        const avgLat = trackingResponse.data.agents.reduce((sum: number, agent: any) => sum + agent.latitude, 0) / trackingResponse.data.agents.length;
        const avgLng = trackingResponse.data.agents.reduce((sum: number, agent: any) => sum + agent.longitude, 0) / trackingResponse.data.agents.length;
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
        shiftId: data.shiftId,
        siteName: data.siteName,
        status: data.status || 'active',
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

  const updateSiteStatus = useCallback((data: any) => {
    setSiteStatuses(prev =>
      prev.map(site =>
        site.siteId === data.siteId
          ? { ...site, ...data }
          : site
      )
    );
  }, []);

  const getAgentMarkerColor = (agent: AgentLocation) => {
    if (agent.status === 'alert') return '#f44336'; // Red
    if (agent.status === 'inactive') return '#9e9e9e'; // Gray
    return '#4caf50'; // Green
  };

  const getSiteStatusColor = (status: string) => {
    switch (status) {
      case 'covered': return 'success';
      case 'partial': return 'warning';
      case 'uncovered': return 'error';
      default: return 'default';
    }
  };

  const filteredAgents = selectedSite === 'all' 
    ? agentLocations 
    : agentLocations.filter(agent => agent.siteName === selectedSite);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Live Monitoring
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter by Site</InputLabel>
            <Select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              label="Filter by Site"
            >
              <MenuItem value="all">All Sites</MenuItem>
              {siteStatuses.map((site) => (
                <MenuItem key={site.siteId} value={site.siteName}>
                  {site.siteName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
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

      {/* Alerts */}
      {alerts.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {alerts.length} active alert{alerts.length > 1 ? 's' : ''} - Latest: {alerts[0]?.message}
        </Alert>
      )}

      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Live Map" />
        <Tab label="Site Status" />
        <Tab label="Agent List" />
        <Tab label="Activity Feed" />
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
                      label="Show Site Boundaries"
                    />
                    <Button startIcon={<FullscreenIcon />} size="small">
                      Fullscreen
                    </Button>
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
                              Last Update: {new Date(selectedAgent.lastUpdate).toLocaleTimeString()}
                            </Typography>
                          </Box>
                        </InfoWindow>
                      )}

                      {/* Show site geofences if enabled */}
                      {showGeofences && siteStatuses.map((site) => (
                        <Circle
                          key={site.siteId}
                          center={{ lat: 0, lng: 0 }} // Would need site coordinates
                          radius={100} // Would need actual geofence radius
                          options={{
                            fillColor: getSiteStatusColor(site.status) === 'success' ? '#4caf50' : '#f44336',
                            fillOpacity: 0.1,
                            strokeColor: getSiteStatusColor(site.status) === 'success' ? '#4caf50' : '#f44336',
                            strokeOpacity: 0.5,
                            strokeWeight: 2,
                          }}
                        />
                      ))}
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
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 1 && (
        <Grid container spacing={3}>
          {siteStatuses.map((site) => (
            <Grid item xs={12} sm={6} md={4} key={site.siteId}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Typography variant="h6">{site.siteName}</Typography>
                    <Chip
                      label={site.status}
                      color={getSiteStatusColor(site.status) as any}
                      icon={site.status === 'covered' ? <CheckIcon /> : <WarningIcon />}
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary">
                    Coverage: {site.agentCount}/{site.requiredAgents} agents
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary">
                    Last Activity: {new Date(site.lastActivity).toLocaleString()}
                  </Typography>
                  
                  <Button
                    size="small"
                    onClick={() => setSelectedSite(site.siteName)}
                    sx={{ mt: 2 }}
                  >
                    View Details
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {activeTab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              All Active Agents
            </Typography>
            <Box sx={{ display: 'grid', gap: 2 }}>
              {agentLocations.map((agent) => (
                <Box
                  key={agent.agentId}
                  sx={{
                    p: 2,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Box>
                    <Typography variant="subtitle1">{agent.agentName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {agent.siteName} • Last seen: {new Date(agent.lastUpdate).toLocaleString()}
                    </Typography>
                  </Box>
                  <Chip
                    label={agent.status}
                    color={agent.status === 'active' ? 'success' : agent.status === 'alert' ? 'error' : 'default'}
                  />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {activeTab === 3 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Recent Activity & Alerts
            </Typography>
            <Box sx={{ maxHeight: 600, overflow: 'auto' }}>
              {alerts.map((alert, index) => (
                <Box
                  key={index}
                  sx={{
                    p: 2,
                    mb: 1,
                    border: 1,
                    borderColor: alert.severity === 'high' ? 'error.main' : 'divider',
                    borderRadius: 1,
                    bgcolor: alert.severity === 'high' ? 'error.light' : 'transparent',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography variant="subtitle2">{alert.title}</Typography>
                      <Typography variant="body2">{alert.message}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(alert.timestamp).toLocaleString()}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={alert.severity}
                      color={alert.severity === 'high' ? 'error' : 'default'}
                    />
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

export default LiveMonitoringPage;
