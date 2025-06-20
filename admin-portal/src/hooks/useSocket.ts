import { useEffect, useRef } from 'react';
import io from 'socket.io-client';
type Socket = any;

interface UseSocketOptions {
  autoConnect?: boolean;
  namespace?: string;
}

export const useSocket = (
  event: string,
  handler: (data: any) => void,
  options: UseSocketOptions = {}
) => {
  const socketRef = useRef<Socket | null>(null);
  const { autoConnect = true, namespace = '' } = options;

  useEffect(() => {
    if (!autoConnect) return;

    // Create socket connection
    const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000';
    const token = localStorage.getItem('accessToken');

    socketRef.current = io(`${socketUrl}${namespace}`, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
    });

    const socket = socketRef.current;

    // Connection event handlers
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('disconnect', (reason: any) => {
      console.log('Socket disconnected:', reason);
    });

    socket.on('connect_error', (error: any) => {
      console.error('Socket connection error:', error);
    });

    // Register the specific event handler
    socket.on(event, handler);

    // Cleanup on unmount
    return () => {
      socket.off(event, handler);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [event, handler, autoConnect, namespace]);

  return socketRef.current;
};

export const useSocketConnection = (options: UseSocketOptions = {}) => {
  const socketRef = useRef<Socket | null>(null);
  const { autoConnect = true, namespace = '' } = options;

  useEffect(() => {
    if (!autoConnect) return;

    const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000';
    const token = localStorage.getItem('accessToken');

    socketRef.current = io(`${socketUrl}${namespace}`, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('disconnect', (reason: any) => {
      console.log('Socket disconnected:', reason);
    });

    socket.on('connect_error', (error: any) => {
      console.error('Socket connection error:', error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [autoConnect, namespace]);

  const emit = (event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  };

  const on = (event: string, handler: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);
    }
  };

  const off = (event: string, handler?: (data: any) => void) => {
    if (socketRef.current) {
      if (handler) {
        socketRef.current.off(event, handler);
      } else {
        socketRef.current.off(event);
      }
    }
  };

  return {
    socket: socketRef.current,
    emit,
    on,
    off,
    connected: socketRef.current?.connected || false,
  };
};
