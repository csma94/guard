import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Avatar,
  Grid,
  Alert,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  PhotoCamera as PhotoCameraIcon,
} from '@mui/icons-material';
import { useUser } from '@clerk/clerk-react';
import { useAuth } from '../../hooks/useAuth';

interface UserProfileData {
  firstName: string;
  lastName: string;
  username: string;
  primaryEmailAddress: string;
  primaryPhoneNumber: string;
  imageUrl: string;
}

/**
 * User Profile Manager Component
 * Provides comprehensive user profile management with real-time updates
 */
export const UserProfileManager: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { clearAuthError } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  
  const [profileData, setProfileData] = useState<UserProfileData>({
    firstName: '',
    lastName: '',
    username: '',
    primaryEmailAddress: '',
    primaryPhoneNumber: '',
    imageUrl: '',
  });

  // Initialize profile data when user loads
  useEffect(() => {
    if (isLoaded && user) {
      setProfileData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        primaryEmailAddress: user.primaryEmailAddress?.emailAddress || '',
        primaryPhoneNumber: user.primaryPhoneNumber?.phoneNumber || '',
        imageUrl: user.imageUrl || '',
      });
    }
  }, [isLoaded, user]);

  // Clear messages after timeout
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleInputChange = (field: keyof UserProfileData, value: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Update user profile using Clerk's API
      await user.update({
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        username: profileData.username,
      });

      // Update email if changed
      if (profileData.primaryEmailAddress !== user.primaryEmailAddress?.emailAddress) {
        await user.createEmailAddress({
          email: profileData.primaryEmailAddress,
        });
      }

      // Update phone if changed
      if (profileData.primaryPhoneNumber !== user.primaryPhoneNumber?.phoneNumber) {
        await user.createPhoneNumber({
          phoneNumber: profileData.primaryPhoneNumber,
        });
      }

      setSuccess('Profile updated successfully!');
      setIsEditing(false);
      clearAuthError();
    } catch (error: any) {
      console.error('Profile update failed:', error);
      setError(error.errors?.[0]?.message || 'Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsLoading(true);
    setError(null);

    try {
      await user.setProfileImage({ file });
      setSuccess('Profile image updated successfully!');
      setAvatarDialogOpen(false);
      
      // Update local state
      setProfileData(prev => ({
        ...prev,
        imageUrl: user.imageUrl || '',
      }));
    } catch (error: any) {
      console.error('Avatar upload failed:', error);
      setError(error.errors?.[0]?.message || 'Failed to update profile image');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    if (user) {
      setProfileData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        primaryEmailAddress: user.primaryEmailAddress?.emailAddress || '',
        primaryPhoneNumber: user.primaryPhoneNumber?.phoneNumber || '',
        imageUrl: user.imageUrl || '',
      });
    }
    setIsEditing(false);
    setError(null);
  };

  if (!isLoaded) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return (
      <Alert severity="error">
        User not found. Please sign in again.
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" component="h2">
            Profile Management
          </Typography>
          {!isEditing ? (
            <Button
              startIcon={<EditIcon />}
              onClick={() => setIsEditing(true)}
              variant="outlined"
            >
              Edit Profile
            </Button>
          ) : (
            <Box>
              <Button
                startIcon={<SaveIcon />}
                onClick={handleSaveProfile}
                disabled={isLoading}
                variant="contained"
                sx={{ mr: 1 }}
              >
                Save
              </Button>
              <Button
                startIcon={<CancelIcon />}
                onClick={handleCancelEdit}
                disabled={isLoading}
                variant="outlined"
              >
                Cancel
              </Button>
            </Box>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Avatar Section */}
          <Grid item xs={12} md={4}>
            <Box display="flex" flexDirection="column" alignItems="center">
              <Box position="relative">
                <Avatar
                  src={profileData.imageUrl}
                  sx={{ width: 120, height: 120, mb: 2 }}
                >
                  {profileData.firstName?.[0]}{profileData.lastName?.[0]}
                </Avatar>
                {isEditing && (
                  <IconButton
                    onClick={() => setAvatarDialogOpen(true)}
                    sx={{
                      position: 'absolute',
                      bottom: 16,
                      right: -8,
                      backgroundColor: 'primary.main',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                    }}
                    size="small"
                  >
                    <PhotoCameraIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
              <Typography variant="h6" textAlign="center">
                {profileData.firstName} {profileData.lastName}
              </Typography>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                @{profileData.username}
              </Typography>
            </Box>
          </Grid>

          {/* Profile Form */}
          <Grid item xs={12} md={8}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  value={profileData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  disabled={!isEditing || isLoading}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  value={profileData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  disabled={!isEditing || isLoading}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Username"
                  value={profileData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  disabled={!isEditing || isLoading}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email Address"
                  type="email"
                  value={profileData.primaryEmailAddress}
                  onChange={(e) => handleInputChange('primaryEmailAddress', e.target.value)}
                  disabled={!isEditing || isLoading}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  value={profileData.primaryPhoneNumber}
                  onChange={(e) => handleInputChange('primaryPhoneNumber', e.target.value)}
                  disabled={!isEditing || isLoading}
                  variant="outlined"
                />
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Account Information */}
        <Typography variant="h6" gutterBottom>
          Account Information
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">
              User ID
            </Typography>
            <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
              {user.id}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">
              Created At
            </Typography>
            <Typography variant="body1">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">
              Last Sign In
            </Typography>
            <Typography variant="body1">
              {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : 'N/A'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2" color="text.secondary">
              Email Verified
            </Typography>
            <Typography variant="body1">
              {user.primaryEmailAddress?.verification?.status === 'verified' ? 'Yes' : 'No'}
            </Typography>
          </Grid>
        </Grid>

        {/* Avatar Upload Dialog */}
        <Dialog open={avatarDialogOpen} onClose={() => setAvatarDialogOpen(false)}>
          <DialogTitle>Update Profile Image</DialogTitle>
          <DialogContent>
            <input
              accept="image/*"
              style={{ display: 'none' }}
              id="avatar-upload"
              type="file"
              onChange={handleAvatarUpload}
            />
            <label htmlFor="avatar-upload">
              <Button
                variant="contained"
                component="span"
                startIcon={<PhotoCameraIcon />}
                disabled={isLoading}
                fullWidth
              >
                Choose Image
              </Button>
            </label>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAvatarDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};
