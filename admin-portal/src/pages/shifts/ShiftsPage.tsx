import React from 'react';
import { Schedule as ScheduleIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const ShiftsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Shift Management"
      description="Schedule and manage security shifts, assign agents to sites, and track shift completion."
      icon={<ScheduleIcon />}
    />
  );
};

export default ShiftsPage;
