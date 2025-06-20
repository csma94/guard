import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Stepper,
  Step,
  StepLabel,
  StepContent,
} from '@mui/material';
import {
  CalendarToday as CalendarIcon,
  AutoAwesome as OptimizeIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  LocationOn as LocationIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
// Temporary fallback for react-big-calendar
let Calendar: any, momentLocalizer: any, Views: any;
try {
  const bigCalendar = require('react-big-calendar');
  Calendar = bigCalendar.Calendar;
  momentLocalizer = bigCalendar.momentLocalizer;
  Views = bigCalendar.Views;
  require('react-big-calendar/lib/css/react-big-calendar.css');
} catch (e) {
  // Fallback components if react-big-calendar is not available
  Calendar = ({ children, ...props }: any) => <div>Calendar component not available</div>;
  momentLocalizer = () => ({});
  Views = { WEEK: 'week', MONTH: 'month', DAY: 'day' };
}
import moment from 'moment';

import { useAuth } from '../../hooks/useAuth';
import { schedulingAPI, sitesAPI, agentsAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

const localizer = momentLocalizer(moment);

interface ScheduleRequirements {
  siteId: string;
  startDate: Date;
  endDate: Date;
  shiftDuration: number;
  shiftType: string;
  requiredSkills: string[];
  minAgentsPerShift: number;
  maxAgentsPerShift: number;
  preferredAgents: string[];
  avoidOvertime: boolean;
  considerAvailability: boolean;
  workingHours: {
    start: string;
    end: string;
  };
  workingDays: number[];
}

interface ScheduleConflict {
  type: 'OVERLAP' | 'UNDERSTAFFED' | 'OVERSTAFFED' | 'SKILL_MISMATCH' | 'AVAILABILITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affectedShifts: string[];
  suggestions: string[];
}

const AdvancedSchedulingPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [sites, setSites] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationDialogOpen, setOptimizationDialogOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  
  const [requirements, setRequirements] = useState<ScheduleRequirements>({
    siteId: '',
    startDate: new Date(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    shiftDuration: 8,
    shiftType: 'REGULAR',
    requiredSkills: [],
    minAgentsPerShift: 1,
    maxAgentsPerShift: 3,
    preferredAgents: [],
    avoidOvertime: true,
    considerAvailability: true,
    workingHours: {
      start: '09:00',
      end: '17:00',
    },
    workingDays: [1, 2, 3, 4, 5], // Monday to Friday
  });

  const [optimizationResults, setOptimizationResults] = useState<any>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const [sitesResponse, agentsResponse, scheduleResponse] = await Promise.all([
        sitesAPI.getAll(),
        agentsAPI.getAll(),
        schedulingAPI.getCurrentSchedule(),
      ]);

      setSites(Array.isArray(sitesResponse.data) ? sitesResponse.data : []);
      setAgents(Array.isArray(agentsResponse.data) ? agentsResponse.data : []);

      // Transform schedule data for calendar
      const shiftsData = Array.isArray(scheduleResponse.data) ? scheduleResponse.data : [];
      const events = shiftsData.map((shift: any) => ({
        id: shift.id,
        title: `${shift.agent?.user?.username || 'Unassigned'} - ${shift.site?.name}`,
        start: new Date(shift.startTime),
        end: new Date(shift.endTime),
        resource: {
          agentId: shift.agentId,
          siteId: shift.siteId,
          status: shift.status,
          type: shift.shiftType,
        },
      }));
      
      setScheduleEvents(events);
      
      // Check for conflicts
      await checkScheduleConflicts();
    } catch (error) {
      console.error('Failed to load scheduling data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkScheduleConflicts = async () => {
    try {
      const response = await schedulingAPI.checkConflicts({
        startDate: requirements.startDate.toISOString(),
        endDate: requirements.endDate.toISOString(),
      });
      setConflicts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to check conflicts:', error);
    }
  };

  const handleOptimizeSchedule = async () => {
    try {
      setIsOptimizing(true);
      const response = await schedulingAPI.optimizeSchedule(requirements);
      setOptimizationResults(response.data);
      setOptimizationDialogOpen(true);
    } catch (error) {
      console.error('Failed to optimize schedule:', error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleApplyOptimization = async () => {
    if (!optimizationResults) return;

    try {
      await schedulingAPI.applyOptimizedSchedule(optimizationResults.scheduleId);
      setOptimizationDialogOpen(false);
      await loadInitialData();
    } catch (error) {
      console.error('Failed to apply optimization:', error);
    }
  };

  const handleExportSchedule = async (format: 'csv' | 'pdf' | 'ical') => {
    try {
      const response = await schedulingAPI.exportSchedule({
        startDate: requirements.startDate.toISOString(),
        endDate: requirements.endDate.toISOString(),
        format,
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `schedule.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export schedule:', error);
    }
  };

  const getConflictSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'error';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'info';
      case 'LOW': return 'success';
      default: return 'default';
    }
  };

  const eventStyleGetter = (event: any) => {
    let backgroundColor = '#3174ad';
    
    if (event.resource?.status === 'CANCELLED') {
      backgroundColor = '#f44336';
    } else if (event.resource?.status === 'COMPLETED') {
      backgroundColor = '#4caf50';
    } else if (event.resource?.type === 'OVERTIME') {
      backgroundColor = '#ff9800';
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '5px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    };
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            Advanced Scheduling
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => handleExportSchedule('pdf')}
            >
              Export
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadInitialData}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<OptimizeIcon />}
              onClick={handleOptimizeSchedule}
              disabled={isOptimizing}
            >
              {isOptimizing ? 'Optimizing...' : 'Optimize Schedule'}
            </Button>
          </Box>
        </Box>

        {/* Conflicts Alert */}
        {conflicts.length > 0 && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            {conflicts.length} scheduling conflict{conflicts.length > 1 ? 's' : ''} detected. 
            Review the conflicts tab for details.
          </Alert>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="Calendar View" icon={<CalendarIcon />} />
          <Tab label="Optimization" icon={<OptimizeIcon />} />
          <Tab label={`Conflicts (${conflicts.length})`} icon={<WarningIcon />} />
          <Tab label="Bulk Operations" icon={<UploadIcon />} />
        </Tabs>

        {/* Calendar View */}
        {activeTab === 0 && (
          <Card>
            <CardContent>
              <Box sx={{ height: 600 }}>
                <Calendar
                  localizer={localizer}
                  events={scheduleEvents}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: '100%' }}
                  eventPropGetter={eventStyleGetter}
                  views={[Views.MONTH, Views.WEEK, Views.DAY]}
                  defaultView={Views.WEEK}
                  popup
                  onSelectEvent={(event: any) => {
                    // Handle event selection
                    console.log('Selected event:', event);
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Optimization Tab */}
        {activeTab === 1 && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Optimization Parameters
                  </Typography>
                  
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Site</InputLabel>
                    <Select
                      value={requirements.siteId}
                      onChange={(e) => setRequirements(prev => ({ ...prev, siteId: e.target.value }))}
                      label="Site"
                    >
                      {sites.map((site) => (
                        <MenuItem key={site.id} value={site.id}>
                          {site.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <DatePicker
                    label="Start Date"
                    value={requirements.startDate}
                    onChange={(newValue) => setRequirements(prev => ({ ...prev, startDate: newValue || new Date() }))}
                    slots={{
                      textField: TextField,
                    }}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        margin: 'normal',
                      },
                    }}
                  />

                  <DatePicker
                    label="End Date"
                    value={requirements.endDate}
                    onChange={(newValue) => setRequirements(prev => ({ ...prev, endDate: newValue || new Date() }))}
                    slots={{
                      textField: TextField,
                    }}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        margin: 'normal',
                      },
                    }}
                  />

                  <TextField
                    fullWidth
                    type="number"
                    label="Shift Duration (hours)"
                    value={requirements.shiftDuration}
                    onChange={(e) => setRequirements(prev => ({ ...prev, shiftDuration: parseInt(e.target.value) }))}
                    margin="normal"
                  />

                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Min Agents"
                        value={requirements.minAgentsPerShift}
                        onChange={(e) => setRequirements(prev => ({ ...prev, minAgentsPerShift: parseInt(e.target.value) }))}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Max Agents"
                        value={requirements.maxAgentsPerShift}
                        onChange={(e) => setRequirements(prev => ({ ...prev, maxAgentsPerShift: parseInt(e.target.value) }))}
                      />
                    </Grid>
                  </Grid>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={requirements.avoidOvertime}
                        onChange={(e) => setRequirements(prev => ({ ...prev, avoidOvertime: e.target.checked }))}
                      />
                    }
                    label="Avoid Overtime"
                    sx={{ mt: 2 }}
                  />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={requirements.considerAvailability}
                        onChange={(e) => setRequirements(prev => ({ ...prev, considerAvailability: e.target.checked }))}
                      />
                    }
                    label="Consider Agent Availability"
                  />
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Optimization Results
                  </Typography>
                  
                  {optimizationResults ? (
                    <Box>
                      <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={3}>
                          <Card variant="outlined">
                            <CardContent sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="primary">
                                {optimizationResults.metrics?.totalShifts || 0}
                              </Typography>
                              <Typography variant="body2">
                                Total Shifts
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <Card variant="outlined">
                            <CardContent sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="success.main">
                                {optimizationResults.metrics?.coverageRate || 0}%
                              </Typography>
                              <Typography variant="body2">
                                Coverage Rate
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <Card variant="outlined">
                            <CardContent sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="warning.main">
                                {optimizationResults.metrics?.conflictCount || 0}
                              </Typography>
                              <Typography variant="body2">
                                Conflicts
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <Card variant="outlined">
                            <CardContent sx={{ textAlign: 'center' }}>
                              <Typography variant="h4" color="info.main">
                                {optimizationResults.metrics?.efficiency || 0}%
                              </Typography>
                              <Typography variant="body2">
                                Efficiency
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                      </Grid>

                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckIcon />}
                        onClick={handleApplyOptimization}
                        sx={{ mr: 2 }}
                      >
                        Apply Optimization
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => setOptimizationResults(null)}
                      >
                        Discard
                      </Button>
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                      <OptimizeIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary">
                        No optimization results yet
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Configure parameters and click "Optimize Schedule" to generate results
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Conflicts Tab */}
        {activeTab === 2 && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Schedule Conflicts
              </Typography>
              
              {conflicts.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CheckIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                  <Typography variant="h6" color="success.main">
                    No conflicts detected
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Your current schedule looks good!
                  </Typography>
                </Box>
              ) : (
                <List>
                  {conflicts.map((conflict, index) => (
                    <ListItem key={index} divider>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={conflict.severity}
                              color={getConflictSeverityColor(conflict.severity) as any}
                              size="small"
                            />
                            <Typography variant="subtitle1">
                              {conflict.type.replace('_', ' ')}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              {conflict.description}
                            </Typography>
                            {conflict.suggestions.length > 0 && (
                              <Box>
                                <Typography variant="caption" color="text.secondary">
                                  Suggestions:
                                </Typography>
                                <ul style={{ margin: 0, paddingLeft: 16 }}>
                                  {conflict.suggestions.map((suggestion, idx) => (
                                    <li key={idx}>
                                      <Typography variant="caption">
                                        {suggestion}
                                      </Typography>
                                    </li>
                                  ))}
                                </ul>
                              </Box>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        )}

        {/* Bulk Operations Tab */}
        {activeTab === 3 && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Import Schedule
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Upload a CSV file to bulk import shifts
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<UploadIcon />}
                    component="label"
                    fullWidth
                  >
                    Choose File
                    <input type="file" hidden accept=".csv" />
                  </Button>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Template Operations
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Apply schedule templates to multiple sites
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<ScheduleIcon />}
                    fullWidth
                  >
                    Apply Template
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </Box>
    </LocalizationProvider>
  );
};

export default AdvancedSchedulingPage;
