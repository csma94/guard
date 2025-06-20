import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  message = 'Loading BahinLink...' 
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f5f5f5',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 4,
          backgroundColor: 'white',
          borderRadius: 2,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        }}
      >
        <SecurityIcon 
          sx={{ 
            fontSize: 60, 
            color: 'primary.main', 
            mb: 2 
          }} 
        />
        
        <Typography 
          variant="h5" 
          sx={{ 
            mb: 3, 
            fontWeight: 600,
            color: 'text.primary' 
          }}
        >
          BahinLink
        </Typography>
        
        <CircularProgress 
          size={40} 
          sx={{ mb: 2 }} 
        />
        
        <Typography 
          variant="body1" 
          color="text.secondary"
        >
          {message}
        </Typography>
      </Box>
    </Box>
  );
};

export default LoadingScreen;
