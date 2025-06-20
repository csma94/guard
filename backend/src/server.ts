import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3001",
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
      { id: 2, name: 'Agent User', role: 'agent', email: 'agent@bahinlink.com' }
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
        status: 'scheduled'
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
        coordinates: { latitude: 40.7128, longitude: -74.0060 }
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
        createdAt: new Date().toISOString()
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
      sitesMonitored: 8
    }
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
        permissions: ['users.read', 'users.write', 'shifts.read'],
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

// WebSocket will be added later

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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

export { app, server };
