import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  DateRange as DateRangeIcon,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Timeline as TimelineIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';

import { useAuth } from '../../hooks/useAuth';
import { analyticsAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

interface AnalyticsData {
  coreMetrics: any;
  performanceAnalytics: any;
  costAnalytics: any;
  qualityMetrics: any;
  trendAnalysis: any;
  forecasting?: any;
  benchmarking?: any;
  riskAnalysis: any;
  recommendations: any[];
}

const AdvancedAnalyticsPage: React.FC = () => {
  const { user } = useAuth();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
  });
  const [filters, setFilters] = useState({
    clientId: '',
    siteId: '',
    agentId: '',
    metricType: 'all',
  });
  const [customReportDialogOpen, setCustomReportDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange, filters]);

  const loadAnalyticsData = async () => {
    try {
      setIsLoading(true);
      const response = await analyticsAPI.getOperationalAnalytics({
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        ...filters,
        includeForecasting: true,
        includeBenchmarking: true,
      });
      setAnalyticsData(response.data as unknown as AnalyticsData);
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async (format: 'csv' | 'pdf' | 'excel') => {
    try {
      const response = await analyticsAPI.exportAnalytics({
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        ...filters,
        format,
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `analytics_${format}_${Date.now()}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setExportDialogOpen(false);
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            Advanced Analytics
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
              onClick={() => {/* Open filter dialog */}}
            >
              Filters
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => setExportDialogOpen(true)}
            >
              Export
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadAnalyticsData}
            >
              Refresh
            </Button>
          </Box>
        </Box>

        {/* Date Range Selector */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} sm={3}>
                <DatePicker
                  label="Start Date"
                  value={dateRange.startDate}
                  onChange={(newValue) => setDateRange(prev => ({ ...prev, startDate: newValue || new Date() }))}
                  slots={{
                    textField: TextField,
                  }}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <DatePicker
                  label="End Date"
                  value={dateRange.endDate}
                  onChange={(newValue) => setDateRange(prev => ({ ...prev, endDate: newValue || new Date() }))}
                  slots={{
                    textField: TextField,
                  }}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={2}>
                <FormControl fullWidth>
                  <InputLabel>Metric Type</InputLabel>
                  <Select
                    value={filters.metricType}
                    onChange={(e) => setFilters(prev => ({ ...prev, metricType: e.target.value }))}
                    label="Metric Type"
                  >
                    <MenuItem value="all">All Metrics</MenuItem>
                    <MenuItem value="performance">Performance</MenuItem>
                    <MenuItem value="cost">Cost</MenuItem>
                    <MenuItem value="quality">Quality</MenuItem>
                    <MenuItem value="risk">Risk</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" size="small" onClick={() => setDateRange({
                    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    endDate: new Date(),
                  })}>
                    Last 7 Days
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => setDateRange({
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    endDate: new Date(),
                  })}>
                    Last 30 Days
                  </Button>
                  <Button variant="outlined" size="small" onClick={() => setDateRange({
                    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                    endDate: new Date(),
                  })}>
                    Last 90 Days
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Key Metrics Overview */}
        {analyticsData?.coreMetrics && (
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Total Shifts
                      </Typography>
                      <Typography variant="h4">
                        {analyticsData.coreMetrics.totalShifts}
                      </Typography>
                    </Box>
                    <AssessmentIcon color="primary" sx={{ fontSize: 40 }} />
                  </Box>
                  <Typography variant="body2" color="textSecondary">
                    Completion Rate: {analyticsData.coreMetrics.completionRate}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Total Hours
                      </Typography>
                      <Typography variant="h4">
                        {analyticsData.coreMetrics.totalHours}
                      </Typography>
                    </Box>
                    <TimelineIcon color="success" sx={{ fontSize: 40 }} />
                  </Box>
                  <Typography variant="body2" color="textSecondary">
                    Avg per shift: {analyticsData.coreMetrics.averageHoursPerShift}h
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Total Reports
                      </Typography>
                      <Typography variant="h4">
                        {analyticsData.coreMetrics.totalReports}
                      </Typography>
                    </Box>
                    <BarChartIcon color="info" sx={{ fontSize: 40 }} />
                  </Box>
                  <Typography variant="body2" color="textSecondary">
                    Incident Rate: {analyticsData.coreMetrics.incidentRate}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Quality Score
                      </Typography>
                      <Typography variant="h4">
                        {analyticsData.qualityMetrics?.overallQualityScore || 'N/A'}
                      </Typography>
                    </Box>
                    <TrendingUpIcon color="warning" sx={{ fontSize: 40 }} />
                  </Box>
                  <Typography variant="body2" color="textSecondary">
                    Overall performance
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Analytics Tabs */}
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="Performance Trends" />
          <Tab label="Cost Analysis" />
          <Tab label="Quality Metrics" />
          <Tab label="Risk Assessment" />
          <Tab label="Forecasting" />
          <Tab label="Benchmarking" />
        </Tabs>

        {/* Performance Trends Tab */}
        {activeTab === 0 && analyticsData?.trendAnalysis && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Performance Trends Over Time
                  </Typography>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={analyticsData.trendAnalysis.dailyTrends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="completionRate" stroke="#8884d8" name="Completion Rate" />
                      <Line type="monotone" dataKey="qualityScore" stroke="#82ca9d" name="Quality Score" />
                      <Line type="monotone" dataKey="efficiency" stroke="#ffc658" name="Efficiency" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Performance Distribution
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Excellent', value: 35, color: '#00C49F' },
                          { name: 'Good', value: 45, color: '#0088FE' },
                          { name: 'Average', value: 15, color: '#FFBB28' },
                          { name: 'Poor', value: 5, color: '#FF8042' },
                        ]}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label
                      >
                        {[
                          { name: 'Excellent', value: 35, color: '#00C49F' },
                          { name: 'Good', value: 45, color: '#0088FE' },
                          { name: 'Average', value: 15, color: '#FFBB28' },
                          { name: 'Poor', value: 5, color: '#FF8042' },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Cost Analysis Tab */}
        {activeTab === 1 && analyticsData?.costAnalytics && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Cost Breakdown
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={[
                      { category: 'Labor', cost: analyticsData.costAnalytics.laborCosts || 0 },
                      { category: 'Equipment', cost: analyticsData.costAnalytics.equipmentCosts || 0 },
                      { category: 'Training', cost: analyticsData.costAnalytics.trainingCosts || 0 },
                      { category: 'Overhead', cost: analyticsData.costAnalytics.overheadCosts || 0 },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" />
                      <YAxis />
                      <RechartsTooltip />
                      <Bar dataKey="cost" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Cost Efficiency Metrics
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body1">
                      Cost per Hour: ${analyticsData.costAnalytics.costPerHour || 0}
                    </Typography>
                    <Typography variant="body1">
                      Cost per Shift: ${analyticsData.costAnalytics.costPerShift || 0}
                    </Typography>
                    <Typography variant="body1">
                      ROI: {analyticsData.costAnalytics.roi || 0}%
                    </Typography>
                    <Typography variant="body1">
                      Budget Variance: {analyticsData.costAnalytics.budgetVariance || 0}%
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Recommendations */}
        {analyticsData?.recommendations && analyticsData.recommendations.length > 0 && (
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                AI-Powered Recommendations
              </Typography>
              <Grid container spacing={2}>
                {analyticsData.recommendations.map((recommendation, index) => (
                  <Grid item xs={12} md={6} key={index}>
                    <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Chip
                          label={recommendation.priority}
                          color={recommendation.priority === 'HIGH' ? 'error' : recommendation.priority === 'MEDIUM' ? 'warning' : 'success'}
                          size="small"
                        />
                        <Typography variant="subtitle2" sx={{ ml: 1 }}>
                          {recommendation.category}
                        </Typography>
                      </Box>
                      <Typography variant="body2">
                        {recommendation.description}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Potential Impact: {recommendation.impact}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Export Dialog */}
        <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)}>
          <DialogTitle>Export Analytics Data</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Choose the format for exporting your analytics data:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button variant="outlined" onClick={() => handleExportData('csv')}>
                Export as CSV
              </Button>
              <Button variant="outlined" onClick={() => handleExportData('excel')}>
                Export as Excel
              </Button>
              <Button variant="outlined" onClick={() => handleExportData('pdf')}>
                Export as PDF Report
              </Button>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default AdvancedAnalyticsPage;
