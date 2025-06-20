import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  employeeId?: string;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const STORAGE_KEYS = {
  TOKEN: '@auth_token',
  USER: '@auth_user',
};

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Initialize auth state from storage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const [token, userJson] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
          AsyncStorage.getItem(STORAGE_KEYS.USER),
        ]);

        if (token && userJson) {
          const user = JSON.parse(userJson);
          setAuthState({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          setAuthState(prev => ({
            ...prev,
            isLoading: false,
          }));
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
        }));
      }
    };

    initializeAuth();
  }, []);

  // Login function
  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const data = await response.json();
      const { token, user } = data;

      // Store auth data
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token),
        AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user)),
      ]);

      setAuthState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.message || 'Login failed' 
      };
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      // Clear storage
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.TOKEN),
        AsyncStorage.removeItem(STORAGE_KEYS.USER),
      ]);

      setAuthState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, []);

  // Get token function
  const getToken = useCallback(async (): Promise<string | null> => {
    if (authState.token) {
      return authState.token;
    }

    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
      return token;
    } catch (error) {
      console.error('Failed to get token:', error);
      return null;
    }
  }, [authState.token]);

  // Refresh user data
  const refreshUser = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to refresh user data');
      }

      const userData = await response.json();
      const user = userData.data;

      // Update storage
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

      setAuthState(prev => ({
        ...prev,
        user,
      }));

      return { success: true, user };
    } catch (error: any) {
      console.error('Refresh user error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to refresh user data' 
      };
    }
  }, [getToken]);

  // Update user data
  const updateUser = useCallback(async (userData: Partial<User>) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No token available');
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        throw new Error('Failed to update user data');
      }

      const result = await response.json();
      const updatedUser = result.data;

      // Update storage
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));

      setAuthState(prev => ({
        ...prev,
        user: updatedUser,
      }));

      return { success: true, user: updatedUser };
    } catch (error: any) {
      console.error('Update user error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to update user data' 
      };
    }
  }, [getToken]);

  return {
    ...authState,
    login,
    logout,
    getToken,
    refreshUser,
    updateUser,
  };
};
