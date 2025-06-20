import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Typography,
  Chip,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { monitoringAPI } from '../../services/api';

interface SystemService {
  name: string;
  status: 'healthy' | 'warning' | 'error' | 'info';
  description?: string;
  lastChecked?: string;
}

interface SystemStatusCardProps {
  services?: SystemService[];
}

const SystemStatusCard: React.FC<SystemStatusCardProps> = ({
  services: propServices,
}) => {
  const [services, setServices] = useState<SystemService[]>(propServices || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propServices || propServices.length === 0) {
      loadSystemStatus();
    }
  }, [propServices]);

  const loadSystemStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await monitoringAPI.getSystemStatus();
      const servicesData = Array.isArray(response.data) ? response.data : [];
      setServices(servicesData);
    } catch (err) {
      console.error('Failed to load system status:', err);
      setError('Failed to load system status');
    } finally {
      setIsLoading(false);
    }
  };
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon sx={{ color: 'success.main' }} />;
      case 'warning':
        return <WarningIcon sx={{ color: 'warning.main' }} />;
      case 'error':
        return <ErrorIcon sx={{ color: 'error.main' }} />;
      case 'info':
        return <InfoIcon sx={{ color: 'info.main' }} />;
      default:
        return <InfoIcon sx={{ color: 'grey.500' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      case 'info':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'Healthy';
      case 'warning':
        return 'Warning';
      case 'error':
        return 'Error';
      case 'info':
        return 'Info';
      default:
        return 'Unknown';
    }
  };

  const overallStatus = services.some(s => s.status === 'error') 
    ? 'error' 
    : services.some(s => s.status === 'warning') 
    ? 'warning' 
    : 'healthy';

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="System Status"
        titleTypographyProps={{ variant: 'h6' }}
        action={
          <Chip
            label={getStatusText(overallStatus)}
            color={getStatusColor(overallStatus) as any}
            variant="outlined"
          />
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {/* Loading State */}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Services List */}
        {!isLoading && !error && (
          <List disablePadding>
          {services.map((service, index) => (
            <ListItem
              key={service.name}
              divider={index < services.length - 1}
              sx={{ px: 0 }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {getStatusIcon(service.status)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2">
                      {service.name}
                    </Typography>
                    <Chip
                      label={getStatusText(service.status)}
                      size="small"
                      color={getStatusColor(service.status) as any}
                      variant="outlined"
                    />
                  </Box>
                }
                secondary={
                  <Box>
                    {service.description && (
                      <Typography variant="body2" color="text.secondary">
                        {service.description}
                      </Typography>
                    )}
                    {service.lastChecked && (
                      <Typography variant="caption" color="text.secondary">
                        Last checked: {service.lastChecked}
                      </Typography>
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
  );
};

export default SystemStatusCard;
