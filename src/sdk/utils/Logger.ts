/**
 * Logging utilities for SDK
 * Provides structured logging with different levels and contexts
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: string;
  data?: any;
  gameId?: string;
  playerId?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  maxEntries: number;
  gameId?: string;
}

export class Logger {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: 'info',
      enableConsole: true,
      enableFile: false,
      maxEntries: 1000,
      ...config
    };
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: string, data?: any): void {
    this.log('debug', message, context, data);
  }

  /**
   * Log info message
   */
  info(message: string, context?: string, data?: any): void {
    this.log('info', message, context, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: string, data?: any): void {
    this.log('warn', message, context, data);
  }

  /**
   * Log error message
   */
  error(message: string, context?: string, data?: any): void {
    this.log('error', message, context, data);
  }

  /**
   * Log with specific player context
   */
  logForPlayer(level: LogLevel, message: string, playerId: string, data?: any): void {
    this.log(level, message, 'player', { ...data, playerId });
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation: string, duration: number, success: boolean, data?: any): void {
    this.log('info', `Performance: ${operation}`, 'performance', {
      duration,
      success,
      ...data
    });
  }

  /**
   * Log integration events
   */
  logIntegration(event: string, data?: any): void {
    this.log('info', `Integration: ${event}`, 'integration', data);
  }

  /**
   * Log validation results
   */
  logValidation(type: string, valid: boolean, errors?: any[], warnings?: any[]): void {
    const level: LogLevel = valid ? 'info' : 'warn';
    this.log(level, `Validation: ${type}`, 'validation', {
      valid,
      errorCount: errors?.length || 0,
      warningCount: warnings?.length || 0,
      errors,
      warnings
    });
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: string, data?: any): void {
    // Check if log level meets threshold
    if (this.levelPriority[level] < this.levelPriority[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
      data,
      gameId: this.config.gameId
    };

    // Add to internal log storage
    this.addLogEntry(entry);

    // Output to console if enabled
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // Output to file if enabled (mock implementation)
    if (this.config.enableFile) {
      this.logToFile(entry);
    }
  }

  /**
   * Add log entry to internal storage
   */
  private addLogEntry(entry: LogEntry): void {
    this.logs.push(entry);

    // Maintain max entries limit
    if (this.logs.length > this.config.maxEntries) {
      this.logs = this.logs.slice(-this.config.maxEntries);
    }
  }

  /**
   * Output log to console
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const context = entry.context ? `[${entry.context}]` : '';
    const gameId = entry.gameId ? `[${entry.gameId}]` : '';
    const prefix = `${timestamp} ${gameId}${context}`;

    const logMessage = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case 'debug':
        console.debug(logMessage, entry.data || '');
        break;
      case 'info':
        console.info(logMessage, entry.data || '');
        break;
      case 'warn':
        console.warn(logMessage, entry.data || '');
        break;
      case 'error':
        console.error(logMessage, entry.data || '');
        break;
    }
  }

  /**
   * Output log to file (mock implementation)
   */
  private logToFile(entry: LogEntry): void {
    // In a real implementation, this would write to a file
    // For now, we'll just store it in memory
    console.log(`[FILE LOG] ${JSON.stringify(entry)}`);
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count: number = 100, level?: LogLevel): LogEntry[] {
    let filteredLogs = this.logs;

    if (level) {
      filteredLogs = this.logs.filter(log => log.level === level);
    }

    return filteredLogs.slice(-count);
  }

  /**
   * Get logs by context
   */
  getLogsByContext(context: string, count: number = 100): LogEntry[] {
    return this.logs
      .filter(log => log.context === context)
      .slice(-count);
  }

  /**
   * Get logs for specific player
   */
  getLogsForPlayer(playerId: string, count: number = 100): LogEntry[] {
    return this.logs
      .filter(log => log.data?.playerId === playerId)
      .slice(-count);
  }

  /**
   * Get error logs
   */
  getErrorLogs(count: number = 50): LogEntry[] {
    return this.logs
      .filter(log => log.level === 'error')
      .slice(-count);
  }

  /**
   * Get performance logs
   */
  getPerformanceLogs(count: number = 100): LogEntry[] {
    return this.logs
      .filter(log => log.context === 'performance')
      .slice(-count);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.config.level = level;
    this.info(`Log level changed to ${level}`, 'logger');
  }

  /**
   * Enable/disable console logging
   */
  setConsoleLogging(enabled: boolean): void {
    this.config.enableConsole = enabled;
    this.info(`Console logging ${enabled ? 'enabled' : 'disabled'}`, 'logger');
  }

  /**
   * Enable/disable file logging
   */
  setFileLogging(enabled: boolean): void {
    this.config.enableFile = enabled;
    this.info(`File logging ${enabled ? 'enabled' : 'disabled'}`, 'logger');
  }

  /**
   * Get logging statistics
   */
  getStatistics(): {
    totalLogs: number;
    logsByLevel: Record<LogLevel, number>;
    logsByContext: Record<string, number>;
    oldestLog?: number;
    newestLog?: number;
  } {
    const logsByLevel: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0
    };

    const logsByContext: Record<string, number> = {};

    for (const log of this.logs) {
      logsByLevel[log.level]++;
      
      if (log.context) {
        logsByContext[log.context] = (logsByContext[log.context] || 0) + 1;
      }
    }

    return {
      totalLogs: this.logs.length,
      logsByLevel,
      logsByContext,
      oldestLog: this.logs.length > 0 ? this.logs[0].timestamp : undefined,
      newestLog: this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : undefined
    };
  }

  /**
   * Export logs as JSON
   */
  exportLogs(filters?: {
    level?: LogLevel;
    context?: string;
    startTime?: number;
    endTime?: number;
  }): LogEntry[] {
    let filteredLogs = this.logs;

    if (filters) {
      if (filters.level) {
        filteredLogs = filteredLogs.filter(log => log.level === filters.level);
      }

      if (filters.context) {
        filteredLogs = filteredLogs.filter(log => log.context === filters.context);
      }

      if (filters.startTime) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= filters.startTime!);
      }

      if (filters.endTime) {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= filters.endTime!);
      }
    }

    return filteredLogs;
  }

  /**
   * Create child logger with specific context
   */
  createChildLogger(context: string): ChildLogger {
    return new ChildLogger(this, context);
  }
}

/**
 * Child logger that automatically includes context
 */
export class ChildLogger {
  constructor(private parent: Logger, private context: string) {}

  debug(message: string, data?: any): void {
    this.parent.debug(message, this.context, data);
  }

  info(message: string, data?: any): void {
    this.parent.info(message, this.context, data);
  }

  warn(message: string, data?: any): void {
    this.parent.warn(message, this.context, data);
  }

  error(message: string, data?: any): void {
    this.parent.error(message, this.context, data);
  }

  logForPlayer(level: LogLevel, message: string, playerId: string, data?: any): void {
    this.parent.logForPlayer(level, message, playerId, { ...data, context: this.context });
  }
}

// Default logger instance
export const defaultLogger = new Logger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  enableConsole: true,
  enableFile: false,
  maxEntries: 1000
});