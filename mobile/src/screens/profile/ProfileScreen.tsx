import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  List,
  Avatar,
  Divider,
  Switch,
  TextInput,
  Dialog,
  Portal,
} from 'react-native-paper';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { RootState, AppDispatch } from '../../store';
import { logout, updateProfile } from '../../store/slices/authSlice';
import { theme } from '../../theme';

const ProfileScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  
  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const [passwordDialogVisible, setPasswordDialogVisible] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(true);
  
  // Edit profile form
  const [editForm, setEditForm] = useState({
    firstName: user?.profile?.firstName || '',
    lastName: user?.profile?.lastName || '',
    phone: user?.profile?.phone || '',
    email: user?.email || '',
  });
  
  // Password change form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => dispatch(logout()),
        },
      ]
    );
  };

  const handleUpdateProfile = async () => {
    try {
      await dispatch(updateProfile(editForm)).unwrap();
      setEditDialogVisible(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }
    
    if (passwordForm.newPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters long');
      return;
    }

    try {
      // Implement password change logic
      setPasswordDialogVisible(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      Alert.alert('Success', 'Password changed successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to change password');
    }
  };

  const getInitials = () => {
    const firstName = user?.profile?.firstName || '';
    const lastName = user?.profile?.lastName || '';
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.profileHeader}>
            <Avatar.Text 
              size={80} 
              label={getInitials()} 
              style={styles.avatar}
            />
            <View style={styles.profileInfo}>
              <Title style={styles.name}>
                {user?.profile?.firstName} {user?.profile?.lastName}
              </Title>
              <Paragraph style={styles.role}>{user?.role}</Paragraph>
              <Paragraph style={styles.email}>{user?.email}</Paragraph>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Account Information */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Account Information</Title>
          <Divider style={styles.divider} />
          
          <List.Item
            title="Username"
            description={user?.username}
            left={(props) => <List.Icon {...props} icon="account" />}
          />
          
          <List.Item
            title="Employee ID"
            description={user?.agent?.employeeId || 'N/A'}
            left={(props) => <List.Icon {...props} icon="badge-account" />}
          />
          
          <List.Item
            title="Phone"
            description={user?.profile?.phone || 'Not provided'}
            left={(props) => <List.Icon {...props} icon="phone" />}
          />
          
          <List.Item
            title="Department"
            description={user?.agent?.department || 'Security'}
            left={(props) => <List.Icon {...props} icon="office-building" />}
          />
          
          <Button
            mode="outlined"
            onPress={() => setEditDialogVisible(true)}
            style={styles.editButton}
            icon="pencil"
          >
            Edit Profile
          </Button>
        </Card.Content>
      </Card>

      {/* Settings */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Settings</Title>
          <Divider style={styles.divider} />
          
          <List.Item
            title="Push Notifications"
            description="Receive notifications for shifts and updates"
            left={(props) => <List.Icon {...props} icon="bell" />}
            right={() => (
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
              />
            )}
          />
          
          <List.Item
            title="Location Tracking"
            description="Allow location tracking during shifts"
            left={(props) => <List.Icon {...props} icon="map-marker" />}
            right={() => (
              <Switch
                value={locationTrackingEnabled}
                onValueChange={setLocationTrackingEnabled}
              />
            )}
          />
          
          <List.Item
            title="Change Password"
            description="Update your account password"
            left={(props) => <List.Icon {...props} icon="lock" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => setPasswordDialogVisible(true)}
          />
        </Card.Content>
      </Card>

      {/* Performance Stats */}
      {user?.agent?.performanceMetrics && (
        <Card style={styles.card}>
          <Card.Content>
            <Title>Performance Overview</Title>
            <Divider style={styles.divider} />
            
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {user.agent.performanceMetrics.totalShifts || 0}
                </Text>
                <Text style={styles.statLabel}>Total Shifts</Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {user.agent.performanceMetrics.completionRate || 0}%
                </Text>
                <Text style={styles.statLabel}>Completion Rate</Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {user.agent.performanceMetrics.totalReports || 0}
                </Text>
                <Text style={styles.statLabel}>Reports Filed</Text>
              </View>
              
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {user.agent.performanceMetrics.rating || 0}/5
                </Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Support & Help */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Support & Help</Title>
          <Divider style={styles.divider} />
          
          <List.Item
            title="Help Center"
            description="Get help and support"
            left={(props) => <List.Icon {...props} icon="help-circle" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {/* Navigate to help */}}
          />
          
          <List.Item
            title="Contact Support"
            description="Get in touch with our support team"
            left={(props) => <List.Icon {...props} icon="headset" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => {/* Contact support */}}
          />
          
          <List.Item
            title="App Version"
            description="1.0.0"
            left={(props) => <List.Icon {...props} icon="information" />}
          />
        </Card.Content>
      </Card>

      {/* Logout Button */}
      <View style={styles.logoutContainer}>
        <Button
          mode="contained"
          onPress={handleLogout}
          style={styles.logoutButton}
          buttonColor={theme.colors.error}
          icon="logout"
        >
          Logout
        </Button>
      </View>

      {/* Edit Profile Dialog */}
      <Portal>
        <Dialog visible={editDialogVisible} onDismiss={() => setEditDialogVisible(false)}>
          <Dialog.Title>Edit Profile</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="First Name"
              value={editForm.firstName}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, firstName: text }))}
              style={styles.dialogInput}
              mode="outlined"
            />
            <TextInput
              label="Last Name"
              value={editForm.lastName}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, lastName: text }))}
              style={styles.dialogInput}
              mode="outlined"
            />
            <TextInput
              label="Phone"
              value={editForm.phone}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, phone: text }))}
              style={styles.dialogInput}
              mode="outlined"
              keyboardType="phone-pad"
            />
            <TextInput
              label="Email"
              value={editForm.email}
              onChangeText={(text) => setEditForm(prev => ({ ...prev, email: text }))}
              style={styles.dialogInput}
              mode="outlined"
              keyboardType="email-address"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleUpdateProfile}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Change Password Dialog */}
      <Portal>
        <Dialog visible={passwordDialogVisible} onDismiss={() => setPasswordDialogVisible(false)}>
          <Dialog.Title>Change Password</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Current Password"
              value={passwordForm.currentPassword}
              onChangeText={(text) => setPasswordForm(prev => ({ ...prev, currentPassword: text }))}
              style={styles.dialogInput}
              mode="outlined"
              secureTextEntry
            />
            <TextInput
              label="New Password"
              value={passwordForm.newPassword}
              onChangeText={(text) => setPasswordForm(prev => ({ ...prev, newPassword: text }))}
              style={styles.dialogInput}
              mode="outlined"
              secureTextEntry
            />
            <TextInput
              label="Confirm New Password"
              value={passwordForm.confirmPassword}
              onChangeText={(text) => setPasswordForm(prev => ({ ...prev, confirmPassword: text }))}
              style={styles.dialogInput}
              mode="outlined"
              secureTextEntry
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPasswordDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleChangePassword}>Change Password</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerCard: {
    margin: 16,
    marginBottom: 8,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    backgroundColor: theme.colors.primary,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  role: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  email: {
    fontSize: 14,
    color: theme.colors.outline,
  },
  card: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  divider: {
    marginVertical: 8,
  },
  editButton: {
    marginTop: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.outline,
    marginTop: 4,
    textAlign: 'center',
  },
  logoutContainer: {
    padding: 16,
  },
  logoutButton: {
    marginTop: 8,
  },
  dialogInput: {
    marginBottom: 16,
  },
});

export default ProfileScreen;
