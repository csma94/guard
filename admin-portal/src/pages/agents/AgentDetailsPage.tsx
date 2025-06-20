import React from 'react';
import { Badge as BadgeIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const AgentDetailsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Agent Details"
      description="View detailed agent information, shift history, performance metrics, and location tracking."
      icon={<BadgeIcon />}
    />
  );
};

export default AgentDetailsPage;
