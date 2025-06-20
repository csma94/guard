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
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Paper,
  Tab,
  Tabs,
  Badge,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  MarkAsUnread as UnreadIcon,
  DoneAll as ReadAllIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  Notifications as NotificationIcon,
  NotificationsActive as ActiveIcon,
  NotificationsOff as OffIcon,
  Priority as PriorityIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Security as SecurityIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as SuccessIcon,
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
      id={`notifications-tabpanel-${index}`}
      aria-labelledby={`notifications-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface Notification {
  id: string;
  type: 'SYSTEM' | 'SECURITY' | 'INCIDENT' | 'SHIFT' | 'TRAINING' | 'MAINTENANCE' | 'BILLING';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL';
  title: string;
  message: string;
  isRead: boolean;
  senderId?: string;
  recipientId: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actionUrl?: string;
  expiresAt?: string;
  createdAt: string;
  readAt?: string;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  systemAlerts: boolean;
  securityAlerts: boolean;
  incidentAlerts: boolean;
  shiftReminders: boolean;
  trainingReminders: boolean;
  maintenanceAlerts: boolean;
  billingAlerts: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
  frequency: 'IMMEDIATE' | 'HOURLY' | 'DAILY' | 'WEEKLY';
}

interface NotificationStats {
  totalNotifications: number;
  unreadNotifications: number;
  todayNotifications: number;
  criticalNotifications: number;
  systemNotifications: number;
  securityNotifications: number;
  incidentNotifications: number;
  averageResponseTime: number;
}

const NotificationsCenterPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Data fetching functions
  const fetchNotifications = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [notificationsResponse, settingsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/notifications`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/notification-settings`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/notification-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!notificationsResponse.ok || !settingsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch notifications data');
      }

      const notificationsResult = await notificationsResponse.json();
      const settingsResult = await settingsResponse.json();
      const statsResult = await statsResponse.json();

      setNotifications(notificationsResult.data || []);
      setSettings(settingsResult.data || {
        emailNotifications: true,
        pushNotifications: true,
        smsNotifications: false,
        systemAlerts: true,
        securityAlerts: true,
        incidentAlerts: true,
        shiftReminders: true,
        trainingReminders: true,
        maintenanceAlerts: true,
        billingAlerts: true,
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00',
        },
        frequency: 'IMMEDIATE',
      });
      setStats(statsResult.data || {
        totalNotifications: 0,
        unreadNotifications: 0,
        todayNotifications: 0,
        criticalNotifications: 0,
        systemNotifications: 0,
        securityNotifications: 0,
        incidentNotifications: 0,
        averageResponseTime: 0,
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications. Please check your connection and try again.');
      setNotifications([]);
      setSettings(null);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const markAsRead = async (notificationId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }

      setNotifications(prev => prev.map(notification => 
        notification.id === notificationId 
          ? { ...notification, isRead: true, readAt: new Date().toISOString() }
          : notification
      ));

    } catch (err: any) {
      console.error('Failed to mark notification as read:', err);
      setError('Failed to mark notification as read. Please try again.');
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/notifications/mark-all-read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }

      setNotifications(prev => prev.map(notification => ({
        ...notification,
        isRead: true,
        readAt: new Date().toISOString(),
      })));

    } catch (err: any) {
      console.error('Failed to mark all notifications as read:', err);
      setError('Failed to mark all notifications as read. Please try again.');
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }

      setNotifications(prev => prev.filter(notification => notification.id !== notificationId));

    } catch (err: any) {
      console.error('Failed to delete notification:', err);
      setError('Failed to delete notification. Please try again.');
    }
  };

  // Utility functions
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SYSTEM':
        return <NotificationIcon color="primary" />;
      case 'SECURITY':
        return <SecurityIcon color="error" />;
      case 'INCIDENT':
        return <WarningIcon color="warning" />;
      case 'SHIFT':
        return <ScheduleIcon color="info" />;
      case 'TRAINING':
        return <PersonIcon color="success" />;
      case 'MAINTENANCE':
        return <SettingsIcon color="action" />;
      case 'BILLING':
        return <InfoIcon color="info" />;
      default:
        return <NotificationIcon />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'error';
      case 'URGENT':
        return 'error';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'default';
      default:
        return 'default';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filterType !== 'all' && notification.type !== filterType) return false;
    if (filterPriority !== 'all' && notification.priority !== filterPriority) return false;
    if (filterStatus === 'unread' && notification.isRead) return false;
    if (filterStatus === 'read' && !notification.isRead) return false;
    if (searchQuery && 
        !notification.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !notification.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const interval = setInterval(fetchNotifications, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Loading state
  if (loading && notifications.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Notifications...
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
            Notifications Center
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Real-time alerts, notification history, and preference management
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
            onClick={markAllAsRead}
            startIcon={<ReadAllIcon />}
            disabled={notifications.filter(n => !n.isRead).length === 0}
          >
            Mark All Read
          </Button>
          <Button
            variant="outlined"
            onClick={fetchNotifications}
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
                  <NotificationIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalNotifications}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Notifications
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
                  <Badge badgeContent={stats.unreadNotifications} color="error">
                    <UnreadIcon color="warning" />
                  </Badge>
                  <Box>
                    <Typography variant="h6">{stats.unreadNotifications}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Unread
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
                    <Typography variant="h6">{stats.todayNotifications}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Today
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
                  <PriorityIcon color="error" />
                  <Box>
                    <Typography variant="h6">{stats.criticalNotifications}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Critical
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
          <Tab label="All Notifications" />
          <Tab label="Unread" />
          <Tab label="Settings" />
        </Tabs>

        {/* All Notifications Tab */}
        <TabPanel value={activeTab} index={0}>
          <Box display="flex" gap={2} mb={3} flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={filterType}
                label="Type"
                onChange={(e) => setFilterType(e.target.value)}
              >
                <MenuItem value="all">All Types</MenuItem>
                <MenuItem value="SYSTEM">System</MenuItem>
                <MenuItem value="SECURITY">Security</MenuItem>
                <MenuItem value="INCIDENT">Incident</MenuItem>
                <MenuItem value="SHIFT">Shift</MenuItem>
                <MenuItem value="TRAINING">Training</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Priority</InputLabel>
              <Select
                value={filterPriority}
                label="Priority"
                onChange={(e) => setFilterPriority(e.target.value)}
              >
                <MenuItem value="all">All Priorities</MenuItem>
                <MenuItem value="CRITICAL">Critical</MenuItem>
                <MenuItem value="URGENT">Urgent</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="LOW">Low</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
              }}
              sx={{ minWidth: 200 }}
            />
          </Box>

          <List>
            {filteredNotifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                <ListItem
                  sx={{
                    bgcolor: notification.isRead ? 'transparent' : 'action.hover',
                    borderRadius: 1,
                    mb: 1,
                  }}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: getPriorityColor(notification.priority) + '.main' }}>
                      {getTypeIcon(notification.type)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Typography variant="subtitle1" sx={{ fontWeight: notification.isRead ? 'normal' : 'bold' }}>
                          {notification.title}
                        </Typography>
                        <Box display="flex" gap={1} alignItems="center">
                          <Chip
                            label={notification.priority}
                            color={getPriorityColor(notification.priority) as any}
                            size="small"
                          />
                          <Typography variant="caption" color="text.secondary">
                            {formatTimeAgo(notification.createdAt)}
                          </Typography>
                        </Box>
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" paragraph>
                          {notification.message}
                        </Typography>
                        <Box display="flex" gap={1}>
                          <Chip label={notification.type} size="small" variant="outlined" />
                          {notification.sender && (
                            <Chip
                              label={`From: ${notification.sender.firstName} ${notification.sender.lastName}`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </Box>
                    }
                  />
                  <Box display="flex" flexDirection="column" gap={1}>
                    {!notification.isRead && (
                      <Tooltip title="Mark as Read">
                        <IconButton
                          size="small"
                          onClick={() => markAsRead(notification.id)}
                        >
                          <ReadAllIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => deleteNotification(notification.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </ListItem>
                {index < filteredNotifications.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </TabPanel>

        {/* Unread Tab */}
        <TabPanel value={activeTab} index={1}>
          <List>
            {filteredNotifications.filter(n => !n.isRead).map((notification, index) => (
              <React.Fragment key={notification.id}>
                <ListItem sx={{ bgcolor: 'action.hover', borderRadius: 1, mb: 1 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: getPriorityColor(notification.priority) + '.main' }}>
                      {getTypeIcon(notification.type)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                        {notification.title}
                      </Typography>
                    }
                    secondary={notification.message}
                  />
                  <IconButton
                    size="small"
                    onClick={() => markAsRead(notification.id)}
                  >
                    <ReadAllIcon />
                  </IconButton>
                </ListItem>
                {index < filteredNotifications.filter(n => !n.isRead).length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </TabPanel>

        {/* Settings Tab */}
        <TabPanel value={activeTab} index={2}>
          {settings && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Notification Channels
                </Typography>
                <FormGroup>
                  <FormControlLabel
                    control={<Switch checked={settings.emailNotifications} />}
                    label="Email Notifications"
                  />
                  <FormControlLabel
                    control={<Switch checked={settings.pushNotifications} />}
                    label="Push Notifications"
                  />
                  <FormControlLabel
                    control={<Switch checked={settings.smsNotifications} />}
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
                    control={<Switch checked={settings.systemAlerts} />}
                    label="System Alerts"
                  />
                  <FormControlLabel
                    control={<Switch checked={settings.securityAlerts} />}
                    label="Security Alerts"
                  />
                  <FormControlLabel
                    control={<Switch checked={settings.incidentAlerts} />}
                    label="Incident Alerts"
                  />
                  <FormControlLabel
                    control={<Switch checked={settings.shiftReminders} />}
                    label="Shift Reminders"
                  />
                </FormGroup>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Quiet Hours
                </Typography>
                <FormControlLabel
                  control={<Switch checked={settings.quietHours.enabled} />}
                  label="Enable Quiet Hours"
                />
                {settings.quietHours.enabled && (
                  <Box display="flex" gap={2} mt={2}>
                    <TextField
                      label="Start Time"
                      type="time"
                      value={settings.quietHours.startTime}
                      size="small"
                    />
                    <TextField
                      label="End Time"
                      type="time"
                      value={settings.quietHours.endTime}
                      size="small"
                    />
                  </Box>
                )}
              </Grid>
            </Grid>
          )}
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default NotificationsCenterPage;
