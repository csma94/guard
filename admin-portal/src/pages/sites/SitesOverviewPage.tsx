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
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Badge,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  LocationOn as LocationIcon,
  Security as SecurityIcon,
  Business as BusinessIcon,
  Map as MapIcon,
  Warning as WarningIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface Site {
  id: string;
  clientId: string;
  name: string;
  address: any;
  coordinates: string;
  geofenceRadius: number;
  geofenceCoordinates?: string;
  qrCode?: string;
  siteType: string;
  accessInstructions?: string;
  emergencyContacts: any[];
  equipmentList: any[];
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
  client: {
    id: string;
    companyName: string;
    contactPerson: any;
  };
  shifts?: any[];
  reports?: any[];
  incidents?: any[];
}

interface SiteStats {
  totalSites: number;
  activeSites: number;
  inactiveSites: number;
  maintenanceSites: number;
  sitesWithActiveShifts: number;
  sitesWithIncidents: number;
  averageSecurityLevel: number;
  totalEquipment: number;
}

const SitesOverviewPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [sites, setSites] = useState<Site[]>([]);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [newSite, setNewSite] = useState({
    name: '',
    clientId: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
    },
    coordinates: '',
    geofenceRadius: 100,
    siteType: 'commercial',
    accessInstructions: '',
    emergencyContacts: [],
    equipmentList: [],
  });

  // Data fetching functions
  const fetchSites = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [sitesResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/sites`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/site-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!sitesResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch site data');
      }

      const sitesResult = await sitesResponse.json();
      const statsResult = await statsResponse.json();

      setSites(sitesResult.data || []);
      setStats(statsResult.data || {
        totalSites: 0,
        activeSites: 0,
        inactiveSites: 0,
        maintenanceSites: 0,
        sitesWithActiveShifts: 0,
        sitesWithIncidents: 0,
        averageSecurityLevel: 0,
        totalEquipment: 0,
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch sites:', err);
      setError('Failed to load site data. Please check your connection and try again.');
      setSites([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const createSite = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/sites`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSite),
      });

      if (!response.ok) {
        throw new Error('Failed to create site');
      }

      setCreateDialogOpen(false);
      setNewSite({
        name: '',
        clientId: '',
        address: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
        },
        coordinates: '',
        geofenceRadius: 100,
        siteType: 'commercial',
        accessInstructions: '',
        emergencyContacts: [],
        equipmentList: [],
      });
      fetchSites();

    } catch (err: any) {
      console.error('Failed to create site:', err);
      setError('Failed to create site. Please try again.');
    }
  };

  const deleteSite = async () => {
    if (!selectedSite) return;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/sites/${selectedSite.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete site');
      }

      setDeleteDialogOpen(false);
      setSelectedSite(null);
      fetchSites();

    } catch (err: any) {
      console.error('Failed to delete site:', err);
      setError('Failed to delete site. Please try again.');
    }
  };

  // Utility functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'INACTIVE':
        return 'default';
      case 'MAINTENANCE':
        return 'warning';
      case 'SUSPENDED':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <ActiveIcon color="success" />;
      case 'INACTIVE':
        return <InactiveIcon color="disabled" />;
      case 'MAINTENANCE':
        return <WarningIcon color="warning" />;
      case 'SUSPENDED':
        return <WarningIcon color="error" />;
      default:
        return <BusinessIcon />;
    }
  };

  const filteredSites = sites.filter(site => {
    if (filterStatus !== 'all' && site.status !== filterStatus) return false;
    if (filterType !== 'all' && site.siteType !== filterType) return false;
    if (searchQuery && 
        !site.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !site.client.companyName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // Loading state
  if (loading && sites.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Site Data...
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
            Sites Overview
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Interactive site monitoring, security management, and operational oversight
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
            onClick={fetchSites}
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
            Add Site
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
                  <BusinessIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalSites}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Sites
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
                  <ActiveIcon color="success" />
                  <Box>
                    <Typography variant="h6">{stats.activeSites}</Typography>
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
                  <ScheduleIcon color="info" />
                  <Box>
                    <Typography variant="h6">{stats.sitesWithActiveShifts}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      With Active Shifts
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
                  <Box>
                    <Typography variant="h6">{stats.sitesWithIncidents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      With Incidents
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            label="Status"
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <MenuItem value="all">All Status</MenuItem>
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="INACTIVE">Inactive</MenuItem>
            <MenuItem value="MAINTENANCE">Maintenance</MenuItem>
            <MenuItem value="SUSPENDED">Suspended</MenuItem>
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
            <MenuItem value="commercial">Commercial</MenuItem>
            <MenuItem value="residential">Residential</MenuItem>
            <MenuItem value="industrial">Industrial</MenuItem>
            <MenuItem value="government">Government</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          placeholder="Search sites..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
          }}
          sx={{ minWidth: 200 }}
        />
      </Box>

      {/* Sites Grid */}
      <Typography variant="h6" gutterBottom>
        Sites ({filteredSites.length})
      </Typography>

      <Grid container spacing={3}>
        {filteredSites.map((site) => (
          <Grid item xs={12} md={6} lg={4} key={site.id}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Typography variant="h6" gutterBottom>
                    {site.name}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    {getStatusIcon(site.status)}
                    <Chip
                      label={site.status}
                      color={getStatusColor(site.status) as any}
                      size="small"
                    />
                  </Box>
                </Box>

                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <LocationIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {site.address?.street}, {site.address?.city}
                  </Typography>
                </Box>

                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  <BusinessIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {site.client.companyName}
                  </Typography>
                </Box>

                <Box display="flex" gap={1} mb={2}>
                  <Chip label={site.siteType} size="small" variant="outlined" />
                  {site.geofenceRadius && (
                    <Chip label={`${site.geofenceRadius}m radius`} size="small" variant="outlined" />
                  )}
                </Box>

                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    {site.shifts?.length || 0} shifts • {site.reports?.length || 0} reports
                  </Typography>
                  <Box>
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => setSelectedSite(site)}
                      >
                        <MapIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit Site">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedSite(site);
                          setEditDialogOpen(true);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Site">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          setSelectedSite(site);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default SitesOverviewPage;
