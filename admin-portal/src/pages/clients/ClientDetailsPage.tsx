import React from 'react';
import { Domain as DomainIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const ClientDetailsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Client Details"
      description="View detailed client information, service history, billing records, and contact details."
      icon={<DomainIcon />}
    />
  );
};

export default ClientDetailsPage;
