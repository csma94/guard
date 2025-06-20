import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Avatar,
  Chip,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeType?: 'increase' | 'decrease';
  icon?: React.ReactNode;
  color?: string;
  subtitle?: string;
  trend?: number; // Add trend prop for compatibility
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  changeType,
  icon,
  color = '#1976d2',
  subtitle,
  trend,
}) => {
  // Use trend if provided, otherwise use change
  const actualChange = trend !== undefined ? trend : change;
  const getTrendIcon = () => {
    if (actualChange === undefined) return null;

    const isIncrease = changeType === 'increase' || (changeType === undefined && actualChange > 0);
    return isIncrease ? (
      <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
    ) : (
      <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
    );
  };

  const getTrendColor = () => {
    if (actualChange === undefined) return 'text.secondary';
    const isIncrease = changeType === 'increase' || (changeType === undefined && actualChange > 0);
    return isIncrease ? 'success.main' : 'error.main';
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          {icon && (
            <Avatar
              sx={{
                bgcolor: color,
                width: 48,
                height: 48,
                mr: 2,
              }}
            >
              {icon}
            </Avatar>
          )}
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="div" gutterBottom>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>

        <Typography variant="h4" component="div" sx={{ mb: 1 }}>
          {value}
        </Typography>

        {actualChange !== undefined && (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {getTrendIcon()}
            <Typography
              variant="body2"
              sx={{ color: getTrendColor(), ml: 0.5 }}
            >
              {Math.abs(actualChange)}%
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              vs last period
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default MetricCard;
