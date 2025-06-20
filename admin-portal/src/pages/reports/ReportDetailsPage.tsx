import React from 'react';
import { Description as DescriptionIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const ReportDetailsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Report Details"
      description="View detailed report information, attachments, follow-up actions, and resolution status."
      icon={<DescriptionIcon />}
    />
  );
};

export default ReportDetailsPage;
