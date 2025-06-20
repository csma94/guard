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
  Paper,
  Tab,
  Tabs,
  Switch,
  FormControlLabel,
  FormGroup,
  Divider,
  Slider,
  Chip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Storage as StorageIcon,
  Speed as PerformanceIcon,
  Integration as IntegrationIcon,
  Backup as BackupIcon,
  Update as UpdateIcon,
  Add as AddIcon,
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
  general: GeneralSettings;
  security: SecuritySettings;
  notifications: NotificationSettings;
  performance: PerformanceSettings;
  integrations: IntegrationSettings;
  backup: BackupSettings;
}

interface GeneralSettings {
  companyName: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  language: string;
  theme: 'light' | 'dark' | 'auto';
  logoUrl?: string;
  maintenanceMode: boolean;
  debugMode: boolean;
}

interface SecuritySettings {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    expirationDays: number;
  };
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  twoFactorRequired: boolean;
  ipWhitelist: string[];
  encryptionLevel: 'standard' | 'high' | 'maximum';
}

interface NotificationSettings {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  incidentAlerts: boolean;
  systemAlerts: boolean;
  reportNotifications: boolean;
  maintenanceNotifications: boolean;
  defaultRecipients: string[];
  escalationRules: EscalationRule[];
}

interface EscalationRule {
  id: string;
  name: string;
  condition: string;
  delay: number;
  recipients: string[];
  isActive: boolean;
}

interface PerformanceSettings {
  cacheEnabled: boolean;
  cacheTtl: number;
  maxConcurrentUsers: number;
  apiRateLimit: number;
  databasePoolSize: number;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  compressionEnabled: boolean;
  cdnEnabled: boolean;
}

interface IntegrationSettings {
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  ssoEnabled: boolean;
  ssoProvider: string;
  ssoConfig: any;
  thirdPartyServices: ThirdPartyService[];
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsed?: string;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret?: string;
  lastTriggered?: string;
}

interface ThirdPartyService {
  id: string;
  name: string;
  type: string;
  isEnabled: boolean;
  config: any;
  status: 'connected' | 'disconnected' | 'error';
}

interface BackupSettings {
  autoBackupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupTime: string;
  retentionDays: number;
  backupLocation: 'local' | 'cloud' | 'both';
  encryptBackups: boolean;
  lastBackup?: string;
  nextBackup?: string;
}

const SystemSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Data fetching functions
  const fetchSettings = useCallback(async () => {
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
        throw new Error('Failed to fetch system settings');
      }

      const result = await response.json();
      setSettings(result.data || {
        general: {
          companyName: 'BahinLink Security',
          timezone: 'UTC',
          dateFormat: 'MM/DD/YYYY',
          currency: 'USD',
          language: 'en',
          theme: 'light',
          maintenanceMode: false,
          debugMode: false,
        },
        security: {
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: false,
            expirationDays: 90,
          },
          sessionTimeout: 30,
          maxLoginAttempts: 5,
          lockoutDuration: 15,
          twoFactorRequired: false,
          ipWhitelist: [],
          encryptionLevel: 'standard',
        },
        notifications: {
          emailNotifications: true,
          smsNotifications: false,
          pushNotifications: true,
          incidentAlerts: true,
          systemAlerts: true,
          reportNotifications: true,
          maintenanceNotifications: true,
          defaultRecipients: [],
          escalationRules: [],
        },
        performance: {
          cacheEnabled: true,
          cacheTtl: 3600,
          maxConcurrentUsers: 1000,
          apiRateLimit: 100,
          databasePoolSize: 10,
          logLevel: 'info',
          compressionEnabled: true,
          cdnEnabled: false,
        },
        integrations: {
          apiKeys: [],
          webhooks: [],
          ssoEnabled: false,
          ssoProvider: '',
          ssoConfig: {},
          thirdPartyServices: [],
        },
        backup: {
          autoBackupEnabled: true,
          backupFrequency: 'daily',
          backupTime: '02:00',
          retentionDays: 30,
          backupLocation: 'cloud',
          encryptBackups: true,
        },
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch settings:', err);
      setError('Failed to load system settings. Please check your connection and try again.');
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const saveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
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
        throw new Error('Failed to save system settings');
      }

      setSuccess('System settings saved successfully');
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setError('Failed to save system settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Utility functions
  const updateGeneralSettings = (field: string, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      general: {
        ...settings.general,
        [field]: value,
      },
    });
  };

  const updateSecuritySettings = (field: string, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      security: {
        ...settings.security,
        [field]: value,
      },
    });
  };

  const updatePasswordPolicy = (field: string, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      security: {
        ...settings.security,
        passwordPolicy: {
          ...settings.security.passwordPolicy,
          [field]: value,
        },
      },
    });
  };

  // Effects
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Loading state
  if (loading && !settings) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading System Settings...
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
            System Settings
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Configure system features, performance settings, and integration management
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
            disabled={saving || !settings}
          >
            {saving ? 'Saving...' : 'Save Settings'}
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
      {settings && (
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
            <Tab label="Performance" icon={<PerformanceIcon />} />
            <Tab label="Integrations" icon={<IntegrationIcon />} />
            <Tab label="Backup" icon={<BackupIcon />} />
          </Tabs>

          {/* General Settings Tab */}
          <TabPanel value={activeTab} index={0}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Company Name"
                  value={settings.general.companyName}
                  onChange={(e) => updateGeneralSettings('companyName', e.target.value)}
                  margin="normal"
                />
                <FormControl fullWidth margin="normal">
                  <InputLabel>Timezone</InputLabel>
                  <Select
                    value={settings.general.timezone}
                    label="Timezone"
                    onChange={(e) => updateGeneralSettings('timezone', e.target.value)}
                  >
                    <MenuItem value="UTC">UTC</MenuItem>
                    <MenuItem value="America/New_York">Eastern Time</MenuItem>
                    <MenuItem value="America/Chicago">Central Time</MenuItem>
                    <MenuItem value="America/Denver">Mountain Time</MenuItem>
                    <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth margin="normal">
                  <InputLabel>Date Format</InputLabel>
                  <Select
                    value={settings.general.dateFormat}
                    label="Date Format"
                    onChange={(e) => updateGeneralSettings('dateFormat', e.target.value)}
                  >
                    <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                    <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                    <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth margin="normal">
                  <InputLabel>Currency</InputLabel>
                  <Select
                    value={settings.general.currency}
                    label="Currency"
                    onChange={(e) => updateGeneralSettings('currency', e.target.value)}
                  >
                    <MenuItem value="USD">USD - US Dollar</MenuItem>
                    <MenuItem value="EUR">EUR - Euro</MenuItem>
                    <MenuItem value="GBP">GBP - British Pound</MenuItem>
                    <MenuItem value="CAD">CAD - Canadian Dollar</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth margin="normal">
                  <InputLabel>Theme</InputLabel>
                  <Select
                    value={settings.general.theme}
                    label="Theme"
                    onChange={(e) => updateGeneralSettings('theme', e.target.value)}
                  >
                    <MenuItem value="light">Light</MenuItem>
                    <MenuItem value="dark">Dark</MenuItem>
                    <MenuItem value="auto">Auto</MenuItem>
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.general.maintenanceMode}
                      onChange={(e) => updateGeneralSettings('maintenanceMode', e.target.checked)}
                    />
                  }
                  label="Maintenance Mode"
                />
              </Grid>
            </Grid>
          </TabPanel>

          {/* Security Settings Tab */}
          <TabPanel value={activeTab} index={1}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Password Policy
                </Typography>
                <TextField
                  fullWidth
                  label="Minimum Length"
                  type="number"
                  value={settings.security.passwordPolicy.minLength}
                  onChange={(e) => updatePasswordPolicy('minLength', parseInt(e.target.value))}
                  margin="normal"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.security.passwordPolicy.requireUppercase}
                      onChange={(e) => updatePasswordPolicy('requireUppercase', e.target.checked)}
                    />
                  }
                  label="Require Uppercase"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.security.passwordPolicy.requireNumbers}
                      onChange={(e) => updatePasswordPolicy('requireNumbers', e.target.checked)}
                    />
                  }
                  label="Require Numbers"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Session Security
                </Typography>
                <TextField
                  fullWidth
                  label="Session Timeout (minutes)"
                  type="number"
                  value={settings.security.sessionTimeout}
                  onChange={(e) => updateSecuritySettings('sessionTimeout', parseInt(e.target.value))}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Max Login Attempts"
                  type="number"
                  value={settings.security.maxLoginAttempts}
                  onChange={(e) => updateSecuritySettings('maxLoginAttempts', parseInt(e.target.value))}
                  margin="normal"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.security.twoFactorRequired}
                      onChange={(e) => updateSecuritySettings('twoFactorRequired', e.target.checked)}
                    />
                  }
                  label="Require Two-Factor Authentication"
                />
              </Grid>
            </Grid>
          </TabPanel>

          {/* Notifications Tab */}
          <TabPanel value={activeTab} index={2}>
            <Typography variant="h6" gutterBottom>
              Notification Preferences
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormGroup>
                  <FormControlLabel
                    control={<Switch checked={true} />}
                    label="Email Notifications"
                  />
                  <FormControlLabel
                    control={<Switch checked={false} />}
                    label="SMS Notifications"
                  />
                  <FormControlLabel
                    control={<Switch checked={true} />}
                    label="Push Notifications"
                  />
                  <FormControlLabel
                    control={<Switch checked={true} />}
                    label="Incident Alerts"
                  />
                </FormGroup>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormGroup>
                  <FormControlLabel
                    control={<Switch checked={true} />}
                    label="System Alerts"
                  />
                  <FormControlLabel
                    control={<Switch checked={true} />}
                    label="Report Notifications"
                  />
                  <FormControlLabel
                    control={<Switch checked={true} />}
                    label="Maintenance Notifications"
                  />
                </FormGroup>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Performance Tab */}
          <TabPanel value={activeTab} index={3}>
            <Typography variant="h6" gutterBottom>
              Performance Settings
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={<Switch checked={true} />}
                  label="Enable Caching"
                />
                <Typography variant="body2" gutterBottom>
                  Cache TTL (seconds)
                </Typography>
                <Slider
                  value={3600}
                  min={300}
                  max={86400}
                  step={300}
                  valueLabelDisplay="auto"
                />
                <TextField
                  fullWidth
                  label="Max Concurrent Users"
                  type="number"
                  value={1000}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="API Rate Limit (requests/minute)"
                  type="number"
                  value={100}
                  margin="normal"
                />
                <FormControl fullWidth margin="normal">
                  <InputLabel>Log Level</InputLabel>
                  <Select value="info" label="Log Level">
                    <MenuItem value="error">Error</MenuItem>
                    <MenuItem value="warn">Warning</MenuItem>
                    <MenuItem value="info">Info</MenuItem>
                    <MenuItem value="debug">Debug</MenuItem>
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={<Switch checked={true} />}
                  label="Enable Compression"
                />
              </Grid>
            </Grid>
          </TabPanel>

          {/* Integrations Tab */}
          <TabPanel value={activeTab} index={4}>
            <Typography variant="h6" gutterBottom>
              Third-Party Integrations
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      API Keys
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Manage API keys for external integrations
                    </Typography>
                    <Button variant="outlined" startIcon={<AddIcon />}>
                      Add API Key
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Webhooks
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Configure webhook endpoints for real-time notifications
                    </Typography>
                    <Button variant="outlined" startIcon={<AddIcon />}>
                      Add Webhook
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Backup Tab */}
          <TabPanel value={activeTab} index={5}>
            <Typography variant="h6" gutterBottom>
              Backup & Recovery Settings
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={<Switch checked={true} />}
                  label="Enable Automatic Backups"
                />
                <FormControl fullWidth margin="normal">
                  <InputLabel>Backup Frequency</InputLabel>
                  <Select value="daily" label="Backup Frequency">
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  label="Backup Time"
                  type="time"
                  value="02:00"
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Retention Days"
                  type="number"
                  value={30}
                  margin="normal"
                />
                <FormControl fullWidth margin="normal">
                  <InputLabel>Backup Location</InputLabel>
                  <Select value="cloud" label="Backup Location">
                    <MenuItem value="local">Local Storage</MenuItem>
                    <MenuItem value="cloud">Cloud Storage</MenuItem>
                    <MenuItem value="both">Both</MenuItem>
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={<Switch checked={true} />}
                  label="Encrypt Backups"
                />
              </Grid>
            </Grid>
          </TabPanel>
        </Paper>
      )}
    </Box>
  );
};

export default SystemSettingsPage;
