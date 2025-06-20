import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Fullscreen as FullscreenIcon,
  FilterList as FilterIcon,
  LocationOn as LocationIcon,
  Person as PersonIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { GoogleMap, LoadScript, Marker, InfoWindow, Circle } from '@react-google-maps/api';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface AgentLocation {
  id: string;
  agentId: string;
  agentName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  status: 'on_duty' | 'off_duty' | 'break' | 'emergency';
  currentSite?: {
    id: string;
    name: string;
    address: string;
  };
  batteryLevel?: number;
  isOnline: boolean;
}

interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  isActive: boolean;
}

const mapContainerStyle = {
  width: '100%',
  height: '600px',
};

const defaultCenter = {
  lat: 40.7128,
  lng: -74.0060,
};

const AgentTrackingMap: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const [agents, setAgents] = useState<AgentLocation[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentLocation | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showSites, setShowSites] = useState(true);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(10);

  const fetchAgentLocations = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Fetch real-time agent locations
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/locations/agents/current`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch agent locations: ${response.status}`);
      }

      const result = await response.json();
      const locationData = result.data || [];

      // Transform API response to component format
      const transformedAgents: AgentLocation[] = locationData.map((location: any) => ({
        id: location.id,
        agentId: location.agentId,
        agentName: location.agent?.user?.firstName + ' ' + location.agent?.user?.lastName || 'Unknown Agent',
        latitude: parseFloat(location.latitude),
        longitude: parseFloat(location.longitude),
        accuracy: location.accuracy || 0,
        timestamp: location.timestamp,
        status: location.agent?.currentShift?.status === 'IN_PROGRESS' ? 'on_duty' : 'off_duty',
        currentSite: location.agent?.currentShift?.site ? {
          id: location.agent.currentShift.site.id,
          name: location.agent.currentShift.site.name,
          address: location.agent.currentShift.site.address,
        } : undefined,
        batteryLevel: location.batteryLevel,
        isOnline: new Date(location.timestamp).getTime() > Date.now() - 300000, // 5 minutes
      }));

      setAgents(transformedAgents);

      // Update map center to show all agents
      if (transformedAgents.length > 0) {
        const avgLat = transformedAgents.reduce((sum, agent) => sum + agent.latitude, 0) / transformedAgents.length;
        const avgLng = transformedAgents.reduce((sum, agent) => sum + agent.longitude, 0) / transformedAgents.length;
        setMapCenter({ lat: avgLat, lng: avgLng });
      }

    } catch (err: any) {
      console.error('Failed to fetch agent locations:', err);
      setError('Failed to load agent locations. Please try again.');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSites = useCallback(async () => {
    try {
      const token = await getToken();
      
      if (!token) return;

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/sites`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        const siteData = result.data || [];
        
        const transformedSites: Site[] = siteData.map((site: any) => ({
          id: site.id,
          name: site.name,
          latitude: parseFloat(site.latitude),
          longitude: parseFloat(site.longitude),
          radius: site.geofenceRadius || 100,
          isActive: site.status === 'ACTIVE',
        }));

        setSites(transformedSites);
      }
    } catch (err) {
      console.error('Failed to fetch sites:', err);
    }
  }, []);

  useEffect(() => {
    fetchAgentLocations();
    fetchSites();
  }, [fetchAgentLocations, fetchSites]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchAgentLocations, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchAgentLocations]);

  const getAgentIcon = (agent: AgentLocation) => {
    const baseUrl = 'https://maps.google.com/mapfiles/ms/icons/';
    
    if (!agent.isOnline) return `${baseUrl}grey-dot.png`;
    
    switch (agent.status) {
      case 'on_duty':
        return `${baseUrl}green-dot.png`;
      case 'break':
        return `${baseUrl}yellow-dot.png`;
      case 'emergency':
        return `${baseUrl}red-dot.png`;
      default:
        return `${baseUrl}blue-dot.png`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_duty':
        return 'success';
      case 'break':
        return 'warning';
      case 'emergency':
        return 'error';
      default:
        return 'default';
    }
  };

  const filteredAgents = agents.filter(agent => {
    if (filterStatus === 'all') return true;
    return agent.status === filterStatus;
  });

  const handleRefresh = () => {
    setLoading(true);
    fetchAgentLocations();
  };

  if (loading && agents.length === 0) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
            <Box textAlign="center">
              <CircularProgress size={60} />
              <Typography variant="h6" sx={{ mt: 2 }}>
                Loading Agent Locations...
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Real-time Agent Tracking
          </Typography>
          <Box display="flex" gap={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Filter Status</InputLabel>
              <Select
                value={filterStatus}
                label="Filter Status"
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <MenuItem value="all">All Agents</MenuItem>
                <MenuItem value="on_duty">On Duty</MenuItem>
                <MenuItem value="break">On Break</MenuItem>
                <MenuItem value="off_duty">Off Duty</MenuItem>
                <MenuItem value="emergency">Emergency</MenuItem>
              </Select>
            </FormControl>
            
            <FormControlLabel
              control={
                <Switch
                  checked={showSites}
                  onChange={(e) => setShowSites(e.target.checked)}
                  size="small"
                />
              }
              label="Show Sites"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  size="small"
                />
              }
              label="Auto Refresh"
            />
            
            <Tooltip title="Refresh Now">
              <IconButton onClick={handleRefresh} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box display="flex" gap={2} mb={2}>
          <Chip
            icon={<PersonIcon />}
            label={`${filteredAgents.length} Agents`}
            color="primary"
            variant="outlined"
          />
          <Chip
            icon={<LocationIcon />}
            label={`${filteredAgents.filter(a => a.isOnline).length} Online`}
            color="success"
            variant="outlined"
          />
          <Chip
            icon={<WarningIcon />}
            label={`${filteredAgents.filter(a => !a.isOnline).length} Offline`}
            color="error"
            variant="outlined"
          />
        </Box>

        <LoadScript googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY || ''}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={mapZoom}
            onLoad={(map) => {
              // Fit bounds to show all agents
              if (filteredAgents.length > 0) {
                const bounds = new window.google.maps.LatLngBounds();
                filteredAgents.forEach(agent => {
                  bounds.extend({ lat: agent.latitude, lng: agent.longitude });
                });
                map.fitBounds(bounds);
              }
            }}
          >
            {/* Render agent markers */}
            {filteredAgents.map((agent) => (
              <Marker
                key={agent.id}
                position={{ lat: agent.latitude, lng: agent.longitude }}
                icon={{
                  url: getAgentIcon(agent),
                  scaledSize: new window.google.maps.Size(32, 32),
                }}
                onClick={() => setSelectedAgent(agent)}
              />
            ))}

            {/* Render site geofences */}
            {showSites && sites.map((site) => (
              <Circle
                key={site.id}
                center={{ lat: site.latitude, lng: site.longitude }}
                radius={site.radius}
                options={{
                  fillColor: site.isActive ? '#4CAF50' : '#9E9E9E',
                  fillOpacity: 0.1,
                  strokeColor: site.isActive ? '#4CAF50' : '#9E9E9E',
                  strokeOpacity: 0.8,
                  strokeWeight: 2,
                }}
              />
            ))}

            {/* Info window for selected agent */}
            {selectedAgent && (
              <InfoWindow
                position={{ lat: selectedAgent.latitude, lng: selectedAgent.longitude }}
                onCloseClick={() => setSelectedAgent(null)}
              >
                <Box p={1}>
                  <Typography variant="h6" gutterBottom>
                    {selectedAgent.agentName}
                  </Typography>
                  <Box display="flex" flexDirection="column" gap={1}>
                    <Chip
                      label={selectedAgent.status.replace('_', ' ').toUpperCase()}
                      color={getStatusColor(selectedAgent.status) as any}
                      size="small"
                    />
                    {selectedAgent.currentSite && (
                      <Typography variant="body2">
                        <strong>Site:</strong> {selectedAgent.currentSite.name}
                      </Typography>
                    )}
                    <Typography variant="body2">
                      <strong>Last Update:</strong> {new Date(selectedAgent.timestamp).toLocaleString()}
                    </Typography>
                    {selectedAgent.batteryLevel && (
                      <Typography variant="body2">
                        <strong>Battery:</strong> {selectedAgent.batteryLevel}%
                      </Typography>
                    )}
                    <Typography variant="body2">
                      <strong>Status:</strong> {selectedAgent.isOnline ? 'Online' : 'Offline'}
                    </Typography>
                  </Box>
                </Box>
              </InfoWindow>
            )}
          </GoogleMap>
        </LoadScript>
      </CardContent>
    </Card>
  );
};

export default AgentTrackingMap;
