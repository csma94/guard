import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
  Alert,
  Divider,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Storage as StorageIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Backup as BackupIcon,
  CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';

import { useAuth } from '../../hooks/useAuth';
import { systemAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

interface SystemConfig {
  general: {
    systemName: string;
    systemDescription: string;
    timezone: string;
    dateFormat: string;
    currency: string;
    language: string;
    maintenanceMode: boolean;
    debugMode: boolean;
  };
  security: {
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
  };
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    pushEnabled: boolean;
    slackEnabled: boolean;
    emailSettings: {
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpPassword: string;
      fromEmail: string;
      fromName: string;
    };
    smsSettings: {
      provider: string;
      apiKey: string;
      fromNumber: string;
    };
    slackSettings: {
      webhookUrl: string;
      channel: string;
    };
  };
  monitoring: {
    locationUpdateInterval: number;
    geofenceAlertThreshold: number;
    inactivityAlertThreshold: number;
    lowBatteryThreshold: number;
    enableRealTimeTracking: boolean;
    enableGeofenceAlerts: boolean;
    enablePerformanceMonitoring: boolean;
    dataRetentionDays: number;
  };
  integrations: {
    googleMapsApiKey: string;
    awsAccessKey: string;
    awsSecretKey: string;
    awsRegion: string;
    s3Bucket: string;
    twilioAccountSid: string;
    twilioAuthToken: string;
    stripePublishableKey: string;
    stripeSecretKey: string;
  };
}

const SystemConfigurationPage: React.FC = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [ipDialogOpen, setIpDialogOpen] = useState(false);
  const [newIpAddress, setNewIpAddress] = useState('');

  useEffect(() => {
    loadSystemConfig();
  }, []);

  const loadSystemConfig = async () => {
    try {
      setIsLoading(true);
      const response = await systemAPI.getSystemConfig();
      setConfig(response.data as unknown as SystemConfig);
    } catch (error: any) {
      setError(error.message || 'Failed to load system configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;

    try {
      setIsSaving(true);
      setError(null);
      
      await systemAPI.updateSystemConfig(config);
      setSuccessMessage('System configuration saved successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      setError(error.message || 'Failed to save system configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfigChange = (section: keyof SystemConfig, field: string, value: any) => {
    if (!config) return;

    setConfig(prev => ({
      ...prev!,
      [section]: {
        ...prev![section],
        [field]: value,
      },
    }));
  };

  const handleNestedConfigChange = (section: keyof SystemConfig, subsection: string, field: string, value: any) => {
    if (!config) return;

    setConfig(prev => ({
      ...prev!,
      [section]: {
        ...prev![section],
        [subsection]: {
          ...(prev![section] as any)[subsection],
          [field]: value,
        },
      },
    }));
  };

  const handleAddIpAddress = () => {
    if (!config || !newIpAddress.trim()) return;

    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(newIpAddress.trim())) {
      setError('Invalid IP address format');
      return;
    }

    setConfig(prev => ({
      ...prev!,
      security: {
        ...prev!.security,
        ipWhitelist: [...prev!.security.ipWhitelist, newIpAddress.trim()],
      },
    }));

    setNewIpAddress('');
    setIpDialogOpen(false);
  };

  const handleRemoveIpAddress = (index: number) => {
    if (!config) return;

    setConfig(prev => ({
      ...prev!,
      security: {
        ...prev!.security,
        ipWhitelist: prev!.security.ipWhitelist.filter((_, i) => i !== index),
      },
    }));
  };

  const handleTestConnection = async (type: 'email' | 'sms' | 'slack') => {
    try {
      await systemAPI.testConnection(type);
      setSuccessMessage(`${type.toUpperCase()} connection test successful`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      setError(`${type.toUpperCase()} connection test failed: ${error.message}`);
    }
  };

  const handleBackupSystem = async () => {
    try {
      await systemAPI.createSystemBackup();
      setSuccessMessage('System backup initiated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      setError(`Backup failed: ${error.message}`);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!config) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Failed to load system configuration</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          System Configuration
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<BackupIcon />}
            onClick={handleBackupSystem}
          >
            Create Backup
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadSystemConfig}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSaveConfig}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </Box>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {/* Configuration Tabs */}
      <Card>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label="General" icon={<SettingsIcon />} />
          <Tab label="Security" icon={<SecurityIcon />} />
          <Tab label="Notifications" icon={<NotificationsIcon />} />
          <Tab label="Monitoring" icon={<StorageIcon />} />
          <Tab label="Integrations" icon={<CloudUploadIcon />} />
        </Tabs>

        <CardContent sx={{ p: 3 }}>
          {/* General Settings */}
          {activeTab === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="System Name"
                  value={config.general.systemName}
                  onChange={(e) => handleConfigChange('general', 'systemName', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Timezone</InputLabel>
                  <Select
                    value={config.general.timezone}
                    onChange={(e) => handleConfigChange('general', 'timezone', e.target.value)}
                    label="Timezone"
                  >
                    <MenuItem value="UTC">UTC</MenuItem>
                    <MenuItem value="America/New_York">Eastern Time</MenuItem>
                    <MenuItem value="America/Chicago">Central Time</MenuItem>
                    <MenuItem value="America/Denver">Mountain Time</MenuItem>
                    <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="System Description"
                  value={config.general.systemDescription}
                  onChange={(e) => handleConfigChange('general', 'systemDescription', e.target.value)}
                  multiline
                  rows={3}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Date Format</InputLabel>
                  <Select
                    value={config.general.dateFormat}
                    onChange={(e) => handleConfigChange('general', 'dateFormat', e.target.value)}
                    label="Date Format"
                  >
                    <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                    <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                    <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Currency</InputLabel>
                  <Select
                    value={config.general.currency}
                    onChange={(e) => handleConfigChange('general', 'currency', e.target.value)}
                    label="Currency"
                  >
                    <MenuItem value="USD">USD ($)</MenuItem>
                    <MenuItem value="EUR">EUR (€)</MenuItem>
                    <MenuItem value="GBP">GBP (£)</MenuItem>
                    <MenuItem value="CAD">CAD (C$)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.general.maintenanceMode}
                      onChange={(e) => handleConfigChange('general', 'maintenanceMode', e.target.checked)}
                    />
                  }
                  label="Maintenance Mode"
                />
                <Typography variant="body2" color="text.secondary">
                  When enabled, only administrators can access the system
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.general.debugMode}
                      onChange={(e) => handleConfigChange('general', 'debugMode', e.target.checked)}
                    />
                  }
                  label="Debug Mode"
                />
                <Typography variant="body2" color="text.secondary">
                  Enable detailed logging for troubleshooting
                </Typography>
              </Grid>
            </Grid>
          )}

          {/* Security Settings */}
          {activeTab === 1 && (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Password Policy
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Minimum Password Length"
                  value={config.security.passwordPolicy.minLength}
                  onChange={(e) => handleNestedConfigChange('security', 'passwordPolicy', 'minLength', parseInt(e.target.value))}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Password Expiration (days)"
                  value={config.security.passwordPolicy.expirationDays}
                  onChange={(e) => handleNestedConfigChange('security', 'passwordPolicy', 'expirationDays', parseInt(e.target.value))}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.security.passwordPolicy.requireUppercase}
                      onChange={(e) => handleNestedConfigChange('security', 'passwordPolicy', 'requireUppercase', e.target.checked)}
                    />
                  }
                  label="Require Uppercase Letters"
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={config.security.passwordPolicy.requireNumbers}
                      onChange={(e) => handleNestedConfigChange('security', 'passwordPolicy', 'requireNumbers', e.target.checked)}
                    />
                  }
                  label="Require Numbers"
                />
              </Grid>
              
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Session & Access Control
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Session Timeout (minutes)"
                  value={config.security.sessionTimeout}
                  onChange={(e) => handleConfigChange('security', 'sessionTimeout', parseInt(e.target.value))}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Max Login Attempts"
                  value={config.security.maxLoginAttempts}
                  onChange={(e) => handleConfigChange('security', 'maxLoginAttempts', parseInt(e.target.value))}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    IP Whitelist
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => setIpDialogOpen(true)}
                  >
                    Add IP
                  </Button>
                </Box>
                <List>
                  {config.security.ipWhitelist.map((ip, index) => (
                    <ListItem key={index}>
                      <ListItemText primary={ip} />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          onClick={() => handleRemoveIpAddress(index)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Add IP Dialog */}
      <Dialog open={ipDialogOpen} onClose={() => setIpDialogOpen(false)}>
        <DialogTitle>Add IP Address</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="IP Address"
            value={newIpAddress}
            onChange={(e) => setNewIpAddress(e.target.value)}
            placeholder="192.168.1.1"
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIpDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddIpAddress} variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SystemConfigurationPage;
