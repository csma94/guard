import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  LinearProgress,
  Divider,
} from '@mui/material';
import {
  Security as SecurityIcon,
  LocationOn as LocationIcon,
  Person as PersonIcon,
  Assignment as ReportIcon,
  Warning as IncidentIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Notifications as NotificationIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface DashboardStats {
  activeSites: number;
  totalAgents: number;
  onDutyAgents: number;
  todayReports: number;
  openIncidents: number;
  completedShifts: number;
  satisfactionScore: number;
  responseTime: number;
}

interface RecentActivity {
  id: string;
  type: 'SHIFT_START' | 'SHIFT_END' | 'INCIDENT' | 'REPORT' | 'PATROL';
  title: string;
  description: string;
  timestamp: string;
  agentName?: string;
  siteName?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface SiteStatus {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  agentsOnDuty: number;
  lastActivity: string;
  incidentCount: number;
}

interface AgentStatus {
  id: string;
  name: string;
  status: 'ON_DUTY' | 'OFF_DUTY' | 'BREAK' | 'EMERGENCY';
  currentSite?: string;
  shiftStart?: string;
  lastActivity: string;
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [siteStatuses, setSiteStatuses] = useState<SiteStatus[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Data fetching functions
  const fetchDashboardData = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [statsResponse, activityResponse, sitesResponse, agentsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/dashboard/stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/dashboard/activity`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/sites/status`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/agents/status`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!statsResponse.ok || !activityResponse.ok || !sitesResponse.ok || !agentsResponse.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const statsResult = await statsResponse.json();
      const activityResult = await activityResponse.json();
      const sitesResult = await sitesResponse.json();
      const agentsResult = await agentsResponse.json();

      setStats(statsResult.data || {
        activeSites: 0,
        totalAgents: 0,
        onDutyAgents: 0,
        todayReports: 0,
        openIncidents: 0,
        completedShifts: 0,
        satisfactionScore: 0,
        responseTime: 0,
      });
      setRecentActivity(activityResult.data || []);
      setSiteStatuses(sitesResult.data || []);
      setAgentStatuses(agentsResult.data || []);
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to load dashboard data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Utility functions
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'SHIFT_START':
      case 'SHIFT_END':
        return <ScheduleIcon color="primary" />;
      case 'INCIDENT':
        return <IncidentIcon color="error" />;
      case 'REPORT':
        return <ReportIcon color="info" />;
      case 'PATROL':
        return <SecurityIcon color="success" />;
      default:
        return <NotificationIcon />;
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'error';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'ON_DUTY':
        return 'success';
      case 'INACTIVE':
      case 'OFF_DUTY':
        return 'default';
      case 'MAINTENANCE':
      case 'BREAK':
        return 'warning';
      case 'EMERGENCY':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  // Effects
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Loading state
  if (loading && !stats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Dashboard...
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
            Security Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Real-time monitoring and security oversight
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
            onClick={fetchDashboardData}
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
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <LocationIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.activeSites}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Sites
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <PersonIcon color="success" />
                  <Box>
                    <Typography variant="h6">{stats.onDutyAgents}/{stats.totalAgents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Agents On Duty
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <ReportIcon color="info" />
                  <Box>
                    <Typography variant="h6">{stats.todayReports}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Today's Reports
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <IncidentIcon color="warning" />
                  <Box>
                    <Typography variant="h6">{stats.openIncidents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Open Incidents
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Main Content Grid */}
      <Grid container spacing={3}>
        {/* Recent Activity */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Recent Activity
            </Typography>
            <List sx={{ maxHeight: 320, overflow: 'auto' }}>
              {recentActivity.map((activity, index) => (
                <React.Fragment key={activity.id}>
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar>
                        {getActivityIcon(activity.type)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={activity.title}
                      secondary={
                        <Box>
                          <Typography variant="body2" paragraph>
                            {activity.description}
                          </Typography>
                          <Box display="flex" gap={1} alignItems="center">
                            {activity.priority && (
                              <Chip
                                label={activity.priority}
                                color={getPriorityColor(activity.priority) as any}
                                size="small"
                              />
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {formatTimeAgo(activity.timestamp)}
                            </Typography>
                          </Box>
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < recentActivity.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Site Status */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Site Status
            </Typography>
            <List sx={{ maxHeight: 320, overflow: 'auto' }}>
              {siteStatuses.map((site, index) => (
                <React.Fragment key={site.id}>
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: getStatusColor(site.status) + '.main' }}>
                        {site.status === 'ACTIVE' ? <ActiveIcon /> : <InactiveIcon />}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={site.name}
                      secondary={
                        <Box>
                          <Typography variant="body2">
                            {site.agentsOnDuty} agents on duty
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Last activity: {formatTimeAgo(site.lastActivity)}
                          </Typography>
                          {site.incidentCount > 0 && (
                            <Chip
                              label={`${site.incidentCount} incidents`}
                              color="warning"
                              size="small"
                              sx={{ ml: 1 }}
                            />
                          )}
                        </Box>
                      }
                    />
                    <Chip
                      label={site.status}
                      color={getStatusColor(site.status) as any}
                      size="small"
                    />
                  </ListItem>
                  {index < siteStatuses.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
