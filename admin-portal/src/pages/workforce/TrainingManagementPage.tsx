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
  LinearProgress,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  School as TrainingIcon,
  Certificate as CertificateIcon,
  Assignment as AssignmentIcon,
  PlayArrow as StartIcon,
  CheckCircle as CompleteIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Group as GroupIcon,
  Assessment as AssessmentIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
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
      id={`training-tabpanel-${index}`}
      aria-labelledby={`training-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

interface Training {
  id: string;
  title: string;
  description?: string;
  type: 'ORIENTATION' | 'SAFETY' | 'TECHNICAL' | 'COMPLIANCE' | 'SOFT_SKILLS' | 'CERTIFICATION_PREP' | 'REFRESHER' | 'SPECIALIZED';
  category: string;
  duration: number;
  isRequired: boolean;
  validityPeriod?: number;
  materials: any[];
  prerequisites: string[];
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    firstName: string;
    lastName: string;
  };
  enrollments?: TrainingEnrollment[];
  completions?: TrainingCompletion[];
  assessments?: TrainingAssessment[];
}

interface TrainingEnrollment {
  id: string;
  trainingId: string;
  agentId: string;
  enrolledBy?: string;
  status: 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  enrolledAt: string;
  dueDate?: string;
  startedAt?: string;
  completedAt?: string;
  progress: number;
  notes?: string;
  agent: {
    id: string;
    employeeId: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

interface TrainingCompletion {
  id: string;
  trainingId: string;
  agentId: string;
  score?: number;
  passed: boolean;
  completedAt: string;
  expiresAt?: string;
  certificateUrl?: string;
  notes?: string;
  agent: {
    id: string;
    employeeId: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
}

interface Certification {
  id: string;
  name: string;
  description?: string;
  issuingBody: string;
  type: 'SECURITY_LICENSE' | 'FIRST_AID' | 'CPR' | 'FIRE_SAFETY' | 'TECHNICAL' | 'PROFESSIONAL' | 'REGULATORY' | 'INTERNAL';
  validityPeriod?: number;
  requirements: any[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  agentCertifications?: AgentCertification[];
}

interface AgentCertification {
  id: string;
  agentId: string;
  certificationId: string;
  obtainedAt: string;
  expiresAt?: string;
  certificateNumber?: string;
  certificateUrl?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED' | 'PENDING_RENEWAL';
  notes?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  agent: {
    id: string;
    employeeId: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
  certification: {
    id: string;
    name: string;
    type: string;
  };
}

interface TrainingStats {
  totalTrainings: number;
  activeTrainings: number;
  totalEnrollments: number;
  completionRate: number;
  averageScore: number;
  expiringSoon: number;
  totalCertifications: number;
  activeCertifications: number;
}

const TrainingManagementPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [activeTab, setActiveTab] = useState(0);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [enrollments, setEnrollments] = useState<TrainingEnrollment[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [agentCertifications, setAgentCertifications] = useState<AgentCertification[]>([]);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);
  const [createTrainingDialogOpen, setCreateTrainingDialogOpen] = useState(false);
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [createCertificationDialogOpen, setCreateCertificationDialogOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [newTraining, setNewTraining] = useState({
    title: '',
    description: '',
    type: 'TECHNICAL' as const,
    category: '',
    duration: 1,
    isRequired: false,
    validityPeriod: 12,
    prerequisites: [] as string[],
  });

  const [newCertification, setNewCertification] = useState({
    name: '',
    description: '',
    issuingBody: '',
    type: 'INTERNAL' as const,
    validityPeriod: 12,
    requirements: [] as string[],
  });

  const [enrollmentData, setEnrollmentData] = useState({
    agentIds: [] as string[],
    dueDate: '',
    notes: '',
  });

  // Data fetching functions
  const fetchTrainingData = useCallback(async () => {
    try {
      setError(null);

      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [trainingsResponse, enrollmentsResponse, certificationsResponse, agentCertificationsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/trainings`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/training-enrollments`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/certifications`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/agent-certifications`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/training-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!trainingsResponse.ok || !enrollmentsResponse.ok || !certificationsResponse.ok || !agentCertificationsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch training data');
      }

      const trainingsResult = await trainingsResponse.json();
      const enrollmentsResult = await enrollmentsResponse.json();
      const certificationsResult = await certificationsResponse.json();
      const agentCertificationsResult = await agentCertificationsResponse.json();
      const statsResult = await statsResponse.json();

      setTrainings(trainingsResult.data || []);
      setEnrollments(enrollmentsResult.data || []);
      setCertifications(certificationsResult.data || []);
      setAgentCertifications(agentCertificationsResult.data || []);
      setStats(statsResult.data || {
        totalTrainings: 0,
        activeTrainings: 0,
        totalEnrollments: 0,
        completionRate: 0,
        averageScore: 0,
        expiringSoon: 0,
        totalCertifications: 0,
        activeCertifications: 0,
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch training data:', err);
      setError('Failed to load training data. Please check your connection and try again.');
      setTrainings([]);
      setEnrollments([]);
      setCertifications([]);
      setAgentCertifications([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const createTraining = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/trainings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newTraining,
          createdBy: user?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create training');
      }

      setCreateTrainingDialogOpen(false);
      setNewTraining({
        title: '',
        description: '',
        type: 'TECHNICAL',
        category: '',
        duration: 1,
        isRequired: false,
        validityPeriod: 12,
        prerequisites: [],
      });
      fetchTrainingData();

    } catch (err: any) {
      console.error('Failed to create training:', err);
      setError('Failed to create training. Please try again.');
    }
  };

  const enrollAgents = async () => {
    if (!selectedTraining) return;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/training-enrollments/bulk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trainingId: selectedTraining.id,
          agentIds: enrollmentData.agentIds,
          dueDate: enrollmentData.dueDate,
          notes: enrollmentData.notes,
          enrolledBy: user?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to enroll agents');
      }

      setEnrollDialogOpen(false);
      setEnrollmentData({
        agentIds: [],
        dueDate: '',
        notes: '',
      });
      fetchTrainingData();

    } catch (err: any) {
      console.error('Failed to enroll agents:', err);
      setError('Failed to enroll agents. Please try again.');
    }
  };

  // Utility functions
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'ORIENTATION':
        return 'primary';
      case 'SAFETY':
        return 'error';
      case 'TECHNICAL':
        return 'info';
      case 'COMPLIANCE':
        return 'warning';
      case 'CERTIFICATION_PREP':
        return 'success';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'IN_PROGRESS':
        return 'info';
      case 'ENROLLED':
        return 'default';
      case 'FAILED':
        return 'error';
      case 'EXPIRED':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getCertificationStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'EXPIRED':
        return 'error';
      case 'PENDING_RENEWAL':
        return 'warning';
      case 'SUSPENDED':
        return 'warning';
      case 'REVOKED':
        return 'error';
      default:
        return 'default';
    }
  };

  const filteredTrainings = trainings.filter(training => {
    if (filterType !== 'all' && training.type !== filterType) return false;
    if (searchQuery && !training.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !training.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredEnrollments = enrollments.filter(enrollment => {
    if (filterStatus !== 'all' && enrollment.status !== filterStatus) return false;
    if (searchQuery &&
        !enrollment.agent.user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !enrollment.agent.user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !enrollment.agent.employeeId.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchTrainingData();
  }, [fetchTrainingData]);

  // Loading state
  if (loading && trainings.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Training Data...
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
            Training & Certification Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Course management, certification tracking, and skill development
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
            onClick={fetchTrainingData}
            startIcon={<RefreshIcon />}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            onClick={() => setCreateTrainingDialogOpen(true)}
            startIcon={<AddIcon />}
          >
            Create Training
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
                  <TrainingIcon color="primary" />
                  <Box>
                    <Typography variant="h6">{stats.totalTrainings}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Trainings
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
                  <AssignmentIcon color="info" />
                  <Box>
                    <Typography variant="h6">{stats.totalEnrollments}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Enrollments
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
                  <CompleteIcon color="success" />
                  <Box>
                    <Typography variant="h6">{stats.completionRate}%</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Completion Rate
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
                  <CertificateIcon color="warning" />
                  <Box>
                    <Typography variant="h6">{stats.activeCertifications}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Certifications
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
          <Tab label="Training Programs" />
          <Tab label="Enrollments" />
          <Tab label="Certifications" />
          <Tab label="Analytics" />
        </Tabs>

        {/* Training Programs Tab */}
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
                <MenuItem value="ORIENTATION">Orientation</MenuItem>
                <MenuItem value="SAFETY">Safety</MenuItem>
                <MenuItem value="TECHNICAL">Technical</MenuItem>
                <MenuItem value="COMPLIANCE">Compliance</MenuItem>
                <MenuItem value="CERTIFICATION_PREP">Certification Prep</MenuItem>
              </Select>
            </FormControl>

            <TextField
              size="small"
              placeholder="Search trainings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
              }}
              sx={{ minWidth: 200 }}
            />
          </Box>

          <Typography variant="h6" gutterBottom>
            Training Programs ({filteredTrainings.length})
          </Typography>

          <Grid container spacing={3}>
            {filteredTrainings.map((training) => (
              <Grid item xs={12} md={6} lg={4} key={training.id}>
                <Card>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                      <Typography variant="h6" gutterBottom>
                        {training.title}
                      </Typography>
                      <Chip
                        label={training.type.replace('_', ' ')}
                        color={getTypeColor(training.type) as any}
                        size="small"
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {training.description}
                    </Typography>
                    <Box display="flex" gap={1} mb={2}>
                      <Chip label={`${training.duration}h`} size="small" variant="outlined" />
                      {training.isRequired && (
                        <Chip label="Required" color="error" size="small" />
                      )}
                    </Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        {training.enrollments?.length || 0} enrolled
                      </Typography>
                      <Box>
                        <Tooltip title="Enroll Agents">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedTraining(training);
                              setEnrollDialogOpen(true);
                            }}
                          >
                            <GroupIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Training">
                          <IconButton size="small">
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </TabPanel>

        {/* Placeholder for other tabs */}
        <TabPanel value={activeTab} index={1}>
          <Typography variant="h6">Enrollments - Coming Soon</Typography>
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <Typography variant="h6">Certifications - Coming Soon</Typography>
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <Typography variant="h6">Analytics - Coming Soon</Typography>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default TrainingManagementPage;
