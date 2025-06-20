import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Extension as IntegrationIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Schedule as ScheduleIcon,
  LocationOn as LocationIcon,
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
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface SystemSettings {
  general: {
    companyName: string;
    timezone: string;
    dateFormat: string;
    language: string;
    sessionTimeout: number;
    autoLogout: boolean;
  };
  security: {
    passwordMinLength: number;
    requireTwoFactor: boolean;
    maxLoginAttempts: number;
    sessionDuration: number;
    allowSelfRegistration: boolean;
    requireEmailVerification: boolean;
  };
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
    emergencyAlerts: boolean;
    shiftReminders: boolean;
    reportNotifications: boolean;
  };
  tracking: {
    locationUpdateInterval: number;
    geofenceAlertThreshold: number;
    batteryLowThreshold: number;
    offlineTimeout: number;
    trackingAccuracy: string;
  };
}

const SettingsPage: React.FC = () => {
  const { user, role } = useAuth();
  const { getToken } = useClerkAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setError(null);

      const token = await getToken();

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/admin/settings`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }

      const result = await response.json();
      setSettings(result.data || getDefaultSettings());

    } catch (err: any) {
      console.error('Failed to fetch settings:', err);
      setError('Failed to load settings. Using default values.');
      setSettings(getDefaultSettings());
    } finally {
      setLoading(false);
    }
  };

  const getDefaultSettings = (): SystemSettings => ({
    general: {
      companyName: 'Bahin SARL',
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      language: 'en',
      sessionTimeout: 3600,
      autoLogout: true,
    },
    security: {
      passwordMinLength: 8,
      requireTwoFactor: false,
      maxLoginAttempts: 5,
      sessionDuration: 24,
      allowSelfRegistration: false,
      requireEmailVerification: true,
    },
    notifications: {
      emailEnabled: true,
      smsEnabled: true,
      pushEnabled: true,
      emergencyAlerts: true,
      shiftReminders: true,
      reportNotifications: true,
    },
    tracking: {
      locationUpdateInterval: 30,
      geofenceAlertThreshold: 50,
      batteryLowThreshold: 20,
      offlineTimeout: 300,
      trackingAccuracy: 'high',
    },
  });

  const saveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const token = await getToken();

      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/admin/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);

    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = (section: keyof SystemSettings, field: string, value: any) => {
    if (!settings) return;

    setSettings({
      ...settings,
      [section]: {
        ...settings[section],
        [field]: value,
      },
    });
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Settings...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!settings) {
    return (
      <Box p={3}>
        <Alert severity="error">
          Failed to load settings. Please refresh the page and try again.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            System Settings
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Configure system settings, security parameters, and integrations
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            onClick={fetchSettings}
            startIcon={<RefreshIcon />}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            onClick={saveSettings}
            startIcon={<SaveIcon />}
            disabled={saving}
          >
            {saving ? <CircularProgress size={20} /> : 'Save Changes'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Settings Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="General" icon={<SettingsIcon />} />
          <Tab label="Security" icon={<SecurityIcon />} />
          <Tab label="Notifications" icon={<NotificationsIcon />} />
          <Tab label="Tracking" icon={<LocationIcon />} />
          <Tab label="User Profile" icon={<PersonIcon />} />
        </Tabs>

        {/* General Settings */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Company Name"
                value={settings.general.companyName}
                onChange={(e) => updateSettings('general', 'companyName', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Timezone</InputLabel>
                <Select
                  value={settings.general.timezone}
                  label="Timezone"
                  onChange={(e) => updateSettings('general', 'timezone', e.target.value)}
                >
                  <MenuItem value="UTC">UTC</MenuItem>
                  <MenuItem value="America/New_York">Eastern Time</MenuItem>
                  <MenuItem value="America/Chicago">Central Time</MenuItem>
                  <MenuItem value="America/Denver">Mountain Time</MenuItem>
                  <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
                  <MenuItem value="Europe/London">London</MenuItem>
                  <MenuItem value="Europe/Paris">Paris</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Date Format</InputLabel>
                <Select
                  value={settings.general.dateFormat}
                  label="Date Format"
                  onChange={(e) => updateSettings('general', 'dateFormat', e.target.value)}
                >
                  <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                  <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                  <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Language</InputLabel>
                <Select
                  value={settings.general.language}
                  label="Language"
                  onChange={(e) => updateSettings('general', 'language', e.target.value)}
                >
                  <MenuItem value="en">English</MenuItem>
                  <MenuItem value="fr">French</MenuItem>
                  <MenuItem value="es">Spanish</MenuItem>
                  <MenuItem value="ar">Arabic</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Session Timeout (seconds)"
                value={settings.general.sessionTimeout}
                onChange={(e) => updateSettings('general', 'sessionTimeout', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.general.autoLogout}
                    onChange={(e) => updateSettings('general', 'autoLogout', e.target.checked)}
                  />
                }
                label="Auto Logout on Inactivity"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Security Settings */}
        <TabPanel value={activeTab} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Minimum Password Length"
                value={settings.security.passwordMinLength}
                onChange={(e) => updateSettings('security', 'passwordMinLength', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Max Login Attempts"
                value={settings.security.maxLoginAttempts}
                onChange={(e) => updateSettings('security', 'maxLoginAttempts', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Session Duration (hours)"
                value={settings.security.sessionDuration}
                onChange={(e) => updateSettings('security', 'sessionDuration', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.security.requireTwoFactor}
                    onChange={(e) => updateSettings('security', 'requireTwoFactor', e.target.checked)}
                  />
                }
                label="Require Two-Factor Authentication"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.security.allowSelfRegistration}
                    onChange={(e) => updateSettings('security', 'allowSelfRegistration', e.target.checked)}
                  />
                }
                label="Allow Self Registration"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.security.requireEmailVerification}
                    onChange={(e) => updateSettings('security', 'requireEmailVerification', e.target.checked)}
                  />
                }
                label="Require Email Verification"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Notifications Settings */}
        <TabPanel value={activeTab} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Notification Channels
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifications.emailEnabled}
                    onChange={(e) => updateSettings('notifications', 'emailEnabled', e.target.checked)}
                  />
                }
                label="Email Notifications"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifications.smsEnabled}
                    onChange={(e) => updateSettings('notifications', 'smsEnabled', e.target.checked)}
                  />
                }
                label="SMS Notifications"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifications.pushEnabled}
                    onChange={(e) => updateSettings('notifications', 'pushEnabled', e.target.checked)}
                  />
                }
                label="Push Notifications"
              />
            </Grid>
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>
                Notification Types
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifications.emergencyAlerts}
                    onChange={(e) => updateSettings('notifications', 'emergencyAlerts', e.target.checked)}
                  />
                }
                label="Emergency Alerts"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifications.shiftReminders}
                    onChange={(e) => updateSettings('notifications', 'shiftReminders', e.target.checked)}
                  />
                }
                label="Shift Reminders"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifications.reportNotifications}
                    onChange={(e) => updateSettings('notifications', 'reportNotifications', e.target.checked)}
                  />
                }
                label="Report Notifications"
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Tracking Settings */}
        <TabPanel value={activeTab} index={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Location Update Interval (seconds)"
                value={settings.tracking.locationUpdateInterval}
                onChange={(e) => updateSettings('tracking', 'locationUpdateInterval', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Geofence Alert Threshold (meters)"
                value={settings.tracking.geofenceAlertThreshold}
                onChange={(e) => updateSettings('tracking', 'geofenceAlertThreshold', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Battery Low Threshold (%)"
                value={settings.tracking.batteryLowThreshold}
                onChange={(e) => updateSettings('tracking', 'batteryLowThreshold', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Offline Timeout (seconds)"
                value={settings.tracking.offlineTimeout}
                onChange={(e) => updateSettings('tracking', 'offlineTimeout', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Tracking Accuracy</InputLabel>
                <Select
                  value={settings.tracking.trackingAccuracy}
                  label="Tracking Accuracy"
                  onChange={(e) => updateSettings('tracking', 'trackingAccuracy', e.target.value)}
                >
                  <MenuItem value="low">Low (Battery Saving)</MenuItem>
                  <MenuItem value="medium">Medium (Balanced)</MenuItem>
                  <MenuItem value="high">High (Most Accurate)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </TabPanel>

        {/* User Profile */}
        <TabPanel value={activeTab} index={4}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Personal Information
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="First Name"
                value={user?.firstName || ''}
                disabled
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={user?.lastName || ''}
                disabled
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Email"
                value={user?.emailAddresses?.[0]?.emailAddress || ''}
                disabled
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Role"
                value={role || 'User'}
                disabled
              />
            </Grid>
            <Grid item xs={12}>
              <Alert severity="info">
                Personal information is managed through your authentication provider.
                Contact your administrator to make changes.
              </Alert>
            </Grid>
          </Grid>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default SettingsPage;
