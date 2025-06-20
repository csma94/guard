import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface LogEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  data?: any;
  timestamp: string;
  source: string;
  userId?: string;
  deviceInfo?: any;
}

class Logger {
  private static instance: Logger;
  private logQueue: LogEntry[] = [];
  private maxLogEntries = 1000;
  private logLevel: LogEntry['level'] = __DEV__ ? 'DEBUG' : 'INFO';

  private constructor() {
    this.loadStoredLogs();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async loadStoredLogs(): Promise<void> {
    try {
      const storedLogs = await AsyncStorage.getItem('@app_logs');
      if (storedLogs) {
        this.logQueue = JSON.parse(storedLogs);
      }
    } catch (error) {
      console.error('Failed to load stored logs:', error);
    }
  }

  private async persistLogs(): Promise<void> {
    try {
      // Keep only the most recent logs
      const logsToStore = this.logQueue.slice(-this.maxLogEntries);
      await AsyncStorage.setItem('@app_logs', JSON.stringify(logsToStore));
    } catch (error) {
      console.error('Failed to persist logs:', error);
    }
  }

  private shouldLog(level: LogEntry['level']): boolean {
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  private async log(level: LogEntry['level'], message: string, data?: any): Promise<void> {
    if (!this.shouldLog(level)) return;

    const logEntry: LogEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      source: Platform.OS,
      deviceInfo: {
        platform: Platform.OS,
        version: Platform.Version,
      },
    };

    // Add to queue
    this.logQueue.push(logEntry);

    // Console output in development
    if (__DEV__) {
      const consoleMethod = level.toLowerCase() as 'debug' | 'info' | 'warn' | 'error';
      console[consoleMethod](`[${level}] ${message}`, data || '');
    }

    // Persist logs periodically
    if (this.logQueue.length % 10 === 0) {
      await this.persistLogs();
    }
  }

  public debug(message: string, data?: any): void {
    this.log('DEBUG', message, data);
  }

  public info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  public warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  public error(message: string, data?: any): void {
    this.log('ERROR', message, data);
  }

  public async getLogs(level?: LogEntry['level'], limit?: number): Promise<LogEntry[]> {
    let logs = [...this.logQueue];

    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    if (limit) {
      logs = logs.slice(-limit);
    }

    return logs;
  }

  public async clearLogs(): Promise<void> {
    this.logQueue = [];
    await AsyncStorage.removeItem('@app_logs');
  }

  public async exportLogs(): Promise<string> {
    return JSON.stringify(this.logQueue, null, 2);
  }

  public setLogLevel(level: LogEntry['level']): void {
    this.logLevel = level;
  }
}

export const logger = Logger.getInstance();
