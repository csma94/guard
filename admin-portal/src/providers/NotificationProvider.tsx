import React, { createContext, useContext, useEffect } from 'react';
import { Snackbar, Alert, AlertColor } from '@mui/material';
import { useAppDispatch, useAppSelector } from '../store';
import { removeNotification, addNotification } from '../store/slices/uiSlice';
import { useSocket } from './SocketProvider';

interface NotificationContextType {
  showNotification: (type: AlertColor, title: string, message: string) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  showNotification: () => {},
});

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const dispatch = useAppDispatch();
  const { notifications } = useAppSelector((state) => state.ui);
  const { socket } = useSocket();

  // Get the most recent unread notification for display
  const currentNotification = notifications.find(n => !n.read);

  useEffect(() => {
    if (socket) {
      // Listen for real-time notifications
      socket.on('notification', (data: any) => {
        dispatch(addNotification({
          type: data.type || 'info',
          title: data.title || 'Notification',
          message: data.message || '',
        }));
      });

      // Listen for emergency alerts
      socket.on('emergency_alert', (data: any) => {
        dispatch(addNotification({
          type: 'error',
          title: 'Emergency Alert',
          message: data.message || 'Emergency situation detected',
        }));
      });

      // Listen for shift updates
      socket.on('shift_update', (data: any) => {
        dispatch(addNotification({
          type: 'info',
          title: 'Shift Update',
          message: data.message || 'Shift information updated',
        }));
      });

      return () => {
        socket.off('notification');
        socket.off('emergency_alert');
        socket.off('shift_update');
      };
    }
  }, [socket, dispatch]);

  const showNotification = (type: AlertColor, title: string, message: string) => {
    dispatch(addNotification({ type, title, message }));
  };

  const handleClose = () => {
    if (currentNotification) {
      dispatch(removeNotification(currentNotification.id));
    }
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      
      {/* Snackbar for displaying notifications */}
      <Snackbar
        open={!!currentNotification}
        autoHideDuration={6000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {currentNotification && (
          <Alert
            onClose={handleClose}
            severity={currentNotification.type}
            variant="filled"
            sx={{ width: '100%' }}
          >
            <strong>{currentNotification.title}</strong>
            <br />
            {currentNotification.message}
          </Alert>
        )}
      </Snackbar>
    </NotificationContext.Provider>
  );
};
