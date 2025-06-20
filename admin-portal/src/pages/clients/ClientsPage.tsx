import React from 'react';
import { Business as BusinessIcon } from '@mui/icons-material';
import PlaceholderPage from '../../components/common/PlaceholderPage';

const ClientsPage: React.FC = () => {
  return (
    <PlaceholderPage
      title="Client Management"
      description="Manage client accounts, contracts, billing information, and service agreements."
      icon={<BusinessIcon />}
    />
  );
};

export default ClientsPage;
