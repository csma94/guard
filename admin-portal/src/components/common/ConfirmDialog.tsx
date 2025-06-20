import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Button,
  Box,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Help as HelpIcon,
} from '@mui/icons-material';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  severity?: 'warning' | 'error' | 'info' | 'question';
  loading?: boolean;
  confirmColor?: string; // Add confirmColor prop for compatibility
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  severity = 'question',
  loading = false,
  confirmColor,
}) => {
  const getIcon = () => {
    switch (severity) {
      case 'warning':
        return <WarningIcon sx={{ color: 'warning.main', fontSize: 48 }} />;
      case 'error':
        return <ErrorIcon sx={{ color: 'error.main', fontSize: 48 }} />;
      case 'info':
        return <InfoIcon sx={{ color: 'info.main', fontSize: 48 }} />;
      case 'question':
        return <HelpIcon sx={{ color: 'primary.main', fontSize: 48 }} />;
      default:
        return <HelpIcon sx={{ color: 'primary.main', fontSize: 48 }} />;
    }
  };

  const getConfirmButtonColor = () => {
    // Use confirmColor if provided, otherwise use severity-based color
    if (confirmColor) return confirmColor;

    switch (severity) {
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      case 'info':
        return 'info';
      case 'question':
        return 'primary';
      default:
        return 'primary';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          {getIcon()}
          {title}
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <DialogContentText sx={{ textAlign: 'center' }}>
          {message}
        </DialogContentText>
      </DialogContent>
      
      <DialogActions sx={{ justifyContent: 'center', gap: 1, pb: 3 }}>
        <Button
          onClick={onClose}
          disabled={loading}
          variant="outlined"
        >
          {cancelText}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          variant="contained"
          color={getConfirmButtonColor() as any}
        >
          {loading ? 'Processing...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
