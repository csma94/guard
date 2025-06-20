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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Chip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  People as PeopleIcon,
  Schedule as ScheduleIcon,
  Assignment as AssignmentIcon,
  Star as StarIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  School as TrainingIcon,
  Certificate as CertificateIcon,
  Work as WorkIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface WorkforceAnalytics {
  totalAgents: number;
  activeAgents: number;
  onDutyAgents: number;
  averagePerformance: number;
  attendanceRate: number;
  trainingCompletionRate: number;
  certificationComplianceRate: number;
  turnoverRate: number;
  averageTenure: number;
  skillGaps: SkillGap[];
  performanceTrends: PerformanceTrend[];
  attendanceTrends: AttendanceTrend[];
  trainingMetrics: TrainingMetrics;
  certificationMetrics: CertificationMetrics;
  topPerformers: TopPerformer[];
  improvementAreas: ImprovementArea[];
}

interface SkillGap {
  skill: string;
  requiredLevel: string;
  currentLevel: string;
  gap: number;
  agentsAffected: number;
}

interface PerformanceTrend {
  period: string;
  averageScore: number;
  improvement: number;
}

interface AttendanceTrend {
  period: string;
  attendanceRate: number;
  lateArrivals: number;
  absences: number;
}

interface TrainingMetrics {
  totalTrainings: number;
  completedTrainings: number;
  inProgressTrainings: number;
  averageCompletionTime: number;
  mostPopularTraining: string;
  leastPopularTraining: string;
}

interface CertificationMetrics {
  totalCertifications: number;
  activeCertifications: number;
  expiringSoon: number;
  expired: number;
  renewalRate: number;
}

interface TopPerformer {
  agentId: string;
  name: string;
  employeeId: string;
  score: number;
  improvement: number;
  department: string;
}

interface ImprovementArea {
  area: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  agentsAffected: number;
  recommendedActions: string[];
}

const WorkforceAnalyticsPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [analytics, setAnalytics] = useState<WorkforceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedMetric, setSelectedMetric] = useState('performance');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Data fetching functions
  const fetchAnalytics = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/workforce?period=${selectedPeriod}&metric=${selectedMetric}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch workforce analytics');
      }

      const result = await response.json();
      setAnalytics(result.data || {
        totalAgents: 0,
        activeAgents: 0,
        onDutyAgents: 0,
        averagePerformance: 0,
        attendanceRate: 0,
        trainingCompletionRate: 0,
        certificationComplianceRate: 0,
        turnoverRate: 0,
        averageTenure: 0,
        skillGaps: [],
        performanceTrends: [],
        attendanceTrends: [],
        trainingMetrics: {
          totalTrainings: 0,
          completedTrainings: 0,
          inProgressTrainings: 0,
          averageCompletionTime: 0,
          mostPopularTraining: '',
          leastPopularTraining: '',
        },
        certificationMetrics: {
          totalCertifications: 0,
          activeCertifications: 0,
          expiringSoon: 0,
          expired: 0,
          renewalRate: 0,
        },
        topPerformers: [],
        improvementAreas: [],
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch workforce analytics:', err);
      setError('Failed to load workforce analytics. Please check your connection and try again.');
      setAnalytics(null);
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'error';
      case 'MEDIUM':
        return 'warning';
      case 'LOW':
        return 'info';
      default:
        return 'default';
    }
  };

  const getTrendIcon = (improvement: number) => {
    if (improvement > 0) return <TrendingUpIcon color="success" />;
    if (improvement < 0) return <TrendingDownIcon color="error" />;
    return null;
  };

  // Effects
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Loading state
  if (loading && !analytics) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Workforce Analytics...
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
            Workforce Analytics
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Comprehensive workforce insights, trends, and optimization recommendations
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
            onClick={fetchAnalytics}
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

      {/* Key Metrics */}
      {analytics && (
        <>
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={2}>
                    <PeopleIcon color="primary" />
                    <Box flex={1}>
                      <Typography variant="h6">{analytics.totalAgents}</Typography>
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
                    <WorkIcon color="success" />
                    <Box flex={1}>
                      <Typography variant="h6">{analytics.activeAgents}</Typography>
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
                    <StarIcon color="warning" />
                    <Box flex={1}>
                      <Typography variant="h6">{analytics.averagePerformance}%</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Avg Performance
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={analytics.averagePerformance}
                        color={getScoreColor(analytics.averagePerformance) as any}
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
                    <ScheduleIcon color="info" />
                    <Box flex={1}>
                      <Typography variant="h6">{analytics.attendanceRate}%</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Attendance Rate
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={analytics.attendanceRate}
                        color="info"
                        sx={{ mt: 1 }}
                      />
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Secondary Metrics */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Training Completion
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {analytics.trainingCompletionRate}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={analytics.trainingCompletionRate}
                    color="success"
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Certification Compliance
                  </Typography>
                  <Typography variant="h4" color="info.main">
                    {analytics.certificationComplianceRate}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={analytics.certificationComplianceRate}
                    color="info"
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Turnover Rate
                  </Typography>
                  <Typography variant="h4" color="warning.main">
                    {analytics.turnoverRate}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Annual rate
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Average Tenure
                  </Typography>
                  <Typography variant="h4" color="primary.main">
                    {analytics.averageTenure}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Months
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
};

export default WorkforceAnalyticsPage;
