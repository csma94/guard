import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { Provider } from 'react-redux';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import { store } from './store';
import { useAuth } from './hooks/useAuth';
import { SocketProvider } from './providers/SocketProvider';
import { NotificationProvider } from './providers/NotificationProvider';

// Components
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import LoadingScreen from './components/common/LoadingScreen';

// Pages
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import ServiceRequestsPage from './pages/ServiceRequestsPage';
import IncidentsPage from './pages/IncidentsPage';
import BillingPage from './pages/BillingPage';
import SettingsPage from './pages/SettingsPage';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#dc004e',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          borderRadius: 12,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
  },
});

const AuthenticatedApp: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const handleSidebarToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <SocketProvider>
      <NotificationProvider>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          <Navbar onMenuClick={handleSidebarToggle} />
          <Sidebar open={sidebarOpen} onToggle={handleSidebarToggle} />
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              p: 3,
              mt: 8, // Account for navbar height
              ml: sidebarOpen ? '240px' : '60px',
              transition: 'margin-left 0.3s ease',
            }}
          >
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/service-requests" element={<ServiceRequestsPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Box>
        </Box>
      </NotificationProvider>
    </SocketProvider>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="*" element={<div>Please sign in using Clerk authentication</div>} />
      </Routes>
    );
  }

  return <AuthenticatedApp />;
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <CssBaseline />
          <Router>
            <AppContent />
          </Router>
        </LocalizationProvider>
      </ThemeProvider>
    </Provider>
  );
};

export default App;
