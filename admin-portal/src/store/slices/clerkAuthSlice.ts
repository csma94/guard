import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Define compatible types for Clerk user and session
interface ClerkUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  primaryEmailAddress?: {
    emailAddress: string;
  } | null;
  primaryPhoneNumber?: {
    phoneNumber: string;
  } | null;
  imageUrl?: string;
  publicMetadata?: Record<string, any>;
  createdAt?: Date | null;
  lastSignInAt?: Date | null;
}

interface ClerkSession {
  id: string;
  expireAt: Date;
  getToken: () => Promise<string | null>;
}

interface ClerkAuthState {
  user: ClerkUser | null;
  session: ClerkSession | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  isLoading: boolean;
  error: string | null;
  organizationId: string | null;
  role: string | null;
  permissions: string[];
}

const initialState: ClerkAuthState = {
  user: null,
  session: null,
  isLoaded: false,
  isSignedIn: false,
  isLoading: false,
  error: null,
  organizationId: null,
  role: null,
  permissions: [],
};

/**
 * Clerk Authentication Slice
 * Manages Clerk authentication state in Redux store
 */
const clerkAuthSlice = createSlice({
  name: 'clerkAuth',
  initialState,
  reducers: {
    setClerkUser: (state, action: PayloadAction<ClerkUser | null>) => {
      state.user = action.payload;
      state.isSignedIn = !!action.payload;
      
      // Extract role and permissions from user metadata
      if (action.payload) {
        const publicMetadata = action.payload.publicMetadata as any;

        state.role = publicMetadata?.role || 'user';
        state.permissions = publicMetadata?.permissions || [];
        state.organizationId = publicMetadata?.organizationId || null;
      } else {
        state.role = null;
        state.permissions = [];
        state.organizationId = null;
      }
    },

    setClerkSession: (state, action: PayloadAction<ClerkSession | null>) => {
      state.session = action.payload;
    },

    setClerkLoaded: (state, action: PayloadAction<boolean>) => {
      state.isLoaded = action.payload;
    },

    setClerkLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setClerkError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    clearClerkError: (state) => {
      state.error = null;
    },

    updateUserRole: (state, action: PayloadAction<{ role: string; permissions: string[] }>) => {
      state.role = action.payload.role;
      state.permissions = action.payload.permissions;
    },

    setOrganization: (state, action: PayloadAction<string | null>) => {
      state.organizationId = action.payload;
    },

    clearClerkAuth: (state) => {
      state.user = null;
      state.session = null;
      state.isSignedIn = false;
      state.role = null;
      state.permissions = [];
      state.organizationId = null;
      state.error = null;
    },
  },
});

export const {
  setClerkUser,
  setClerkSession,
  setClerkLoaded,
  setClerkLoading,
  setClerkError,
  clearClerkError,
  updateUserRole,
  setOrganization,
  clearClerkAuth,
} = clerkAuthSlice.actions;

export default clerkAuthSlice.reducer;
