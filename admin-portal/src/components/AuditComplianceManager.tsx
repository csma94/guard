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
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Assessment as AssessmentIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  Visibility as ViewIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import { auditAPI, complianceAPI } from '../services/api';

interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  details: any;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface ComplianceCheck {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'WARNING' | 'PENDING';
  lastChecked: string;
  nextCheck: string;
  requirements: string[];
  findings: string[];
  remediation: string[];
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface ComplianceReport {
  id: string;
  name: string;
  type: 'GDPR' | 'SOC2' | 'ISO27001' | 'HIPAA' | 'PCI_DSS' | 'CUSTOM';
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED';
  createdAt: string;
  completedAt?: string;
  overallScore: number;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
}

const AuditComplianceManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [complianceReports, setComplianceReports] = useState<ComplianceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDateRange, setSelectedDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date(),
  });
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterRiskLevel, setFilterRiskLevel] = useState('');
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ComplianceReport | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedDateRange, filterUser, filterAction, filterRiskLevel]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      const [auditResponse, complianceResponse, reportsResponse] = await Promise.all([
        auditAPI.getAuditLogs({
          startDate: selectedDateRange.startDate.toISOString(),
          endDate: selectedDateRange.endDate.toISOString(),
          userId: filterUser || undefined,
          action: filterAction || undefined,
          riskLevel: filterRiskLevel || undefined,
        }),
        complianceAPI.getComplianceChecks(),
        complianceAPI.getComplianceReports(),
      ]);

      setAuditLogs(Array.isArray(auditResponse.data) ? auditResponse.data : []);
      setComplianceChecks(Array.isArray(complianceResponse.data) ? complianceResponse.data : []);
      setComplianceReports(Array.isArray(reportsResponse.data) ? reportsResponse.data : []);
    } catch (error) {
      console.error('Failed to load audit and compliance data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportAuditLogs = async (format: 'csv' | 'pdf' | 'json') => {
    try {
      const response = await auditAPI.exportAuditLogs({
        startDate: selectedDateRange.startDate.toISOString(),
        endDate: selectedDateRange.endDate.toISOString(),
        format,
        filters: {
          userId: filterUser || undefined,
          action: filterAction || undefined,
          riskLevel: filterRiskLevel || undefined,
        },
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit_logs.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export audit logs:', error);
    }
  };

  const handleRunComplianceCheck = async (checkId: string) => {
    try {
      await complianceAPI.runComplianceCheck(checkId);
      await loadData(); // Reload to get updated status
    } catch (error) {
      console.error('Failed to run compliance check:', error);
    }
  };

  const handleGenerateComplianceReport = async (type: string) => {
    try {
      const response = await complianceAPI.generateComplianceReport({ type });
      setSelectedReport(response.data as unknown as ComplianceReport);
      setReportDialogOpen(true);
    } catch (error) {
      console.error('Failed to generate compliance report:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS':
      case 'COMPLIANT':
      case 'COMPLETED':
      case 'APPROVED':
        return 'success';
      case 'FAILURE':
      case 'NON_COMPLIANT':
        return 'error';
      case 'WARNING':
        return 'warning';
      case 'PENDING':
      case 'DRAFT':
      case 'IN_PROGRESS':
        return 'info';
      default:
        return 'default';
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'error';
      case 'HIGH': return 'warning';
      case 'MEDIUM': return 'info';
      case 'LOW': return 'success';
      default: return 'default';
    }
  };

  const getComplianceScore = () => {
    if (complianceChecks.length === 0) return 0;
    const compliantChecks = complianceChecks.filter(check => check.status === 'COMPLIANT').length;
    return Math.round((compliantChecks / complianceChecks.length) * 100);
  };

  const getCriticalFindings = () => {
    return complianceChecks.filter(check => 
      check.status === 'NON_COMPLIANT' && check.priority === 'CRITICAL'
    ).length;
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" component="h1">
            Audit & Compliance Management
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadData}
            >
              Refresh
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={() => handleExportAuditLogs('pdf')}
            >
              Export Report
            </Button>
          </Box>
        </Box>

        {/* Compliance Overview */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="primary">
                  {getComplianceScore()}%
                </Typography>
                <Typography variant="body2">
                  Overall Compliance Score
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={getComplianceScore()}
                  sx={{ mt: 1 }}
                />
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="error">
                  {getCriticalFindings()}
                </Typography>
                <Typography variant="body2">
                  Critical Findings
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="info.main">
                  {auditLogs.length}
                </Typography>
                <Typography variant="body2">
                  Audit Events (30 days)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4" color="success.main">
                  {complianceReports.filter(r => r.status === 'COMPLETED').length}
                </Typography>
                <Typography variant="body2">
                  Completed Reports
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Critical Alerts */}
        {getCriticalFindings() > 0 && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="h6">Critical Compliance Issues Detected</Typography>
            <Typography>
              {getCriticalFindings()} critical compliance finding{getCriticalFindings() > 1 ? 's' : ''} require immediate attention.
            </Typography>
          </Alert>
        )}

        {/* Main Content Tabs */}
        <Card>
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab label="Audit Logs" icon={<SecurityIcon />} />
            <Tab label="Compliance Checks" icon={<AssessmentIcon />} />
            <Tab label="Reports" icon={<DownloadIcon />} />
          </Tabs>

          <CardContent>
            {/* Audit Logs Tab */}
            {activeTab === 0 && (
              <Box>
                {/* Filters */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={3}>
                    <DatePicker
                      label="Start Date"
                      value={selectedDateRange.startDate}
                      onChange={(newValue) => setSelectedDateRange(prev => ({
                        ...prev,
                        startDate: newValue || new Date()
                      }))}
                      slots={{
                        textField: TextField
                      }}
                      slotProps={{
                        textField: { fullWidth: true }
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <DatePicker
                      label="End Date"
                      value={selectedDateRange.endDate}
                      onChange={(newValue) => setSelectedDateRange(prev => ({
                        ...prev,
                        endDate: newValue || new Date()
                      }))}
                      slots={{
                        textField: TextField
                      }}
                      slotProps={{
                        textField: { fullWidth: true }
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl fullWidth>
                      <InputLabel>Risk Level</InputLabel>
                      <Select
                        value={filterRiskLevel}
                        onChange={(e) => setFilterRiskLevel(e.target.value)}
                        label="Risk Level"
                      >
                        <MenuItem value="">All Levels</MenuItem>
                        <MenuItem value="CRITICAL">Critical</MenuItem>
                        <MenuItem value="HIGH">High</MenuItem>
                        <MenuItem value="MEDIUM">Medium</MenuItem>
                        <MenuItem value="LOW">Low</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      fullWidth
                      label="User"
                      value={filterUser}
                      onChange={(e) => setFilterUser(e.target.value)}
                      placeholder="Filter by user..."
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={() => handleExportAuditLogs('csv')}
                    >
                      Export CSV
                    </Button>
                  </Grid>
                </Grid>

                {/* Audit Logs Table */}
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Timestamp</TableCell>
                        <TableCell>User</TableCell>
                        <TableCell>Action</TableCell>
                        <TableCell>Resource</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Risk Level</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            {new Date(log.timestamp).toLocaleString()}
                          </TableCell>
                          <TableCell>{log.userName}</TableCell>
                          <TableCell>{log.action}</TableCell>
                          <TableCell>{log.resource}</TableCell>
                          <TableCell>
                            <Chip
                              label={log.status}
                              color={getStatusColor(log.status)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={log.riskLevel}
                              color={getRiskLevelColor(log.riskLevel)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton size="small">
                              <ViewIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Compliance Checks Tab */}
            {activeTab === 1 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                  <Typography variant="h6">
                    Compliance Checks ({complianceChecks.length})
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<ScheduleIcon />}
                    onClick={() => {
                      // Run all compliance checks
                      complianceChecks.forEach(check => {
                        if (check.status !== 'PENDING') {
                          handleRunComplianceCheck(check.id);
                        }
                      });
                    }}
                  >
                    Run All Checks
                  </Button>
                </Box>

                {complianceChecks.map((check) => (
                  <Accordion key={check.id}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle1">
                            {check.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {check.category} • Last checked: {new Date(check.lastChecked).toLocaleDateString()}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
                          <Chip
                            label={check.status}
                            color={getStatusColor(check.status)}
                            size="small"
                          />
                          <Chip
                            label={check.priority}
                            color={getRiskLevelColor(check.priority)}
                            size="small"
                          />
                        </Box>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2" gutterBottom>
                            Description
                          </Typography>
                          <Typography variant="body2" paragraph>
                            {check.description}
                          </Typography>
                          
                          <Typography variant="subtitle2" gutterBottom>
                            Requirements
                          </Typography>
                          <List dense>
                            {check.requirements.map((req, index) => (
                              <ListItem key={index}>
                                <ListItemText primary={req} />
                              </ListItem>
                            ))}
                          </List>
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                          {check.findings.length > 0 && (
                            <>
                              <Typography variant="subtitle2" gutterBottom>
                                Findings
                              </Typography>
                              <List dense>
                                {check.findings.map((finding, index) => (
                                  <ListItem key={index}>
                                    <ListItemText 
                                      primary={finding}
                                      primaryTypographyProps={{ color: 'error' }}
                                    />
                                  </ListItem>
                                ))}
                              </List>
                            </>
                          )}
                          
                          {check.remediation.length > 0 && (
                            <>
                              <Typography variant="subtitle2" gutterBottom>
                                Remediation Steps
                              </Typography>
                              <List dense>
                                {check.remediation.map((step, index) => (
                                  <ListItem key={index}>
                                    <ListItemText primary={`${index + 1}. ${step}`} />
                                  </ListItem>
                                ))}
                              </List>
                            </>
                          )}
                          
                          <Box sx={{ mt: 2 }}>
                            <Button
                              variant="outlined"
                              onClick={() => handleRunComplianceCheck(check.id)}
                              disabled={check.status === 'PENDING'}
                            >
                              {check.status === 'PENDING' ? 'Running...' : 'Run Check'}
                            </Button>
                          </Box>
                        </Grid>
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            )}

            {/* Reports Tab */}
            {activeTab === 2 && (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                  <Typography variant="h6">
                    Compliance Reports
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={() => handleGenerateComplianceReport('GDPR')}
                    >
                      Generate GDPR Report
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => handleGenerateComplianceReport('SOC2')}
                    >
                      Generate SOC2 Report
                    </Button>
                  </Box>
                </Box>

                <Grid container spacing={2}>
                  {complianceReports.map((report) => (
                    <Grid item xs={12} md={6} lg={4} key={report.id}>
                      <Card>
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                            <Typography variant="h6">
                              {report.name}
                            </Typography>
                            <Chip
                              label={report.status}
                              color={getStatusColor(report.status)}
                              size="small"
                            />
                          </Box>
                          
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {report.type} • Created: {new Date(report.createdAt).toLocaleDateString()}
                          </Typography>
                          
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="body2">
                              Overall Score: {report.overallScore}%
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={report.overallScore}
                              sx={{ mt: 1, mb: 2 }}
                            />
                            
                            <Grid container spacing={1}>
                              <Grid item xs={4}>
                                <Typography variant="caption" color="success.main">
                                  Passed: {report.passedChecks}
                                </Typography>
                              </Grid>
                              <Grid item xs={4}>
                                <Typography variant="caption" color="error.main">
                                  Failed: {report.failedChecks}
                                </Typography>
                              </Grid>
                              <Grid item xs={4}>
                                <Typography variant="caption" color="warning.main">
                                  Warnings: {report.warningChecks}
                                </Typography>
                              </Grid>
                            </Grid>
                          </Box>
                          
                          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<ViewIcon />}
                              onClick={() => {
                                setSelectedReport(report);
                                setReportDialogOpen(true);
                              }}
                            >
                              View
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<DownloadIcon />}
                            >
                              Download
                            </Button>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Report Details Dialog */}
        <Dialog
          open={reportDialogOpen}
          onClose={() => setReportDialogOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            Compliance Report Details
          </DialogTitle>
          <DialogContent>
            {selectedReport && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  {selectedReport.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Type: {selectedReport.type} • Status: {selectedReport.status}
                </Typography>
                
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={3}>
                    <Card variant="outlined">
                      <CardContent sx={{ textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">
                          {selectedReport.overallScore}%
                        </Typography>
                        <Typography variant="caption">
                          Overall Score
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={3}>
                    <Card variant="outlined">
                      <CardContent sx={{ textAlign: 'center' }}>
                        <Typography variant="h4" color="success.main">
                          {selectedReport.passedChecks}
                        </Typography>
                        <Typography variant="caption">
                          Passed
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={3}>
                    <Card variant="outlined">
                      <CardContent sx={{ textAlign: 'center' }}>
                        <Typography variant="h4" color="error.main">
                          {selectedReport.failedChecks}
                        </Typography>
                        <Typography variant="caption">
                          Failed
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={3}>
                    <Card variant="outlined">
                      <CardContent sx={{ textAlign: 'center' }}>
                        <Typography variant="h4" color="warning.main">
                          {selectedReport.warningChecks}
                        </Typography>
                        <Typography variant="caption">
                          Warnings
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReportDialogOpen(false)}>
              Close
            </Button>
            <Button variant="contained" startIcon={<DownloadIcon />}>
              Download Report
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default AuditComplianceManager;
