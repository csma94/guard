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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Business as BusinessIcon,
  Person as PersonIcon,
  LocationOn as LocationIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Assignment as ContractIcon,
  AttachMoney as BillingIcon,
  Star as RatingIcon,
  TrendingUp as GrowthIcon,
  Warning as WarningIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface Client {
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
  contractDetails?: {
    startDate: string;
    endDate: string;
    value: number;
    terms: string;
  };
  serviceLevel: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING';
  settings: any;
  createdAt: string;
  updatedAt: string;
  sites?: any[];
  users?: any[];
  requests?: any[];
  incidents?: any[];
}

interface ClientStats {
  totalClients: number;
  activeClients: number;
  inactiveClients: number;
  pendingClients: number;
  totalRevenue: number;
  averageContractValue: number;
  clientSatisfactionScore: number;
  renewalRate: number;
  totalSites: number;
  totalIncidents: number;
  averageResponseTime: number;
  topClients: TopClient[];
}

interface TopClient {
  id: string;
  companyName: string;
  contractValue: number;
  satisfactionScore: number;
  siteCount: number;
  incidentCount: number;
}

const ClientOverviewPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterServiceLevel, setFilterServiceLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [newClient, setNewClient] = useState({
    companyName: '',
    contactPerson: {
      name: '',
      title: '',
      email: '',
      phone: '',
    },
    billingAddress: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
    },
    serviceLevel: 'standard',
    contractDetails: {
      startDate: '',
      endDate: '',
      value: 0,
      terms: '',
    },
  });

  // Data fetching functions
  const fetchClients = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [clientsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/clients`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/client-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!clientsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch client data');
      }

      const clientsResult = await clientsResponse.json();
      const statsResult = await statsResponse.json();

      setClients(clientsResult.data || []);
      setStats(statsResult.data || {
        totalClients: 0,
        activeClients: 0,
        inactiveClients: 0,
        pendingClients: 0,
        totalRevenue: 0,
        averageContractValue: 0,
        clientSatisfactionScore: 0,
        renewalRate: 0,
        totalSites: 0,
        totalIncidents: 0,
        averageResponseTime: 0,
        topClients: [],
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch clients:', err);
      setError('Failed to load client data. Please check your connection and try again.');
      setClients([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const createClient = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/clients`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newClient),
      });

      if (!response.ok) {
        throw new Error('Failed to create client');
      }

      setCreateDialogOpen(false);
      setNewClient({
        companyName: '',
        contactPerson: {
          name: '',
          title: '',
          email: '',
          phone: '',
        },
        billingAddress: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
        },
        serviceLevel: 'standard',
        contractDetails: {
          startDate: '',
          endDate: '',
          value: 0,
          terms: '',
        },
      });
      fetchClients();

    } catch (err: any) {
      console.error('Failed to create client:', err);
      setError('Failed to create client. Please try again.');
    }
  };

  const deleteClient = async () => {
    if (!selectedClient) return;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/clients/${selectedClient.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete client');
      }

      setDeleteDialogOpen(false);
      setSelectedClient(null);
      fetchClients();

    } catch (err: any) {
      console.error('Failed to delete client:', err);
      setError('Failed to delete client. Please try again.');
    }
  };

  // Utility functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'INACTIVE':
        return 'default';
      case 'SUSPENDED':
        return 'error';
      case 'PENDING':
        return 'warning';
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
      case 'SUSPENDED':
        return <WarningIcon color="error" />;
      case 'PENDING':
        return <WarningIcon color="warning" />;
      default:
        return <BusinessIcon />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const filteredClients = clients.filter(client => {
    if (filterStatus !== 'all' && client.status !== filterStatus) return false;
    if (filterServiceLevel !== 'all' && client.serviceLevel !== filterServiceLevel) return false;
    if (searchQuery && 
        !client.companyName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !client.contactPerson.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !client.contactPerson.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Loading state
  if (loading && clients.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Client Data...
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
            Client Overview
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Account management, relationship tracking, and client satisfaction monitoring
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
            onClick={fetchClients}
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
            Add Client
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

export default ClientOverviewPage;
