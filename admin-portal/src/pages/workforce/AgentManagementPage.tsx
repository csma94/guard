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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Person as PersonIcon,
  Badge as BadgeIcon,
  School as CertificationIcon,
  Star as PerformanceIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  LocationOn as LocationIcon,
  Work as WorkIcon,
  Schedule as ScheduleIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface Agent {
  id: string;
  userId: string;
  employeeId: string;
  hireDate: string;
  employmentStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'TERMINATED';
  skills: string[];
  certifications: any[];
  emergencyContact: any;
  performanceMetrics: any;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    profile: any;
  };
  shifts?: any[];
  attendance?: any[];
  reports?: any[];
}

interface AgentStats {
  totalAgents: number;
  activeAgents: number;
  onDutyAgents: number;
  availableAgents: number;
  averagePerformance: number;
  newHiresThisMonth: number;
}

const AgentManagementPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [newAgent, setNewAgent] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    employeeId: '',
    hireDate: '',
    skills: [] as string[],
    emergencyContact: {
      name: '',
      relationship: '',
      phone: '',
      email: '',
    },
  });

  // Data fetching functions
  const fetchAgents = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [agentsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/agents`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/agent-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!agentsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch agent data');
      }

      const agentsResult = await agentsResponse.json();
      const statsResult = await statsResponse.json();

      setAgents(agentsResult.data || []);
      setStats(statsResult.data || {
        totalAgents: 0,
        activeAgents: 0,
        onDutyAgents: 0,
        availableAgents: 0,
        averagePerformance: 0,
        newHiresThisMonth: 0,
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch agents:', err);
      setError('Failed to load agent data. Please check your connection and try again.');
      setAgents([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const createAgent = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/agents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAgent),
      });

      if (!response.ok) {
        throw new Error('Failed to create agent');
      }

      setCreateDialogOpen(false);
      setNewAgent({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        employeeId: '',
        hireDate: '',
        skills: [],
        emergencyContact: {
          name: '',
          relationship: '',
          phone: '',
          email: '',
        },
      });
      fetchAgents();

    } catch (err: any) {
      console.error('Failed to create agent:', err);
      setError('Failed to create agent. Please try again.');
    }
  };

  const deleteAgent = async () => {
    if (!selectedAgent) return;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/agents/${selectedAgent.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete agent');
      }

      setDeleteDialogOpen(false);
      setSelectedAgent(null);
      fetchAgents();

    } catch (err: any) {
      console.error('Failed to delete agent:', err);
      setError('Failed to delete agent. Please try again.');
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
        return 'warning';
      case 'TERMINATED':
        return 'error';
      default:
        return 'default';
    }
  };

  const filteredAgents = agents.filter(agent => {
    if (filterStatus !== 'all' && agent.employmentStatus !== filterStatus) return false;
    if (searchQuery && 
        !agent.user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !agent.user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !agent.user.email.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !agent.employeeId.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Loading state
  if (loading && agents.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Agent Data...
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
            Agent Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Comprehensive agent profiles, certifications, and performance tracking
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
            onClick={fetchAgents}
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
            Add Agent
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
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <PersonIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalAgents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Agents
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <Badge badgeContent={stats.activeAgents} color="success">
                    <PersonIcon color="success" />
                  </Badge>
                  <Box>
                    <Typography variant="h6">{stats.activeAgents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <WorkIcon color="info" />
                  <Box>
                    <Typography variant="h6">{stats.onDutyAgents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      On Duty
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <ScheduleIcon color="warning" />
                  <Box>
                    <Typography variant="h6">{stats.availableAgents}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Available
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <PerformanceIcon color="warning" />
                  <Box>
                    <Typography variant="h6">{stats.averagePerformance}%</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Avg Performance
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2}>
                  <AddIcon color="info" />
                  <Box>
                    <Typography variant="h6">{stats.newHiresThisMonth}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      New Hires
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
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            label="Status"
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <MenuItem value="all">All Status</MenuItem>
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="INACTIVE">Inactive</MenuItem>
            <MenuItem value="SUSPENDED">Suspended</MenuItem>
            <MenuItem value="TERMINATED">Terminated</MenuItem>
          </Select>
        </FormControl>

        <TextField
          size="small"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
          }}
          sx={{ minWidth: 200 }}
        />
      </Box>

      {/* Agent Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Agent</TableCell>
                <TableCell>Employee ID</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Skills</TableCell>
                <TableCell>Hire Date</TableCell>
                <TableCell>Performance</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAgents
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((agent) => (
                  <TableRow key={agent.id} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={2}>
                        <Avatar>
                          {agent.user.firstName[0]}{agent.user.lastName[0]}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle2">
                            {agent.user.firstName} {agent.user.lastName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {agent.user.email}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>{agent.employeeId}</TableCell>
                    <TableCell>
                      <Chip
                        label={agent.employmentStatus}
                        color={getStatusColor(agent.employmentStatus) as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {agent.skills.slice(0, 2).map((skill, index) => (
                          <Chip key={index} label={skill} size="small" variant="outlined" />
                        ))}
                        {agent.skills.length > 2 && (
                          <Chip label={`+${agent.skills.length - 2}`} size="small" variant="outlined" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {new Date(agent.hireDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <PerformanceIcon fontSize="small" />
                        <Typography variant="body2">
                          {agent.performanceMetrics?.score || 'N/A'}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <Tooltip title="Edit Agent">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedAgent(agent);
                              setEditDialogOpen(true);
                            }}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Agent">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                              setSelectedAgent(agent);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredAgents.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>
    </Box>
  );
};

export default AgentManagementPage;
