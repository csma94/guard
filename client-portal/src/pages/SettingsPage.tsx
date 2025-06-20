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
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  LocationOn as LocationIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
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
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface ClientProfile {
  id: string;
  companyName: string;
  contactPerson: {
    name: string;
    title: string;
    email: string;
    phone: string;
  };
  billingAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  serviceLevel: string;
  preferences: {
    timezone: string;
    dateFormat: string;
    currency: string;
    language: string;
    theme: 'light' | 'dark' | 'auto';
  };
  notifications: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    pushNotifications: boolean;
    incidentAlerts: boolean;
    reportNotifications: boolean;
    billingReminders: boolean;
    maintenanceNotifications: boolean;
  };
  security: {
    twoFactorEnabled: boolean;
    sessionTimeout: number;
    ipWhitelist: string[];
    apiAccess: boolean;
  };
}

interface EmergencyContact {
  id: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<EmergencyContact | null>(null);
  const [newContact, setNewContact] = useState({
    name: '',
    title: '',
    phone: '',
    email: '',
    isPrimary: false,
  });

  // Data fetching functions
  const fetchSettings = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [profileResponse, contactsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/profile`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/emergency-contacts`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!profileResponse.ok || !contactsResponse.ok) {
        throw new Error('Failed to fetch settings data');
      }

      const profileResult = await profileResponse.json();
      const contactsResult = await contactsResponse.json();

      setProfile(profileResult.data || null);
      setEmergencyContacts(contactsResult.data || []);

    } catch (err: any) {
      console.error('Failed to fetch settings:', err);
      setError('Failed to load settings data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const saveProfile = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        throw new Error('Failed to save profile');
      }

      setSuccess('Profile updated successfully');

    } catch (err: any) {
      console.error('Failed to save profile:', err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveEmergencyContact = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const url = selectedContact 
        ? `${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/emergency-contacts/${selectedContact.id}`
        : `${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/emergency-contacts`;

      const method = selectedContact ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newContact),
      });

      if (!response.ok) {
        throw new Error('Failed to save emergency contact');
      }

      setContactDialogOpen(false);
      setSelectedContact(null);
      setNewContact({
        name: '',
        title: '',
        phone: '',
        email: '',
        isPrimary: false,
      });
      fetchSettings();

    } catch (err: any) {
      console.error('Failed to save emergency contact:', err);
      setError('Failed to save emergency contact. Please try again.');
    }
  };

  const deleteEmergencyContact = async (contactId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/client/emergency-contacts/${contactId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete emergency contact');
      }

      fetchSettings();

    } catch (err: any) {
      console.error('Failed to delete emergency contact:', err);
      setError('Failed to delete emergency contact. Please try again.');
    }
  };

  // Utility functions
  const updateProfile = (field: string, value: any) => {
    if (!profile) return;
    setProfile({
      ...profile,
      [field]: value,
    });
  };

  const updateNestedProfile = (section: string, field: string, value: any) => {
    if (!profile) return;
    setProfile({
      ...profile,
      [section]: {
        ...profile[section as keyof ClientProfile],
        [field]: value,
      },
    });
  };

  // Effects
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Loading state
  if (loading && !profile) {
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

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Account Settings
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your account preferences and security settings
          </Typography>
        </Box>
        <Box display="flex" gap={2} alignItems="center">
          <Button
            variant="contained"
            onClick={saveProfile}
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

      {/* Settings Tabs */}
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
            <Tab label="Company Profile" icon={<BusinessIcon />} />
            <Tab label="Preferences" icon={<PersonIcon />} />
            <Tab label="Notifications" icon={<NotificationsIcon />} />
            <Tab label="Security" icon={<SecurityIcon />} />
            <Tab label="Emergency Contacts" icon={<PhoneIcon />} />
          </Tabs>

          {/* Company Profile Tab */}
          <TabPanel value={activeTab} index={0}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Company Name"
                  value={profile.companyName}
                  onChange={(e) => updateProfile('companyName', e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Contact Person Name"
                  value={profile.contactPerson.name}
                  onChange={(e) => updateNestedProfile('contactPerson', 'name', e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Contact Person Title"
                  value={profile.contactPerson.title}
                  onChange={(e) => updateNestedProfile('contactPerson', 'title', e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Contact Email"
                  value={profile.contactPerson.email}
                  onChange={(e) => updateNestedProfile('contactPerson', 'email', e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Contact Phone"
                  value={profile.contactPerson.phone}
                  onChange={(e) => updateNestedProfile('contactPerson', 'phone', e.target.value)}
                  margin="normal"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Billing Address
                </Typography>
                <TextField
                  fullWidth
                  label="Street Address"
                  value={profile.billingAddress.street}
                  onChange={(e) => updateNestedProfile('billingAddress', 'street', e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="City"
                  value={profile.billingAddress.city}
                  onChange={(e) => updateNestedProfile('billingAddress', 'city', e.target.value)}
                  margin="normal"
                />
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="State"
                      value={profile.billingAddress.state}
                      onChange={(e) => updateNestedProfile('billingAddress', 'state', e.target.value)}
                      margin="normal"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="ZIP Code"
                      value={profile.billingAddress.zipCode}
                      onChange={(e) => updateNestedProfile('billingAddress', 'zipCode', e.target.value)}
                      margin="normal"
                    />
                  </Grid>
                </Grid>
                <TextField
                  fullWidth
                  label="Country"
                  value={profile.billingAddress.country}
                  onChange={(e) => updateNestedProfile('billingAddress', 'country', e.target.value)}
                  margin="normal"
                />
              </Grid>
            </Grid>
          </TabPanel>

          {/* Preferences Tab */}
          <TabPanel value={activeTab} index={1}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth margin="normal">
                  <InputLabel>Timezone</InputLabel>
                  <Select
                    value={profile.preferences.timezone}
                    label="Timezone"
                    onChange={(e) => updateNestedProfile('preferences', 'timezone', e.target.value)}
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
                    value={profile.preferences.dateFormat}
                    label="Date Format"
                    onChange={(e) => updateNestedProfile('preferences', 'dateFormat', e.target.value)}
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
                    value={profile.preferences.currency}
                    label="Currency"
                    onChange={(e) => updateNestedProfile('preferences', 'currency', e.target.value)}
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
                    value={profile.preferences.theme}
                    label="Theme"
                    onChange={(e) => updateNestedProfile('preferences', 'theme', e.target.value)}
                  >
                    <MenuItem value="light">Light</MenuItem>
                    <MenuItem value="dark">Dark</MenuItem>
                    <MenuItem value="auto">Auto</MenuItem>
                  </Select>
                </FormControl>
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
                <FormControlLabel
                  control={
                    <Switch
                      checked={profile.notifications.emailNotifications}
                      onChange={(e) => updateNestedProfile('notifications', 'emailNotifications', e.target.checked)}
                    />
                  }
                  label="Email Notifications"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={profile.notifications.smsNotifications}
                      onChange={(e) => updateNestedProfile('notifications', 'smsNotifications', e.target.checked)}
                    />
                  }
                  label="SMS Notifications"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={profile.notifications.pushNotifications}
                      onChange={(e) => updateNestedProfile('notifications', 'pushNotifications', e.target.checked)}
                    />
                  }
                  label="Push Notifications"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={profile.notifications.incidentAlerts}
                      onChange={(e) => updateNestedProfile('notifications', 'incidentAlerts', e.target.checked)}
                    />
                  }
                  label="Incident Alerts"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={profile.notifications.reportNotifications}
                      onChange={(e) => updateNestedProfile('notifications', 'reportNotifications', e.target.checked)}
                    />
                  }
                  label="Report Notifications"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={profile.notifications.billingReminders}
                      onChange={(e) => updateNestedProfile('notifications', 'billingReminders', e.target.checked)}
                    />
                  }
                  label="Billing Reminders"
                />
              </Grid>
            </Grid>
          </TabPanel>

          {/* Security Tab */}
          <TabPanel value={activeTab} index={3}>
            <Typography variant="h6" gutterBottom>
              Security Settings
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={profile.security.twoFactorEnabled}
                      onChange={(e) => updateNestedProfile('security', 'twoFactorEnabled', e.target.checked)}
                    />
                  }
                  label="Two-Factor Authentication"
                />
                <TextField
                  fullWidth
                  label="Session Timeout (minutes)"
                  type="number"
                  value={profile.security.sessionTimeout}
                  onChange={(e) => updateNestedProfile('security', 'sessionTimeout', parseInt(e.target.value))}
                  margin="normal"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={profile.security.apiAccess}
                      onChange={(e) => updateNestedProfile('security', 'apiAccess', e.target.checked)}
                    />
                  }
                  label="API Access Enabled"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  IP Whitelist
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Restrict access to specific IP addresses for enhanced security
                </Typography>
                <Button variant="outlined" startIcon={<AddIcon />}>
                  Add IP Address
                </Button>
              </Grid>
            </Grid>
          </TabPanel>

          {/* Emergency Contacts Tab */}
          <TabPanel value={activeTab} index={4}>
            <Box display="flex" justifyContent="between" alignItems="center" mb={3}>
              <Typography variant="h6">
                Emergency Contacts
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => {
                  setSelectedContact(null);
                  setNewContact({
                    name: '',
                    title: '',
                    phone: '',
                    email: '',
                    isPrimary: false,
                  });
                  setContactDialogOpen(true);
                }}
              >
                Add Contact
              </Button>
            </Box>
            <List>
              {emergencyContacts.map((contact, index) => (
                <React.Fragment key={contact.id}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="subtitle1">
                            {contact.name}
                          </Typography>
                          {contact.isPrimary && (
                            <Chip label="Primary" color="primary" size="small" />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2">
                            {contact.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {contact.phone} • {contact.email}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedContact(contact);
                          setNewContact({
                            name: contact.name,
                            title: contact.title,
                            phone: contact.phone,
                            email: contact.email,
                            isPrimary: contact.isPrimary,
                          });
                          setContactDialogOpen(true);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => deleteEmergencyContact(contact.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                  {index < emergencyContacts.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </TabPanel>
        </Paper>
      )}

      {/* Emergency Contact Dialog */}
      <Dialog
        open={contactDialogOpen}
        onClose={() => setContactDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {selectedContact ? 'Edit Emergency Contact' : 'Add Emergency Contact'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Name"
            value={newContact.name}
            onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Title"
            value={newContact.title}
            onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Phone"
            value={newContact.phone}
            onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Email"
            value={newContact.email}
            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
            margin="normal"
          />
          <FormControlLabel
            control={
              <Switch
                checked={newContact.isPrimary}
                onChange={(e) => setNewContact({ ...newContact, isPrimary: e.target.checked })}
              />
            }
            label="Primary Contact"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveEmergencyContact} variant="contained">
            {selectedContact ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettingsPage;
