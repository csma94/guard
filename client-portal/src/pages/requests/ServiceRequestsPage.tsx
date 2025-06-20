import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
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
  Chip,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  Priority as PriorityIcon,
  Schedule as ScheduleIcon,
  CheckCircle as CompleteIcon,
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import { useAuth } from '../../hooks/useAuth';
import { clientPortalAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

interface ServiceRequest {
  id: string;
  title: string;
  description: string;
  requestType: string;
  priority: string;
  status: string;
  siteId: string;
  siteName: string;
  contactPerson?: string;
  preferredResponseTime?: string;
  assignedTo?: any;
  createdAt: string;
  updatedAt: string;
  responses?: any[];
}

interface Site {
  id: string;
  name: string;
}

const ServiceRequestsPage: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    siteId: '',
    requestType: 'SERVICE_REQUEST',
    title: '',
    description: '',
    priority: 'MEDIUM',
    contactPerson: '',
    preferredResponseTime: null as Date | null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [requestsResponse, sitesResponse] = await Promise.all([
        clientPortalAPI.getServiceRequests(),
        clientPortalAPI.getSites(),
      ]);

      setRequests(requestsResponse.data.requests || []);
      setSites(sitesResponse.data.sites || []);
    } catch (error: any) {
      setError(error.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRequest = async () => {
    try {
      setError(null);
      
      if (!formData.siteId || !formData.title || !formData.description) {
        setError('Please fill in all required fields');
        return;
      }

      const requestData = {
        ...formData,
        preferredResponseTime: formData.preferredResponseTime?.toISOString(),
      };

      await clientPortalAPI.createServiceRequest(requestData);
      
      setCreateDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      setError(error.message || 'Failed to create request');
    }
  };

  const resetForm = () => {
    setFormData({
      siteId: '',
      requestType: 'SERVICE_REQUEST',
      title: '',
      description: '',
      priority: 'MEDIUM',
      contactPerson: '',
      preferredResponseTime: null,
    });
  };

  const handleViewRequest = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setViewDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'primary';
      case 'IN_PROGRESS': return 'warning';
      case 'RESOLVED': return 'success';
      case 'CLOSED': return 'default';
      default: return 'default';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW': return 'success';
      case 'MEDIUM': return 'primary';
      case 'HIGH': return 'warning';
      case 'URGENT': return 'error';
      default: return 'default';
    }
  };

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'SERVICE_REQUEST': return 'Service Request';
      case 'INCIDENT_REPORT': return 'Incident Report';
      case 'SCHEDULE_CHANGE': return 'Schedule Change';
      case 'EQUIPMENT_ISSUE': return 'Equipment Issue';
      case 'GENERAL_INQUIRY': return 'General Inquiry';
      default: return type;
    }
  };

  const filterRequests = (status?: string) => {
    if (!status) return requests;
    return requests.filter(request => request.status === status);
  };

  const getTabRequests = () => {
    switch (activeTab) {
      case 0: return requests; // All
      case 1: return filterRequests('OPEN');
      case 2: return filterRequests('IN_PROGRESS');
      case 3: return filterRequests('RESOLVED');
      case 4: return filterRequests('CLOSED');
      default: return requests;
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            Service Requests
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            New Request
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
          <Tab label={`All (${requests.length})`} />
          <Tab label={`Open (${filterRequests('OPEN').length})`} />
          <Tab label={`In Progress (${filterRequests('IN_PROGRESS').length})`} />
          <Tab label={`Resolved (${filterRequests('RESOLVED').length})`} />
          <Tab label={`Closed (${filterRequests('CLOSED').length})`} />
        </Tabs>

        <Grid container spacing={3}>
          {getTabRequests().map((request) => (
            <Grid item xs={12} md={6} lg={4} key={request.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Typography variant="h6" sx={{ flex: 1 }}>
                      {request.title}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip
                        size="small"
                        label={request.status}
                        color={getStatusColor(request.status) as any}
                      />
                      <Chip
                        size="small"
                        label={request.priority}
                        color={getPriorityColor(request.priority) as any}
                        icon={<PriorityIcon />}
                      />
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {getRequestTypeLabel(request.requestType)} • {request.siteName}
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 2 }}>
                    {request.description.length > 100 
                      ? `${request.description.substring(0, 100)}...` 
                      : request.description
                    }
                  </Typography>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      Created: {new Date(request.createdAt).toLocaleDateString()}
                    </Typography>
                    
                    <Box>
                      <Tooltip title="View Details">
                        <IconButton
                          size="small"
                          onClick={() => handleViewRequest(request)}
                        >
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  {request.assignedTo && (
                    <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="caption">
                        Assigned to: {request.assignedTo.username}
                      </Typography>
                    </Box>
                  )}

                  {request.preferredResponseTime && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ScheduleIcon fontSize="small" color="action" />
                      <Typography variant="caption" color="text.secondary">
                        Response needed by: {new Date(request.preferredResponseTime).toLocaleString()}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {getTabRequests().length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              No requests found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {activeTab === 0 ? 'Create your first service request' : 'No requests in this category'}
            </Typography>
          </Box>
        )}

        {/* Create Request Dialog */}
        <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Create Service Request</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Site</InputLabel>
                  <Select
                    value={formData.siteId}
                    onChange={(e) => setFormData(prev => ({ ...prev, siteId: e.target.value }))}
                    label="Site"
                    required
                  >
                    {sites.map((site) => (
                      <MenuItem key={site.id} value={site.id}>
                        {site.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Request Type</InputLabel>
                  <Select
                    value={formData.requestType}
                    onChange={(e) => setFormData(prev => ({ ...prev, requestType: e.target.value }))}
                    label="Request Type"
                  >
                    <MenuItem value="SERVICE_REQUEST">Service Request</MenuItem>
                    <MenuItem value="INCIDENT_REPORT">Incident Report</MenuItem>
                    <MenuItem value="SCHEDULE_CHANGE">Schedule Change</MenuItem>
                    <MenuItem value="EQUIPMENT_ISSUE">Equipment Issue</MenuItem>
                    <MenuItem value="GENERAL_INQUIRY">General Inquiry</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  required
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  multiline
                  rows={4}
                  required
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Priority</InputLabel>
                  <Select
                    value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    label="Priority"
                  >
                    <MenuItem value="LOW">Low</MenuItem>
                    <MenuItem value="MEDIUM">Medium</MenuItem>
                    <MenuItem value="HIGH">High</MenuItem>
                    <MenuItem value="URGENT">Urgent</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Contact Person (Optional)"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
                />
              </Grid>

              <Grid item xs={12}>
                <DateTimePicker
                  label="Preferred Response Time (Optional)"
                  value={formData.preferredResponseTime}
                  onChange={(newValue) => setFormData(prev => ({ ...prev, preferredResponseTime: newValue }))}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRequest} variant="contained">
              Create Request
            </Button>
          </DialogActions>
        </Dialog>

        {/* View Request Dialog */}
        <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
          {selectedRequest && (
            <>
              <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {selectedRequest.title}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip
                      label={selectedRequest.status}
                      color={getStatusColor(selectedRequest.status) as any}
                    />
                    <Chip
                      label={selectedRequest.priority}
                      color={getPriorityColor(selectedRequest.priority) as any}
                    />
                  </Box>
                </Box>
              </DialogTitle>
              <DialogContent>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Type:</Typography>
                    <Typography variant="body1">{getRequestTypeLabel(selectedRequest.requestType)}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Site:</Typography>
                    <Typography variant="body1">{selectedRequest.siteName}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">Description:</Typography>
                    <Typography variant="body1">{selectedRequest.description}</Typography>
                  </Grid>
                  {selectedRequest.contactPerson && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2" color="text.secondary">Contact Person:</Typography>
                      <Typography variant="body1">{selectedRequest.contactPerson}</Typography>
                    </Grid>
                  )}
                  {selectedRequest.preferredResponseTime && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2" color="text.secondary">Preferred Response Time:</Typography>
                      <Typography variant="body1">
                        {new Date(selectedRequest.preferredResponseTime).toLocaleString()}
                      </Typography>
                    </Grid>
                  )}
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Created:</Typography>
                    <Typography variant="body1">
                      {new Date(selectedRequest.createdAt).toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Last Updated:</Typography>
                    <Typography variant="body1">
                      {new Date(selectedRequest.updatedAt).toLocaleString()}
                    </Typography>
                  </Grid>
                  {selectedRequest.assignedTo && (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">Assigned To:</Typography>
                      <Typography variant="body1">{selectedRequest.assignedTo.username}</Typography>
                    </Grid>
                  )}
                </Grid>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default ServiceRequestsPage;
