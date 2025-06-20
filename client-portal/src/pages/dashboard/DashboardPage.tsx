import React, { useEffect, useState } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Button,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  Security as SecurityIcon,
  Assignment as AssignmentIcon,
  People as PeopleIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';

import { RootState, AppDispatch } from '../../store';
import { fetchDashboardData } from '../../store/slices/dashboardSlice';
import { useSocket } from '../../hooks/useSocket';

// Components
import MetricCard from '../../components/dashboard/MetricCard';
import RecentActivityCard from '../../components/dashboard/RecentActivityCard';
import SiteStatusCard from '../../components/dashboard/SiteStatusCard';
import AlertsCard from '../../components/dashboard/AlertsCard';
import PerformanceChart from '../../components/dashboard/PerformanceChart';
import LiveMapCard from '../../components/dashboard/LiveMapCard';

const DashboardPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [refreshing, setRefreshing] = useState(false);
  
  const {
    metrics,
    recentActivity,
    siteStatuses,
    alerts,
    performanceData,
    isLoading,
    error,
    lastUpdated,
  } = useSelector((state: RootState) => state.dashboard);

  const { user } = useSelector((state: RootState) => state.auth);

  // Real-time updates via Socket.IO
  useSocket('dashboard_update', (data) => {
    // Handle real-time dashboard updates
    console.log('Dashboard update received:', data);
    // You could dispatch specific actions to update parts of the dashboard
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      await dispatch(fetchDashboardData()).unwrap();
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (isLoading && !metrics) {
    return (
      <Box>
        <Grid container spacing={3}>
          {[...Array(8)].map((_, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="rectangular" height={60} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            {getGreeting()}, {user?.profile?.firstName || user?.username}!
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Here's what's happening with your security operations today.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Last Updated */}
      {lastUpdated && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </Typography>
      )}

      {/* Key Metrics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Active Sites"
            value={metrics?.activeSites || 0}
            icon={<SecurityIcon />}
            color="primary"
            trend={metrics?.sitesTrend}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Active Agents"
            value={metrics?.activeAgents || 0}
            icon={<PeopleIcon />}
            color="success"
            trend={metrics?.agentsTrend}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Ongoing Shifts"
            value={metrics?.ongoingShifts || 0}
            icon={<AssignmentIcon />}
            color="info"
            trend={metrics?.shiftsTrend}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Reports Today"
            value={metrics?.reportsToday || 0}
            icon={<AssignmentIcon />}
            color="warning"
            trend={metrics?.reportsTrend}
          />
        </Grid>
      </Grid>

      {/* Alerts and Status */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <AlertsCard alerts={alerts || []} />
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Status
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon color="success" />
                  <Typography variant="body2">All systems operational</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon color="success" />
                  <Typography variant="body2">Real-time tracking active</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon color="success" />
                  <Typography variant="body2">Notifications enabled</Typography>
                </Box>
                {metrics?.systemHealth?.issues && metrics.systemHealth.issues.length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningIcon color="warning" />
                    <Typography variant="body2">
                      {metrics.systemHealth.issues.length} system issue(s)
                    </Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts and Analytics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <PerformanceChart data={performanceData} />
        </Grid>
        <Grid item xs={12} md={4}>
          <SiteStatusCard sites={siteStatuses || []} />
        </Grid>
      </Grid>

      {/* Live Map and Recent Activity */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <LiveMapCard />
        </Grid>
        <Grid item xs={12} md={4}>
          <RecentActivityCard activities={recentActivity || []} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
