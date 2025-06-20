import { configureStore } from '@reduxjs/toolkit';
import { combineReducers } from '@reduxjs/toolkit';

// Slices
import authReducer from './slices/authSlice';
import dashboardReducer from './slices/dashboardSlice';
import sitesReducer from './slices/sitesSlice';
import agentsReducer from './slices/agentsSlice';
import shiftsReducer from './slices/shiftsSlice';
import reportsReducer from './slices/reportsSlice';
import analyticsReducer from './slices/analyticsSlice';
import notificationsReducer from './slices/notificationsSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  dashboard: dashboardReducer,
  sites: sitesReducer,
  agents: agentsReducer,
  shifts: shiftsReducer,
  reports: reportsReducer,
  analytics: analyticsReducer,
  notifications: notificationsReducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
