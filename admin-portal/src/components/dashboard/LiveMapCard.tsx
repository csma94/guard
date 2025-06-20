import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  Chip,
  Avatar,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  LocationOn as LocationIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { monitoringAPI } from '../../services/api';

interface AgentLocation {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'break';
  latitude: number;
  longitude: number;
  lastUpdate: string;
}

interface LiveMapCardProps {
  agents?: AgentLocation[];
  height?: number;
}

const LiveMapCard: React.FC<LiveMapCardProps> = ({
  agents: propAgents,
  height = 400,
}) => {
  const [agents, setAgents] = useState<AgentLocation[]>(propAgents || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propAgents || propAgents.length === 0) {
      loadAgentLocations();
    }
  }, [propAgents]);

  const loadAgentLocations = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await monitoringAPI.getAgentLocations();
      const agentsData = Array.isArray(response.data) ? response.data : [];
      setAgents(agentsData);
    } catch (err) {
      console.error('Failed to load agent locations:', err);
      setError('Failed to load agent locations');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'error';
      case 'break':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'inactive':
        return 'Inactive';
      case 'break':
        return 'On Break';
      default:
        return 'Unknown';
    }
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="Live Agent Tracking"
        titleTypographyProps={{ variant: 'h6' }}
        subheader={`${agents.length} agents tracked`}
      />
      <CardContent>
        {/* Loading State */}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
            <CircularProgress />
          </Box>
        )}

        {/* Error State */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Map Content */}
        {!isLoading && !error && (
          <>
            {/* Placeholder for map - would integrate with Google Maps or similar */}
            <Box
          sx={{
            height,
            backgroundColor: '#f5f5f5',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 2,
            position: 'relative',
            backgroundImage: 'linear-gradient(45deg, #e8f5e8 25%, transparent 25%), linear-gradient(-45deg, #e8f5e8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e8f5e8 75%), linear-gradient(-45deg, transparent 75%, #e8f5e8 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <LocationIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="h6" color="text.secondary">
              Interactive Map
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Real-time agent locations would be displayed here
            </Typography>
          </Box>

          {/* Simulated agent markers */}
          {agents.slice(0, 3).map((agent, index) => (
            <Box
              key={agent.id}
              sx={{
                position: 'absolute',
                top: `${20 + index * 30}%`,
                left: `${30 + index * 20}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: getStatusColor(agent.status) === 'success' ? '#4caf50' : 
                           getStatusColor(agent.status) === 'warning' ? '#ff9800' : '#f44336',
                  fontSize: 14,
                }}
              >
                <PersonIcon fontSize="small" />
              </Avatar>
            </Box>
          ))}
        </Box>

        {/* Agent list */}
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Active Agents
          </Typography>
          {agents.map((agent) => (
            <Box
              key={agent.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                py: 1,
                borderBottom: '1px solid #e0e0e0',
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Avatar sx={{ width: 24, height: 24, fontSize: 12 }}>
                  {agent.name.charAt(0)}
                </Avatar>
                <Typography variant="body2">{agent.name}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={getStatusText(agent.status)}
                  size="small"
                  color={getStatusColor(agent.status) as any}
                  variant="outlined"
                />
                <Typography variant="caption" color="text.secondary">
                  {agent.lastUpdate}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
        </>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveMapCard;
