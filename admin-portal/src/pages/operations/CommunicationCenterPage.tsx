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
  Badge,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Send as SendIcon,
  Broadcast as BroadcastIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  Message as MessageIcon,
  Email as EmailIcon,
  Sms as SmsIcon,
  Notifications as PushIcon,
  Emergency as EmergencyIcon,
  Schedule as ScheduleIcon,
  AttachFile as AttachIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Settings as SettingsIcon,
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
      id={`communication-tabpanel-${index}`}
      aria-labelledby={`communication-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface Communication {
  id: string;
  type: 'EMAIL' | 'SMS' | 'PUSH_NOTIFICATION' | 'INTERNAL_MESSAGE' | 'BROADCAST' | 'EMERGENCY_ALERT';
  subject?: string;
  message: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'EMERGENCY';
  status: 'DRAFT' | 'SCHEDULED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  senderId?: string;
  recipientId?: string;
  groupId?: string;
  siteId?: string;
  scheduledAt?: string;
  sentAt?: string;
  readAt?: string;
  createdAt: string;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  recipient?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  group?: {
    id: string;
    name: string;
    description?: string;
  };
  site?: {
    id: string;
    name: string;
  };
}

interface CommunicationGroup {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface CommunicationStats {
  totalMessages: number;
  sentToday: number;
  pendingMessages: number;
  failedMessages: number;
  emergencyAlerts: number;
  activeGroups: number;
}

const CommunicationCenterPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [groups, setGroups] = useState<CommunicationGroup[]>([]);
  const [stats, setStats] = useState<CommunicationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommunication, setSelectedCommunication] = useState<Communication | null>(null);
  const [composeDialogOpen, setComposeDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [broadcastDialogOpen, setBroadcastDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [newMessage, setNewMessage] = useState({
    type: 'INTERNAL_MESSAGE' as const,
    subject: '',
    message: '',
    priority: 'NORMAL' as const,
    recipientId: '',
    groupId: '',
    siteId: '',
    scheduledAt: '',
    isEmergency: false,
  });

  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    memberIds: [] as string[],
  });

  const [broadcastMessage, setBroadcastMessage] = useState({
    type: 'BROADCAST' as const,
    subject: '',
    message: '',
    priority: 'NORMAL' as const,
    targetAudience: 'all' as 'all' | 'agents' | 'supervisors' | 'clients',
    channels: {
      email: true,
      sms: false,
      push: true,
    },
    isEmergency: false,
  });

  // Data fetching functions
  const fetchCommunications = useCallback(async () => {
    try {
      setError(null);

      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [communicationsResponse, groupsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/communications`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/communications/groups`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/communication-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!communicationsResponse.ok || !groupsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch communication data');
      }

      const communicationsResult = await communicationsResponse.json();
      const groupsResult = await groupsResponse.json();
      const statsResult = await statsResponse.json();

      setCommunications(communicationsResult.data || []);
      setGroups(groupsResult.data || []);
      setStats(statsResult.data || {
        totalMessages: 0,
        sentToday: 0,
        pendingMessages: 0,
        failedMessages: 0,
        emergencyAlerts: 0,
        activeGroups: 0,
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch communications:', err);
      setError('Failed to load communication data. Please check your connection and try again.');
      setCommunications([]);
      setGroups([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const sendMessage = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const messageData = {
        ...newMessage,
        senderId: user?.id,
        type: newMessage.isEmergency ? 'EMERGENCY_ALERT' : newMessage.type,
        priority: newMessage.isEmergency ? 'EMERGENCY' : newMessage.priority,
      };

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/communications`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setComposeDialogOpen(false);
      setNewMessage({
        type: 'INTERNAL_MESSAGE',
        subject: '',
        message: '',
        priority: 'NORMAL',
        recipientId: '',
        groupId: '',
        siteId: '',
        scheduledAt: '',
        isEmergency: false,
      });
      fetchCommunications();

    } catch (err: any) {
      console.error('Failed to send message:', err);
      setError('Failed to send message. Please try again.');
    }
  };

  const sendBroadcast = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const broadcastData = {
        ...broadcastMessage,
        senderId: user?.id,
        type: broadcastMessage.isEmergency ? 'EMERGENCY_ALERT' : 'BROADCAST',
        priority: broadcastMessage.isEmergency ? 'EMERGENCY' : broadcastMessage.priority,
      };

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/communications/broadcast`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(broadcastData),
      });

      if (!response.ok) {
        throw new Error('Failed to send broadcast');
      }

      setBroadcastDialogOpen(false);
      setBroadcastMessage({
        type: 'BROADCAST',
        subject: '',
        message: '',
        priority: 'NORMAL',
        targetAudience: 'all',
        channels: {
          email: true,
          sms: false,
          push: true,
        },
        isEmergency: false,
      });
      fetchCommunications();

    } catch (err: any) {
      console.error('Failed to send broadcast:', err);
      setError('Failed to send broadcast. Please try again.');
    }
  };

  // Utility functions
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'EMAIL':
        return <EmailIcon />;
      case 'SMS':
        return <SmsIcon />;
      case 'PUSH_NOTIFICATION':
        return <PushIcon />;
      case 'INTERNAL_MESSAGE':
        return <MessageIcon />;
      case 'BROADCAST':
        return <BroadcastIcon />;
      case 'EMERGENCY_ALERT':
        return <EmergencyIcon />;
      default:
        return <MessageIcon />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'EMERGENCY':
        return 'error';
      case 'URGENT':
        return 'error';
      case 'HIGH':
        return 'warning';
      case 'NORMAL':
        return 'info';
      case 'LOW':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SENT':
        return 'success';
      case 'DELIVERED':
        return 'success';
      case 'READ':
        return 'info';
      case 'FAILED':
        return 'error';
      case 'SCHEDULED':
        return 'warning';
      case 'DRAFT':
        return 'default';
      default:
        return 'default';
    }
  };

  const filteredCommunications = communications.filter(comm => {
    if (filterType !== 'all' && comm.type !== filterType) return false;
    if (filterStatus !== 'all' && comm.status !== filterStatus) return false;
    if (filterPriority !== 'all' && comm.priority !== filterPriority) return false;
    if (searchQuery && !comm.subject?.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !comm.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchCommunications();
  }, [fetchCommunications]);

  useEffect(() => {
    const interval = setInterval(fetchCommunications, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchCommunications]);

  // Loading state
  if (loading && communications.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Communication Center...
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
            Communication Center
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Real-time messaging, broadcast capabilities, and team coordination
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
            onClick={fetchCommunications}
            startIcon={<RefreshIcon />}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            onClick={() => setComposeDialogOpen(true)}
            startIcon={<SendIcon />}
          >
            Compose
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => setBroadcastDialogOpen(true)}
            startIcon={<BroadcastIcon />}
          >
            Broadcast
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default CommunicationCenterPage;
