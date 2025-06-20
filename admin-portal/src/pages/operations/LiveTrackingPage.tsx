import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
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
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Fullscreen as FullscreenIcon,
  FilterList as FilterIcon,
  LocationOn as LocationIcon,
  Person as PersonIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Phone as PhoneIcon,
  Message as MessageIcon,
  ReportProblem as EmergencyIcon,
} from '@mui/icons-material';
import { GoogleMap, LoadScript, Marker, InfoWindow, Circle, Polyline } from '@react-google-maps/api';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import AgentTrackingMap from '../../components/maps/AgentTrackingMap';

interface AgentLocation {
  id: string;
  agentId: string;
  agentName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  status: 'on_duty' | 'off_duty' | 'break' | 'emergency' | 'offline';
  currentSite?: {
    id: string;
    name: string;
    address: string;
  };
  batteryLevel?: number;
  isOnline: boolean;
  lastActivity?: string;
  phone?: string;
  emergencyContact?: string;
}

interface TrackingStats {
  totalAgents: number;
  onDutyAgents: number;
  offlineAgents: number;
  emergencyAlerts: number;
  averageResponseTime: number;
  siteCoverage: number;
}

const LiveTrackingPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const [agents, setAgents] = useState<AgentLocation[]>([]);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentLocation | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showOffline, setShowOffline] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTrackingData = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Fetch real-time agent locations and stats
      const [locationsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/locations/agents/current`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/tracking-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!locationsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch tracking data');
      }

      const locationsResult = await locationsResponse.json();
      const statsResult = await statsResponse.json();

      // Transform location data
      const transformedAgents: AgentLocation[] = (locationsResult.data || []).map((location: any) => ({
        id: location.id,
        agentId: location.agentId,
        agentName: `${location.agent?.user?.firstName || ''} ${location.agent?.user?.lastName || ''}`.trim() || 'Unknown Agent',
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
        lastActivity: location.lastActivity,
        phone: location.agent?.user?.phone,
        emergencyContact: location.agent?.emergencyContact,
      }));

      setAgents(transformedAgents);
      setStats(statsResult.data || {
        totalAgents: transformedAgents.length,
        onDutyAgents: transformedAgents.filter(a => a.status === 'on_duty').length,
        offlineAgents: transformedAgents.filter(a => !a.isOnline).length,
        emergencyAlerts: transformedAgents.filter(a => a.status === 'emergency').length,
        averageResponseTime: 0,
        siteCoverage: 0,
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch tracking data:', err);
      setError('Failed to load tracking data. Please check your connection and try again.');
      setAgents([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrackingData();
  }, [fetchTrackingData]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchTrackingData, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, fetchTrackingData]);

  const handleRefresh = () => {
    setLoading(true);
    fetchTrackingData();
  };

  const handleAgentSelect = (agent: AgentLocation) => {
    setSelectedAgent(agent);
  };

  const handleEmergencyContact = async (agent: AgentLocation) => {
    // Implement emergency contact functionality
    console.log('Emergency contact for agent:', agent.agentName);
  };

  const handleSendMessage = async (agent: AgentLocation) => {
    // Implement messaging functionality
    console.log('Send message to agent:', agent.agentName);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_duty':
        return 'success';
      case 'break':
        return 'warning';
      case 'emergency':
        return 'error';
      case 'offline':
        return 'default';
      default:
        return 'info';
    }
  };

  const getStatusIcon = (agent: AgentLocation) => {
    if (!agent.isOnline) return <WarningIcon color="error" />;
    
    switch (agent.status) {
      case 'on_duty':
        return <CheckCircleIcon color="success" />;
      case 'break':
        return <ScheduleIcon color="warning" />;
      case 'emergency':
        return <EmergencyIcon color="error" />;
      default:
        return <PersonIcon color="info" />;
    }
  };

  const filteredAgents = agents.filter(agent => {
    if (!showOffline && !agent.isOnline) return false;
    if (filterStatus === 'all') return true;
    return agent.status === filterStatus;
  });

  if (loading && agents.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Live Tracking Data...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Live Agent Tracking
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Real-time monitoring of security agents and their locations
          </Typography>
        </Box>
        <Box display="flex" gap={2} alignItems="center">
          {lastUpdated && (
            <Typography variant="caption" color="text.secondary">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </Typography>
          )}
          <Button
            variant="outlined"
            onClick={handleRefresh}
            startIcon={<RefreshIcon />}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <PersonIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalAgents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Agents
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <CheckCircleIcon color="success" />
                  <Box>
                    <Typography variant="h6">{stats.onDutyAgents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      On Duty
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <WarningIcon color="error" />
                  <Box>
                    <Typography variant="h6">{stats.offlineAgents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Offline
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <EmergencyIcon color="error" />
                  <Box>
                    <Typography variant="h6">{stats.emergencyAlerts}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Emergency Alerts
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <LocationIcon color="info" />
                  <Box>
                    <Typography variant="h6">{stats.siteCoverage}%</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Site Coverage
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <ScheduleIcon color="warning" />
                  <Box>
                    <Typography variant="h6">{stats.averageResponseTime}s</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Avg Response
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
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
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Refresh Interval</InputLabel>
                <Select
                  value={refreshInterval}
                  label="Refresh Interval"
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                >
                  <MenuItem value={10}>10 seconds</MenuItem>
                  <MenuItem value={30}>30 seconds</MenuItem>
                  <MenuItem value={60}>1 minute</MenuItem>
                  <MenuItem value={300}>5 minutes</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={showOffline}
                    onChange={(e) => setShowOffline(e.target.checked)}
                  />
                }
                label="Show Offline Agents"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                }
                label="Auto Refresh"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Grid container spacing={3}>
        {/* Map */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Live Agent Map
              </Typography>
              <AgentTrackingMap />
            </CardContent>
          </Card>
        </Grid>

        {/* Agent List */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Agent Status ({filteredAgents.length})
              </Typography>
              <List sx={{ maxHeight: 600, overflowY: 'auto' }}>
                {filteredAgents.map((agent, index) => (
                  <React.Fragment key={agent.id}>
                    <ListItem
                      button
                      onClick={() => handleAgentSelect(agent)}
                      selected={selectedAgent?.id === agent.id}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: getStatusColor(agent.status) + '.main' }}>
                          {getStatusIcon(agent)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Typography variant="subtitle2">
                              {agent.agentName}
                            </Typography>
                            <Box display="flex" gap={1}>
                              {agent.phone && (
                                <Tooltip title="Call Agent">
                                  <IconButton size="small" onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(`tel:${agent.phone}`);
                                  }}>
                                    <PhoneIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              <Tooltip title="Send Message">
                                <IconButton size="small" onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendMessage(agent);
                                }}>
                                  <MessageIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {agent.status === 'emergency' && (
                                <Tooltip title="Emergency Contact">
                                  <IconButton size="small" color="error" onClick={(e) => {
                                    e.stopPropagation();
                                    handleEmergencyContact(agent);
                                  }}>
                                    <EmergencyIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Box display="flex" gap={1} mb={1}>
                              <Chip
                                label={agent.status.replace('_', ' ').toUpperCase()}
                                color={getStatusColor(agent.status) as any}
                                size="small"
                              />
                              {!agent.isOnline && (
                                <Chip
                                  label="OFFLINE"
                                  color="error"
                                  size="small"
                                />
                              )}
                            </Box>
                            {agent.currentSite && (
                              <Typography variant="caption" display="block">
                                Site: {agent.currentSite.name}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              Last update: {new Date(agent.timestamp).toLocaleTimeString()}
                            </Typography>
                            {agent.batteryLevel && (
                              <Typography variant="caption" display="block" color={agent.batteryLevel < 20 ? 'error' : 'text.secondary'}>
                                Battery: {agent.batteryLevel}%
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < filteredAgents.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default LiveTrackingPage;
