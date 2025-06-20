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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  Warning as IncidentIcon,
  Security as SecurityIcon,
  Emergency as EmergencyIcon,
  CheckCircle as ResolvedIcon,
  Schedule as PendingIcon,
  Person as PersonIcon,
  LocationOn as LocationIcon,
} from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface Incident {
  id: string;
  type: 'SECURITY_BREACH' | 'EMERGENCY' | 'SAFETY_VIOLATION' | 'EQUIPMENT_FAILURE' | 'MEDICAL' | 'FIRE' | 'THEFT' | 'VANDALISM' | 'OTHER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';
  title: string;
  description: string;
  location: string;
  reportedBy: string;
  assignedTo?: string;
  siteId: string;
  timestamp: string;
  resolvedAt?: string;
  responseTime?: number;
  resolutionTime?: number;
  notes?: string;
  attachments: any[];
  site: {
    id: string;
    name: string;
    address: any;
  };
  reporter: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  assignee?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

interface IncidentStats {
  totalIncidents: number;
  openIncidents: number;
  resolvedIncidents: number;
  criticalIncidents: number;
  averageResponseTime: number;
  averageResolutionTime: number;
  incidentsByType: { type: string; count: number }[];
  incidentsBySeverity: { severity: string; count: number }[];
}

const IncidentsPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<IncidentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterSite, setFilterSite] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Data fetching functions
  const fetchIncidents = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: rowsPerPage.toString(),
        type: filterType,
        status: filterStatus,
        severity: filterSeverity,
        site: filterSite,
        search: searchQuery,
      });

      const [incidentsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/incidents?${params}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/incidents/stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!incidentsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch incidents data');
      }

      const incidentsResult = await incidentsResponse.json();
      const statsResult = await statsResponse.json();

      setIncidents(incidentsResult.data || []);
      setStats(statsResult.data || {
        totalIncidents: 0,
        openIncidents: 0,
        resolvedIncidents: 0,
        criticalIncidents: 0,
        averageResponseTime: 0,
        averageResolutionTime: 0,
        incidentsByType: [],
        incidentsBySeverity: [],
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch incidents:', err);
      setError('Failed to load incidents data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [getToken, page, rowsPerPage, filterType, filterStatus, filterSeverity, filterSite, searchQuery]);

  // Utility functions
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SECURITY_BREACH':
        return <SecurityIcon color="error" />;
      case 'EMERGENCY':
        return <EmergencyIcon color="error" />;
      case 'FIRE':
        return <EmergencyIcon color="error" />;
      case 'MEDICAL':
        return <EmergencyIcon color="warning" />;
      default:
        return <IncidentIcon color="warning" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RESOLVED':
      case 'CLOSED':
        return 'success';
      case 'IN_PROGRESS':
        return 'info';
      case 'ESCALATED':
        return 'error';
      default:
        return 'warning';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
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

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  const filteredIncidents = incidents.filter(incident => {
    if (searchQuery && 
        !incident.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !incident.description.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !incident.location.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // Loading state
  if (loading && incidents.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Incidents...
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
            Security Incidents
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Monitor and track security incidents and emergency responses
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
            onClick={fetchIncidents}
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

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <IncidentIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalIncidents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Incidents
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
                    <Typography variant="h6">{stats.openIncidents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Open Incidents
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
                  <EmergencyIcon color="error" />
                  <Box>
                    <Typography variant="h6">{stats.criticalIncidents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Critical
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
                  <ResolvedIcon color="success" />
                  <Box>
                    <Typography variant="h6">{stats.averageResponseTime}m</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Avg Response Time
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

export default IncidentsPage;
