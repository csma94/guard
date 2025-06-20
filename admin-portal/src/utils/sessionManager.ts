// Session management utilities - using custom session interface

/**
 * Session Management Utilities
 * Handles session persistence, token refresh, and session validation
 */

interface SessionData {
  sessionId: string;
  userId: string;
  expiresAt: number;
  lastActivity: number;
}

interface ClerkSession {
  id: string;
  userId?: string;
  expireAt: Date;
  getToken: () => Promise<string | null>;
}

const SESSION_STORAGE_KEY = 'clerk_session_data';
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const ACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity

/**
 * Stores session data in localStorage for persistence
 */
export const storeSessionData = (session: ClerkSession): void => {
  try {
    const sessionData: SessionData = {
      sessionId: session.id,
      userId: session.userId || '',
      expiresAt: session.expireAt.getTime(),
      lastActivity: Date.now(),
    };

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
  } catch (error) {
    console.error('Failed to store session data:', error);
  }
};

/**
 * Retrieves session data from localStorage
 */
export const getStoredSessionData = (): SessionData | null => {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;

    const sessionData: SessionData = JSON.parse(stored);
    
    // Check if session has expired
    if (Date.now() > sessionData.expiresAt) {
      clearStoredSessionData();
      return null;
    }

    // Check for inactivity timeout
    if (Date.now() - sessionData.lastActivity > ACTIVITY_TIMEOUT) {
      clearStoredSessionData();
      return null;
    }

    return sessionData;
  } catch (error) {
    console.error('Failed to retrieve session data:', error);
    return null;
  }
};

/**
 * Updates last activity timestamp
 */
export const updateSessionActivity = (): void => {
  try {
    const stored = getStoredSessionData();
    if (stored) {
      stored.lastActivity = Date.now();
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
    }
  } catch (error) {
    console.error('Failed to update session activity:', error);
  }
};

/**
 * Clears stored session data
 */
export const clearStoredSessionData = (): void => {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear session data:', error);
  }
};

/**
 * Validates if a session is still valid
 */
export const isSessionValid = (session: ClerkSession | null): boolean => {
  if (!session) return false;

  const now = Date.now();
  const expiresAt = session.expireAt.getTime();

  return now < expiresAt;
};

/**
 * Gets the time until session expires (in milliseconds)
 */
export const getTimeUntilExpiry = (session: ClerkSession | null): number => {
  if (!session) return 0;

  const now = Date.now();
  const expiresAt = session.expireAt.getTime();

  return Math.max(0, expiresAt - now);
};

/**
 * Sets up automatic session activity tracking
 */
export const setupActivityTracking = (): (() => void) => {
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  
  const updateActivity = () => {
    updateSessionActivity();
  };

  // Add event listeners
  events.forEach(event => {
    document.addEventListener(event, updateActivity, { passive: true });
  });

  // Return cleanup function
  return () => {
    events.forEach(event => {
      document.removeEventListener(event, updateActivity);
    });
  };
};

/**
 * Sets up automatic token refresh
 */
export const setupTokenRefresh = (
  session: ClerkSession | null,
  onRefresh: (token: string) => void,
  onError: (error: Error) => void
): (() => void) => {
  if (!session) return () => {};

  const refreshInterval = 5 * 60 * 1000; // Refresh every 5 minutes
  
  const refreshToken = async () => {
    try {
      if (isSessionValid(session)) {
        const token = await session.getToken();
        if (token) {
          onRefresh(token);
        }
      }
    } catch (error) {
      onError(error as Error);
    }
  };

  // Initial refresh
  refreshToken();

  // Set up interval
  const intervalId = setInterval(refreshToken, refreshInterval);

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
};
