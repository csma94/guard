import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  LinearProgress,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Star as StarIcon,
  Assignment as AssignmentIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`performance-tabpanel-${index}`}
      aria-labelledby={`performance-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface PerformanceMetric {
  id: string;
  agentId: string;
  metricType: string;
  value: number;
  target: number;
  period: string;
  createdAt: string;
  agent: {
    id: string;
    employeeId: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

interface PerformanceStats {
  totalAgents: number;
  averageScore: number;
  topPerformers: number;
  improvementNeeded: number;
  attendanceRate: number;
  completionRate: number;
  customerSatisfaction: number;
  incidentResponse: number;
}

interface TopPerformer {
  agentId: string;
  employeeId: string;
  name: string;
  score: number;
  improvement: number;
  avatar?: string;
}

const PerformanceTrackingPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedMetric, setSelectedMetric] = useState('overall');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Data fetching functions
  const fetchPerformanceData = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [metricsResponse, statsResponse, topPerformersResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/performance-metrics?period=${selectedPeriod}&metric=${selectedMetric}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/performance-stats?period=${selectedPeriod}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/top-performers?period=${selectedPeriod}&limit=10`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!metricsResponse.ok || !statsResponse.ok || !topPerformersResponse.ok) {
        throw new Error('Failed to fetch performance data');
      }

      const metricsResult = await metricsResponse.json();
      const statsResult = await statsResponse.json();
      const topPerformersResult = await topPerformersResponse.json();

      setMetrics(metricsResult.data || []);
      setStats(statsResult.data || {
        totalAgents: 0,
        averageScore: 0,
        topPerformers: 0,
        improvementNeeded: 0,
        attendanceRate: 0,
        completionRate: 0,
        customerSatisfaction: 0,
        incidentResponse: 0,
      });
      setTopPerformers(topPerformersResult.data || []);
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch performance data:', err);
      setError('Failed to load performance data. Please check your connection and try again.');
      setMetrics([]);
      setStats(null);
      setTopPerformers([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, selectedPeriod, selectedMetric]);

  // Utility functions
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'success';
    if (score >= 75) return 'info';
    if (score >= 60) return 'warning';
    return 'error';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 90) return <CheckCircleIcon color="success" />;
    if (score >= 75) return <StarIcon color="info" />;
    if (score >= 60) return <WarningIcon color="warning" />;
    return <WarningIcon color="error" />;
  };

  const getTrendIcon = (improvement: number) => {
    if (improvement > 0) return <TrendingUpIcon color="success" />;
    if (improvement < 0) return <TrendingDownIcon color="error" />;
    return null;
  };

  // Effects
  useEffect(() => {
    fetchPerformanceData();
  }, [fetchPerformanceData]);

  // Loading state
  if (loading && metrics.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Performance Data...
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
            Performance Tracking
          </Typography>
          <Typography variant="body1" color="text.secondary">
            KPI visualization, metrics analysis, and performance optimization
          </Typography>
        </Box>
        <Box display="flex" gap={2} alignItems="center">
          {lastUpdated && (
            <Typography variant="caption" color="text.secondary">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </Typography>
          )}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Period</InputLabel>
            <Select
              value={selectedPeriod}
              label="Period"
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <MenuItem value="week">This Week</MenuItem>
              <MenuItem value="month">This Month</MenuItem>
              <MenuItem value="quarter">This Quarter</MenuItem>
              <MenuItem value="year">This Year</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            onClick={fetchPerformanceData}
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

      {/* Performance Stats Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <PersonIcon color="primary" />
                  <Box flex={1}>
                    <Typography variant="h6">{stats.totalAgents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Agents
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
                  <StarIcon color="warning" />
                  <Box flex={1}>
                    <Typography variant="h6">{stats.averageScore}%</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Average Score
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={stats.averageScore}
                      color={getScoreColor(stats.averageScore) as any}
                      sx={{ mt: 1 }}
                    />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <CheckCircleIcon color="success" />
                  <Box flex={1}>
                    <Typography variant="h6">{stats.topPerformers}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Top Performers
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
                  <WarningIcon color="warning" />
                  <Box flex={1}>
                    <Typography variant="h6">{stats.improvementNeeded}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Need Improvement
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Key Metrics */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Attendance Rate
                </Typography>
                <Box display="flex" alignItems="center" gap={2}>
                  <Box flex={1}>
                    <Typography variant="h4" color="primary">
                      {stats.attendanceRate}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={stats.attendanceRate}
                      color="primary"
                      sx={{ mt: 1 }}
                    />
                  </Box>
                  <ScheduleIcon color="primary" />
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Task Completion
                </Typography>
                <Box display="flex" alignItems="center" gap={2}>
                  <Box flex={1}>
                    <Typography variant="h4" color="success.main">
                      {stats.completionRate}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={stats.completionRate}
                      color="success"
                      sx={{ mt: 1 }}
                    />
                  </Box>
                  <AssignmentIcon color="success" />
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Customer Satisfaction
                </Typography>
                <Box display="flex" alignItems="center" gap={2}>
                  <Box flex={1}>
                    <Typography variant="h4" color="info.main">
                      {stats.customerSatisfaction}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={stats.customerSatisfaction}
                      color="info"
                      sx={{ mt: 1 }}
                    />
                  </Box>
                  <StarIcon color="info" />
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Incident Response
                </Typography>
                <Box display="flex" alignItems="center" gap={2}>
                  <Box flex={1}>
                    <Typography variant="h4" color="warning.main">
                      {stats.incidentResponse}%
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={stats.incidentResponse}
                      color="warning"
                      sx={{ mt: 1 }}
                    />
                  </Box>
                  <WarningIcon color="warning" />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Top Performers */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Top Performers ({selectedPeriod})
        </Typography>
        <List>
          {topPerformers.map((performer, index) => (
            <React.Fragment key={performer.agentId}>
              <ListItem>
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: getScoreColor(performer.score) + '.main' }}>
                    {index + 1}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle1">
                        {performer.name}
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1}>
                        {getTrendIcon(performer.improvement)}
                        <Chip
                          label={`${performer.score}%`}
                          color={getScoreColor(performer.score) as any}
                          size="small"
                        />
                      </Box>
                    </Box>
                  }
                  secondary={
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption">
                        Employee ID: {performer.employeeId}
                      </Typography>
                      {performer.improvement !== 0 && (
                        <Typography variant="caption" color={performer.improvement > 0 ? 'success.main' : 'error.main'}>
                          {performer.improvement > 0 ? '+' : ''}{performer.improvement}% vs last period
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
              {index < topPerformers.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default PerformanceTrackingPage;
