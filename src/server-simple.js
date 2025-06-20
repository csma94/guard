const express = require('express');
const cors = require('cors');
const { createServer } = require('http');

// Load environment variables
require('dotenv').config();

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || ["http://localhost:3001", "http://localhost:3002"],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// API routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    services: {
      database: 'healthy',
      redis: 'healthy',
      websocket: 'healthy'
    },
    timestamp: new Date().toISOString()
  });
});

// Basic API endpoints for testing
app.get('/api/users', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'Admin User', role: 'admin', email: 'admin@bahinlink.com' },
      { id: 2, name: 'Agent User', role: 'agent', email: 'agent@bahinlink.com' },
      { id: 3, name: 'Supervisor', role: 'supervisor', email: 'supervisor@bahinlink.com' }
    ]
  });
});

app.get('/api/shifts', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        agentId: 2,
        siteId: 1,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        status: 'scheduled',
        type: 'regular'
      },
      {
        id: 2,
        agentId: 2,
        siteId: 2,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString(),
        status: 'scheduled',
        type: 'overtime'
      }
    ]
  });
});

app.get('/api/sites', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        name: 'Downtown Office Complex',
        address: '123 Business St, City, State 12345',
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
        status: 'active'
      },
      {
        id: 2,
        name: 'Shopping Mall Security',
        address: '456 Mall Ave, City, State 12345',
        coordinates: { latitude: 40.7589, longitude: -73.9851 },
        status: 'active'
      }
    ]
  });
});

app.get('/api/reports', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        type: 'incident',
        title: 'Security Check',
        content: 'All clear during patrol',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        agentId: 2,
        siteId: 1
      },
      {
        id: 2,
        type: 'maintenance',
        title: 'Door Lock Issue',
        content: 'Main entrance lock needs repair',
        priority: 'high',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        agentId: 2,
        siteId: 1
      }
    ]
  });
});

app.get('/api/analytics/dashboard', (req, res) => {
  res.json({
    success: true,
    data: {
      activeShifts: 5,
      totalAgents: 12,
      incidentsToday: 2,
      sitesMonitored: 8,
      completionRate: 95.5,
      responseTime: 4.2
    }
  });
});

app.get('/api/agents', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 1,
        userId: 2,
        employeeId: 'EMP001',
        status: 'active',
        currentLocation: { latitude: 40.7128, longitude: -74.0060 },
        lastSeen: new Date().toISOString()
      },
      {
        id: 2,
        userId: 3,
        employeeId: 'EMP002',
        status: 'on_shift',
        currentLocation: { latitude: 40.7589, longitude: -73.9851 },
        lastSeen: new Date().toISOString()
      }
    ]
  });
});

// Authentication handled by Clerk - no custom auth endpoints needed

app.get('/api/auth/me', (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: 1,
        email: 'admin@bahinlink.com',
        username: 'admin',
        role: 'admin',
        permissions: ['users.read', 'users.write', 'shifts.read', 'shifts.write', 'reports.read'],
        profile: {
          firstName: 'Admin',
          lastName: 'User',
          avatar: null
        },
        lastLoginAt: new Date().toISOString(),
        isActive: true
      }
    }
  });
});

// CRUD operations for shifts
app.post('/api/shifts', (req, res) => {
  const newShift = {
    id: Date.now(),
    ...req.body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  res.status(201).json({
    success: true,
    data: newShift
  });
});

app.put('/api/shifts/:id', (req, res) => {
  const { id } = req.params;
  const updatedShift = {
    id: parseInt(id),
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  
  res.json({
    success: true,
    data: updatedShift
  });
});

app.delete('/api/shifts/:id', (req, res) => {
  const { id } = req.params;
  
  res.json({
    success: true,
    message: `Shift ${id} deleted successfully`
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal server error occurred'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 BahinLink Backend API is running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 API endpoints: http://localhost:${PORT}/api`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎯 CORS enabled for: ${process.env.CORS_ORIGIN || 'http://localhost:3001, http://localhost:3002'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server };
