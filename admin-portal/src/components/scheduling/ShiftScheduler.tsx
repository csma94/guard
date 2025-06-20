import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Paper,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Schedule as ScheduleIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Calendar, momentLocalizer, Event } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useAuth } from '../../hooks/useAuth';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';

const localizer = momentLocalizer(moment);

interface Shift {
  id: string;
  agentId: string;
  agentName: string;
  siteId: string;
  siteName: string;
  startTime: Date;
  endTime: Date;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  requirements?: string[];
}

interface Agent {
  id: string;
  userId: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  employeeId: string;
  skills: string[];
  isActive: boolean;
}

interface Site {
  id: string;
  name: string;
  address: string;
  requirements?: string[];
  isActive: boolean;
}

interface ShiftFormData {
  agentId: string;
  siteId: string;
  startTime: Date | null;
  endTime: Date | null;
  notes: string;
  requirements: string[];
}

const ShiftScheduler: React.FC = () => {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('week');
  
  // Dialog states
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [formData, setFormData] = useState<ShiftFormData>({
    agentId: '',
    siteId: '',
    startTime: null,
    endTime: null,
    notes: '',
    requirements: [],
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchShifts = useCallback(async () => {
    try {
      setError(null);
      
      const token = await getToken();
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Get date range for current view
      const startDate = moment(selectedDate).startOf(calendarView).toISOString();
      const endDate = moment(selectedDate).endOf(calendarView).toISOString();

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/shifts?startDate=${startDate}&endDate=${endDate}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch shifts: ${response.status}`);
      }

      const result = await response.json();
      const shiftData = result.data || [];

      const transformedShifts: Shift[] = shiftData.map((shift: any) => ({
        id: shift.id,
        agentId: shift.agentId,
        agentName: `${shift.agent?.user?.firstName || ''} ${shift.agent?.user?.lastName || ''}`.trim() || 'Unknown Agent',
        siteId: shift.siteId,
        siteName: shift.site?.name || 'Unknown Site',
        startTime: new Date(shift.startTime),
        endTime: new Date(shift.endTime),
        status: shift.status,
        notes: shift.notes,
        requirements: shift.requirements || [],
      }));

      setShifts(transformedShifts);

    } catch (err: any) {
      console.error('Failed to fetch shifts:', err);
      setError('Failed to load shifts. Please check your connection and try again.');
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, calendarView]);

  const fetchAgents = useCallback(async () => {
    try {
      const token = await getToken();
      
      if (!token) return;

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/agents?status=ACTIVE`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        setAgents(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, []);

  const fetchSites = useCallback(async () => {
    try {
      const token = await getToken();
      
      if (!token) return;

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/sites?status=ACTIVE`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        setSites(result.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch sites:', err);
    }
  }, []);

  useEffect(() => {
    fetchShifts();
    fetchAgents();
    fetchSites();
  }, [fetchShifts, fetchAgents, fetchSites]);

  const handleCreateShift = (slotInfo?: any) => {
    setDialogMode('create');
    setSelectedShift(null);
    
    const startTime = slotInfo?.start || new Date();
    const endTime = slotInfo?.end || new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours later

    setFormData({
      agentId: '',
      siteId: '',
      startTime,
      endTime,
      notes: '',
      requirements: [],
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleEditShift = (shift: Shift) => {
    setDialogMode('edit');
    setSelectedShift(shift);
    setFormData({
      agentId: shift.agentId,
      siteId: shift.siteId,
      startTime: shift.startTime,
      endTime: shift.endTime,
      notes: shift.notes || '',
      requirements: shift.requirements || [],
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.agentId) {
      errors.agentId = 'Agent is required';
    }

    if (!formData.siteId) {
      errors.siteId = 'Site is required';
    }

    if (!formData.startTime) {
      errors.startTime = 'Start time is required';
    }

    if (!formData.endTime) {
      errors.endTime = 'End time is required';
    }

    if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
      errors.endTime = 'End time must be after start time';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const token = await getToken();
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      const url = dialogMode === 'create' 
        ? `${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/shifts`
        : `${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/shifts/${selectedShift?.id}`;

      const method = dialogMode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          startTime: formData.startTime?.toISOString(),
          endTime: formData.endTime?.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to ${dialogMode} shift`);
      }

      setOpenDialog(false);
      fetchShifts();
      
    } catch (err: any) {
      console.error(`Failed to ${dialogMode} shift:`, err);
      setError(err.message || `Failed to ${dialogMode} shift. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    if (!window.confirm('Are you sure you want to delete this shift?')) return;

    try {
      const token = await getToken();
      
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/shifts/${shiftId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete shift');
      }

      fetchShifts();
      
    } catch (err: any) {
      console.error('Failed to delete shift:', err);
      setError('Failed to delete shift. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return '#2196F3';
      case 'IN_PROGRESS':
        return '#4CAF50';
      case 'COMPLETED':
        return '#9E9E9E';
      case 'CANCELLED':
        return '#F44336';
      default:
        return '#2196F3';
    }
  };

  // Transform shifts for calendar
  const calendarEvents: Event[] = shifts.map(shift => ({
    id: shift.id,
    title: `${shift.agentName} - ${shift.siteName}`,
    start: shift.startTime,
    end: shift.endTime,
    resource: shift,
    style: {
      backgroundColor: getStatusColor(shift.status),
    },
  }));

  const eventStyleGetter = (event: any) => {
    return {
      style: {
        backgroundColor: getStatusColor(event.resource.status),
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    };
  };

  if (loading && shifts.length === 0) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
            <Box textAlign="center">
              <CircularProgress size={60} />
              <Typography variant="h6" sx={{ mt: 2 }}>
                Loading Schedule...
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4">Shift Scheduler</Typography>
          <Box display="flex" gap={2}>
            <Button
              variant="outlined"
              onClick={() => fetchShifts()}
              startIcon={<RefreshIcon />}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleCreateShift()}
            >
              Schedule Shift
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Calendar */}
        <Card>
          <CardContent>
            <Box sx={{ height: 600 }}>
              <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%' }}
                view={calendarView}
                onView={(view) => setCalendarView(view as any)}
                date={selectedDate}
                onNavigate={(date) => setSelectedDate(date)}
                eventPropGetter={eventStyleGetter}
                selectable
                onSelectSlot={handleCreateShift}
                onSelectEvent={(event) => handleEditShift(event.resource)}
                popup
                views={['month', 'week', 'day']}
                step={60}
                showMultiDayTimes
                components={{
                  event: ({ event }) => (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                        {event.resource.agentName}
                      </Typography>
                      <br />
                      <Typography variant="caption">
                        {event.resource.siteName}
                      </Typography>
                    </Box>
                  ),
                }}
              />
            </Box>
          </CardContent>
        </Card>

        {/* Shift Dialog */}
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            {dialogMode === 'create' ? 'Schedule New Shift' : 'Edit Shift'}
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth error={!!formErrors.agentId}>
                  <InputLabel>Agent</InputLabel>
                  <Select
                    value={formData.agentId}
                    label="Agent"
                    onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                  >
                    {agents.map((agent) => (
                      <MenuItem key={agent.id} value={agent.id}>
                        {agent.user.firstName} {agent.user.lastName} ({agent.employeeId})
                      </MenuItem>
                    ))}
                  </Select>
                  {formErrors.agentId && (
                    <Typography variant="caption" color="error">
                      {formErrors.agentId}
                    </Typography>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth error={!!formErrors.siteId}>
                  <InputLabel>Site</InputLabel>
                  <Select
                    value={formData.siteId}
                    label="Site"
                    onChange={(e) => setFormData({ ...formData, siteId: e.target.value })}
                  >
                    {sites.map((site) => (
                      <MenuItem key={site.id} value={site.id}>
                        {site.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {formErrors.siteId && (
                    <Typography variant="caption" color="error">
                      {formErrors.siteId}
                    </Typography>
                  )}
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <DateTimePicker
                  label="Start Time"
                  value={formData.startTime}
                  onChange={(newValue) => setFormData({ ...formData, startTime: newValue })}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: !!formErrors.startTime,
                      helperText: formErrors.startTime,
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <DateTimePicker
                  label="End Time"
                  value={formData.endTime}
                  onChange={(newValue) => setFormData({ ...formData, endTime: newValue })}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: !!formErrors.endTime,
                      helperText: formErrors.endTime,
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes"
                  multiline
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            {dialogMode === 'edit' && (
              <Button
                onClick={() => handleDeleteShift(selectedShift!.id)}
                color="error"
              >
                Delete
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={submitting}
            >
              {submitting ? <CircularProgress size={20} /> : (dialogMode === 'create' ? 'Schedule' : 'Update')}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default ShiftScheduler;
