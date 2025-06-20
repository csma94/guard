import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch } from 'react-redux';
import { Alert } from 'react-native';

import { AppDispatch } from '../store';
import { syncOfflineData } from '../store/slices/offlineSlice';
import OfflineManager, { OfflineStorage, OfflineAction, SyncResult } from '../services/offlineManager';
import { logger } from '../utils/logger';

interface OfflineContextType {
  isConnected: boolean;
  isOnline: boolean;
  connectionType: string | null;
  syncPending: boolean;
  queueAction: (type: string, data: any, priority?: OfflineAction['priority'], dependencies?: string[]) => Promise<string>;
  syncData: () => Promise<SyncResult>;
  getQueuedActions: () => OfflineAction[];
  clearQueue: () => Promise<void>;
  getSyncStatus: () => { isOnline: boolean; syncInProgress: boolean; queueLength: number };
  storeOfflineData: (key: string, data: any, category?: string) => Promise<void>;
  retrieveOfflineData: (key: string) => Promise<any>;
  getCacheStats: () => Promise<any>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

interface OfflineProviderProps {
  children: ReactNode;
}

const OFFLINE_QUEUE_KEY = '@bahinlink_offline_queue';

export const OfflineProvider: React.FC<OfflineProviderProps> = ({ children }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [isConnected, setIsConnected] = useState(true);
  const [connectionType, setConnectionType] = useState<string | null>(null);
  const [syncPending, setSyncPending] = useState(false);

  const offlineManager = OfflineManager.getInstance();
  const offlineStorage = OfflineStorage.getInstance();
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener(state => {
      const wasConnected = isConnected;
      const nowConnected = state.isConnected ?? false;
      
      setIsConnected(nowConnected);
      setConnectionType(state.type);

      // If we just came back online, sync offline data
      if (!wasConnected && nowConnected) {
        handleReconnection();
      }

      // Show connection status alerts
      if (wasConnected && !nowConnected) {
        Alert.alert(
          'Connection Lost',
          'You are now offline. Your actions will be saved and synced when connection is restored.',
          [{ text: 'OK' }]
        );
      } else if (!wasConnected && nowConnected) {
        Alert.alert(
          'Connection Restored',
          'You are back online. Syncing your offline data...',
          [{ text: 'OK' }]
        );
      }
    });

    return unsubscribe;
  }, [isConnected]);

  const handleReconnection = async () => {
    try {
      setSyncPending(true);
      logger.info('Network reconnected, starting intelligent sync...');

      // Use the enhanced offline manager for sync
      const syncResult = await offlineManager.syncOfflineData();

      if (syncResult.successful > 0) {
        Alert.alert(
          'Sync Complete',
          `Successfully synced ${syncResult.successful} actions. ${syncResult.failed > 0 ? `${syncResult.failed} failed.` : ''}`,
          [{ text: 'OK' }]
        );
      }

      if (syncResult.conflicts.length > 0) {
        Alert.alert(
          'Sync Conflicts',
          `${syncResult.conflicts.length} conflicts detected. Please review in settings.`,
          [{ text: 'OK' }]
        );
      }

      logger.info('Sync completed', syncResult);
    } catch (error) {
      logger.error('Failed to sync offline data:', error);
      Alert.alert(
        'Sync Failed',
        'Failed to sync offline data. Please try again later.',
        [{ text: 'OK' }]
      );
    } finally {
      setSyncPending(false);
    }
  };

  const queueAction = async (
    type: string,
    data: any,
    priority: OfflineAction['priority'] = 'NORMAL',
    dependencies?: string[]
  ): Promise<string> => {
    try {
      return await offlineManager.queueAction(type, data, priority, dependencies);
    } catch (error) {
      logger.error('Failed to queue offline action:', error);
      throw error;
    }
  };

  const syncData = async (): Promise<SyncResult> => {
    try {
      setSyncPending(true);
      return await offlineManager.syncOfflineData();
    } catch (error) {
      logger.error('Failed to sync data:', error);
      throw error;
    } finally {
      setSyncPending(false);
    }
  };

  const getQueuedActions = (): OfflineAction[] => {
    return offlineManager.getQueuedActions();
  };

  const clearQueue = async (): Promise<void> => {
    try {
      await offlineManager.clearQueue();
    } catch (error) {
      logger.error('Failed to clear offline queue:', error);
      throw error;
    }
  };

  const getSyncStatus = () => {
    return offlineManager.getSyncStatus();
  };

  const storeOfflineData = async (key: string, data: any, category?: string): Promise<void> => {
    try {
      await offlineStorage.store(key, data, category);
    } catch (error) {
      logger.error('Failed to store offline data:', error);
      throw error;
    }
  };

  const retrieveOfflineData = async (key: string): Promise<any> => {
    try {
      return await offlineStorage.retrieve(key);
    } catch (error) {
      logger.error('Failed to retrieve offline data:', error);
      return null;
    }
  };

  const getCacheStats = async (): Promise<any> => {
    try {
      return await offlineStorage.getCacheStats();
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return null;
    }
  };

  const value: OfflineContextType = {
    isConnected,
    isOnline: isConnected,
    connectionType,
    syncPending,
    queueAction,
    syncData,
    getQueuedActions,
    clearQueue,
    getSyncStatus,
    storeOfflineData,
    retrieveOfflineData,
    getCacheStats,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = (): OfflineContextType => {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};
