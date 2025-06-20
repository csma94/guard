import React from 'react';
import { AccountCircle as ProfileIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const ProfilePage: React.FC = () => {
  return (
    <PlaceholderPage
      title="User Profile"
      description="Manage your profile information, change password, and configure personal preferences."
      icon={<ProfileIcon />}
    />
  );
};

export default ProfilePage;
