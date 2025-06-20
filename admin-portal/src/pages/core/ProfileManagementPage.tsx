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
  TextField,
  Paper,
  Tab,
  Tabs,
  Avatar,
  Divider,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
  Save as SaveIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Person as PersonIcon,
  VpnKey as ApiKeyIcon,
  History as HistoryIcon,
  PhotoCamera as PhotoIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
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
      id={`profile-tabpanel-${index}`}
      aria-labelledby={`profile-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: string;
  department?: string;
  title?: string;
  bio?: string;
  timezone: string;
  language: string;
  dateFormat: string;
  theme: 'light' | 'dark' | 'auto';
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface SecuritySettings {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  twoFactorEnabled: boolean;
  sessionTimeout: number;
  loginNotifications: boolean;
  securityAlerts: boolean;
}

interface NotificationPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  systemAlerts: boolean;
  securityAlerts: boolean;
  incidentAlerts: boolean;
  shiftReminders: boolean;
  trainingReminders: boolean;
  reportNotifications: boolean;
  marketingEmails: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsed?: string;
  createdAt: string;
}

interface LoginHistory {
  id: string;
  ipAddress: string;
  userAgent: string;
  location?: string;
  success: boolean;
  timestamp: string;
}

const ProfileManagementPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false,
    sessionTimeout: 30,
    loginNotifications: true,
    securityAlerts: true,
  });
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [createApiKeyDialogOpen, setCreateApiKeyDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState({
    name: '',
    permissions: [] as string[],
    expiresAt: '',
  });

  // Data fetching functions
  const fetchProfileData = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [profileResponse, notificationsResponse, apiKeysResponse, historyResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/profile`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/profile/notification-preferences`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/profile/api-keys`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/profile/login-history`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!profileResponse.ok || !notificationsResponse.ok || !apiKeysResponse.ok || !historyResponse.ok) {
        throw new Error('Failed to fetch profile data');
      }

      const profileResult = await profileResponse.json();
      const notificationsResult = await notificationsResponse.json();
      const apiKeysResult = await apiKeysResponse.json();
      const historyResult = await historyResponse.json();

      setProfile(profileResult.data || null);
      setNotificationPreferences(notificationsResult.data || {
        emailNotifications: true,
        pushNotifications: true,
        smsNotifications: false,
        systemAlerts: true,
        securityAlerts: true,
        incidentAlerts: true,
        shiftReminders: true,
        trainingReminders: true,
        reportNotifications: true,
        marketingEmails: false,
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00',
        },
      });
      setApiKeys(apiKeysResult.data || []);
      setLoginHistory(historyResult.data || []);

    } catch (err: any) {
      console.error('Failed to fetch profile data:', err);
      setError('Failed to load profile data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const updateProfile = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      setSuccess('Profile updated successfully');

    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setError('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async () => {
    if (securitySettings.newPassword !== securitySettings.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/profile/change-password`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: securitySettings.currentPassword,
          newPassword: securitySettings.newPassword,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update password');
      }

      setSuccess('Password updated successfully');
      setSecuritySettings(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));

    } catch (err: any) {
      console.error('Failed to update password:', err);
      setError('Failed to update password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const createApiKey = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/profile/api-keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newApiKey),
      });

      if (!response.ok) {
        throw new Error('Failed to create API key');
      }

      setCreateApiKeyDialogOpen(false);
      setNewApiKey({
        name: '',
        permissions: [],
        expiresAt: '',
      });
      fetchProfileData();

    } catch (err: any) {
      console.error('Failed to create API key:', err);
      setError('Failed to create API key. Please try again.');
    }
  };

  // Utility functions
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusChip = (success: boolean) => {
    return (
      <Chip
        label={success ? 'Success' : 'Failed'}
        color={success ? 'success' : 'error'}
        size="small"
      />
    );
  };

  // Effects
  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  // Loading state
  if (loading && !profile) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Profile...
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
            Profile Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Personal information, security settings, and account preferences
          </Typography>
        </Box>
        <Box display="flex" gap={2} alignItems="center">
          <Button
            variant="contained"
            onClick={updateProfile}
            startIcon={<SaveIcon />}
            disabled={saving || !profile}
          >
            {saving ? 'Saving...' : 'Save Changes'}
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

      {/* Profile Tabs */}
      {profile && (
        <Paper sx={{ width: '100%' }}>
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            indicatorColor="primary"
            textColor="primary"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Profile" icon={<PersonIcon />} />
            <Tab label="Security" icon={<SecurityIcon />} />
            <Tab label="Notifications" icon={<NotificationsIcon />} />
            <Tab label="API Keys" icon={<ApiKeyIcon />} />
            <Tab label="Login History" icon={<HistoryIcon />} />
          </Tabs>

          {/* Profile Tab */}
          <TabPanel value={activeTab} index={0}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Avatar
                      sx={{ width: 120, height: 120, mx: 'auto', mb: 2 }}
                      src={profile.avatar}
                    >
                      {profile.firstName[0]}{profile.lastName[0]}
                    </Avatar>
                    <Typography variant="h6" gutterBottom>
                      {profile.firstName} {profile.lastName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {profile.role} • {profile.department}
                    </Typography>
                    <Button
                      variant="outlined"
                      startIcon={<PhotoIcon />}
                      size="small"
                    >
                      Change Photo
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={8}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="First Name"
                      value={profile.firstName}
                      onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Last Name"
                      value={profile.lastName}
                      onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Email"
                      value={profile.email}
                      disabled
                      helperText="Email cannot be changed"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Phone"
                      value={profile.phone || ''}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Title"
                      value={profile.title || ''}
                      onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Bio"
                      multiline
                      rows={3}
                      value={profile.bio || ''}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Timezone</InputLabel>
                      <Select
                        value={profile.timezone}
                        label="Timezone"
                        onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                      >
                        <MenuItem value="UTC">UTC</MenuItem>
                        <MenuItem value="America/New_York">Eastern Time</MenuItem>
                        <MenuItem value="America/Chicago">Central Time</MenuItem>
                        <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Theme</InputLabel>
                      <Select
                        value={profile.theme}
                        label="Theme"
                        onChange={(e) => setProfile({ ...profile, theme: e.target.value as any })}
                      >
                        <MenuItem value="light">Light</MenuItem>
                        <MenuItem value="dark">Dark</MenuItem>
                        <MenuItem value="auto">Auto</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Security Tab */}
          <TabPanel value={activeTab} index={1}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Change Password
                </Typography>
                <TextField
                  fullWidth
                  label="Current Password"
                  type={showPassword ? 'text' : 'password'}
                  value={securitySettings.currentPassword}
                  onChange={(e) => setSecuritySettings({ ...securitySettings, currentPassword: e.target.value })}
                  margin="normal"
                  InputProps={{
                    endAdornment: (
                      <IconButton onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    ),
                  }}
                />
                <TextField
                  fullWidth
                  label="New Password"
                  type="password"
                  value={securitySettings.newPassword}
                  onChange={(e) => setSecuritySettings({ ...securitySettings, newPassword: e.target.value })}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Confirm New Password"
                  type="password"
                  value={securitySettings.confirmPassword}
                  onChange={(e) => setSecuritySettings({ ...securitySettings, confirmPassword: e.target.value })}
                  margin="normal"
                />
                <Button
                  variant="contained"
                  onClick={updatePassword}
                  disabled={saving}
                  sx={{ mt: 2 }}
                >
                  Update Password
                </Button>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Security Settings
                </Typography>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={securitySettings.twoFactorEnabled}
                        onChange={(e) => setSecuritySettings({ ...securitySettings, twoFactorEnabled: e.target.checked })}
                      />
                    }
                    label="Two-Factor Authentication"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={securitySettings.loginNotifications}
                        onChange={(e) => setSecuritySettings({ ...securitySettings, loginNotifications: e.target.checked })}
                      />
                    }
                    label="Login Notifications"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={securitySettings.securityAlerts}
                        onChange={(e) => setSecuritySettings({ ...securitySettings, securityAlerts: e.target.checked })}
                      />
                    }
                    label="Security Alerts"
                  />
                </FormGroup>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Session Timeout: {securitySettings.sessionTimeout} minutes
                </Typography>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Notifications Tab */}
          <TabPanel value={activeTab} index={2}>
            {notificationPreferences && (
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Notification Channels
                  </Typography>
                  <FormGroup>
                    <FormControlLabel
                      control={<Switch checked={notificationPreferences.emailNotifications} />}
                      label="Email Notifications"
                    />
                    <FormControlLabel
                      control={<Switch checked={notificationPreferences.pushNotifications} />}
                      label="Push Notifications"
                    />
                    <FormControlLabel
                      control={<Switch checked={notificationPreferences.smsNotifications} />}
                      label="SMS Notifications"
                    />
                  </FormGroup>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>
                    Alert Types
                  </Typography>
                  <FormGroup>
                    <FormControlLabel
                      control={<Switch checked={notificationPreferences.systemAlerts} />}
                      label="System Alerts"
                    />
                    <FormControlLabel
                      control={<Switch checked={notificationPreferences.securityAlerts} />}
                      label="Security Alerts"
                    />
                    <FormControlLabel
                      control={<Switch checked={notificationPreferences.incidentAlerts} />}
                      label="Incident Alerts"
                    />
                    <FormControlLabel
                      control={<Switch checked={notificationPreferences.shiftReminders} />}
                      label="Shift Reminders"
                    />
                  </FormGroup>
                </Grid>
              </Grid>
            )}
          </TabPanel>

          {/* API Keys Tab */}
          <TabPanel value={activeTab} index={3}>
            <Box display="flex" justifyContent="between" alignItems="center" mb={3}>
              <Typography variant="h6">
                API Keys
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setCreateApiKeyDialogOpen(true)}
              >
                Create API Key
              </Button>
            </Box>
            <List>
              {apiKeys.map((apiKey, index) => (
                <React.Fragment key={apiKey.id}>
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar>
                        <ApiKeyIcon />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={apiKey.name}
                      secondary={
                        <Box>
                          <Typography variant="caption" display="block">
                            Key: {apiKey.key.substring(0, 8)}...
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Created: {new Date(apiKey.createdAt).toLocaleDateString()}
                          </Typography>
                          {apiKey.lastUsed && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Last used: {new Date(apiKey.lastUsed).toLocaleDateString()}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Box display="flex" gap={1}>
                        <Chip
                          label={apiKey.isActive ? 'Active' : 'Inactive'}
                          color={apiKey.isActive ? 'success' : 'default'}
                          size="small"
                        />
                        <IconButton size="small" color="error">
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </ListItemSecondaryAction>
                  </ListItem>
                  {index < apiKeys.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </TabPanel>

          {/* Login History Tab */}
          <TabPanel value={activeTab} index={4}>
            <Typography variant="h6" gutterBottom>
              Recent Login Activity
            </Typography>
            <List>
              {loginHistory.slice(0, 10).map((login, index) => (
                <React.Fragment key={login.id}>
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: login.success ? 'success.main' : 'error.main' }}>
                        {login.success ? <CheckCircleIcon /> : <ErrorIcon />}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box display="flex" justifyContent="between" alignItems="center">
                          <Typography variant="body1">
                            {login.success ? 'Successful Login' : 'Failed Login'}
                          </Typography>
                          {getStatusChip(login.success)}
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="caption" display="block">
                            IP: {login.ipAddress}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(login.timestamp).toLocaleString()}
                          </Typography>
                          {login.location && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Location: {login.location}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < Math.min(loginHistory.length, 10) - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </TabPanel>
        </Paper>
      )}

      {/* Create API Key Dialog */}
      <Dialog
        open={createApiKeyDialogOpen}
        onClose={() => setCreateApiKeyDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New API Key</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Key Name"
            value={newApiKey.name}
            onChange={(e) => setNewApiKey({ ...newApiKey, name: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Expires At (optional)"
            type="date"
            value={newApiKey.expiresAt}
            onChange={(e) => setNewApiKey({ ...newApiKey, expiresAt: e.target.value })}
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateApiKeyDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={createApiKey} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProfileManagementPage;
