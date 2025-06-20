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
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assessment as AssessmentIcon,
  Psychology as PredictiveIcon,
  CompareArrows as CompareIcon,
  Insights as InsightsIcon,
  AutoGraph as AutoGraphIcon,
  Download as DownloadIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from 'recharts';

import { businessIntelligenceAPI } from '../services/api';

interface BIMetrics {
  kpis: Array<{
    name: string;
    value: number;
    target: number;
    trend: 'up' | 'down' | 'stable';
    variance: number;
    category: string;
  }>;
  predictiveAnalytics: {
    demandForecast: any[];
    riskPrediction: any[];
    performanceForecast: any[];
    costProjection: any[];
  };
  benchmarking: {
    industryComparison: any[];
    competitorAnalysis: any[];
    bestPractices: string[];
  };
  insights: Array<{
    id: string;
    type: 'OPPORTUNITY' | 'RISK' | 'TREND' | 'ANOMALY';
    title: string;
    description: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    confidence: number;
    actionItems: string[];
    dataPoints: any[];
  }>;
  correlationAnalysis: any[];
  correlations: Array<{ vars: string; corr: number }>;
  segmentAnalysis: any[];
}

const BusinessIntelligenceDashboard: React.FC = () => {
  const [biData, setBiData] = useState<BIMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedTimeframe, setSelectedTimeframe] = useState('30d');
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [insightDialogOpen, setInsightDialogOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<any>(null);

  useEffect(() => {
    loadBIData();
    
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(loadBIData, 5 * 60 * 1000); // Refresh every 5 minutes
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedTimeframe, selectedSegment, autoRefresh]);

  const loadBIData = async () => {
    try {
      setIsLoading(true);
      const response = await businessIntelligenceAPI.getBIMetrics({
        timeframe: selectedTimeframe,
        segment: selectedSegment,
        includePredictive: true,
        includeBenchmarking: true,
        includeInsights: true,
      });
      setBiData(response.data as unknown as BIMetrics);
    } catch (error) {
      console.error('Failed to load BI data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportInsights = async () => {
    try {
      const response = await businessIntelligenceAPI.exportInsights({
        timeframe: selectedTimeframe,
        format: 'pdf',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `bi_insights_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export insights:', error);
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUpIcon color="success" />;
      case 'down': return <TrendingDownIcon color="error" />;
      default: return <AutoGraphIcon color="info" />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'HIGH': return 'error';
      case 'MEDIUM': return 'warning';
      case 'LOW': return 'info';
      default: return 'default';
    }
  };

  const getInsightTypeColor = (type: string) => {
    switch (type) {
      case 'OPPORTUNITY': return 'success';
      case 'RISK': return 'error';
      case 'TREND': return 'info';
      case 'ANOMALY': return 'warning';
      default: return 'default';
    }
  };

  if (isLoading && !biData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <LinearProgress sx={{ width: '50%' }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Business Intelligence Dashboard
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
            }
            label="Auto Refresh"
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Timeframe</InputLabel>
            <Select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              label="Timeframe"
            >
              <MenuItem value="7d">Last 7 Days</MenuItem>
              <MenuItem value="30d">Last 30 Days</MenuItem>
              <MenuItem value="90d">Last 90 Days</MenuItem>
              <MenuItem value="1y">Last Year</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadBIData}
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportInsights}
          >
            Export
          </Button>
        </Box>
      </Box>

      {/* KPI Overview */}
      {biData?.kpis && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {biData.kpis.slice(0, 4).map((kpi, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography color="textSecondary" gutterBottom variant="body2">
                        {kpi.name}
                      </Typography>
                      <Typography variant="h4">
                        {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                        {getTrendIcon(kpi.trend)}
                        <Typography
                          variant="body2"
                          color={kpi.variance >= 0 ? 'success.main' : 'error.main'}
                          sx={{ ml: 0.5 }}
                        >
                          {kpi.variance >= 0 ? '+' : ''}{kpi.variance}%
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      label={`Target: ${kpi.target}`}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min((kpi.value / kpi.target) * 100, 100)}
                    sx={{ mt: 2 }}
                  />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* AI Insights Alert */}
      {biData?.insights && biData.insights.filter(i => i.impact === 'HIGH').length > 0 && (
        <Alert 
          severity="info" 
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => setActiveTab(3)}>
              View Insights
            </Button>
          }
        >
          {biData.insights.filter(i => i.impact === 'HIGH').length} high-impact insights detected. 
          Review recommendations to optimize performance.
        </Alert>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Predictive Analytics" icon={<PredictiveIcon />} />
        <Tab label="Benchmarking" icon={<CompareIcon />} />
        <Tab label="Correlation Analysis" icon={<AutoGraphIcon />} />
        <Tab label="AI Insights" icon={<InsightsIcon />} />
      </Tabs>

      {/* Predictive Analytics Tab */}
      {activeTab === 0 && biData?.predictiveAnalytics && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Demand Forecast
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={biData.predictiveAnalytics.demandForecast}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="confidence"
                      fill="#8884d8"
                      fillOpacity={0.3}
                      stroke="none"
                    />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      stroke="#8884d8"
                      strokeWidth={2}
                      dot={{ fill: '#8884d8' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      dot={{ fill: '#82ca9d' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Risk Prediction
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={biData.predictiveAnalytics.riskPrediction}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="riskScore"
                      stackId="1"
                      stroke="#ff7300"
                      fill="#ff7300"
                      fillOpacity={0.6}
                    />
                    <ReferenceLine y={70} stroke="red" strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Performance Forecast vs Cost Projection
                </Typography>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={biData.predictiveAnalytics.performanceForecast}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="performance" fill="#8884d8" name="Performance Score" />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="cost"
                      stroke="#ff7300"
                      strokeWidth={3}
                      name="Projected Cost"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Benchmarking Tab */}
      {activeTab === 1 && biData?.benchmarking && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Industry Comparison
                </Typography>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={biData.benchmarking.industryComparison}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="metric" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="ourPerformance" fill="#8884d8" name="Our Performance" />
                    <Bar dataKey="industryAverage" fill="#82ca9d" name="Industry Average" />
                    <Bar dataKey="topPerformer" fill="#ffc658" name="Top Performer" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Best Practices
                </Typography>
                {biData.benchmarking.bestPractices.map((practice, index) => (
                  <Box key={index} sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="body2">
                      {practice}
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Correlation Analysis Tab */}
      {activeTab === 2 && biData?.correlationAnalysis && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Performance Correlation Matrix
                </Typography>
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart data={biData.correlationAnalysis}>
                    <CartesianGrid />
                    <XAxis dataKey="x" name="Factor A" />
                    <YAxis dataKey="y" name="Factor B" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter name="Correlation" data={biData.correlationAnalysis} fill="#8884d8" />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Key Correlations
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Variables</TableCell>
                        <TableCell>Correlation</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(biData?.correlations || []).map((row, index) => (
                        <TableRow key={index}>
                          <TableCell>{row.vars}</TableCell>
                          <TableCell>
                            <Chip
                              label={row.corr.toFixed(2)}
                              color={Math.abs(row.corr) > 0.7 ? 'success' : Math.abs(row.corr) > 0.5 ? 'warning' : 'default'}
                              size="small"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* AI Insights Tab */}
      {activeTab === 3 && biData?.insights && (
        <Grid container spacing={3}>
          {biData.insights.map((insight) => (
            <Grid item xs={12} md={6} key={insight.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        {insight.title}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                        <Chip
                          label={insight.type}
                          color={getInsightTypeColor(insight.type)}
                          size="small"
                        />
                        <Chip
                          label={`${insight.impact} Impact`}
                          color={getImpactColor(insight.impact)}
                          size="small"
                        />
                        <Chip
                          label={`${insight.confidence}% Confidence`}
                          variant="outlined"
                          size="small"
                        />
                      </Box>
                    </Box>
                  </Box>
                  
                  <Typography variant="body2" paragraph>
                    {insight.description}
                  </Typography>
                  
                  <Typography variant="subtitle2" gutterBottom>
                    Recommended Actions:
                  </Typography>
                  {insight.actionItems.slice(0, 3).map((action, index) => (
                    <Typography key={index} variant="body2" sx={{ ml: 2, mb: 0.5 }}>
                      • {action}
                    </Typography>
                  ))}
                  
                  <Button
                    size="small"
                    onClick={() => {
                      setSelectedInsight(insight);
                      setInsightDialogOpen(true);
                    }}
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

      {/* Insight Details Dialog */}
      <Dialog
        open={insightDialogOpen}
        onClose={() => setInsightDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Insight Details
        </DialogTitle>
        <DialogContent>
          {selectedInsight && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {selectedInsight.title}
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                <Chip
                  label={selectedInsight.type}
                  color={getInsightTypeColor(selectedInsight.type)}
                />
                <Chip
                  label={`${selectedInsight.impact} Impact`}
                  color={getImpactColor(selectedInsight.impact)}
                />
                <Chip
                  label={`${selectedInsight.confidence}% Confidence`}
                  variant="outlined"
                />
              </Box>
              
              <Typography variant="body1" paragraph>
                {selectedInsight.description}
              </Typography>
              
              <Typography variant="h6" gutterBottom>
                Recommended Actions:
              </Typography>
              {selectedInsight.actionItems.map((action: string, index: number) => (
                <Typography key={index} variant="body2" sx={{ ml: 2, mb: 1 }}>
                  {index + 1}. {action}
                </Typography>
              ))}
              
              {selectedInsight.dataPoints && selectedInsight.dataPoints.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Supporting Data:
                  </Typography>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={selectedInsight.dataPoints}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#8884d8" />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInsightDialogOpen(false)}>
            Close
          </Button>
          <Button variant="contained">
            Implement Actions
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BusinessIntelligenceDashboard;
