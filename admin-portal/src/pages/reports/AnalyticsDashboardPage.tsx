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
  Tab,
  Tabs,
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
  Analytics as AnalyticsIcon,
  Assessment as ReportIcon,
  Timeline as TimelineIcon,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  ShowChart as LineChartIcon,
  Dashboard as DashboardIcon,
  Insights as InsightsIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  AttachMoney as AttachMoneyIcon,
  Star as StarIcon,
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
      id={`analytics-tabpanel-${index}`}
      aria-labelledby={`analytics-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface AnalyticsData {
  overview: OverviewMetrics;
  operationalMetrics: OperationalMetrics;
  financialMetrics: FinancialMetrics;
  performanceMetrics: PerformanceMetrics;
  trends: TrendData[];
  insights: Insight[];
  kpis: KPI[];
}

interface OverviewMetrics {
  totalAgents: number;
  activeSites: number;
  totalClients: number;
  monthlyRevenue: number;
  incidentCount: number;
  responseTime: number;
  satisfactionScore: number;
  utilizationRate: number;
}

interface OperationalMetrics {
  shiftsCompleted: number;
  hoursWorked: number;
  patrolsCompleted: number;
  incidentsResolved: number;
  trainingCompleted: number;
  certificationRate: number;
  attendanceRate: number;
  equipmentUtilization: number;
}

interface FinancialMetrics {
  totalRevenue: number;
  operatingCosts: number;
  profitMargin: number;
  clientRetention: number;
  averageContractValue: number;
  billingEfficiency: number;
  collectionRate: number;
  growthRate: number;
}

interface PerformanceMetrics {
  agentPerformance: number;
  clientSatisfaction: number;
  incidentResponseTime: number;
  resolutionRate: number;
  qualityScore: number;
  complianceRate: number;
  trainingEffectiveness: number;
  innovationIndex: number;
}

interface TrendData {
  period: string;
  metric: string;
  value: number;
  change: number;
  target?: number;
}

interface Insight {
  id: string;
  title: string;
  description: string;
  type: 'OPPORTUNITY' | 'RISK' | 'TREND' | 'ALERT';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  impact: string;
  recommendation: string;
  createdAt: string;
}

interface KPI {
  id: string;
  name: string;
  value: number;
  target: number;
  unit: string;
  trend: 'UP' | 'DOWN' | 'STABLE';
  status: 'GOOD' | 'WARNING' | 'CRITICAL';
  category: string;
}

const AnalyticsDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Data fetching functions
  const fetchAnalyticsData = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/dashboard?period=${selectedPeriod}&category=${selectedCategory}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const result = await response.json();
      setAnalyticsData(result.data || {
        overview: {
          totalAgents: 0,
          activeSites: 0,
          totalClients: 0,
          monthlyRevenue: 0,
          incidentCount: 0,
          responseTime: 0,
          satisfactionScore: 0,
          utilizationRate: 0,
        },
        operationalMetrics: {
          shiftsCompleted: 0,
          hoursWorked: 0,
          patrolsCompleted: 0,
          incidentsResolved: 0,
          trainingCompleted: 0,
          certificationRate: 0,
          attendanceRate: 0,
          equipmentUtilization: 0,
        },
        financialMetrics: {
          totalRevenue: 0,
          operatingCosts: 0,
          profitMargin: 0,
          clientRetention: 0,
          averageContractValue: 0,
          billingEfficiency: 0,
          collectionRate: 0,
          growthRate: 0,
        },
        performanceMetrics: {
          agentPerformance: 0,
          clientSatisfaction: 0,
          incidentResponseTime: 0,
          resolutionRate: 0,
          qualityScore: 0,
          complianceRate: 0,
          trainingEffectiveness: 0,
          innovationIndex: 0,
        },
        trends: [],
        insights: [],
        kpis: [],
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch analytics data:', err);
      setError('Failed to load analytics data. Please check your connection and try again.');
      setAnalyticsData(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, selectedPeriod, selectedCategory]);

  // Utility functions
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getKPIStatusColor = (status: string) => {
    switch (status) {
      case 'GOOD':
        return 'success';
      case 'WARNING':
        return 'warning';
      case 'CRITICAL':
        return 'error';
      default:
        return 'default';
    }
  };

  const getInsightTypeColor = (type: string) => {
    switch (type) {
      case 'OPPORTUNITY':
        return 'success';
      case 'RISK':
        return 'error';
      case 'TREND':
        return 'info';
      case 'ALERT':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'UP':
        return <TrendingUpIcon color="success" />;
      case 'DOWN':
        return <TrendingDownIcon color="error" />;
      default:
        return <TimelineIcon color="action" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  // Effects
  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Loading state
  if (loading && !analyticsData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Analytics Dashboard...
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
            Analytics Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Comprehensive business intelligence, KPI visualization, and predictive analytics
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
            onClick={fetchAnalyticsData}
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

      {/* Overview Metrics */}
      {analyticsData && (
        <>
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={2}>
                    <PeopleIcon color="primary" />
                    <Box flex={1}>
                      <Typography variant="h6">{analyticsData.overview.totalAgents}</Typography>
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
                    <BusinessIcon color="success" />
                    <Box flex={1}>
                      <Typography variant="h6">{analyticsData.overview.activeSites}</Typography>
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
                    <AttachMoneyIcon color="warning" />
                    <Box flex={1}>
                      <Typography variant="h6">{formatCurrency(analyticsData.overview.monthlyRevenue)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Monthly Revenue
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
                    <StarIcon color="info" />
                    <Box flex={1}>
                      <Typography variant="h6">{formatPercentage(analyticsData.overview.satisfactionScore)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Satisfaction Score
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Tabs for Different Analytics Views */}
          <Paper sx={{ width: '100%' }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              indicatorColor="primary"
              textColor="primary"
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Overview" />
              <Tab label="Operations" />
              <Tab label="Financial" />
              <Tab label="Performance" />
              <Tab label="Insights" />
            </Tabs>

            {/* Overview Tab */}
            <TabPanel value={activeTab} index={0}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Key Performance Indicators
                      </Typography>
                      <List>
                        {analyticsData.kpis.slice(0, 5).map((kpi) => (
                          <ListItem key={kpi.id}>
                            <ListItemAvatar>
                              <Avatar sx={{ bgcolor: getKPIStatusColor(kpi.status) + '.main' }}>
                                {getTrendIcon(kpi.trend)}
                              </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={kpi.name}
                              secondary={
                                <Box display="flex" justifyContent="space-between" alignItems="center">
                                  <Typography variant="body2">
                                    {kpi.value}{kpi.unit} / {kpi.target}{kpi.unit}
                                  </Typography>
                                  <LinearProgress
                                    variant="determinate"
                                    value={(kpi.value / kpi.target) * 100}
                                    color={getKPIStatusColor(kpi.status) as any}
                                    sx={{ width: 100, ml: 2 }}
                                  />
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Recent Insights
                      </Typography>
                      <List>
                        {analyticsData.insights.slice(0, 5).map((insight) => (
                          <ListItem key={insight.id}>
                            <ListItemAvatar>
                              <Avatar sx={{ bgcolor: getInsightTypeColor(insight.type) + '.main' }}>
                                <InsightsIcon />
                              </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={insight.title}
                              secondary={
                                <Box>
                                  <Typography variant="body2" paragraph>
                                    {insight.description}
                                  </Typography>
                                  <Chip
                                    label={insight.priority}
                                    color={insight.priority === 'HIGH' ? 'error' : insight.priority === 'MEDIUM' ? 'warning' : 'info'}
                                    size="small"
                                  />
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </TabPanel>

            {/* Operations Tab */}
            <TabPanel value={activeTab} index={1}>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{analyticsData.operationalMetrics.shiftsCompleted}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Shifts Completed
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{analyticsData.operationalMetrics.hoursWorked}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Hours Worked
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{analyticsData.operationalMetrics.incidentsResolved}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Incidents Resolved
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{formatPercentage(analyticsData.operationalMetrics.attendanceRate)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Attendance Rate
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </TabPanel>

            {/* Financial Tab */}
            <TabPanel value={activeTab} index={2}>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{formatCurrency(analyticsData.financialMetrics.totalRevenue)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Revenue
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{formatPercentage(analyticsData.financialMetrics.profitMargin)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Profit Margin
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{formatPercentage(analyticsData.financialMetrics.clientRetention)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Client Retention
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{formatPercentage(analyticsData.financialMetrics.growthRate)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Growth Rate
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </TabPanel>

            {/* Performance Tab */}
            <TabPanel value={activeTab} index={3}>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{formatPercentage(analyticsData.performanceMetrics.agentPerformance)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Agent Performance
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={analyticsData.performanceMetrics.agentPerformance}
                        color={getScoreColor(analyticsData.performanceMetrics.agentPerformance) as any}
                        sx={{ mt: 1 }}
                      />
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{formatPercentage(analyticsData.performanceMetrics.clientSatisfaction)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Client Satisfaction
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={analyticsData.performanceMetrics.clientSatisfaction}
                        color="success"
                        sx={{ mt: 1 }}
                      />
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{analyticsData.performanceMetrics.incidentResponseTime}m</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Response Time
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{formatPercentage(analyticsData.performanceMetrics.complianceRate)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Compliance Rate
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={analyticsData.performanceMetrics.complianceRate}
                        color="info"
                        sx={{ mt: 1 }}
                      />
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </TabPanel>

            {/* Insights Tab */}
            <TabPanel value={activeTab} index={4}>
              <Typography variant="h6" gutterBottom>
                AI-Powered Business Insights
              </Typography>
              <Grid container spacing={3}>
                {analyticsData.insights.map((insight) => (
                  <Grid item xs={12} md={6} key={insight.id}>
                    <Card>
                      <CardContent>
                        <Box display="flex" justifyContent="between" alignItems="flex-start" mb={2}>
                          <Typography variant="h6" gutterBottom>
                            {insight.title}
                          </Typography>
                          <Chip
                            label={insight.type}
                            color={getInsightTypeColor(insight.type) as any}
                            size="small"
                          />
                        </Box>
                        <Typography variant="body2" paragraph>
                          {insight.description}
                        </Typography>
                        <Typography variant="subtitle2" gutterBottom>
                          Impact: {insight.impact}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Recommendation: {insight.recommendation}
                        </Typography>
                        <Box mt={2}>
                          <Chip
                            label={insight.priority}
                            color={insight.priority === 'HIGH' ? 'error' : insight.priority === 'MEDIUM' ? 'warning' : 'info'}
                            size="small"
                          />
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </TabPanel>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default AnalyticsDashboardPage;
