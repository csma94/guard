import '@testing-library/jest-dom';
import 'jest-canvas-mock';
import { configure } from '@testing-library/react';

// Configure testing library
configure({
  testIdAttribute: 'data-testid',
  asyncUtilTimeout: 5000,
});

// Test environment configuration
process.env.NODE_ENV = 'test';
process.env.REACT_APP_API_URL = 'http://localhost:3001/api';
process.env.REACT_APP_WS_URL = 'ws://localhost:3001';

// Global test setup
beforeAll(() => {
  // Start MSW server
  server.listen({
    onUnhandledRequest: 'warn',
  });

  // Mock console methods to reduce noise in tests
  global.console = {
    ...console,
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(), // deprecated
      removeListener: jest.fn(), // deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });

  // Mock window.ResizeObserver
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));

  // Mock IntersectionObserver
  global.IntersectionObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));

  // Mock window.scrollTo
  Object.defineProperty(window, 'scrollTo', {
    value: jest.fn(),
    writable: true,
  });

  // Mock window.location
  delete (window as any).location;
  window.location = {
    ...window.location,
    assign: jest.fn(),
    replace: jest.fn(),
    reload: jest.fn(),
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    port: '3000',
    pathname: '/',
    search: '',
    hash: '',
  };

  // Mock localStorage
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn(),
  };
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
  });

  // Mock sessionStorage
  const sessionStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn(),
  };
  Object.defineProperty(window, 'sessionStorage', {
    value: sessionStorageMock,
  });

  // Mock navigator.geolocation
  const mockGeolocation = {
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(),
    clearWatch: jest.fn(),
  };
  Object.defineProperty(navigator, 'geolocation', {
    value: mockGeolocation,
  });

  // Mock navigator.permissions
  Object.defineProperty(navigator, 'permissions', {
    value: {
      query: jest.fn().mockResolvedValue({ state: 'granted' }),
    },
  });

  // Mock navigator.serviceWorker
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: jest.fn().mockResolvedValue({}),
      ready: Promise.resolve({}),
      controller: null,
    },
  });

  // Mock Notification API
  global.Notification = jest.fn().mockImplementation(() => ({
    close: jest.fn(),
  })) as any;
  global.Notification.permission = 'granted';
  global.Notification.requestPermission = jest.fn().mockResolvedValue('granted');

  // Mock WebSocket
  global.WebSocket = jest.fn().mockImplementation(() => ({
    send: jest.fn(),
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    readyState: 1, // OPEN
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  }));

  // Mock fetch if not available
  if (!global.fetch) {
    global.fetch = jest.fn();
  }

  // Mock URL.createObjectURL
  global.URL.createObjectURL = jest.fn(() => 'mocked-url');
  global.URL.revokeObjectURL = jest.fn();

  // Mock FileReader
  global.FileReader = jest.fn().mockImplementation(() => ({
    readAsDataURL: jest.fn(),
    readAsText: jest.fn(),
    readAsArrayBuffer: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    result: null,
    error: null,
    readyState: 0,
    EMPTY: 0,
    LOADING: 1,
    DONE: 2,
  }));

  // Mock HTMLCanvasElement.getContext
  HTMLCanvasElement.prototype.getContext = jest.fn();

  // Mock HTMLMediaElement methods
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    writable: true,
    value: jest.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    writable: true,
    value: jest.fn(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    writable: true,
    value: jest.fn(),
  });

  // Mock crypto.randomUUID
  if (!global.crypto) {
    global.crypto = {} as any;
  }
  global.crypto.randomUUID = jest.fn(() => 'mocked-uuid');

  // Mock performance.now
  global.performance.now = jest.fn(() => Date.now());

  // Mock requestAnimationFrame
  global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));
  global.cancelAnimationFrame = jest.fn(id => clearTimeout(id));

  // Mock requestIdleCallback
  global.requestIdleCallback = jest.fn(cb => setTimeout(cb, 0));
  global.cancelIdleCallback = jest.fn(id => clearTimeout(id));
});

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
  
  // Clear localStorage and sessionStorage
  window.localStorage.clear();
  window.sessionStorage.clear();
  
  // Reset location
  window.location.pathname = '/';
  window.location.search = '';
  window.location.hash = '';
});

// Clean up after all tests
afterAll(() => {
  server.close();
  jest.restoreAllMocks();
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Suppress specific warnings in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is deprecated') ||
       args[0].includes('Warning: componentWillReceiveProps') ||
       args[0].includes('Warning: componentWillMount'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Custom matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toHaveBeenCalledWithObjectContaining(received: jest.Mock, expected: any) {
    const pass = received.mock.calls.some(call =>
      call.some(arg => {
        if (typeof arg === 'object' && arg !== null) {
          return Object.keys(expected).every(key => arg[key] === expected[key]);
        }
        return false;
      })
    );
    
    if (pass) {
      return {
        message: () =>
          `expected mock not to have been called with object containing ${JSON.stringify(expected)}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected mock to have been called with object containing ${JSON.stringify(expected)}`,
        pass: false,
      };
    }
  },
});

// Declare custom matchers for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toHaveBeenCalledWithObjectContaining(expected: any): R;
    }
  }
}

// Export test utilities
export * from './testUtils';
export * from './reactTestUtils';
