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
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Paper,
  Tab,
  Tabs,
  Checkbox,
  FormControlLabel,
  FormGroup,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  GetApp as ExportIcon,
  Schedule as ScheduleIcon,
  Share as ShareIcon,
  Save as SaveIcon,
  PlayArrow as RunIcon,
  Assessment as ReportIcon,
  TableChart as TableIcon,
  BarChart as ChartIcon,
  PictureAsPdf as PdfIcon,
  Description as CsvIcon,
  Download as DownloadIcon,
  Assessment as AssessmentIcon,
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
      id={`reports-tabpanel-${index}`}
      aria-labelledby={`reports-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface CustomReport {
  id: string;
  name: string;
  description?: string;
  type: 'TABLE' | 'CHART' | 'DASHBOARD' | 'SUMMARY';
  category: string;
  dataSource: string;
  fields: ReportField[];
  filters: ReportFilter[];
  groupBy: string[];
  sortBy: ReportSort[];
  chartConfig?: ChartConfig;
  schedule?: ReportSchedule;
  isPublic: boolean;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastRun?: string;
  creator: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface ReportField {
  name: string;
  label: string;
  type: 'STRING' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'CURRENCY';
  aggregation?: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX';
  format?: string;
  isVisible: boolean;
}

interface ReportFilter {
  field: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'CONTAINS' | 'BETWEEN' | 'IN';
  value: any;
  label: string;
}

interface ReportSort {
  field: string;
  direction: 'ASC' | 'DESC';
}

interface ChartConfig {
  chartType: 'BAR' | 'LINE' | 'PIE' | 'AREA' | 'SCATTER';
  xAxis: string;
  yAxis: string[];
  colors: string[];
  showLegend: boolean;
  showGrid: boolean;
}

interface ReportSchedule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
  time: string;
  recipients: string[];
  format: 'PDF' | 'CSV' | 'EXCEL';
  isActive: boolean;
}

interface ReportExecution {
  id: string;
  reportId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  recordCount?: number;
  fileUrl?: string;
  error?: string;
}

const CustomReportsPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [reports, setReports] = useState<CustomReport[]>([]);
  const [executions, setExecutions] = useState<ReportExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<CustomReport | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [newReport, setNewReport] = useState({
    name: '',
    description: '',
    type: 'TABLE' as const,
    category: 'operational',
    dataSource: 'agents',
    fields: [] as ReportField[],
    filters: [] as ReportFilter[],
    groupBy: [] as string[],
    sortBy: [] as ReportSort[],
    isPublic: false,
  });

  const [reportBuilder, setReportBuilder] = useState({
    step: 1,
    availableFields: [] as string[],
    selectedFields: [] as string[],
    availableFilters: [] as string[],
    selectedFilters: [] as ReportFilter[],
  });

  // Data fetching functions
  const fetchReports = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [reportsResponse, executionsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/custom-reports`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/report-executions`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!reportsResponse.ok || !executionsResponse.ok) {
        throw new Error('Failed to fetch reports data');
      }

      const reportsResult = await reportsResponse.json();
      const executionsResult = await executionsResponse.json();

      setReports(reportsResult.data || []);
      setExecutions(executionsResult.data || []);
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch reports:', err);
      setError('Failed to load reports data. Please check your connection and try again.');
      setReports([]);
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const createReport = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/custom-reports`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newReport,
          createdBy: user?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create report');
      }

      setCreateDialogOpen(false);
      setNewReport({
        name: '',
        description: '',
        type: 'TABLE',
        category: 'operational',
        dataSource: 'agents',
        fields: [],
        filters: [],
        groupBy: [],
        sortBy: [],
        isPublic: false,
      });
      fetchReports();

    } catch (err: any) {
      console.error('Failed to create report:', err);
      setError('Failed to create report. Please try again.');
    }
  };

  const runReport = async (reportId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/custom-reports/${reportId}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to run report');
      }

      fetchReports();

    } catch (err: any) {
      console.error('Failed to run report:', err);
      setError('Failed to run report. Please try again.');
    }
  };

  // Utility functions
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'TABLE':
        return <TableIcon />;
      case 'CHART':
        return <ChartIcon />;
      case 'DASHBOARD':
        return <ReportIcon />;
      default:
        return <ReportIcon />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'RUNNING':
        return 'info';
      case 'FAILED':
        return 'error';
      default:
        return 'default';
    }
  };

  const filteredReports = reports.filter(report => {
    if (filterCategory !== 'all' && report.category !== filterCategory) return false;
    if (filterType !== 'all' && report.type !== filterType) return false;
    if (searchQuery && 
        !report.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !report.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Loading state
  if (loading && reports.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Custom Reports...
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
            Custom Reports Builder
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Drag-drop interface, filters, scheduling, and export capabilities
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
            onClick={fetchReports}
            startIcon={<RefreshIcon />}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            onClick={() => setCreateDialogOpen(true)}
            startIcon={<AddIcon />}
          >
            Create Report
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <ReportIcon color="primary" />
                <Box>
                  <Typography variant="h6">{reports.length}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Reports
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
                <ScheduleIcon color="info" />
                <Box>
                  <Typography variant="h6">{reports.filter(r => r.schedule?.isActive).length}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Scheduled Reports
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
                <RunIcon color="success" />
                <Box>
                  <Typography variant="h6">{executions.filter(e => e.status === 'COMPLETED').length}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Completed Runs
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
                <ShareIcon color="warning" />
                <Box>
                  <Typography variant="h6">{reports.filter(r => r.isPublic).length}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Shared Reports
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={filterCategory}
            label="Category"
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <MenuItem value="all">All Categories</MenuItem>
            <MenuItem value="operational">Operational</MenuItem>
            <MenuItem value="financial">Financial</MenuItem>
            <MenuItem value="performance">Performance</MenuItem>
            <MenuItem value="compliance">Compliance</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Type</InputLabel>
          <Select
            value={filterType}
            label="Type"
            onChange={(e) => setFilterType(e.target.value)}
          >
            <MenuItem value="all">All Types</MenuItem>
            <MenuItem value="TABLE">Table</MenuItem>
            <MenuItem value="CHART">Chart</MenuItem>
            <MenuItem value="DASHBOARD">Dashboard</MenuItem>
            <MenuItem value="SUMMARY">Summary</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          placeholder="Search reports..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
          }}
          sx={{ minWidth: 200 }}
        />
      </Box>

      {/* Reports Grid */}
      <Typography variant="h6" gutterBottom>
        Custom Reports ({filteredReports.length})
      </Typography>

      <Grid container spacing={3}>
        {filteredReports.map((report) => (
          <Grid item xs={12} md={6} lg={4} key={report.id}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Typography variant="h6" gutterBottom>
                    {report.name}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    {getTypeIcon(report.type)}
                    <Chip
                      label={report.type}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                </Box>

                <Typography variant="body2" color="text.secondary" paragraph>
                  {report.description}
                </Typography>

                <Box display="flex" gap={1} mb={2}>
                  <Chip label={report.category} size="small" variant="outlined" />
                  <Chip label={report.dataSource} size="small" variant="outlined" />
                  {report.isPublic && (
                    <Chip label="Public" color="info" size="small" />
                  )}
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    Created by {report.creator.firstName} {report.creator.lastName}
                  </Typography>
                  <Box>
                    <Tooltip title="Run Report">
                      <IconButton
                        size="small"
                        onClick={() => runReport(report.id)}
                        color="primary"
                      >
                        <RunIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit Report">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedReport(report);
                          setEditDialogOpen(true);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Share Report">
                      <IconButton size="small">
                        <ShareIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Recent Executions */}
      <Paper sx={{ mt: 3 }}>
        <Box p={3}>
          <Typography variant="h6" gutterBottom>
            Recent Report Executions
          </Typography>
          <List>
            {executions.slice(0, 5).map((execution, index) => (
              <React.Fragment key={execution.id}>
                <ListItem>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: getStatusColor(execution.status) + '.main' }}>
                      <AssessmentIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`Report Execution #${execution.id.slice(-8)}`}
                    secondary={
                      <Box>
                        <Typography variant="caption" display="block">
                          Status: {execution.status}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Started: {new Date(execution.startedAt).toLocaleString()}
                        </Typography>
                        {execution.duration && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            Duration: {execution.duration}s
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  <Box display="flex" gap={1}>
                    <Chip
                      label={execution.status}
                      color={getStatusColor(execution.status) as any}
                      size="small"
                    />
                    {execution.fileUrl && (
                      <IconButton size="small">
                        <DownloadIcon />
                      </IconButton>
                    )}
                  </Box>
                </ListItem>
                {index < 4 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </Box>
      </Paper>
    </Box>
  );
};

export default CustomReportsPage;
