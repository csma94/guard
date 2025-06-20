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
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  CheckCircle as PresentIcon,
  Cancel as AbsentIcon,
  Schedule as LateIcon,
  Warning as WarningIcon,
  Edit as EditIcon,
  Approve as ApproveIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  AccessTime as TimeIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

interface AttendanceRecord {
  id: string;
  agentId: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  breakStart?: string;
  breakEnd?: string;
  totalHours?: number;
  overtimeHours: number;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EARLY_DEPARTURE' | 'SICK_LEAVE' | 'VACATION' | 'PERSONAL_LEAVE' | 'UNPAID_LEAVE' | 'HOLIDAY';
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
  agent: {
    id: string;
    employeeId: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  approver?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface AttendanceStats {
  totalRecords: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  averageHours: number;
  overtimeHours: number;
  attendanceRate: number;
  punctualityRate: number;
}

const AttendanceManagementPage: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  
  // State management
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDate, setFilterDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Form states
  const [editData, setEditData] = useState({
    clockIn: '',
    clockOut: '',
    breakStart: '',
    breakEnd: '',
    status: 'PRESENT' as const,
    notes: '',
  });

  // Data fetching functions
  const fetchAttendanceData = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const [recordsResponse, statsResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/attendance-records`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/analytics/attendance-stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!recordsResponse.ok || !statsResponse.ok) {
        throw new Error('Failed to fetch attendance data');
      }

      const recordsResult = await recordsResponse.json();
      const statsResult = await statsResponse.json();

      setAttendanceRecords(recordsResult.data || []);
      setStats(statsResult.data || {
        totalRecords: 0,
        presentToday: 0,
        absentToday: 0,
        lateToday: 0,
        averageHours: 0,
        overtimeHours: 0,
        attendanceRate: 0,
        punctualityRate: 0,
      });
      setLastUpdated(new Date());

    } catch (err: any) {
      console.error('Failed to fetch attendance data:', err);
      setError('Failed to load attendance data. Please check your connection and try again.');
      setAttendanceRecords([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const updateAttendanceRecord = async () => {
    if (!selectedRecord) return;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/attendance-records/${selectedRecord.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...editData,
          approvedBy: user?.id,
          approvedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update attendance record');
      }

      setEditDialogOpen(false);
      setSelectedRecord(null);
      setEditData({
        clockIn: '',
        clockOut: '',
        breakStart: '',
        breakEnd: '',
        status: 'PRESENT',
        notes: '',
      });
      fetchAttendanceData();

    } catch (err: any) {
      console.error('Failed to update attendance record:', err);
      setError('Failed to update attendance record. Please try again.');
    }
  };

  // Utility functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PRESENT':
        return 'success';
      case 'ABSENT':
        return 'error';
      case 'LATE':
        return 'warning';
      case 'EARLY_DEPARTURE':
        return 'warning';
      case 'SICK_LEAVE':
        return 'info';
      case 'VACATION':
        return 'info';
      case 'PERSONAL_LEAVE':
        return 'default';
      case 'UNPAID_LEAVE':
        return 'default';
      case 'HOLIDAY':
        return 'primary';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PRESENT':
        return <PresentIcon color="success" />;
      case 'ABSENT':
        return <AbsentIcon color="error" />;
      case 'LATE':
        return <LateIcon color="warning" />;
      case 'EARLY_DEPARTURE':
        return <WarningIcon color="warning" />;
      default:
        return <PersonIcon />;
    }
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return 'N/A';
    return new Date(timeString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (hours?: number) => {
    if (!hours) return 'N/A';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const filteredRecords = attendanceRecords.filter(record => {
    if (filterStatus !== 'all' && record.status !== filterStatus) return false;
    if (filterDate && !record.date.includes(filterDate)) return false;
    if (searchQuery && 
        !record.agent.user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !record.agent.user.lastName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !record.agent.employeeId.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Effects
  useEffect(() => {
    fetchAttendanceData();
  }, [fetchAttendanceData]);

  // Loading state
  if (loading && attendanceRecords.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <Box textAlign="center">
          <CircularProgress size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading Attendance Data...
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
            Attendance Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Track attendance, manage time records, and monitor workforce presence
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
            onClick={fetchAttendanceData}
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
    </Box>
  );
};

export default AttendanceManagementPage;
