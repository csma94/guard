import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import Dashboard from '../../components/Dashboard/Dashboard';
import { theme } from '../../theme';
import authSlice from '../../store/slices/authSlice';
import dashboardSlice from '../../store/slices/dashboardSlice';

// Mock API calls
jest.mock('../../services/api', () => ({
  dashboardAPI: {
    getStats: jest.fn(),
    getRecentActivity: jest.fn(),
    getAlerts: jest.fn(),
  },
}));

const mockStore = configureStore({
  reducer: {
    auth: authSlice,
    dashboard: dashboardSlice,
  },
  preloadedState: {
    auth: {
      isAuthenticated: true,
      user: {
        id: '1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
      },
      token: 'mock-token',
      loading: false,
      error: null,
    },
    dashboard: {
      stats: {
        totalAgents: 25,
        activeShifts: 12,
        openIncidents: 3,
        completedReports: 45,
      },
      recentActivity: [],
      alerts: [],
      loading: false,
      error: null,
    },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <Provider store={mockStore}>
      <BrowserRouter>
        <ThemeProvider theme={theme}>
          {component}
        </ThemeProvider>
      </BrowserRouter>
    </Provider>
  );
};

describe('Dashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dashboard with stats cards', async () => {
    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Total Agents')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('Active Shifts')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('Open Incidents')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Completed Reports')).toBeInTheDocument();
      expect(screen.getByText('45')).toBeInTheDocument();
    });
  });

  it('displays loading state initially', () => {
    const loadingStore = configureStore({
      reducer: {
        auth: authSlice,
        dashboard: dashboardSlice,
      },
      preloadedState: {
        auth: {
          isAuthenticated: true,
          user: {
            id: '1',
            email: 'admin@test.com',
            firstName: 'Admin',
            lastName: 'User',
            role: 'ADMIN',
          },
          token: 'mock-token',
          loading: false,
          error: null,
        },
        dashboard: {
          stats: null,
          recentActivity: [],
          alerts: [],
          loading: true,
          error: null,
        },
      },
    });

    render(
      <Provider store={loadingStore}>
        <BrowserRouter>
          <ThemeProvider theme={theme}>
            <Dashboard />
          </ThemeProvider>
        </BrowserRouter>
      </Provider>
    );

    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
  });

  it('displays error state when data fails to load', () => {
    const errorStore = configureStore({
      reducer: {
        auth: authSlice,
        dashboard: dashboardSlice,
      },
      preloadedState: {
        auth: {
          isAuthenticated: true,
          user: {
            id: '1',
            email: 'admin@test.com',
            firstName: 'Admin',
            lastName: 'User',
            role: 'ADMIN',
          },
          token: 'mock-token',
          loading: false,
          error: null,
        },
        dashboard: {
          stats: null,
          recentActivity: [],
          alerts: [],
          loading: false,
          error: 'Failed to load dashboard data',
        },
      },
    });

    render(
      <Provider store={errorStore}>
        <BrowserRouter>
          <ThemeProvider theme={theme}>
            <Dashboard />
          </ThemeProvider>
        </BrowserRouter>
      </Provider>
    );

    expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument();
  });

  it('handles refresh button click', async () => {
    const { dashboardAPI } = require('../../services/api');
    dashboardAPI.getStats.mockResolvedValue({
      data: {
        totalAgents: 30,
        activeShifts: 15,
        openIncidents: 2,
        completedReports: 50,
      },
    });

    renderWithProviders(<Dashboard />);

    const refreshButton = screen.getByLabelText('refresh');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(dashboardAPI.getStats).toHaveBeenCalled();
    });
  });

  it('displays recent activity when available', async () => {
    const storeWithActivity = configureStore({
      reducer: {
        auth: authSlice,
        dashboard: dashboardSlice,
      },
      preloadedState: {
        auth: {
          isAuthenticated: true,
          user: {
            id: '1',
            email: 'admin@test.com',
            firstName: 'Admin',
            lastName: 'User',
            role: 'ADMIN',
          },
          token: 'mock-token',
          loading: false,
          error: null,
        },
        dashboard: {
          stats: {
            totalAgents: 25,
            activeShifts: 12,
            openIncidents: 3,
            completedReports: 45,
          },
          recentActivity: [
            {
              id: '1',
              type: 'INCIDENT_CREATED',
              description: 'New incident reported at Site A',
              timestamp: new Date().toISOString(),
              user: 'John Doe',
            },
            {
              id: '2',
              type: 'SHIFT_STARTED',
              description: 'Agent started shift at Site B',
              timestamp: new Date().toISOString(),
              user: 'Jane Smith',
            },
          ],
          alerts: [],
          loading: false,
          error: null,
        },
      },
    });

    render(
      <Provider store={storeWithActivity}>
        <BrowserRouter>
          <ThemeProvider theme={theme}>
            <Dashboard />
          </ThemeProvider>
        </BrowserRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByText('New incident reported at Site A')).toBeInTheDocument();
      expect(screen.getByText('Agent started shift at Site B')).toBeInTheDocument();
    });
  });

  it('displays alerts when available', async () => {
    const storeWithAlerts = configureStore({
      reducer: {
        auth: authSlice,
        dashboard: dashboardSlice,
      },
      preloadedState: {
        auth: {
          isAuthenticated: true,
          user: {
            id: '1',
            email: 'admin@test.com',
            firstName: 'Admin',
            lastName: 'User',
            role: 'ADMIN',
          },
          token: 'mock-token',
          loading: false,
          error: null,
        },
        dashboard: {
          stats: {
            totalAgents: 25,
            activeShifts: 12,
            openIncidents: 3,
            completedReports: 45,
          },
          recentActivity: [],
          alerts: [
            {
              id: '1',
              type: 'WARNING',
              title: 'High Incident Rate',
              message: 'Site A has reported 5 incidents in the last hour',
              timestamp: new Date().toISOString(),
            },
            {
              id: '2',
              type: 'ERROR',
              title: 'Agent Offline',
              message: 'Agent John Doe has been offline for 30 minutes',
              timestamp: new Date().toISOString(),
            },
          ],
          loading: false,
          error: null,
        },
      },
    });

    render(
      <Provider store={storeWithAlerts}>
        <BrowserRouter>
          <ThemeProvider theme={theme}>
            <Dashboard />
          </ThemeProvider>
        </BrowserRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Alerts')).toBeInTheDocument();
      expect(screen.getByText('High Incident Rate')).toBeInTheDocument();
      expect(screen.getByText('Agent Offline')).toBeInTheDocument();
    });
  });

  it('navigates to detailed views when cards are clicked', async () => {
    renderWithProviders(<Dashboard />);

    const agentsCard = screen.getByText('Total Agents').closest('div');
    if (agentsCard) {
      fireEvent.click(agentsCard);
      // Navigation would be tested with router mocking
    }
  });

  it('updates data in real-time', async () => {
    const { dashboardAPI } = require('../../services/api');
    
    // Mock WebSocket or polling updates
    dashboardAPI.getStats.mockResolvedValueOnce({
      data: {
        totalAgents: 25,
        activeShifts: 12,
        openIncidents: 3,
        completedReports: 45,
      },
    }).mockResolvedValueOnce({
      data: {
        totalAgents: 26,
        activeShifts: 13,
        openIncidents: 2,
        completedReports: 46,
      },
    });

    renderWithProviders(<Dashboard />);

    // Simulate real-time update
    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument();
    });

    // Trigger update (this would normally come from WebSocket)
    fireEvent(window, new CustomEvent('dashboard-update'));

    await waitFor(() => {
      expect(screen.getByText('26')).toBeInTheDocument();
    });
  });

  it('handles responsive layout', () => {
    // Mock window resize
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    });

    renderWithProviders(<Dashboard />);

    // Check if mobile layout is applied
    const dashboard = screen.getByTestId('dashboard-container');
    expect(dashboard).toHaveClass('mobile-layout');
  });

  it('displays correct user greeting', () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByText(/Welcome back, Admin/)).toBeInTheDocument();
  });

  it('shows time-based greeting', () => {
    const originalDate = Date;
    const mockDate = new Date('2023-12-07T09:00:00Z');
    global.Date = jest.fn(() => mockDate) as any;
    global.Date.now = originalDate.now;

    renderWithProviders(<Dashboard />);

    expect(screen.getByText(/Good morning/)).toBeInTheDocument();

    global.Date = originalDate;
  });

  it('handles keyboard navigation', () => {
    renderWithProviders(<Dashboard />);

    const firstCard = screen.getByText('Total Agents').closest('div');
    if (firstCard) {
      firstCard.focus();
      fireEvent.keyDown(firstCard, { key: 'Enter' });
      // Test navigation or action
    }
  });

  it('displays accessibility labels', () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByLabelText('Total number of agents')).toBeInTheDocument();
    expect(screen.getByLabelText('Number of active shifts')).toBeInTheDocument();
    expect(screen.getByLabelText('Number of open incidents')).toBeInTheDocument();
    expect(screen.getByLabelText('Number of completed reports')).toBeInTheDocument();
  });
});
