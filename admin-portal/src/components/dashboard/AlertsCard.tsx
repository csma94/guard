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
  IconButton,
  CircularProgress,
  Alert as MuiAlert,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { monitoringAPI } from '../../services/api';

interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  dismissible?: boolean;
}

interface AlertsCardProps {
  alerts?: Alert[];
  onDismiss?: (alertId: string) => void;
  maxItems?: number;
}

const AlertsCard: React.FC<AlertsCardProps> = ({
  alerts: propAlerts,
  onDismiss,
  maxItems = 5,
}) => {
  const [alerts, setAlerts] = useState<Alert[]>(propAlerts || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propAlerts || propAlerts.length === 0) {
      loadAlerts();
    }
  }, [propAlerts]);

  const loadAlerts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await monitoringAPI.getAlerts({ limit: maxItems, active: true });

      // Transform monitoring alerts to alert items
      const alertsData = Array.isArray(response.data) ? response.data : [];
      const alertItems = alertsData.map((alert: any) => ({
        id: alert.id,
        type: getAlertType(alert.severity),
        title: alert.title || alert.type,
        message: alert.message || alert.description,
        timestamp: new Date(alert.createdAt).toLocaleString(),
        dismissible: alert.dismissible !== false,
      }));

      setAlerts(alertItems);
    } catch (err) {
      console.error('Failed to load alerts:', err);
      setError('Failed to load alerts');
    } finally {
      setIsLoading(false);
    }
  };

  const getAlertType = (severity: string): Alert['type'] => {
    switch (severity?.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
      case 'info':
        return 'info';
      default:
        return 'info';
    }
  };

  const handleDismiss = async (alertId: string) => {
    if (onDismiss) {
      onDismiss(alertId);
    }
    // Remove from local state
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <ErrorIcon sx={{ color: 'error.main' }} />;
      case 'warning':
        return <WarningIcon sx={{ color: 'warning.main' }} />;
      case 'info':
        return <InfoIcon sx={{ color: 'info.main' }} />;
      default:
        return <InfoIcon sx={{ color: 'grey.500' }} />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'default';
    }
  };

  const displayAlerts = alerts.slice(0, maxItems);

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="System Alerts"
        titleTypographyProps={{ variant: 'h6' }}
        action={
          alerts.length > 0 && (
            <Chip
              label={`${alerts.length} alert${alerts.length !== 1 ? 's' : ''}`}
              color={alerts.some(a => a.type === 'error') ? 'error' : 'warning'}
              variant="outlined"
              size="small"
            />
          )
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
          <MuiAlert severity="error" sx={{ mb: 2 }}>
            {error}
          </MuiAlert>
        )}

        {/* Content */}
        {!isLoading && !error && (
          <>
            {displayAlerts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No active alerts
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {displayAlerts.map((alert, index) => (
              <ListItem
                key={alert.id}
                divider={index < displayAlerts.length - 1}
                sx={{ px: 0 }}
                secondaryAction={
                  alert.dismissible && onDismiss && (
                    <IconButton
                      edge="end"
                      aria-label="dismiss"
                      size="small"
                      onClick={() => handleDismiss(alert.id)}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )
                }
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  {getAlertIcon(alert.type)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2">
                        {alert.title}
                      </Typography>
                      <Chip
                        label={alert.type}
                        size="small"
                        color={getAlertColor(alert.type) as any}
                        variant="outlined"
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {alert.message}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {alert.timestamp}
                      </Typography>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
        </>
        )}
      </CardContent>
    </Card>
  );
};

export default AlertsCard;
