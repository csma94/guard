import React from 'react';
import { Security as SecurityIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const AgentsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Agent Management"
      description="Manage security agents, track their locations, and monitor their activities in real-time."
      icon={<SecurityIcon />}
    />
  );
};

export default AgentsPage;
