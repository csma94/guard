import React from 'react';
import { AccessTime as AccessTimeIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const ShiftDetailsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Shift Details"
      description="View detailed shift information, assigned agents, time tracking, and performance metrics."
      icon={<AccessTimeIcon />}
    />
  );
};

export default ShiftDetailsPage;
