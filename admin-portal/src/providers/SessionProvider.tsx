import React, { useEffect, useCallback } from 'react';
import { useSession, useUser } from '@clerk/clerk-react';
import { useAppDispatch } from '../store';
import { setClerkSession, setClerkUser, setClerkError } from '../store/slices/clerkAuthSlice';
import {
  storeSessionData,
  clearStoredSessionData,
  setupActivityTracking,
  setupTokenRefresh,
  isSessionValid,
} from '../utils/sessionManager';

interface SessionProviderProps {
  children: React.ReactNode;
}

/**
 * Session Provider
 * Manages session persistence, activity tracking, and automatic token refresh
 */
export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  const dispatch = useAppDispatch();
  const { session, isLoaded: sessionLoaded } = useSession();
  const { user, isLoaded: userLoaded } = useUser();

  // Handle session changes
  useEffect(() => {
    if (sessionLoaded) {
      if (session && isSessionValid(session)) {
        // Store session data for persistence
        storeSessionData(session);
        // Convert Clerk session to our custom type
        const customSession = {
          id: session.id,
          expireAt: session.expireAt,
          getToken: session.getToken.bind(session),
        };
        dispatch(setClerkSession(customSession));
      } else {
        // Clear invalid or null session
        clearStoredSessionData();
        dispatch(setClerkSession(null));
      }
    }
  }, [session, sessionLoaded, dispatch]);

  // Handle user changes
  useEffect(() => {
    if (userLoaded) {
      // Convert Clerk user to our custom type
      const customUser = user ? {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        primaryEmailAddress: user.primaryEmailAddress,
        primaryPhoneNumber: user.primaryPhoneNumber,
        imageUrl: user.imageUrl,
        publicMetadata: user.publicMetadata,
        createdAt: user.createdAt,
        lastSignInAt: user.lastSignInAt,
      } : null;
      dispatch(setClerkUser(customUser));
    }
  }, [user, userLoaded, dispatch]);

  // Token refresh handler
  const handleTokenRefresh = useCallback((token: string) => {
    console.log('Token refreshed successfully');
    // Token is automatically managed by Clerk, no additional action needed
  }, []);

  // Token refresh error handler
  const handleTokenError = useCallback((error: Error) => {
    console.error('Token refresh failed:', error);
    dispatch(setClerkError('Session expired. Please sign in again.'));
    clearStoredSessionData();
  }, [dispatch]);

  // Set up activity tracking and token refresh
  useEffect(() => {
    if (!session || !sessionLoaded) return;

    // Set up activity tracking
    const cleanupActivity = setupActivityTracking();

    // Set up automatic token refresh
    const cleanupTokenRefresh = setupTokenRefresh(
      session,
      handleTokenRefresh,
      handleTokenError
    );

    // Cleanup on unmount or session change
    return () => {
      cleanupActivity();
      cleanupTokenRefresh();
    };
  }, [session, sessionLoaded, handleTokenRefresh, handleTokenError]);

  // Handle page visibility changes (pause/resume activity tracking)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, user might be inactive
        console.log('Page hidden - pausing activity tracking');
      } else {
        // Page is visible again, resume activity tracking
        console.log('Page visible - resuming activity tracking');
        if (session && isSessionValid(session)) {
          storeSessionData(session);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session]);

  // Handle beforeunload to clean up if needed
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Update session activity one last time before page unload
      if (session && isSessionValid(session)) {
        storeSessionData(session);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [session]);

  return <>{children}</>;
};
