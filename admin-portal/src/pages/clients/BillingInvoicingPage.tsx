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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tab,
  Tabs,
  LinearProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  AttachMoney as MoneyIcon,
  Receipt as InvoiceIcon,
  Payment as PaymentIcon,
  Schedule as ScheduleIcon,
  CheckCircle as PaidIcon,
  Warning as OverdueIcon,
  Cancel as CancelledIcon,
  Send as SendIcon,
  Download as DownloadIcon,
  Print as PrintIcon,
  Email as EmailIcon,
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
      id={`billing-tabpanel-${index}`}
      aria-labelledby={`billing-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface Invoice {
  id: string;
  clientId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  tax: number;
  totalAmount: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';
  paymentTerms: string;
  description: string;
  lineItems: InvoiceLineItem[];
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
  client: {
    id: string;
    companyName: string;
    contactPerson: any;
    billingAddress: any;
  };
}

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxRate: number;
}

interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: 'CREDIT_CARD' | 'BANK_TRANSFER' | 'CHECK' | 'CASH' | 'OTHER';
  transactionId?: string;
  notes?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
}

interface BillingStats {
  totalInvoices: number;
  totalRevenue: number;
  outstandingAmount: number;
  overdueAmount: number;
  paidInvoices: number;
  pendingInvoices: number;
  averagePaymentTime: number;
  collectionRate: number;
  monthlyRevenue: MonthlyRevenue[];
  topClients: TopPayingClient[];
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
  invoiceCount: number;
}

interface TopPayingClient {
  clientId: string;
  companyName: string;
  totalPaid: number;
  invoiceCount: number;
  averagePaymentTime: number;
}

const BillingInvoicingPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [createInvoiceDialogOpen, setCreateInvoiceDialogOpen] = useState(false);
  const [recordPaymentDialogOpen, setRecordPaymentDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [newInvoice, setNewInvoice] = useState({
    clientId: '',
    dueDate: '',
    paymentTerms: 'NET_30',
    description: '',
    lineItems: [{
      description: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: 0,
    }],
  });

  const [newPayment, setNewPayment] = useState({
    amount: 0,
    paymentDate: '',
    paymentMethod: 'CREDIT_CARD' as const,
    transactionId: '',
    notes: '',
  });

  // Data fetching functions
  const fetchBillingData = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [invoicesResponse, paymentsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/invoices`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/payments`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/billing-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!invoicesResponse.ok || !paymentsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch billing data');
      }

      const invoicesResult = await invoicesResponse.json();
      const paymentsResult = await paymentsResponse.json();
      const statsResult = await statsResponse.json();

      setInvoices(invoicesResult.data || []);
      setPayments(paymentsResult.data || []);
      setStats(statsResult.data || {
        totalInvoices: 0,
        totalRevenue: 0,
        outstandingAmount: 0,
        overdueAmount: 0,
        paidInvoices: 0,
        pendingInvoices: 0,
        averagePaymentTime: 0,
        collectionRate: 0,
        monthlyRevenue: [],
        topClients: [],
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch billing data:', err);
      setError('Failed to load billing data. Please check your connection and try again.');
      setInvoices([]);
      setPayments([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const createInvoice = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/invoices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newInvoice),
      });

      if (!response.ok) {
        throw new Error('Failed to create invoice');
      }

      setCreateInvoiceDialogOpen(false);
      setNewInvoice({
        clientId: '',
        dueDate: '',
        paymentTerms: 'NET_30',
        description: '',
        lineItems: [{
          description: '',
          quantity: 1,
          unitPrice: 0,
          taxRate: 0,
        }],
      });
      fetchBillingData();

    } catch (err: any) {
      console.error('Failed to create invoice:', err);
      setError('Failed to create invoice. Please try again.');
    }
  };

  const recordPayment = async () => {
    if (!selectedInvoice) return;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newPayment,
          invoiceId: selectedInvoice.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record payment');
      }

      setRecordPaymentDialogOpen(false);
      setNewPayment({
        amount: 0,
        paymentDate: '',
        paymentMethod: 'CREDIT_CARD',
        transactionId: '',
        notes: '',
      });
      setSelectedInvoice(null);
      fetchBillingData();

    } catch (err: any) {
      console.error('Failed to record payment:', err);
      setError('Failed to record payment. Please try again.');
    }
  };

  // Utility functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'SENT':
        return 'info';
      case 'OVERDUE':
        return 'error';
      case 'CANCELLED':
        return 'default';
      case 'DRAFT':
        return 'warning';
      default:
        return 'default';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Effects
  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  // Loading state
  if (loading && invoices.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Billing Data...
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
            Billing & Invoicing
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Invoice generation, payment tracking, and financial reporting
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
            onClick={fetchBillingData}
            startIcon={<RefreshIcon />}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            onClick={() => setCreateInvoiceDialogOpen(true)}
            startIcon={<AddIcon />}
          >
            Create Invoice
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
                  <MoneyIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{formatCurrency(stats.totalRevenue)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Revenue
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
                  <InvoiceIcon color="info" />
                  <Box>
                    <Typography variant="h6">{stats.totalInvoices}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Invoices
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
                  <OverdueIcon color="warning" />
                  <Box>
                    <Typography variant="h6">{formatCurrency(stats.outstandingAmount)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Outstanding
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
                  <PaymentIcon color="success" />
                  <Box>
                    <Typography variant="h6">{stats.collectionRate}%</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Collection Rate
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
          <Tab label="Invoices" />
          <Tab label="Payments" />
          <Tab label="Reports" />
        </Tabs>

        {/* Invoices Tab */}
        <TabPanel value={activeTab} index={0}>
          <Typography variant="h6">Invoice Management - Coming Soon</Typography>
        </TabPanel>

        {/* Payments Tab */}
        <TabPanel value={activeTab} index={1}>
          <Typography variant="h6">Payment Tracking - Coming Soon</Typography>
        </TabPanel>

        {/* Reports Tab */}
        <TabPanel value={activeTab} index={2}>
          <Typography variant="h6">Financial Reports - Coming Soon</Typography>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default BillingInvoicingPage;
