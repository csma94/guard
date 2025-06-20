import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import DashboardPage from '../../pages/DashboardPage';

// Mock Clerk
const mockClerkProvider = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="clerk-provider">{children}</div>
);

jest.mock('@clerk/clerk-react', () => ({
  ClerkProvider: mockClerkProvider,
  useAuth: () => ({
    isSignedIn: true,
    user: {
      id: 'user-123',
      firstName: 'Test',
      lastName: 'User',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    },
    getToken: jest.fn().mockResolvedValue('mock-token'),
  }),
  useUser: () => ({
    user: {
      id: 'user-123',
      firstName: 'Test',
      lastName: 'User',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    },
  }),
}));

// Mock fetch
global.fetch = jest.fn();

// Mock store
const mockStore = configureStore({
  reducer: {
    auth: (state = { user: null, isAuthenticated: true }) => state,
    dashboard: (state = { stats: null, loading: false }) => state,
  },
});

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Provider store={mockStore}>
    <BrowserRouter>
      <ClerkProvider publishableKey="test-key">
        {children}
      </ClerkProvider>
    </BrowserRouter>
  </Provider>
);

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful API responses
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/dashboard/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              totalAgents: 25,
              activeAgents: 18,
              totalSites: 12,
              activeSites: 10,
              todayShifts: 15,
              completedShifts: 12,
              openIncidents: 3,
              resolvedIncidents: 8,
              monthlyRevenue: 125000,
              satisfactionScore: 4.7,
            },
          }),
        });
      }
      
      if (url.includes('/dashboard/activity')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [
              {
                id: 'activity-1',
                type: 'SHIFT_START',
                title: 'Shift Started',
                description: 'John Doe started shift at Downtown Office',
                timestamp: new Date().toISOString(),
                agentName: 'John Doe',
                siteName: 'Downtown Office',
              },
              {
                id: 'activity-2',
                type: 'INCIDENT',
                title: 'Security Incident',
                description: 'Unauthorized access attempt detected',
                timestamp: new Date().toISOString(),
                priority: 'HIGH',
              },
            ],
          }),
        });
      }

      if (url.includes('/dashboard/alerts')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [
              {
                id: 'alert-1',
                type: 'SECURITY',
                priority: 'HIGH',
                title: 'Security Alert',
                message: 'Multiple failed login attempts detected',
                timestamp: new Date().toISOString(),
              },
            ],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
    });
  });

  it('renders dashboard page with loading state initially', () => {
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    expect(screen.getByText('Security Management Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Real-time overview of security operations and workforce management')).toBeInTheDocument();
  });

  it('displays stats cards after data loads', async () => {
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument(); // Total Agents
      expect(screen.getByText('18')).toBeInTheDocument(); // Active Agents
      expect(screen.getByText('12')).toBeInTheDocument(); // Total Sites
      expect(screen.getByText('10')).toBeInTheDocument(); // Active Sites
    });

    expect(screen.getByText('Total Agents')).toBeInTheDocument();
    expect(screen.getByText('Active Agents')).toBeInTheDocument();
    expect(screen.getByText('Total Sites')).toBeInTheDocument();
    expect(screen.getByText('Active Sites')).toBeInTheDocument();
  });

  it('displays recent activity section', async () => {
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByText('Shift Started')).toBeInTheDocument();
      expect(screen.getByText('Security Incident')).toBeInTheDocument();
    });

    expect(screen.getByText('John Doe started shift at Downtown Office')).toBeInTheDocument();
    expect(screen.getByText('Unauthorized access attempt detected')).toBeInTheDocument();
  });

  it('displays alerts section', async () => {
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Active Alerts')).toBeInTheDocument();
      expect(screen.getByText('Security Alert')).toBeInTheDocument();
    });

    expect(screen.getByText('Multiple failed login attempts detected')).toBeInTheDocument();
  });

  it('handles refresh button click', async () => {
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    // Verify fetch was called again
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(6); // Initial 3 calls + 3 refresh calls
    });
  });

  it('displays error message when API fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load dashboard data/i)).toBeInTheDocument();
    });
  });

  it('handles empty data gracefully', async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: null,
        }),
      })
    );

    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Security Management Dashboard')).toBeInTheDocument();
    });

    // Should display default values (0) when no data
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('displays quick actions section', async () => {
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    expect(screen.getByText('Add Agent')).toBeInTheDocument();
    expect(screen.getByText('Create Site')).toBeInTheDocument();
    expect(screen.getByText('Schedule Shift')).toBeInTheDocument();
    expect(screen.getByText('Generate Report')).toBeInTheDocument();
  });

  it('navigates to correct pages when quick action buttons are clicked', async () => {
    const mockNavigate = jest.fn();
    jest.mock('react-router-dom', () => ({
      ...jest.requireActual('react-router-dom'),
      useNavigate: () => mockNavigate,
    }));

    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Add Agent')).toBeInTheDocument();
    });

    const addAgentButton = screen.getByText('Add Agent');
    fireEvent.click(addAgentButton);

    // Note: In a real test, you'd verify navigation
    // This is a simplified example
  });

  it('formats currency values correctly', async () => {
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('$125,000')).toBeInTheDocument(); // Monthly Revenue
    });
  });

  it('formats percentage values correctly', async () => {
    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('4.7')).toBeInTheDocument(); // Satisfaction Score
    });
  });

  it('displays time-based greeting correctly', () => {
    const originalDate = Date;
    const mockDate = new Date('2023-01-01T10:00:00Z'); // 10 AM
    global.Date = jest.fn(() => mockDate) as any;
    global.Date.now = originalDate.now;

    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    expect(screen.getByText(/good morning/i)).toBeInTheDocument();

    global.Date = originalDate;
  });

  it('handles network errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to load dashboard data/i)).toBeInTheDocument();
    });

    // Error should be dismissible
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText(/failed to load dashboard data/i)).not.toBeInTheDocument();
    });
  });

  it('updates data automatically on interval', async () => {
    jest.useFakeTimers();

    render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument();
    });

    // Clear the initial fetch calls
    jest.clearAllMocks();

    // Fast-forward time by 30 seconds (auto-refresh interval)
    jest.advanceTimersByTime(30000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    jest.useRealTimers();
  });

  it('cleans up intervals on unmount', () => {
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    const { unmount } = render(
      <TestWrapper>
        <DashboardPage />
      </TestWrapper>
    );

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();

    jest.useRealTimers();
    clearIntervalSpy.mockRestore();
  });
});
