import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
type Socket = any;
import { useAppSelector } from '../store';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { isSignedIn, session } = useAppSelector((state) => state.clerkAuth);

  useEffect(() => {
    if (isSignedIn && session) {
      // Get token from Clerk session
      session.getToken().then((token) => {
        if (token) {
          // Initialize socket connection
          const socketUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3000';
          const newSocket = io(socketUrl, {
            auth: {
              token: token,
            },
            transports: ['websocket'],
          });

          newSocket.on('connect', () => {
            console.log('Socket connected');
            setIsConnected(true);
          });

          newSocket.on('disconnect', () => {
            console.log('Socket disconnected');
            setIsConnected(false);
          });

          newSocket.on('connect_error', (error: any) => {
            console.error('Socket connection error:', error);
            setIsConnected(false);
          });

          setSocket(newSocket);
        }
      }).catch((error) => {
        console.error('Failed to get Clerk token:', error);
      });

      return () => {
        if (socket) {
          socket.close();
          setSocket(null);
          setIsConnected(false);
        }
      };
    } else {
      // Clean up socket if not signed in
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
    }
  }, [isSignedIn, session, socket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
