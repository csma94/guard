import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import {
  renderWithProviders,
  createMockShift,
  createMockUser,
  expectElementToBeVisible,
  expectElementToHaveText,
  mockGeolocation,
} from '../../../shared/testing/reactTestUtils';
import ShiftCard from '../ShiftCard';

// Mock the geolocation and API services
jest.mock('../../services/api', () => ({
  shiftsAPI: {
    checkIn: jest.fn(),
    checkOut: jest.fn(),
    updateLocation: jest.fn(),
  },
}));

jest.mock('../../hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    location: { latitude: 40.7128, longitude: -74.0060 },
    error: null,
    loading: false,
  }),
}));

describe('ShiftCard Component', () => {
  const mockUser = createMockUser({ role: 'agent' });
  const defaultProps = {
    shift: createMockShift(),
    onCheckIn: jest.fn(),
    onCheckOut: jest.fn(),
    onViewDetails: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGeolocation({ latitude: 40.7128, longitude: -74.0060 });
  });

  describe('Rendering', () => {
    it('should render shift information correctly', () => {
      const shift = createMockShift({
        site: { name: 'Downtown Office' },
        startTime: '2024-01-01T09:00:00Z',
        endTime: '2024-01-01T17:00:00Z',
        status: 'scheduled',
      });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      expectElementToHaveText(screen.getByTestId('shift-site-name'), 'Downtown Office');
      expectElementToHaveText(screen.getByTestId('shift-time'), '9:00 AM - 5:00 PM');
      expectElementToHaveText(screen.getByTestId('shift-status'), 'Scheduled');
    });

    it('should show check-in button for scheduled shifts', () => {
      const shift = createMockShift({ status: 'scheduled' });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const checkInButton = screen.getByRole('button', { name: /check in/i });
      expectElementToBeVisible(checkInButton);
    });

    it('should show check-out button for active shifts', () => {
      const shift = createMockShift({ status: 'in_progress' });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const checkOutButton = screen.getByRole('button', { name: /check out/i });
      expectElementToBeVisible(checkOutButton);
    });

    it('should show completed status for finished shifts', () => {
      const shift = createMockShift({ status: 'completed' });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      expectElementToHaveText(screen.getByTestId('shift-status'), 'Completed');
      expect(screen.queryByRole('button', { name: /check/i })).not.toBeInTheDocument();
    });

    it('should display shift duration', () => {
      const shift = createMockShift({
        startTime: '2024-01-01T09:00:00Z',
        endTime: '2024-01-01T17:00:00Z',
      });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      expectElementToHaveText(screen.getByTestId('shift-duration'), '8 hours');
    });

    it('should show overtime indicator for long shifts', () => {
      const shift = createMockShift({
        startTime: '2024-01-01T09:00:00Z',
        endTime: '2024-01-01T23:00:00Z', // 14 hours
        shiftType: 'overtime',
      });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const overtimeIndicator = screen.getByTestId('overtime-indicator');
      expectElementToBeVisible(overtimeIndicator);
    });
  });

  describe('Check-in Functionality', () => {
    it('should handle successful check-in', async () => {
      const shift = createMockShift({ status: 'scheduled' });
      const mockCheckIn = jest.fn().mockResolvedValue({ success: true });

      renderWithProviders(
        <ShiftCard {...defaultProps} shift={shift} onCheckIn={mockCheckIn} />,
        {
          initialState: {
            auth: { user: mockUser, isAuthenticated: true },
          },
        }
      );

      const checkInButton = screen.getByRole('button', { name: /check in/i });
      fireEvent.click(checkInButton);

      await waitFor(() => {
        expect(mockCheckIn).toHaveBeenCalledWith(shift.id, {
          latitude: 40.7128,
          longitude: -74.0060,
        });
      });
    });

    it('should show loading state during check-in', async () => {
      const shift = createMockShift({ status: 'scheduled' });
      const mockCheckIn = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      renderWithProviders(
        <ShiftCard {...defaultProps} shift={shift} onCheckIn={mockCheckIn} />,
        {
          initialState: {
            auth: { user: mockUser, isAuthenticated: true },
          },
        }
      );

      const checkInButton = screen.getByRole('button', { name: /check in/i });
      fireEvent.click(checkInButton);

      await waitFor(() => {
        expect(screen.getByText(/checking in/i)).toBeInTheDocument();
      });
    });

    it('should handle check-in errors', async () => {
      const shift = createMockShift({ status: 'scheduled' });
      const mockCheckIn = jest.fn().mockRejectedValue(new Error('Location required'));

      renderWithProviders(
        <ShiftCard {...defaultProps} shift={shift} onCheckIn={mockCheckIn} />,
        {
          initialState: {
            auth: { user: mockUser, isAuthenticated: true },
          },
        }
      );

      const checkInButton = screen.getByRole('button', { name: /check in/i });
      fireEvent.click(checkInButton);

      await waitFor(() => {
        expect(screen.getByText(/location required/i)).toBeInTheDocument();
      });
    });

    it('should validate location before check-in', async () => {
      const shift = createMockShift({ 
        status: 'scheduled',
        site: {
          coordinates: { latitude: 41.0, longitude: -75.0 }, // Far from current location
          geofenceRadius: 100,
        },
      });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const checkInButton = screen.getByRole('button', { name: /check in/i });
      fireEvent.click(checkInButton);

      await waitFor(() => {
        expect(screen.getByText(/outside the designated area/i)).toBeInTheDocument();
      });
    });
  });

  describe('Check-out Functionality', () => {
    it('should handle successful check-out', async () => {
      const shift = createMockShift({ status: 'in_progress' });
      const mockCheckOut = jest.fn().mockResolvedValue({ success: true });

      renderWithProviders(
        <ShiftCard {...defaultProps} shift={shift} onCheckOut={mockCheckOut} />,
        {
          initialState: {
            auth: { user: mockUser, isAuthenticated: true },
          },
        }
      );

      const checkOutButton = screen.getByRole('button', { name: /check out/i });
      fireEvent.click(checkOutButton);

      await waitFor(() => {
        expect(mockCheckOut).toHaveBeenCalledWith(shift.id, {
          latitude: 40.7128,
          longitude: -74.0060,
        });
      });
    });

    it('should show confirmation dialog before check-out', async () => {
      const shift = createMockShift({ status: 'in_progress' });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const checkOutButton = screen.getByRole('button', { name: /check out/i });
      fireEvent.click(checkOutButton);

      await waitFor(() => {
        expect(screen.getByText(/confirm check-out/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      expectElementToBeVisible(confirmButton);
    });

    it('should calculate shift duration on check-out', async () => {
      const shift = createMockShift({ 
        status: 'in_progress',
        actualStartTime: '2024-01-01T09:00:00Z',
      });

      // Mock current time as 5 PM
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T17:00:00Z').getTime());

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const checkOutButton = screen.getByRole('button', { name: /check out/i });
      fireEvent.click(checkOutButton);

      await waitFor(() => {
        expect(screen.getByText(/8 hours worked/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      const shift = createMockShift();

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const card = screen.getByRole('article');
      expect(card).toHaveAttribute('aria-label');
      
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName();
      });
    });

    it('should support keyboard navigation', () => {
      const shift = createMockShift({ status: 'scheduled' });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const checkInButton = screen.getByRole('button', { name: /check in/i });
      
      // Test tab navigation
      checkInButton.focus();
      expect(checkInButton).toHaveFocus();
      
      // Test enter key activation
      fireEvent.keyDown(checkInButton, { key: 'Enter' });
      expect(defaultProps.onCheckIn).toHaveBeenCalled();
    });
  });

  describe('Responsive Design', () => {
    it('should adapt to mobile viewport', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const shift = createMockShift();

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const card = screen.getByTestId('shift-card');
      expect(card).toHaveClass('mobile-layout');
    });

    it('should show condensed information on small screens', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 320,
      });

      const shift = createMockShift();

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      // Should show abbreviated time format on very small screens
      expect(screen.getByTestId('shift-time')).toHaveTextContent(/9AM - 5PM/);
    });
  });

  describe('Real-time Updates', () => {
    it('should update when shift status changes', () => {
      const shift = createMockShift({ status: 'scheduled' });

      const { rerender } = renderWithProviders(
        <ShiftCard {...defaultProps} shift={shift} />,
        {
          initialState: {
            auth: { user: mockUser, isAuthenticated: true },
          },
        }
      );

      expect(screen.getByRole('button', { name: /check in/i })).toBeInTheDocument();

      // Update shift status
      const updatedShift = { ...shift, status: 'in_progress' };
      rerender(<ShiftCard {...defaultProps} shift={updatedShift} />);

      expect(screen.getByRole('button', { name: /check out/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
    });

    it('should show live timer for active shifts', () => {
      const shift = createMockShift({ 
        status: 'in_progress',
        actualStartTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const timer = screen.getByTestId('shift-timer');
      expectElementToBeVisible(timer);
      expect(timer).toHaveTextContent(/2:00/); // 2 hours elapsed
    });
  });

  describe('Error Handling', () => {
    it('should handle missing shift data gracefully', () => {
      const incompleteShift = {
        id: 'shift-1',
        // Missing required fields
      };

      renderWithProviders(
        <ShiftCard {...defaultProps} shift={incompleteShift as any} />,
        {
          initialState: {
            auth: { user: mockUser, isAuthenticated: true },
          },
        }
      );

      // Should render without crashing
      expect(screen.getByTestId('shift-card')).toBeInTheDocument();
      expect(screen.getByText(/unknown site/i)).toBeInTheDocument();
    });

    it('should handle geolocation errors', async () => {
      // Mock geolocation error
      const mockGeolocationError = {
        getCurrentPosition: jest.fn().mockImplementation((success, error) =>
          error({ code: 1, message: 'Permission denied' })
        ),
      };
      
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocationError,
      });

      const shift = createMockShift({ status: 'scheduled' });

      renderWithProviders(<ShiftCard {...defaultProps} shift={shift} />, {
        initialState: {
          auth: { user: mockUser, isAuthenticated: true },
        },
      });

      const checkInButton = screen.getByRole('button', { name: /check in/i });
      fireEvent.click(checkInButton);

      await waitFor(() => {
        expect(screen.getByText(/location permission required/i)).toBeInTheDocument();
      });
    });
  });
});
