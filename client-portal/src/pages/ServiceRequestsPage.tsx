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
  Chip,
  Divider,
  Paper,
  Tab,
  Tabs,
  Stepper,
  Step,
  StepLabel,
  StepContent,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Assignment as RequestIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  LocationOn as LocationIcon,
  Priority as PriorityIcon,
  CheckCircle as CompletedIcon,
  Cancel as CancelledIcon,
  HourglassEmpty as PendingIcon,
  PlayArrow as InProgressIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
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
      id={`service-tabpanel-${index}`}
      aria-labelledby={`service-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface ServiceRequest {
  id: string;
  type: 'SECURITY_ENHANCEMENT' | 'MAINTENANCE' | 'PATROL_ADJUSTMENT' | 'INCIDENT_RESPONSE' | 'TRAINING' | 'EQUIPMENT' | 'OTHER';
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';
  requestedBy: string;
  assignedTo?: string;
  siteId?: string;
  estimatedCost?: number;
  estimatedDuration?: number;
  requestedDate: string;
  approvedDate?: string;
  completedDate?: string;
  notes?: string;
  attachments: any[];
  statusHistory: ServiceRequestStatus[];
  site?: {
    id: string;
    name: string;
    address: any;
  };
  assignee?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

interface ServiceRequestStatus {
  id: string;
  status: string;
  notes?: string;
  updatedBy: string;
  updatedAt: string;
  user: {
    firstName: string;
    lastName: string;
  };
}

interface ServiceRequestStats {
  totalRequests: number;
  pendingRequests: number;
  inProgressRequests: number;
  completedRequests: number;
  averageResponseTime: number;
  averageCompletionTime: number;
  requestsByType: { type: string; count: number }[];
  requestsByPriority: { priority: string; count: number }[];
}

const ServiceRequestsPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [stats, setStats] = useState<ServiceRequestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [newRequest, setNewRequest] = useState({
    type: 'SECURITY_ENHANCEMENT' as const,
    title: '',
    description: '',
    priority: 'MEDIUM' as const,
    siteId: '',
    estimatedCost: 0,
    estimatedDuration: 0,
  });

  // Data fetching functions
  const fetchServiceRequests = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [requestsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/service-requests`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/service-requests/stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!requestsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch service requests data');
      }

      const requestsResult = await requestsResponse.json();
      const statsResult = await statsResponse.json();

      setServiceRequests(requestsResult.data || []);
      setStats(statsResult.data || {
        totalRequests: 0,
        pendingRequests: 0,
        inProgressRequests: 0,
        completedRequests: 0,
        averageResponseTime: 0,
        averageCompletionTime: 0,
        requestsByType: [],
        requestsByPriority: [],
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch service requests:', err);
      setError('Failed to load service requests data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const createServiceRequest = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/service-requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newRequest,
          requestedBy: user?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create service request');
      }

      setCreateDialogOpen(false);
      setNewRequest({
        type: 'SECURITY_ENHANCEMENT',
        title: '',
        description: '',
        priority: 'MEDIUM',
        siteId: '',
        estimatedCost: 0,
        estimatedDuration: 0,
      });
      fetchServiceRequests();

    } catch (err: any) {
      console.error('Failed to create service request:', err);
      setError('Failed to create service request. Please try again.');
    }
  };

  // Utility functions
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CompletedIcon color="success" />;
      case 'IN_PROGRESS':
        return <InProgressIcon color="info" />;
      case 'CANCELLED':
      case 'REJECTED':
        return <CancelledIcon color="error" />;
      default:
        return <PendingIcon color="warning" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'IN_PROGRESS':
        return 'info';
      case 'APPROVED':
        return 'primary';
      case 'CANCELLED':
      case 'REJECTED':
        return 'error';
      default:
        return 'warning';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDuration = (hours: number) => {
    if (hours < 24) return `${hours} hours`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days} days ${remainingHours} hours` : `${days} days`;
  };

  const filteredRequests = serviceRequests.filter(request => {
    if (filterStatus !== 'all' && request.status !== filterStatus) return false;
    if (filterType !== 'all' && request.type !== filterType) return false;
    if (filterPriority !== 'all' && request.priority !== filterPriority) return false;
    if (searchQuery && 
        !request.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !request.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchServiceRequests();
  }, [fetchServiceRequests]);

  // Loading state
  if (loading && serviceRequests.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Service Requests...
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
            Service Requests
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Request and track security service enhancements and modifications
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
            onClick={fetchServiceRequests}
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
            New Request
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
                  <RequestIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalRequests}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Requests
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
                  <PendingIcon color="warning" />
                  <Box>
                    <Typography variant="h6">{stats.pendingRequests}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Pending
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
                  <InProgressIcon color="info" />
                  <Box>
                    <Typography variant="h6">{stats.inProgressRequests}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      In Progress
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
                  <CompletedIcon color="success" />
                  <Box>
                    <Typography variant="h6">{stats.completedRequests}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Completed
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default ServiceRequestsPage;
