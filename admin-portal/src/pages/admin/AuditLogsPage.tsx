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
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  GetApp as ExportIcon,
  Visibility as ViewIcon,
  Security as SecurityIcon,
  Person as PersonIcon,
  Schedule as TimeIcon,
  Computer as SystemIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  tableName: string;
  recordId?: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface AuditStats {
  totalLogs: number;
  todayLogs: number;
  uniqueUsers: number;
  topActions: ActionCount[];
  riskEvents: number;
  systemEvents: number;
  userEvents: number;
  failedAttempts: number;
}

interface ActionCount {
  action: string;
  count: number;
  percentage: number;
}

const AuditLogsPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterTable, setFilterTable] = useState<string>('all');
  const [filterDateRange, setFilterDateRange] = useState<string>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Data fetching functions
  const fetchAuditLogs = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: rowsPerPage.toString(),
        action: filterAction,
        user: filterUser,
        table: filterTable,
        dateRange: filterDateRange,
        search: searchQuery,
      });

      const [logsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/admin/audit-logs?${params}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/audit-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!logsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const logsResult = await logsResponse.json();
      const statsResult = await statsResponse.json();

      setAuditLogs(logsResult.data || []);
      setStats(statsResult.data || {
        totalLogs: 0,
        todayLogs: 0,
        uniqueUsers: 0,
        topActions: [],
        riskEvents: 0,
        systemEvents: 0,
        userEvents: 0,
        failedAttempts: 0,
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch audit logs:', err);
      setError('Failed to load audit logs. Please check your connection and try again.');
      setAuditLogs([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, page, rowsPerPage, filterAction, filterUser, filterTable, filterDateRange, searchQuery]);

  const exportLogs = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const params = new URLSearchParams({
        action: filterAction,
        user: filterUser,
        table: filterTable,
        dateRange: filterDateRange,
        search: searchQuery,
        format: 'csv',
      });

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/admin/audit-logs/export?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to export audit logs');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err: any) {
      console.error('Failed to export audit logs:', err);
      setError('Failed to export audit logs. Please try again.');
    }
  };

  // Utility functions
  const getActionIcon = (action: string) => {
    if (action.includes('LOGIN') || action.includes('LOGOUT')) {
      return <SecurityIcon color="primary" />;
    }
    if (action.includes('CREATE')) {
      return <SuccessIcon color="success" />;
    }
    if (action.includes('UPDATE')) {
      return <InfoIcon color="info" />;
    }
    if (action.includes('DELETE')) {
      return <ErrorIcon color="error" />;
    }
    if (action.includes('FAILED') || action.includes('ERROR')) {
      return <WarningIcon color="warning" />;
    }
    return <SystemIcon color="action" />;
  };

  const getActionColor = (action: string) => {
    if (action.includes('FAILED') || action.includes('ERROR') || action.includes('DELETE')) {
      return 'error';
    }
    if (action.includes('CREATE')) {
      return 'success';
    }
    if (action.includes('UPDATE')) {
      return 'info';
    }
    if (action.includes('LOGIN') || action.includes('LOGOUT')) {
      return 'primary';
    }
    return 'default';
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatJsonData = (data: any) => {
    if (!data) return 'N/A';
    return JSON.stringify(data, null, 2);
  };

  const filteredLogs = auditLogs.filter(log => {
    if (searchQuery && 
        !log.action.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !log.tableName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !log.user?.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Loading state
  if (loading && auditLogs.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Audit Logs...
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
            Audit Logs
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Comprehensive activity monitoring, compliance reporting, and security tracking
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
            onClick={exportLogs}
            startIcon={<ExportIcon />}
          >
            Export
          </Button>
          <Button
            variant="outlined"
            onClick={fetchAuditLogs}
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
                  <SecurityIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalLogs}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Logs
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
                  <TimeIcon color="info" />
                  <Box>
                    <Typography variant="h6">{stats.todayLogs}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Today's Logs
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
                  <PersonIcon color="success" />
                  <Box>
                    <Typography variant="h6">{stats.uniqueUsers}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Users
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
                  <WarningIcon color="warning" />
                  <Box>
                    <Typography variant="h6">{stats.riskEvents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Risk Events
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Box display="flex" gap={2} mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Action</InputLabel>
          <Select
            value={filterAction}
            label="Action"
            onChange={(e) => setFilterAction(e.target.value)}
          >
            <MenuItem value="all">All Actions</MenuItem>
            <MenuItem value="LOGIN">Login</MenuItem>
            <MenuItem value="LOGOUT">Logout</MenuItem>
            <MenuItem value="CREATE">Create</MenuItem>
            <MenuItem value="UPDATE">Update</MenuItem>
            <MenuItem value="DELETE">Delete</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Table</InputLabel>
          <Select
            value={filterTable}
            label="Table"
            onChange={(e) => setFilterTable(e.target.value)}
          >
            <MenuItem value="all">All Tables</MenuItem>
            <MenuItem value="users">Users</MenuItem>
            <MenuItem value="agents">Agents</MenuItem>
            <MenuItem value="sites">Sites</MenuItem>
            <MenuItem value="clients">Clients</MenuItem>
            <MenuItem value="shifts">Shifts</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Date Range</InputLabel>
          <Select
            value={filterDateRange}
            label="Date Range"
            onChange={(e) => setFilterDateRange(e.target.value)}
          >
            <MenuItem value="today">Today</MenuItem>
            <MenuItem value="week">This Week</MenuItem>
            <MenuItem value="month">This Month</MenuItem>
            <MenuItem value="quarter">This Quarter</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          placeholder="Search logs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
          }}
          sx={{ minWidth: 200 }}
        />
      </Box>

      {/* Audit Logs Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Table</TableCell>
                <TableCell>Record ID</TableCell>
                <TableCell>IP Address</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLogs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell>
                    <Typography variant="body2">
                      {formatTimestamp(log.timestamp)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Avatar sx={{ width: 32, height: 32 }}>
                        {log.user ? (
                          `${log.user.firstName[0]}${log.user.lastName[0]}`
                        ) : (
                          <SystemIcon />
                        )}
                      </Avatar>
                      <Box>
                        <Typography variant="body2">
                          {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {log.user?.email || 'system@bahinlink.com'}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getActionIcon(log.action)}
                      <Chip
                        label={log.action}
                        color={getActionColor(log.action) as any}
                        size="small"
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {log.tableName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {log.recordId || 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {log.ipAddress || 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedLog(log);
                          setDetailDialogOpen(true);
                        }}
                      >
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={filteredLogs.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Recent Activity Summary */}
      <Paper sx={{ mt: 3 }}>
        <Box p={3}>
          <Typography variant="h6" gutterBottom>
            Recent Activity Summary
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Top Actions (Last 24 Hours)
              </Typography>
              <List dense>
                {stats?.topActions.slice(0, 5).map((action, index) => (
                  <ListItem key={index}>
                    <ListItemAvatar>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                        {getActionIcon(action.action)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={action.action}
                      secondary={`${action.count} occurrences (${action.percentage}%)`}
                    />
                  </ListItem>
                ))}
              </List>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Security Events
              </Typography>
              <Box display="flex" gap={2} flexWrap="wrap">
                <Chip
                  label={`${stats?.riskEvents || 0} Risk Events`}
                  color="error"
                  variant="outlined"
                />
                <Chip
                  label={`${stats?.failedAttempts || 0} Failed Logins`}
                  color="warning"
                  variant="outlined"
                />
                <Chip
                  label={`${stats?.systemEvents || 0} System Events`}
                  color="info"
                  variant="outlined"
                />
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Audit Log Details
        </DialogTitle>
        <DialogContent>
          {selectedLog && (
            <Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2">Timestamp</Typography>
                  <Typography variant="body2" paragraph>
                    {formatTimestamp(selectedLog.timestamp)}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2">User</Typography>
                  <Typography variant="body2" paragraph>
                    {selectedLog.user ? `${selectedLog.user.firstName} ${selectedLog.user.lastName}` : 'System'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2">Action</Typography>
                  <Typography variant="body2" paragraph>
                    {selectedLog.action}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2">Table</Typography>
                  <Typography variant="body2" paragraph>
                    {selectedLog.tableName}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2">IP Address</Typography>
                  <Typography variant="body2" paragraph>
                    {selectedLog.ipAddress || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2">User Agent</Typography>
                  <Typography variant="body2" paragraph>
                    {selectedLog.userAgent || 'N/A'}
                  </Typography>
                </Grid>
                {selectedLog.oldValues && (
                  <Grid item xs={12}>
                    <Accordion>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="subtitle2">Old Values</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                          {formatJsonData(selectedLog.oldValues)}
                        </pre>
                      </AccordionDetails>
                    </Accordion>
                  </Grid>
                )}
                {selectedLog.newValues && (
                  <Grid item xs={12}>
                    <Accordion>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="subtitle2">New Values</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                          {formatJsonData(selectedLog.newValues)}
                        </pre>
                      </AccordionDetails>
                    </Accordion>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AuditLogsPage;
