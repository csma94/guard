import React from 'react';
import { Person as PersonIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const UserDetailsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="User Details"
      description="View and edit detailed user information, permissions, and activity history."
      icon={<PersonIcon />}
    />
  );
};

export default UserDetailsPage;
