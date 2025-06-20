import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Alert,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Divider,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Visibility as ViewIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  DateRange as DateRangeIcon,
  Assessment as ReportIcon,
  Security as SecurityIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  ExpandMore as ExpandMoreIcon,
  Share as ShareIcon,
  Print as PrintIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import { clientPortalAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';

interface Report {
  id: string;
  title: string;
  type: 'PATROL' | 'INCIDENT' | 'MAINTENANCE' | 'SUMMARY' | 'COMPLIANCE';
  description: string;
  createdAt: string;
  createdBy: string;
  siteName: string;
  siteId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  attachments: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    url: string;
  }>;
  tags: string[];
  summary: string;
  findings: string[];
  recommendations: string[];
  isConfidential: boolean;
  accessLevel: 'PUBLIC' | 'RESTRICTED' | 'CONFIDENTIAL';
}

interface ReportAccessManagerProps {
  style?: any;
}

const ReportAccessManager: React.FC<ReportAccessManagerProps> = ({ style }) => {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredReports, setFilteredReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
  });

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [reports, searchQuery, selectedType, selectedSite, selectedStatus, dateRange]);

  const loadReports = async () => {
    try {
      setIsLoading(true);
      const response = await clientPortalAPI.getReports({
        clientId: user?.clientId,
        includeAttachments: true,
        includeMetadata: true,
      });
      setReports(response.data.reports || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = reports;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(report =>
        report.title.toLowerCase().includes(query) ||
        report.description.toLowerCase().includes(query) ||
        report.summary.toLowerCase().includes(query) ||
        report.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Type filter
    if (selectedType) {
      filtered = filtered.filter(report => report.type === selectedType);
    }

    // Site filter
    if (selectedSite) {
      filtered = filtered.filter(report => report.siteId === selectedSite);
    }

    // Status filter
    if (selectedStatus) {
      filtered = filtered.filter(report => report.status === selectedStatus);
    }

    // Date range filter
    filtered = filtered.filter(report => {
      const reportDate = new Date(report.createdAt);
      return reportDate >= dateRange.startDate && reportDate <= dateRange.endDate;
    });

    setFilteredReports(filtered);
  };

  const handleDownloadReport = async (reportId: string, format: 'pdf' | 'excel' | 'csv' = 'pdf') => {
    try {
      const response = await clientPortalAPI.downloadReport(reportId, format);
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${reportId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to download report:', error);
    }
  };

  const handleShareReport = async (reportId: string, emails: string[]) => {
    try {
      await clientPortalAPI.shareReport(reportId, { emails });
      // Show success message
    } catch (error) {
      console.error('Failed to share report:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'success';
      case 'REVIEWED': return 'info';
      case 'SUBMITTED': return 'warning';
      case 'DRAFT': return 'default';
      default: return 'default';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'error';
      case 'HIGH': return 'warning';
      case 'NORMAL': return 'info';
      case 'LOW': return 'success';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'PATROL': return <SecurityIcon />;
      case 'INCIDENT': return <WarningIcon />;
      case 'MAINTENANCE': return <ReportIcon />;
      case 'SUMMARY': return <AssessmentIcon />;
      case 'COMPLIANCE': return <CheckIcon />;
      default: return <ReportIcon />;
    }
  };

  const getUniqueValues = (field: keyof Report) => {
    return [...new Set(reports.map(report => report[field]))].filter(Boolean);
  };

  const renderReportCard = (report: Report) => (
    <Card key={report.id} sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            {getTypeIcon(report.type)}
            <Box>
              <Typography variant="h6" component="h3">
                {report.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {report.siteName} • {new Date(report.createdAt).toLocaleDateString()}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Chip
                  label={report.type}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={report.status}
                  size="small"
                  color={getStatusColor(report.status)}
                />
                <Chip
                  label={report.priority}
                  size="small"
                  color={getPriorityColor(report.priority)}
                />
                {report.isConfidential && (
                  <Chip
                    label="Confidential"
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                )}
              </Box>
            </Box>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="View Report">
              <IconButton
                onClick={() => {
                  setSelectedReport(report);
                  setReportDialogOpen(true);
                }}
              >
                <ViewIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Download PDF">
              <IconButton onClick={() => handleDownloadReport(report.id, 'pdf')}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Share Report">
              <IconButton>
                <ShareIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        
        <Typography variant="body2" paragraph>
          {report.summary || report.description}
        </Typography>
        
        {report.tags.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {report.tags.map((tag, index) => (
              <Chip key={index} label={tag} size="small" variant="outlined" />
            ))}
          </Box>
        )}
        
        {report.attachments.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {report.attachments.length} attachment{report.attachments.length > 1 ? 's' : ''}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderReportTable = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Title</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Site</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Priority</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredReports.map((report) => (
            <TableRow key={report.id}>
              <TableCell>
                <Box>
                  <Typography variant="subtitle2">{report.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {report.description.substring(0, 100)}...
                  </Typography>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getTypeIcon(report.type)}
                  {report.type}
                </Box>
              </TableCell>
              <TableCell>{report.siteName}</TableCell>
              <TableCell>{new Date(report.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <Chip
                  label={report.status}
                  size="small"
                  color={getStatusColor(report.status)}
                />
              </TableCell>
              <TableCell>
                <Chip
                  label={report.priority}
                  size="small"
                  color={getPriorityColor(report.priority)}
                />
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setSelectedReport(report);
                      setReportDialogOpen(true);
                    }}
                  >
                    <ViewIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleDownloadReport(report.id, 'pdf')}
                  >
                    <DownloadIcon />
                  </IconButton>
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={style}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            Reports & Documentation
          </Typography>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => {
              // Bulk download functionality
            }}
          >
            Bulk Download
          </Button>
        </Box>

        {/* Filters */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Search Reports"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  InputProps={{
                    startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
                  }}
                />
              </Grid>
              
              <Grid item xs={12} md={2}>
                <FormControl fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    label="Type"
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {getUniqueValues('type').map((type) => (
                      <MenuItem key={type} value={type}>{type}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={2}>
                <FormControl fullWidth>
                  <InputLabel>Site</InputLabel>
                  <Select
                    value={selectedSite}
                    onChange={(e) => setSelectedSite(e.target.value)}
                    label="Site"
                  >
                    <MenuItem value="">All Sites</MenuItem>
                    {getUniqueValues('siteName').map((site) => (
                      <MenuItem key={site} value={site}>{site}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={2}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    label="Status"
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    {getUniqueValues('status').map((status) => (
                      <MenuItem key={status} value={status}>{status}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <DatePicker
                    label="From"
                    value={dateRange.startDate}
                    onChange={(newValue) => setDateRange(prev => ({ 
                      ...prev, 
                      startDate: newValue || new Date() 
                    }))}
                    renderInput={(params) => <TextField {...params} size="small" />}
                  />
                  <DatePicker
                    label="To"
                    value={dateRange.endDate}
                    onChange={(newValue) => setDateRange(prev => ({ 
                      ...prev, 
                      endDate: newValue || new Date() 
                    }))}
                    renderInput={(params) => <TextField {...params} size="small" />}
                  />
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Results Summary */}
        <Alert severity="info" sx={{ mb: 3 }}>
          Showing {filteredReports.length} of {reports.length} reports
        </Alert>

        {/* View Toggle */}
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="Card View" />
          <Tab label="Table View" />
        </Tabs>

        {/* Loading */}
        {isLoading && <LinearProgress sx={{ mb: 3 }} />}

        {/* Reports Display */}
        {activeTab === 0 ? (
          <Box>
            {filteredReports.map(renderReportCard)}
          </Box>
        ) : (
          renderReportTable()
        )}

        {/* Report Details Dialog */}
        <Dialog
          open={reportDialogOpen}
          onClose={() => setReportDialogOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">
                {selectedReport?.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <IconButton onClick={() => handleDownloadReport(selectedReport?.id || '', 'pdf')}>
                  <DownloadIcon />
                </IconButton>
                <IconButton>
                  <PrintIcon />
                </IconButton>
                <IconButton>
                  <EmailIcon />
                </IconButton>
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent>
            {selectedReport && (
              <Box>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Type: {selectedReport.type}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Site: {selectedReport.siteName}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Created: {new Date(selectedReport.createdAt).toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Created By: {selectedReport.createdBy}
                    </Typography>
                  </Grid>
                </Grid>

                <Divider sx={{ mb: 2 }} />

                <Typography variant="h6" gutterBottom>
                  Summary
                </Typography>
                <Typography variant="body1" paragraph>
                  {selectedReport.summary || selectedReport.description}
                </Typography>

                {selectedReport.findings.length > 0 && (
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="h6">Findings</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {selectedReport.findings.map((finding, index) => (
                        <Typography key={index} variant="body2" paragraph>
                          • {finding}
                        </Typography>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                )}

                {selectedReport.recommendations.length > 0 && (
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="h6">Recommendations</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {selectedReport.recommendations.map((recommendation, index) => (
                        <Typography key={index} variant="body2" paragraph>
                          • {recommendation}
                        </Typography>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                )}

                {selectedReport.attachments.length > 0 && (
                  <Box sx={{ mt: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Attachments
                    </Typography>
                    {selectedReport.attachments.map((attachment) => (
                      <Box
                        key={attachment.id}
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          p: 1,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          mb: 1,
                        }}
                      >
                        <Box>
                          <Typography variant="body2">{attachment.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {attachment.type} • {(attachment.size / 1024).toFixed(1)} KB
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => window.open(attachment.url, '_blank')}
                        >
                          <DownloadIcon />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReportDialogOpen(false)}>
              Close
            </Button>
            <Button
              variant="contained"
              onClick={() => handleDownloadReport(selectedReport?.id || '', 'pdf')}
            >
              Download PDF
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default ReportAccessManager;
