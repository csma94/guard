import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Container,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { useAuth } from './hooks/useAuth';

// Import layout components
import Sidebar from './components/layout/Sidebar';

// Import pages and components
import DashboardPage from './pages/dashboard/DashboardPage';
import SettingsPage from './pages/settings/SettingsPage';
import LiveTrackingPage from './pages/operations/LiveTrackingPage';
import IncidentResponsePage from './pages/operations/IncidentResponsePage';
import CommunicationCenterPage from './pages/operations/CommunicationCenterPage';
import AgentManagementPage from './pages/workforce/AgentManagementPage';
import PerformanceTrackingPage from './pages/workforce/PerformanceTrackingPage';
import TrainingManagementPage from './pages/workforce/TrainingManagementPage';
import WorkforceAnalyticsPage from './pages/workforce/WorkforceAnalyticsPage';
import AttendanceManagementPage from './pages/workforce/AttendanceManagementPage';
import SitesOverviewPage from './pages/sites/SitesOverviewPage';
import GeofencingManagementPage from './pages/sites/GeofencingManagementPage';
import ClientOverviewPage from './pages/clients/ClientOverviewPage';
import BillingInvoicingPage from './pages/clients/BillingInvoicingPage';
import AnalyticsDashboardPage from './pages/reports/AnalyticsDashboardPage';
import CustomReportsPage from './pages/reports/CustomReportsPage';
import SystemSettingsPage from './pages/admin/SystemSettingsPage';
import AuditLogsPage from './pages/admin/AuditLogsPage';
import NotificationsCenterPage from './pages/core/NotificationsCenterPage';
import ProfileManagementPage from './pages/core/ProfileManagementPage';
import UserManagement from './components/admin/UserManagement';
import ShiftScheduler from './components/scheduling/ShiftScheduler';

// Layout component for authenticated users
const AuthenticatedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const handleSidebarToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        variant={isMobile ? 'temporary' : 'persistent'}
      />

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          transition: theme.transitions.create(['margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          marginLeft: isMobile ? 0 : sidebarOpen ? 0 : `-280px`,
        }}
      >
        {/* Mobile Menu Button - Only show on mobile when sidebar is closed */}
        {isMobile && !sidebarOpen && (
          <Box
            sx={{
              position: 'fixed',
              top: 16,
              left: 16,
              zIndex: theme.zIndex.drawer + 1,
            }}
          >
            <IconButton
              color="primary"
              aria-label="toggle sidebar"
              onClick={handleSidebarToggle}
              sx={{
                backgroundColor: 'background.paper',
                boxShadow: 2,
                '&:hover': {
                  backgroundColor: 'background.paper',
                },
              }}
            >
              <MenuIcon />
            </IconButton>
          </Box>
        )}

        {/* Page content */}
        <Box
          sx={{
            flexGrow: 1,
            backgroundColor: 'background.default',
            minHeight: '100vh',
            p: 0,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Main Application Component
 * Uses useAuth hook for authentication state management
 */
const App: React.FC = () => {
  const { isLoaded, isAuthenticated } = useAuth();

  // Show loading spinner while Clerk is initializing
  if (!isLoaded) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Routes>
      {/* Protected routes - only accessible when signed in */}
      <Route
        path="/dashboard"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <DashboardPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      {/* Operations Routes */}
      <Route
        path="/operations/tracking"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <LiveTrackingPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/operations/shifts"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <ShiftScheduler />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/operations/incidents"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <IncidentResponsePage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/operations/communication"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <CommunicationCenterPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/workforce/agents"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <AgentManagementPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/workforce/performance"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <PerformanceTrackingPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/workforce/training"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <TrainingManagementPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/workforce/analytics"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <WorkforceAnalyticsPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/workforce/attendance"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <AttendanceManagementPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/sites/overview"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <SitesOverviewPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/sites/geofencing"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <GeofencingManagementPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/clients/overview"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <ClientOverviewPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/clients/billing"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <BillingInvoicingPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/reports/analytics"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <AnalyticsDashboardPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/reports/custom"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <CustomReportsPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/admin/settings"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <SystemSettingsPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/admin/audit"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <AuditLogsPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/notifications"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <NotificationsCenterPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      <Route
        path="/profile"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <ProfileManagementPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin/users"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <UserManagement />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      {/* Settings Route */}
      <Route
        path="/settings"
        element={
          isAuthenticated ? (
            <AuthenticatedLayout>
              <SettingsPage />
            </AuthenticatedLayout>
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      {/* Sign-in page */}
      <Route
        path="/sign-in/*"
        element={
          !isAuthenticated ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                backgroundColor: 'background.default',
              }}
            >
              <Container maxWidth="sm">
                <Card>
                  <CardContent sx={{ p: 4 }}>
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                      <SecurityIcon
                        sx={{
                          fontSize: 60,
                          color: 'primary.main',
                          mb: 2
                        }}
                      />
                      <Typography variant="h4" gutterBottom>
                        BahinLink
                      </Typography>
                      <Typography variant="subtitle1" color="text.secondary">
                        Security Workforce Management
                      </Typography>
                    </Box>
                    <SignIn
                      routing="path"
                      path="/sign-in"
                      signUpUrl="/sign-up"
                    />
                  </CardContent>
                </Card>
              </Container>
            </Box>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />

      {/* Sign-up page */}
      <Route
        path="/sign-up/*"
        element={
          !isAuthenticated ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                backgroundColor: 'background.default',
              }}
            >
              <Container maxWidth="sm">
                <Card>
                  <CardContent sx={{ p: 4 }}>
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                      <SecurityIcon
                        sx={{
                          fontSize: 60,
                          color: 'primary.main',
                          mb: 2
                        }}
                      />
                      <Typography variant="h4" gutterBottom>
                        BahinLink
                      </Typography>
                      <Typography variant="subtitle1" color="text.secondary">
                        Security Workforce Management
                      </Typography>
                    </Box>
                    <SignUp
                      routing="path"
                      path="/sign-up"
                      signInUrl="/sign-in"
                    />
                  </CardContent>
                </Card>
              </Container>
            </Box>
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />

      {/* Default redirects */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />

      {/* Catch-all redirect */}
      <Route
        path="*"
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />
    </Routes>
  );
};

export default App;
