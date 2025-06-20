import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

// Slices
import clerkAuthSlice from './slices/clerkAuthSlice';
import uiSlice from './slices/uiSlice';
import dashboardSlice from './slices/dashboardSlice';
import usersSlice from './slices/usersSlice';

export const store = configureStore({
  reducer: {
    clerkAuth: clerkAuthSlice, // Clerk-based authentication
    ui: uiSlice,
    dashboard: dashboardSlice,
    users: usersSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
