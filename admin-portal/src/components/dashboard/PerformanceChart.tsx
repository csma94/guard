import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { analyticsAPI } from '../../services/api';

interface PerformanceData {
  time: string;
  responseTime: number;
  throughput: number;
  errorRate: number;
}

interface PerformanceChartProps {
  data?: PerformanceData[];
  height?: number;
}

const PerformanceChart: React.FC<PerformanceChartProps> = ({
  data: propData,
  height = 300,
}) => {
  const [data, setData] = useState<PerformanceData[]>(propData || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propData || propData.length === 0) {
      loadPerformanceData();
    }
  }, [propData]);

  const loadPerformanceData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await analyticsAPI.getRealtimeMetrics();
      const performanceData = Array.isArray(response.data) ? response.data : [];
      setData(performanceData);
    } catch (err) {
      console.error('Failed to load performance data:', err);
      setError('Failed to load performance data');
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title="Performance Metrics"
        titleTypographyProps={{ variant: 'h6' }}
        subheader="Response time and throughput over time"
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

        {/* Chart Content */}
        {!isLoading && !error && (
          <>
            <Box sx={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: '#e0e0e0' }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickLine={{ stroke: '#e0e0e0' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                }}
              />
              <Line
                type="monotone"
                dataKey="responseTime"
                stroke="#1976d2"
                strokeWidth={2}
                dot={{ fill: '#1976d2', strokeWidth: 2, r: 4 }}
                name="Response Time (ms)"
              />
              <Line
                type="monotone"
                dataKey="throughput"
                stroke="#4caf50"
                strokeWidth={2}
                dot={{ fill: '#4caf50', strokeWidth: 2, r: 4 }}
                name="Throughput (req/min)"
              />
              <Line
                type="monotone"
                dataKey="errorRate"
                stroke="#f44336"
                strokeWidth={2}
                dot={{ fill: '#f44336', strokeWidth: 2, r: 4 }}
                name="Error Rate (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" color="primary">
              {data[data.length - 1]?.responseTime || 0}ms
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Avg Response Time
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: '#4caf50' }}>
              {data[data.length - 1]?.throughput || 0}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Requests/min
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ color: '#f44336' }}>
              {data[data.length - 1]?.errorRate || 0}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Error Rate
            </Typography>
          </Box>
        </Box>
        </>
        )}
      </CardContent>
    </Card>
  );
};

export default PerformanceChart;
