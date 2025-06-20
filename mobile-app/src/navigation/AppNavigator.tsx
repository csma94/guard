import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../theme';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import PatrolScreen from '../screens/PatrolScreen';
import ReportsScreen from '../screens/ReportsScreen';
import IncidentsScreen from '../screens/IncidentsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LoginScreen from '../screens/LoginScreen';
import ShiftDetailsScreen from '../screens/ShiftDetailsScreen';
import ReportFormScreen from '../screens/ReportFormScreen';
import IncidentFormScreen from '../screens/IncidentFormScreen';
import CheckInScreen from '../screens/CheckInScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

// Navigation types
export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  ShiftDetails: { shiftId: string };
  ReportForm: { reportId?: string };
  IncidentForm: { incidentId?: string };
  CheckIn: { checkpointId?: string };
  Notifications: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Patrol: undefined;
  Reports: undefined;
  Incidents: undefined;
  Profile: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Main Tab Navigator
const MainTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          switch (route.name) {
            case 'Dashboard':
              iconName = 'dashboard';
              break;
            case 'Patrol':
              iconName = 'security';
              break;
            case 'Reports':
              iconName = 'assignment';
              break;
            case 'Incidents':
              iconName = 'warning';
              break;
            case 'Profile':
              iconName = 'person';
              break;
            default:
              iconName = 'help';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: colors.primary,
        },
        headerTintColor: colors.white,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          headerShown: false,
        }}
      />
      <Tab.Screen 
        name="Patrol" 
        component={PatrolScreen}
        options={{
          title: 'Patrol',
        }}
      />
      <Tab.Screen 
        name="Reports" 
        component={ReportsScreen}
        options={{
          title: 'Reports',
        }}
      />
      <Tab.Screen 
        name="Incidents" 
        component={IncidentsScreen}
        options={{
          title: 'Incidents',
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{
          title: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

// Root Stack Navigator
const AppNavigator: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: colors.white,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen 
            name="Login" 
            component={LoginScreen}
            options={{
              headerShown: false,
            }}
          />
        ) : (
          <>
            <Stack.Screen 
              name="MainTabs" 
              component={MainTabNavigator}
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen 
              name="ShiftDetails" 
              component={ShiftDetailsScreen}
              options={{
                title: 'Shift Details',
              }}
            />
            <Stack.Screen 
              name="ReportForm" 
              component={ReportFormScreen}
              options={({ route }) => ({
                title: route.params?.reportId ? 'Edit Report' : 'New Report',
              })}
            />
            <Stack.Screen 
              name="IncidentForm" 
              component={IncidentFormScreen}
              options={({ route }) => ({
                title: route.params?.incidentId ? 'Edit Incident' : 'Report Incident',
              })}
            />
            <Stack.Screen 
              name="CheckIn" 
              component={CheckInScreen}
              options={{
                title: 'Check In',
              }}
            />
            <Stack.Screen 
              name="Notifications" 
              component={NotificationsScreen}
              options={{
                title: 'Notifications',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
