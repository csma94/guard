import React from 'react';
import { Assessment as ReportsIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const ReportsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Reports Management"
      description="View and manage incident reports, security logs, and compliance documentation."
      icon={<ReportsIcon />}
    />
  );
};

export default ReportsPage;
