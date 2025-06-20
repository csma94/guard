import React, { ReactElement } from 'react';
import { render, RenderOptions, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { createTheme } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';

// Mock store configuration
export const createMockStore = (initialState: any = {}) => {
  return configureStore({
    reducer: {
      auth: (state = { user: null, isAuthenticated: false }, action) => state,
      shifts: (state = { shifts: [], isLoading: false }, action) => state,
      reports: (state = { reports: [], isLoading: false }, action) => state,
      sites: (state = { sites: [], isLoading: false }, action) => state,
      agents: (state = { agents: [], isLoading: false }, action) => state,
      ...initialState,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });
};

// Theme for testing
const testTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

// Custom render function with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialState?: any;
  store?: any;
  route?: string;
}

export const renderWithProviders = (
  ui: ReactElement,
  {
    initialState = {},
    store = createMockStore(initialState),
    route = '/',
    ...renderOptions
  }: CustomRenderOptions = {}
) => {
  // Set initial route
  window.history.pushState({}, 'Test page', route);

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <BrowserRouter>
        <ThemeProvider theme={testTheme}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {children}
          </LocalizationProvider>
        </ThemeProvider>
      </BrowserRouter>
    </Provider>
  );

  return {
    store,
    user: userEvent.setup(),
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
};

// Mock API responses
export const mockApiResponse = (data: any, status: number = 200) => ({
  data,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  headers: {},
  config: {},
});

export const mockApiError = (message: string, status: number = 500) => ({
  response: {
    data: { error: message },
    status,
    statusText: 'Error',
  },
  message,
});

// Common test data factories
export const createMockUser = (overrides: any = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  username: 'testuser',
  role: 'agent',
  permissions: ['shifts.read', 'reports.create'],
  isActive: true,
  profile: {
    firstName: 'Test',
    lastName: 'User',
    avatar: null,
  },
  ...overrides,
});

export const createMockShift = (overrides: any = {}) => ({
  id: 'shift-1',
  agentId: 'agent-1',
  siteId: 'site-1',
  startTime: new Date('2024-01-01T09:00:00Z').toISOString(),
  endTime: new Date('2024-01-01T17:00:00Z').toISOString(),
  status: 'scheduled',
  shiftType: 'regular',
  site: {
    id: 'site-1',
    name: 'Test Site',
    address: '123 Test St',
  },
  agent: {
    id: 'agent-1',
    user: {
      username: 'testagent',
      profile: {
        firstName: 'Test',
        lastName: 'Agent',
      },
    },
  },
  ...overrides,
});

export const createMockReport = (overrides: any = {}) => ({
  id: 'report-1',
  title: 'Test Security Report',
  type: 'patrol',
  agentId: 'agent-1',
  siteId: 'site-1',
  shiftId: 'shift-1',
  content: 'Test report content',
  status: 'submitted',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const createMockSite = (overrides: any = {}) => ({
  id: 'site-1',
  name: 'Test Security Site',
  address: '123 Test Street, Test City',
  clientId: 'client-1',
  coordinates: {
    latitude: 40.7128,
    longitude: -74.0060,
  },
  isActive: true,
  ...overrides,
});

// Custom matchers and assertions
export const expectElementToBeVisible = (element: HTMLElement) => {
  expect(element).toBeInTheDocument();
  expect(element).toBeVisible();
};

export const expectElementToHaveText = (element: HTMLElement, text: string) => {
  expect(element).toBeInTheDocument();
  expect(element).toHaveTextContent(text);
};

export const expectFormValidationError = async (fieldName: string, errorMessage: string) => {
  await waitFor(() => {
    const errorElement = screen.getByText(errorMessage);
    expect(errorElement).toBeInTheDocument();
  });
};

export const expectLoadingState = () => {
  const loadingElement = screen.getByTestId('loading-spinner') || 
                         screen.getByText(/loading/i) ||
                         screen.getByRole('progressbar');
  expect(loadingElement).toBeInTheDocument();
};

export const expectNoLoadingState = () => {
  const loadingElement = screen.queryByTestId('loading-spinner') || 
                         screen.queryByText(/loading/i) ||
                         screen.queryByRole('progressbar');
  expect(loadingElement).not.toBeInTheDocument();
};

// Form testing utilities
export const fillFormField = async (user: any, fieldName: string, value: string) => {
  const field = screen.getByLabelText(new RegExp(fieldName, 'i'));
  await user.clear(field);
  await user.type(field, value);
};

export const selectFromDropdown = async (user: any, fieldName: string, optionText: string) => {
  const dropdown = screen.getByLabelText(new RegExp(fieldName, 'i'));
  await user.click(dropdown);
  
  const option = await screen.findByText(optionText);
  await user.click(option);
};

export const submitForm = async (user: any, buttonText: string = 'submit') => {
  const submitButton = screen.getByRole('button', { name: new RegExp(buttonText, 'i') });
  await user.click(submitButton);
};

// Table testing utilities
export const expectTableToHaveRows = (expectedCount: number) => {
  const rows = screen.getAllByRole('row');
  // Subtract 1 for header row
  expect(rows.length - 1).toBe(expectedCount);
};

export const expectTableToContainText = (text: string) => {
  const table = screen.getByRole('table');
  expect(table).toHaveTextContent(text);
};

export const clickTableRowAction = async (user: any, rowIndex: number, actionName: string) => {
  const rows = screen.getAllByRole('row');
  const targetRow = rows[rowIndex + 1]; // +1 to skip header
  
  const actionButton = within(targetRow).getByRole('button', { 
    name: new RegExp(actionName, 'i') 
  });
  await user.click(actionButton);
};

// Navigation testing utilities
export const expectCurrentRoute = (expectedPath: string) => {
  expect(window.location.pathname).toBe(expectedPath);
};

export const navigateToRoute = (path: string) => {
  window.history.pushState({}, 'Test page', path);
};

// Modal/Dialog testing utilities
export const expectModalToBeOpen = (modalTitle: string) => {
  const modal = screen.getByRole('dialog');
  expect(modal).toBeInTheDocument();
  expect(modal).toHaveTextContent(modalTitle);
};

export const expectModalToBeClosed = () => {
  const modal = screen.queryByRole('dialog');
  expect(modal).not.toBeInTheDocument();
};

export const closeModal = async (user: any) => {
  const closeButton = screen.getByRole('button', { name: /close/i }) ||
                     screen.getByLabelText(/close/i);
  await user.click(closeButton);
};

// API mocking utilities
export const mockSuccessfulApiCall = (apiFunction: any, responseData: any) => {
  return jest.spyOn(apiFunction, 'mockResolvedValue').mockResolvedValue(
    mockApiResponse(responseData)
  );
};

export const mockFailedApiCall = (apiFunction: any, errorMessage: string, status: number = 500) => {
  return jest.spyOn(apiFunction, 'mockRejectedValue').mockRejectedValue(
    mockApiError(errorMessage, status)
  );
};

// Date testing utilities
export const mockCurrentDate = (date: string) => {
  const mockDate = new Date(date);
  jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
  return mockDate;
};

export const restoreDateMock = () => {
  (global.Date as any).mockRestore();
};

// Local storage mocking
export const mockLocalStorage = () => {
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
  
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
  });
  
  return localStorageMock;
};

// WebSocket mocking
export const mockWebSocket = () => {
  const mockSocket = {
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
  };
  
  return mockSocket;
};

// Geolocation mocking
export const mockGeolocation = (coords: { latitude: number; longitude: number }) => {
  const mockGeolocation = {
    getCurrentPosition: jest.fn().mockImplementation((success) =>
      success({
        coords: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: 10,
        },
      })
    ),
    watchPosition: jest.fn(),
    clearWatch: jest.fn(),
  };
  
  Object.defineProperty(navigator, 'geolocation', {
    value: mockGeolocation,
  });
  
  return mockGeolocation;
};

// File upload testing
export const createMockFile = (name: string, size: number, type: string) => {
  const file = new File(['test content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

export const uploadFile = async (user: any, inputTestId: string, file: File) => {
  const input = screen.getByTestId(inputTestId);
  await user.upload(input, file);
};

// Accessibility testing utilities
export const expectElementToBeAccessible = async (element: HTMLElement) => {
  // Check for ARIA attributes
  expect(element).toHaveAttribute('role');
  
  // Check for keyboard navigation
  element.focus();
  expect(element).toHaveFocus();
};

export const expectFormToBeAccessible = async () => {
  const form = screen.getByRole('form') || screen.getByTestId('form');
  
  // Check that all form fields have labels
  const inputs = within(form).getAllByRole('textbox');
  inputs.forEach(input => {
    expect(input).toHaveAccessibleName();
  });
};

// Performance testing utilities
export const measureRenderTime = (renderFunction: () => void) => {
  const start = performance.now();
  renderFunction();
  const end = performance.now();
  return end - start;
};

// Re-export testing library utilities
export * from '@testing-library/react';
export { userEvent };
export { within } from '@testing-library/react';
