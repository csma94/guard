import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Grid,
  Button,
  Box,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Schedule as ScheduleIcon,
  Report as ReportIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}

interface QuickActionsCardProps {
  actions?: QuickAction[];
}

const QuickActionsCard: React.FC<QuickActionsCardProps> = ({
  actions = [
    {
      id: 'add-agent',
      title: 'Add Agent',
      description: 'Register new security agent',
      icon: <AddIcon />,
      color: '#1976d2',
      onClick: () => window.location.href = '/users?action=create',
    },
    {
      id: 'schedule-shift',
      title: 'Schedule Shift',
      description: 'Create new shift assignment',
      icon: <ScheduleIcon />,
      color: '#4caf50',
      onClick: () => window.location.href = '/scheduling?action=create',
    },
    {
      id: 'generate-report',
      title: 'Generate Report',
      description: 'Create performance report',
      icon: <ReportIcon />,
      color: '#ff9800',
      onClick: () => window.location.href = '/analytics?action=report',
    },
    {
      id: 'system-settings',
      title: 'System Settings',
      description: 'Configure system parameters',
      icon: <SettingsIcon />,
      color: '#9c27b0',
      onClick: () => window.location.href = '/settings',
    },
    {
      id: 'send-notification',
      title: 'Send Alert',
      description: 'Broadcast notification',
      icon: <NotificationsIcon />,
      color: '#f44336',
      onClick: () => window.location.href = '/notifications?action=create',
    },
    {
      id: 'security-check',
      title: 'Security Check',
      description: 'Run security audit',
      icon: <SecurityIcon />,
      color: '#607d8b',
      onClick: () => window.location.href = '/audit?action=check',
    },
  ],
}) => {
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="Quick Actions"
        titleTypographyProps={{ variant: 'h6' }}
        subheader="Common administrative tasks"
      />
      <CardContent>
        <Grid container spacing={2}>
          {actions.map((action) => (
            <Grid item xs={12} sm={6} key={action.id}>
              <Button
                fullWidth
                variant="outlined"
                onClick={action.onClick}
                sx={{
                  height: 80,
                  flexDirection: 'column',
                  gap: 1,
                  borderColor: action.color,
                  color: action.color,
                  '&:hover': {
                    borderColor: action.color,
                    backgroundColor: `${action.color}10`,
                  },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: `${action.color}20`,
                    color: action.color,
                  }}
                >
                  {action.icon}
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ color: action.color, fontWeight: 600 }}
                  >
                    {action.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', display: 'block' }}
                  >
                    {action.description}
                  </Typography>
                </Box>
              </Button>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );
};

export default QuickActionsCard;
