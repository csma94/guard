import { useUser, useSession, useClerk, useAuth as useClerkAuth } from '@clerk/clerk-react';

/**
 * Simplified useAuth hook for basic Clerk integration
 * Provides a unified authentication interface
 */
export const useAuth = () => {
  const clerkAuth = useClerkAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();
  const { session, isLoaded: sessionLoaded } = useSession();
  const { signOut } = useClerk();

  // Basic authentication state
  const isLoaded = userLoaded && sessionLoaded;
  const isAuthenticated = clerkAuth.isSignedIn || false;
  const user = clerkUser;
  const role = clerkUser?.publicMetadata?.role || 'user';
  const permissions = clerkUser?.publicMetadata?.permissions || [];

  // Authentication methods
  const signIn = async () => {
    // Clerk handles sign-in through components
    return { success: true };
  };

  const signUp = async () => {
    // Clerk handles sign-up through components
    return { success: true };
  };

  const logout = async () => {
    try {
      await signOut();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const clearAuthError = () => {
    // No-op for now
  };

  // Permission checking utilities
  const hasPermission = (permission: string): boolean => {
    return Array.isArray(permissions) && permissions.includes(permission);
  };

  const hasRole = (requiredRole: string): boolean => {
    return role === requiredRole;
  };

  const hasAnyRole = (roles: string[]): boolean => {
    return typeof role === 'string' ? roles.includes(role) : false;
  };

  // Get JWT token for API calls
  const getToken = async (): Promise<string | null> => {
    try {
      if (session) {
        return await session.getToken();
      }
      return null;
    } catch (error) {
      console.error('Failed to get token:', error);
      return null;
    }
  };

  return {
    // User data
    user,
    session,

    // Authentication state
    isAuthenticated,
    isLoaded,
    isLoading: !isLoaded,
    error: null,

    // User metadata
    role,
    permissions,
    organizationId: null,

    // Authentication methods
    signIn,
    signUp,
    logout,
    clearAuthError,

    // Permission utilities
    hasPermission,
    hasRole,
    hasAnyRole,

    // Token management
    getToken,

    // Legacy compatibility (for gradual migration)
    login: signIn,
  };
};
