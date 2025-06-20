import React from 'react';
import { Place as PlaceIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const SiteDetailsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Site Details"
      description="View detailed site information, assigned agents, security zones, and incident history."
      icon={<PlaceIcon />}
    />
  );
};

export default SiteDetailsPage;
