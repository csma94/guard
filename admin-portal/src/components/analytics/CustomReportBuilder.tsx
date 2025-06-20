import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  TextField,
  Grid,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Preview as PreviewIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  DragIndicator as DragIcon,
} from '@mui/icons-material';
// Temporary fallback for react-beautiful-dnd
let DragDropContext: any, Droppable: any, Draggable: any;
try {
  const dnd = require('react-beautiful-dnd');
  DragDropContext = dnd.DragDropContext;
  Droppable = dnd.Droppable;
  Draggable = dnd.Draggable;
} catch (e) {
  // Fallback components if react-beautiful-dnd is not available
  DragDropContext = ({ children }: any) => children;
  Droppable = ({ children }: any) => children({ droppableProps: {}, innerRef: () => {} });
  Draggable = ({ children }: any) => children({ draggableProps: {}, dragHandleProps: {}, innerRef: () => {} });
}

import { analyticsAPI } from '../../services/api';

interface ReportField {
  id: string;
  name: string;
  type: 'metric' | 'dimension' | 'filter';
  category: string;
  description: string;
}

interface ReportConfig {
  name: string;
  description: string;
  fields: ReportField[];
  filters: any[];
  groupBy: string[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  chartType: 'table' | 'line' | 'bar' | 'pie' | 'area';
  dateRange: {
    type: 'relative' | 'absolute';
    value: string;
    startDate?: Date;
    endDate?: Date;
  };
}

interface CustomReportBuilderProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: ReportConfig) => void;
  initialConfig?: ReportConfig;
}

const CustomReportBuilder: React.FC<CustomReportBuilderProps> = ({
  open,
  onClose,
  onSave,
  initialConfig,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [availableFields, setAvailableFields] = useState<ReportField[]>([]);
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    name: '',
    description: '',
    fields: [],
    filters: [],
    groupBy: [],
    sortBy: '',
    sortOrder: 'desc',
    chartType: 'table',
    dateRange: {
      type: 'relative',
      value: '30d',
    },
  });
  const [previewData, setPreviewData] = useState<any>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  const steps = [
    'Basic Information',
    'Select Fields',
    'Configure Filters',
    'Visualization',
    'Preview & Save',
  ];

  useEffect(() => {
    if (open) {
      loadAvailableFields();
      if (initialConfig) {
        setReportConfig(initialConfig);
      }
    }
  }, [open, initialConfig]);

  const loadAvailableFields = async () => {
    try {
      const response = await analyticsAPI.getAvailableFields();
      setAvailableFields(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to load available fields:', error);
    }
  };

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleFieldAdd = (field: ReportField) => {
    if (!reportConfig.fields.find(f => f.id === field.id)) {
      setReportConfig(prev => ({
        ...prev,
        fields: [...prev.fields, field],
      }));
    }
  };

  const handleFieldRemove = (fieldId: string) => {
    setReportConfig(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== fieldId),
    }));
  };

  const handleFieldReorder = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(reportConfig.fields);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setReportConfig(prev => ({
      ...prev,
      fields: items,
    }));
  };

  const generatePreview = async () => {
    try {
      setIsGeneratingPreview(true);
      const response = await analyticsAPI.generateCustomReport(reportConfig);
      setPreviewData(response.data);
    } catch (error) {
      console.error('Failed to generate preview:', error);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleSave = () => {
    onSave(reportConfig);
    onClose();
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Report Name"
              value={reportConfig.name}
              onChange={(e) => setReportConfig(prev => ({ ...prev, name: e.target.value }))}
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Description"
              value={reportConfig.description}
              onChange={(e) => setReportConfig(prev => ({ ...prev, description: e.target.value }))}
              margin="normal"
              multiline
              rows={3}
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Date Range</InputLabel>
              <Select
                value={reportConfig.dateRange.value}
                onChange={(e) => setReportConfig(prev => ({
                  ...prev,
                  dateRange: { ...prev.dateRange, value: e.target.value },
                }))}
                label="Date Range"
              >
                <MenuItem value="7d">Last 7 days</MenuItem>
                <MenuItem value="30d">Last 30 days</MenuItem>
                <MenuItem value="90d">Last 90 days</MenuItem>
                <MenuItem value="1y">Last year</MenuItem>
                <MenuItem value="custom">Custom range</MenuItem>
              </Select>
            </FormControl>
          </Box>
        );

      case 1:
        return (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Available Fields
                </Typography>
                <List dense>
                  {availableFields.map((field) => (
                    <ListItem key={field.id}>
                      <ListItemText
                        primary={field.name}
                        secondary={field.description}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          onClick={() => handleFieldAdd(field)}
                          disabled={reportConfig.fields.some(f => f.id === field.id)}
                        >
                          <AddIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Selected Fields
                </Typography>
                <DragDropContext onDragEnd={handleFieldReorder}>
                  <Droppable droppableId="selected-fields">
                    {(provided: any) => (
                      <List
                        dense
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        {reportConfig.fields.map((field, index) => (
                          <Draggable key={field.id} draggableId={field.id} index={index}>
                            {(provided: any) => (
                              <ListItem
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                              >
                                <Box {...provided.dragHandleProps}>
                                  <DragIcon />
                                </Box>
                                <ListItemText
                                  primary={field.name}
                                  secondary={field.type}
                                />
                                <ListItemSecondaryAction>
                                  <IconButton
                                    edge="end"
                                    onClick={() => handleFieldRemove(field.id)}
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </ListItemSecondaryAction>
                              </ListItem>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </List>
                    )}
                  </Droppable>
                </DragDropContext>
              </Grid>
            </Grid>
          </Box>
        );

      case 2:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Configure Filters
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={<Checkbox />}
                label="Include only completed shifts"
              />
              <FormControlLabel
                control={<Checkbox />}
                label="Exclude incidents"
              />
              <FormControlLabel
                control={<Checkbox />}
                label="Active agents only"
              />
            </FormGroup>
            <Divider sx={{ my: 2 }} />
            <FormControl fullWidth margin="normal">
              <InputLabel>Group By</InputLabel>
              <Select
                multiple
                value={reportConfig.groupBy}
                onChange={(e) => setReportConfig(prev => ({
                  ...prev,
                  groupBy: typeof e.target.value === 'string' ? [e.target.value] : e.target.value,
                }))}
                label="Group By"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value} />
                    ))}
                  </Box>
                )}
              >
                <MenuItem value="site">Site</MenuItem>
                <MenuItem value="agent">Agent</MenuItem>
                <MenuItem value="client">Client</MenuItem>
                <MenuItem value="date">Date</MenuItem>
                <MenuItem value="shift_type">Shift Type</MenuItem>
              </Select>
            </FormControl>
          </Box>
        );

      case 3:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Visualization Settings
            </Typography>
            <FormControl fullWidth margin="normal">
              <InputLabel>Chart Type</InputLabel>
              <Select
                value={reportConfig.chartType}
                onChange={(e) => setReportConfig(prev => ({
                  ...prev,
                  chartType: e.target.value as any,
                }))}
                label="Chart Type"
              >
                <MenuItem value="table">Table</MenuItem>
                <MenuItem value="line">Line Chart</MenuItem>
                <MenuItem value="bar">Bar Chart</MenuItem>
                <MenuItem value="pie">Pie Chart</MenuItem>
                <MenuItem value="area">Area Chart</MenuItem>
              </Select>
            </FormControl>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Sort By</InputLabel>
                  <Select
                    value={reportConfig.sortBy}
                    onChange={(e) => setReportConfig(prev => ({
                      ...prev,
                      sortBy: e.target.value,
                    }))}
                    label="Sort By"
                  >
                    {reportConfig.fields.map((field) => (
                      <MenuItem key={field.id} value={field.id}>
                        {field.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Sort Order</InputLabel>
                  <Select
                    value={reportConfig.sortOrder}
                    onChange={(e) => setReportConfig(prev => ({
                      ...prev,
                      sortOrder: e.target.value as 'asc' | 'desc',
                    }))}
                    label="Sort Order"
                  >
                    <MenuItem value="asc">Ascending</MenuItem>
                    <MenuItem value="desc">Descending</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        );

      case 4:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Preview & Save
            </Typography>
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  Report Configuration
                </Typography>
                <Typography variant="body2">
                  <strong>Name:</strong> {reportConfig.name}
                </Typography>
                <Typography variant="body2">
                  <strong>Fields:</strong> {reportConfig.fields.length} selected
                </Typography>
                <Typography variant="body2">
                  <strong>Chart Type:</strong> {reportConfig.chartType}
                </Typography>
                <Typography variant="body2">
                  <strong>Date Range:</strong> {reportConfig.dateRange.value}
                </Typography>
              </CardContent>
            </Card>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Button
                variant="outlined"
                startIcon={<PreviewIcon />}
                onClick={generatePreview}
                disabled={isGeneratingPreview}
              >
                {isGeneratingPreview ? 'Generating...' : 'Generate Preview'}
              </Button>
            </Box>
            {previewData && (
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Preview Data
                  </Typography>
                  <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                    <pre>{JSON.stringify(previewData, null, 2)}</pre>
                  </Box>
                </CardContent>
              </Card>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Custom Report Builder</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        {renderStepContent(activeStep)}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
        >
          Back
        </Button>
        {activeStep === steps.length - 1 ? (
          <Button
            variant="contained"
            onClick={handleSave}
            startIcon={<SaveIcon />}
            disabled={!reportConfig.name}
          >
            Save Report
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={activeStep === 0 && !reportConfig.name}
          >
            Next
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CustomReportBuilder;
