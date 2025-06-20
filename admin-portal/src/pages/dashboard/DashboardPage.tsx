import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Container,
  AppBar,
  Toolbar,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  Assignment as AssignmentIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  TrendingUp as TrendingUpIcon,
  LocationOn as LocationIcon,
} from '@mui/icons-material';
import { UserButton } from '@clerk/clerk-react';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface DashboardMetrics {
  totalUsers: number;
  activeAgents: number;
  activeSites: number;
  activeShifts: number;
  reportsToday: number;
  incidentsToday: number;
  systemHealth: {
    database: 'healthy' | 'warning' | 'error';
    api: 'healthy' | 'warning' | 'error';
    websocket: 'healthy' | 'warning' | 'error';
    notifications: 'healthy' | 'warning' | 'error';
  };
  recentActivity: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: string;
    severity: 'info' | 'warning' | 'error';
  }>;
}

const DashboardPage: React.FC = () => {
  const { user, isLoaded, role, permissions } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const fetchDashboardData = async () => {
    try {
      setError(null);

      // Get Clerk session token for API authentication
      const { getToken } = useClerkAuth();
      const token = await getToken();

      if (!token) {
        throw new Error('No authentication token available');
      }

      // Create authenticated API request
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/kpi`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const result = await response.json();
      const data = result.data;

      // Transform API response to dashboard metrics
      const dashboardMetrics: DashboardMetrics = {
        totalUsers: data.totalUsers || 0,
        activeAgents: data.activeAgents || 0,
        activeSites: data.activeSites || 0,
        activeShifts: data.activeShifts || 0,
        reportsToday: data.reportsToday || 0,
        incidentsToday: data.incidentsToday || 0,
        systemHealth: {
          database: data.error ? 'warning' : 'healthy',
          api: 'healthy',
          websocket: 'healthy',
          notifications: 'healthy',
        },
        recentActivity: data.recentActivity || [],
      };

      setMetrics(dashboardMetrics);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to load dashboard data. Please check your connection and try again.');

      // Set empty state instead of mock data
      setMetrics({
        totalUsers: 0,
        activeAgents: 0,
        activeSites: 0,
        activeShifts: 0,
        reportsToday: 0,
        incidentsToday: 0,
        systemHealth: {
          database: 'error',
          api: 'error',
          websocket: 'error',
          notifications: 'error',
        },
        recentActivity: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  useEffect(() => {
    if (isLoaded) {
      fetchDashboardData();

      // Set up auto-refresh every 30 seconds
      const interval = setInterval(fetchDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [isLoaded]);

  if (!isLoaded || loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
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
    <Box>
      {/* App Bar */}
      <AppBar position="static" sx={{ mb: 3 }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            BahinLink Admin Portal
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Chip
              label={String(role || 'user')}
              color="secondary"
              size="small"
            />
            <UserButton />
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg">
        {/* Welcome Header */}
        <Box sx={{ mb: 4 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h4" gutterBottom>
                {getGreeting()}, {user?.firstName || 'User'}!
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Welcome to the BahinLink Security Workforce Management System
              </Typography>
            </Box>
            <Box textAlign="right">
              {lastUpdated && (
                <Typography variant="caption" color="text.secondary">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </Typography>
              )}
              {refreshing && <LinearProgress sx={{ mt: 1, width: 200 }} />}
            </Box>
          </Box>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Quick Stats */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <PeopleIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{metrics?.totalUsers || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Users
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
                  <LocationIcon color="success" />
                  <Box>
                    <Typography variant="h6">{metrics?.activeAgents || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Agents
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
                  <BusinessIcon color="info" />
                  <Box>
                    <Typography variant="h6">{metrics?.activeSites || 0}</Typography>
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
                  <ScheduleIcon color="warning" />
                  <Box>
                    <Typography variant="h6">{metrics?.activeShifts || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Shifts
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Additional Metrics Row */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={6}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <AssignmentIcon color="info" />
                  <Box>
                    <Typography variant="h6">{metrics?.reportsToday || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Reports Today
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={6}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <WarningIcon color="error" />
                  <Box>
                    <Typography variant="h6">{metrics?.incidentsToday || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Incidents Today
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* System Status & Recent Activity */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  System Status
                </Typography>
                <Box display="flex" flexDirection="column" gap={2}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography>Database Connection</Typography>
                    <Chip
                      label={metrics?.systemHealth.database === 'healthy' ? 'Online' : 'Warning'}
                      color={metrics?.systemHealth.database === 'healthy' ? 'success' : 'warning'}
                      size="small"
                      icon={metrics?.systemHealth.database === 'healthy' ? <CheckCircleIcon /> : <WarningIcon />}
                    />
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography>API Services</Typography>
                    <Chip
                      label={metrics?.systemHealth.api === 'healthy' ? 'Online' : 'Warning'}
                      color={metrics?.systemHealth.api === 'healthy' ? 'success' : 'warning'}
                      size="small"
                      icon={metrics?.systemHealth.api === 'healthy' ? <CheckCircleIcon /> : <WarningIcon />}
                    />
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography>Real-time Updates</Typography>
                    <Chip
                      label={metrics?.systemHealth.websocket === 'healthy' ? 'Online' : 'Warning'}
                      color={metrics?.systemHealth.websocket === 'healthy' ? 'success' : 'warning'}
                      size="small"
                      icon={metrics?.systemHealth.websocket === 'healthy' ? <CheckCircleIcon /> : <WarningIcon />}
                    />
                  </Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography>Notification Service</Typography>
                    <Chip
                      label={metrics?.systemHealth.notifications === 'healthy' ? 'Online' : 'Warning'}
                      color={metrics?.systemHealth.notifications === 'healthy' ? 'success' : 'warning'}
                      size="small"
                      icon={metrics?.systemHealth.notifications === 'healthy' ? <CheckCircleIcon /> : <WarningIcon />}
                    />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Recent Activity
                </Typography>
                <Box display="flex" flexDirection="column" gap={2} sx={{ maxHeight: 300, overflowY: 'auto' }}>
                  {metrics?.recentActivity && metrics.recentActivity.length > 0 ? (
                    metrics.recentActivity.map((activity) => (
                      <Box key={activity.id} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {activity.message}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(activity.timestamp).toLocaleString()}
                        </Typography>
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No recent activity
                    </Typography>
                  )}
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<RefreshIcon />}
                    onClick={handleRefresh}
                    disabled={refreshing}
                  >
                    {refreshing ? 'Refreshing...' : 'Refresh Data'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Quick Actions */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Quick Actions
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<PeopleIcon />}
                      onClick={() => window.location.href = '/users'}
                    >
                      Manage Users
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<BusinessIcon />}
                      onClick={() => window.location.href = '/sites'}
                    >
                      Manage Sites
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<ScheduleIcon />}
                      onClick={() => window.location.href = '/shifts'}
                    >
                      Schedule Shifts
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<TrendingUpIcon />}
                      onClick={() => window.location.href = '/analytics'}
                    >
                      View Analytics
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Real-time Agent Tracking */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12}>
            <Typography variant="h5" gutterBottom>
              Live Agent Tracking
            </Typography>
            {/* AgentTrackingMap component will be imported and used here */}
          </Grid>
        </Grid>

        {/* User Information */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Your Account Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  User ID
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                  {user?.id}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  Email
                </Typography>
                <Typography variant="body1">
                  {user?.primaryEmailAddress?.emailAddress}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  Role
                </Typography>
                <Typography variant="body1">
                  {String(role || 'User')}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  Permissions
                </Typography>
                <Typography variant="body1">
                  {Array.isArray(permissions) && permissions.length > 0 ? permissions.join(', ') : 'Basic access'}
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
};

export default DashboardPage;
