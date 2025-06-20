import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  Chip,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Person as PersonIcon,
  Security as SecurityIcon,
  Report as ReportIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { auditAPI } from '../../services/api';

interface ActivityItem {
  id: string;
  type: 'user' | 'security' | 'report' | 'schedule';
  title: string;
  description: string;
  timestamp: string;
  status?: 'success' | 'warning' | 'error' | 'info';
}

interface RecentActivityCardProps {
  activities?: ActivityItem[];
  maxItems?: number;
}

const RecentActivityCard: React.FC<RecentActivityCardProps> = ({
  activities: propActivities,
  maxItems = 5,
}) => {
  const [activities, setActivities] = useState<ActivityItem[]>(propActivities || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propActivities || propActivities.length === 0) {
      loadRecentActivity();
    }
  }, [propActivities]);

  const loadRecentActivity = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await auditAPI.getLogs({ limit: maxItems, sortBy: 'createdAt', sortOrder: 'desc' });

      // Transform audit logs to activity items
      const logsData = Array.isArray(response.data) ? response.data : [];
      const activityItems = logsData.map((log: any) => ({
        id: log.id,
        type: getActivityType(log.action),
        title: log.action.replace('_', ' ').toLowerCase().replace(/\b\w/g, (l: string) => l.toUpperCase()),
        description: log.details || `${log.action} performed by ${log.user?.username || 'System'}`,
        timestamp: new Date(log.createdAt).toLocaleString(),
        status: (log.success ? 'success' : 'error') as 'success' | 'warning' | 'error' | 'info',
      }));

      setActivities(activityItems);
    } catch (err) {
      console.error('Failed to load recent activity:', err);
      setError('Failed to load recent activity');
    } finally {
      setIsLoading(false);
    }
  };

  const getActivityType = (action: string): ActivityItem['type'] => {
    if (action.includes('USER') || action.includes('LOGIN')) return 'user';
    if (action.includes('SECURITY') || action.includes('ALERT')) return 'security';
    if (action.includes('REPORT') || action.includes('EXPORT')) return 'report';
    if (action.includes('SCHEDULE') || action.includes('SHIFT')) return 'schedule';
    return 'user';
  };
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <PersonIcon />;
      case 'security':
        return <SecurityIcon />;
      case 'report':
        return <ReportIcon />;
      case 'schedule':
        return <ScheduleIcon />;
      default:
        return <SecurityIcon />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'user':
        return '#2196f3';
      case 'security':
        return '#f44336';
      case 'report':
        return '#ff9800';
      case 'schedule':
        return '#4caf50';
      default:
        return '#9e9e9e';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'success':
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

  const displayActivities = activities.slice(0, maxItems);

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="Recent Activity"
        titleTypographyProps={{ variant: 'h6' }}
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

        {/* Content */}
        {!isLoading && !error && (
          <>
            {displayActivities.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No recent activity
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {displayActivities.map((activity, index) => (
              <ListItem
                key={activity.id}
                divider={index < displayActivities.length - 1}
                sx={{ px: 0 }}
              >
                <ListItemAvatar>
                  <Avatar
                    sx={{
                      bgcolor: getActivityColor(activity.type),
                      width: 40,
                      height: 40,
                    }}
                  >
                    {getActivityIcon(activity.type)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2">
                        {activity.title}
                      </Typography>
                      {activity.status && (
                        <Chip
                          label={activity.status}
                          size="small"
                          color={getStatusColor(activity.status) as any}
                          variant="outlined"
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {activity.description}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {activity.timestamp}
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

export default RecentActivityCard;
