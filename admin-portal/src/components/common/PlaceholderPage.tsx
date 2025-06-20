import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { Construction as ConstructionIcon } from '@mui/icons-material';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ 
  title, 
  description = 'This page is under development and will be available soon.',
  icon = <ConstructionIcon />
}) => {
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 4 }}>
        {title}
      </Typography>
      
      <Card>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              py: 8,
              textAlign: 'center',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 80,
                height: 80,
                borderRadius: '50%',
                backgroundColor: 'primary.light',
                color: 'primary.main',
                mb: 3,
              }}
            >
              {React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 40 } })}
            </Box>
            
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
              {title}
            </Typography>
            
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400 }}>
              {description}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PlaceholderPage;
