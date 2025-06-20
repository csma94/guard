import React from 'react';
import { LocationOn as LocationIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const SitesPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Site Management"
      description="Manage security sites, configure geofencing, and monitor site-specific activities."
      icon={<LocationIcon />}
    />
  );
};

export default SitesPage;
