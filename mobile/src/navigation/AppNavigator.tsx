import React, { useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSelector, useDispatch } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { RootState, AppDispatch } from '../store';
import { loadStoredAuth } from '../store/slices/authSlice';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import LoadingScreen from '../components/LoadingScreen';

// Main App Screens
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import ShiftsScreen from '../screens/shifts/ShiftsScreen';
import ShiftDetailsScreen from '../screens/shifts/ShiftDetailsScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import CreateReportScreen from '../screens/reports/CreateReportScreen';
import ReportDetailsScreen from '../screens/reports/ReportDetailsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import MapScreen from '../screens/map/MapScreen';

// Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  ShiftDetails: { shiftId: string };
  CreateReport: { shiftId?: string; reportType?: string };
  ReportDetails: { reportId: string };
  Settings: undefined;
  Map: { siteId?: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Shifts: undefined;
  Reports: undefined;
  Profile: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'view-dashboard' : 'view-dashboard-outline';
              break;
            case 'Shifts':
              iconName = focused ? 'calendar-clock' : 'calendar-clock-outline';
              break;
            case 'Reports':
              iconName = focused ? 'file-document' : 'file-document-outline';
              break;
            case 'Profile':
              iconName = focused ? 'account' : 'account-outline';
              break;
            default:
              iconName = 'help-circle-outline';
          }

          return <MaterialCommunityIcons name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2196F3',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Tab.Screen 
        name="Shifts" 
        component={ShiftsScreen}
        options={{ title: 'My Shifts' }}
      />
      <Tab.Screen 
        name="Reports" 
        component={ReportsScreen}
        options={{ title: 'Reports' }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { isAuthenticated, isLoading } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    // Try to load stored authentication on app start
    dispatch(loadStoredAuth());
  }, [dispatch]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen 
            name="ShiftDetails" 
            component={ShiftDetailsScreen}
            options={{ 
              headerShown: true,
              title: 'Shift Details',
              headerBackTitleVisible: false,
            }}
          />
          <Stack.Screen 
            name="CreateReport" 
            component={CreateReportScreen}
            options={{ 
              headerShown: true,
              title: 'Create Report',
              headerBackTitleVisible: false,
            }}
          />
          <Stack.Screen 
            name="ReportDetails" 
            component={ReportDetailsScreen}
            options={{ 
              headerShown: true,
              title: 'Report Details',
              headerBackTitleVisible: false,
            }}
          />
          <Stack.Screen 
            name="Settings" 
            component={SettingsScreen}
            options={{ 
              headerShown: true,
              title: 'Settings',
              headerBackTitleVisible: false,
            }}
          />
          <Stack.Screen 
            name="Map" 
            component={MapScreen}
            options={{ 
              headerShown: true,
              title: 'Site Map',
              headerBackTitleVisible: false,
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

export default AppNavigator;
