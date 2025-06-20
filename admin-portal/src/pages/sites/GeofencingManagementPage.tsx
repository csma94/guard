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
  Switch,
  FormControlLabel,
  Slider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Map as MapIcon,
  LocationOn as LocationIcon,
  RadioButtonChecked as GeofenceIcon,
  Warning as WarningIcon,
  CheckCircle as ValidIcon,
  Cancel as ViolationIcon,
  Settings as SettingsIcon,
  Notifications as AlertIcon,
  Timeline as HistoryIcon,
  Visibility as ViewIcon,
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
      id={`geofence-tabpanel-${index}`}
      aria-labelledby={`geofence-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface GeofenceZone {
  id: string;
  siteId: string;
  name: string;
  type: 'CIRCULAR' | 'POLYGON' | 'RECTANGLE';
  coordinates: any;
  radius?: number;
  isActive: boolean;
  alertSettings: {
    entryAlert: boolean;
    exitAlert: boolean;
    dwellTimeAlert: boolean;
    dwellTimeThreshold: number;
  };
  validationRules: {
    requiresValidation: boolean;
    validationMethod: 'QR_CODE' | 'BIOMETRIC' | 'MANUAL';
    gracePeriod: number;
  };
  createdAt: string;
  updatedAt: string;
  site: {
    id: string;
    name: string;
    address: any;
  };
  violations?: GeofenceViolation[];
  validations?: GeofenceValidation[];
}

interface GeofenceViolation {
  id: string;
  geofenceId: string;
  agentId: string;
  violationType: 'ENTRY' | 'EXIT' | 'DWELL_TIME' | 'UNAUTHORIZED_ACCESS';
  location: string;
  timestamp: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE';
  notes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  agent: {
    id: string;
    employeeId: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
}

interface GeofenceValidation {
  id: string;
  geofenceId: string;
  agentId: string;
  validationType: 'ENTRY' | 'EXIT' | 'CHECKPOINT';
  method: 'QR_CODE' | 'BIOMETRIC' | 'MANUAL';
  location: string;
  timestamp: string;
  isValid: boolean;
  notes?: string;
  agent: {
    id: string;
    employeeId: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
}

interface GeofenceStats {
  totalZones: number;
  activeZones: number;
  totalViolations: number;
  openViolations: number;
  totalValidations: number;
  validationRate: number;
  averageResponseTime: number;
  criticalViolations: number;
}

const GeofencingManagementPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [geofenceZones, setGeofenceZones] = useState<GeofenceZone[]>([]);
  const [violations, setViolations] = useState<GeofenceViolation[]>([]);
  const [validations, setValidations] = useState<GeofenceValidation[]>([]);
  const [stats, setStats] = useState<GeofenceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<GeofenceZone | null>(null);
  const [createZoneDialogOpen, setCreateZoneDialogOpen] = useState(false);
  const [editZoneDialogOpen, setEditZoneDialogOpen] = useState(false);
  const [mapViewOpen, setMapViewOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [newZone, setNewZone] = useState({
    siteId: '',
    name: '',
    type: 'CIRCULAR' as const,
    coordinates: { lat: 0, lng: 0 },
    radius: 100,
    isActive: true,
    alertSettings: {
      entryAlert: true,
      exitAlert: true,
      dwellTimeAlert: false,
      dwellTimeThreshold: 300,
    },
    validationRules: {
      requiresValidation: false,
      validationMethod: 'QR_CODE' as const,
      gracePeriod: 60,
    },
  });

  // Data fetching functions
  const fetchGeofenceData = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [zonesResponse, violationsResponse, validationsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/geofence-zones`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/geofence-violations`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/geofence-validations`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/geofence-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!zonesResponse.ok || !violationsResponse.ok || !validationsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch geofence data');
      }

      const zonesResult = await zonesResponse.json();
      const violationsResult = await violationsResponse.json();
      const validationsResult = await validationsResponse.json();
      const statsResult = await statsResponse.json();

      setGeofenceZones(zonesResult.data || []);
      setViolations(violationsResult.data || []);
      setValidations(validationsResult.data || []);
      setStats(statsResult.data || {
        totalZones: 0,
        activeZones: 0,
        totalViolations: 0,
        openViolations: 0,
        totalValidations: 0,
        validationRate: 0,
        averageResponseTime: 0,
        criticalViolations: 0,
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch geofence data:', err);
      setError('Failed to load geofence data. Please check your connection and try again.');
      setGeofenceZones([]);
      setViolations([]);
      setValidations([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const createGeofenceZone = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/geofence-zones`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newZone),
      });

      if (!response.ok) {
        throw new Error('Failed to create geofence zone');
      }

      setCreateZoneDialogOpen(false);
      setNewZone({
        siteId: '',
        name: '',
        type: 'CIRCULAR',
        coordinates: { lat: 0, lng: 0 },
        radius: 100,
        isActive: true,
        alertSettings: {
          entryAlert: true,
          exitAlert: true,
          dwellTimeAlert: false,
          dwellTimeThreshold: 300,
        },
        validationRules: {
          requiresValidation: false,
          validationMethod: 'QR_CODE',
          gracePeriod: 60,
        },
      });
      fetchGeofenceData();

    } catch (err: any) {
      console.error('Failed to create geofence zone:', err);
      setError('Failed to create geofence zone. Please try again.');
    }
  };

  // Utility functions
  const getViolationSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'error';
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

  const getViolationStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'error';
      case 'ACKNOWLEDGED':
        return 'warning';
      case 'RESOLVED':
        return 'success';
      case 'FALSE_POSITIVE':
        return 'default';
      default:
        return 'default';
    }
  };

  // Effects
  useEffect(() => {
    fetchGeofenceData();
  }, [fetchGeofenceData]);

  // Loading state
  if (loading && geofenceZones.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Geofence Data...
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
            Geofencing Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Map-based boundary creation, validation rules, and monitoring
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
            onClick={fetchGeofenceData}
            startIcon={<RefreshIcon />}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            onClick={() => setCreateZoneDialogOpen(true)}
            startIcon={<AddIcon />}
          >
            Create Zone
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
                  <GeofenceIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalZones}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Zones
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
                  <ValidIcon color="success" />
                  <Box>
                    <Typography variant="h6">{stats.activeZones}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Zones
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
                  <ViolationIcon color="error" />
                  <Box>
                    <Typography variant="h6">{stats.totalViolations}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Violations
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
                  <CheckCircle color="info" />
                  <Box>
                    <Typography variant="h6">{stats.validationRate}%</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Validation Rate
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Geofence Zones" />
          <Tab label="Violations" />
          <Tab label="Validations" />
          <Tab label="Map View" />
        </Tabs>

        {/* Geofence Zones Tab */}
        <TabPanel value={activeTab} index={0}>
          <Typography variant="h6">Geofence Zones Management - Coming Soon</Typography>
        </TabPanel>

        {/* Violations Tab */}
        <TabPanel value={activeTab} index={1}>
          <Typography variant="h6">Violation Monitoring - Coming Soon</Typography>
        </TabPanel>

        {/* Validations Tab */}
        <TabPanel value={activeTab} index={2}>
          <Typography variant="h6">Validation Tracking - Coming Soon</Typography>
        </TabPanel>

        {/* Map View Tab */}
        <TabPanel value={activeTab} index={3}>
          <Box display="flex" gap={2} mb={3}>
            <Button
              variant="contained"
              onClick={() => setMapViewOpen(true)}
              startIcon={<MapIcon />}
            >
              Open Map View
            </Button>
            <Button
              variant="outlined"
              startIcon={<ViewIcon />}
            >
              Satellite View
            </Button>
          </Box>

          <Paper sx={{ p: 3, minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box textAlign="center">
              <MapIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                Interactive Map Integration
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Real-time geofence visualization and management
              </Typography>
            </Box>
          </Paper>
        </TabPanel>
      </Paper>

      {/* Geofence Zones List */}
      <Paper sx={{ mt: 3 }}>
        <Box p={3}>
          <Typography variant="h6" gutterBottom>
            Recent Geofence Activity
          </Typography>
          <List>
            {geofenceZones.slice(0, 5).map((zone, index) => (
              <React.Fragment key={zone.id}>
                <ListItem>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: zone.isActive ? 'success.main' : 'grey.500' }}>
                      <GeofenceIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={zone.name}
                    secondary={
                      <Box>
                        <Typography variant="caption" display="block">
                          Site: {zone.site.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Type: {zone.type} • Radius: {zone.radius}m
                        </Typography>
                      </Box>
                    }
                  />
                  <Box display="flex" gap={1}>
                    <Chip
                      label={zone.isActive ? 'Active' : 'Inactive'}
                      color={zone.isActive ? 'success' : 'default'}
                      size="small"
                    />
                    <IconButton size="small">
                      <SettingsIcon />
                    </IconButton>
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

export default GeofencingManagementPage;
