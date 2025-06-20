import React from 'react';
import { Analytics as AnalyticsIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const AnalyticsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Analytics & Business Intelligence"
      description="View comprehensive analytics, performance metrics, and business intelligence dashboards."
      icon={<AnalyticsIcon />}
    />
  );
};

export default AnalyticsPage;
