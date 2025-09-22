/**
 * Performance monitoring and metrics collection service
 * Tracks system performance, response times, and resource usage
 */

import { EventEmitter } from 'events';
import { Timestamp } from '../../types/core';

export interface PerformanceMetrics {
  system: SystemMetrics;
  cache: CachePerformanceMetrics;
  adapters: AdapterPerformanceMetrics;
  sync: SyncPerformanceMetrics;
  api: ApiPerformanceMetrics;
  errors: ErrorMetrics;
  timestamp: Timestamp;
}

export interface SystemMetrics {
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage: number;
  activeConnections: number;
  requestsPerSecond: number;
  averageResponseTime: number;
}

export interface CachePerformanceMetrics {
  hitRate: number;
  missRate: number;
  averageResponseTime: number;
  memoryUsage: number;
  keyCount: number;
  evictionRate: number;
}

export interface AdapterPerformanceMetrics {
  totalAdapters: number;
  healthyAdapters: number;
  averageResponseTime: number;
  syncSuccessRate: number;
  errorRate: number;
  dataValidationRate: number;
}

export interface SyncPerformanceMetrics {
  activeSyncs: number;
  syncThroughput: number; // events per second
  averageSyncTime: number;
  queueSize: number;
  backlogSize: number;
  syncSuccessRate: number;
}

export interface ApiPerformanceMetrics {
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  slowRequestsCount: number;
  timeoutCount: number;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorRate: number;
  criticalErrors: number;
  recentErrors: ErrorSample[];
}

export interface ErrorSample {
  timestamp: Timestamp;
  type: string;
  message: string;
  source: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface PerformanceAlert {
  id: string;
  type: AlertType;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  metric: string;
  threshold: number;
  currentValue: number;
  timestamp: Timestamp;
  resolved: boolean;
}

export type AlertType = 
  | 'HIGH_RESPONSE_TIME'
  | 'LOW_CACHE_HIT_RATE'
  | 'HIGH_ERROR_RATE'
  | 'HIGH_MEMORY_USAGE'
  | 'HIGH_CPU_USAGE'
  | 'ADAPTER_UNHEALTHY'
  | 'SYNC_BACKLOG'
  | 'CONNECTION_LIMIT';

export interface AlertThreshold {
  metric: string;
  warningThreshold: number;
  criticalThreshold: number;
  enabled: boolean;
}

export interface PerformanceConfig {
  metricsCollectionInterval: number; // milliseconds
  metricsRetentionPeriod: number; // milliseconds
  alertThresholds: AlertThreshold[];
  enableDetailedMetrics: boolean;
  enableAlerts: boolean;
  maxErrorSamples: number;
}

export class PerformanceMonitor extends EventEmitter {
  private config: PerformanceConfig;
  private metrics: PerformanceMetrics;
  private metricsHistory: PerformanceMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private errorSamples: ErrorSample[] = [];
  private metricsInterval: NodeJS.Timeout | null = null;
  private startTime: Timestamp;
  private requestCounts: number[] = [];
  private responseTimes: number[] = [];

  constructor(config: PerformanceConfig) {
    super();
    this.config = config;
    this.startTime = Date.now();
    this.metrics = this.initializeMetrics();
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    this.metricsInterval = setInterval(
      () => this.collectMetrics(),
      this.config.metricsCollectionInterval
    );

    console.log('Performance monitoring started');
    this.emit('monitor:started');
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    console.log('Performance monitoring stopped');
    this.emit('monitor:stopped');
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): PerformanceMetrics[] {
    const history = [...this.metricsHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(limit?: number): PerformanceAlert[] {
    const alerts = [...this.alerts];
    return limit ? alerts.slice(-limit) : alerts;
  }

  /**
   * Record API request
   */
  recordApiRequest(responseTime: number, success: boolean): void {
    this.responseTimes.push(responseTime);
    this.requestCounts.push(Date.now());

    // Keep only recent samples
    const cutoff = Date.now() - 60000; // Last minute
    this.requestCounts = this.requestCounts.filter(time => time > cutoff);
    
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }

    if (!success) {
      this.recordError({
        timestamp: Date.now(),
        type: 'API_ERROR',
        message: 'API request failed',
        source: 'api',
        severity: 'MEDIUM'
      });
    }

    // Check for slow requests
    if (responseTime > 5000) { // 5 seconds
      this.metrics.api.slowRequestsCount++;
    }
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(operation: 'hit' | 'miss', responseTime: number): void {
    // This would be called by the cache manager
    // Update cache metrics based on operation
  }

  /**
   * Record adapter operation
   */
  recordAdapterOperation(gameId: string, operation: string, responseTime: number, success: boolean): void {
    if (!success) {
      this.recordError({
        timestamp: Date.now(),
        type: 'ADAPTER_ERROR',
        message: `Adapter operation failed: ${operation}`,
        source: `adapter:${gameId}`,
        severity: 'HIGH'
      });
    }
  }

  /**
   * Record sync operation
   */
  recordSyncOperation(gameId: string, playerId: string, syncTime: number, success: boolean): void {
    if (!success) {
      this.recordError({
        timestamp: Date.now(),
        type: 'SYNC_ERROR',
        message: `Sync failed for player ${playerId}`,
        source: `sync:${gameId}`,
        severity: 'HIGH'
      });
    }
  }

  /**
   * Record error
   */
  recordError(error: ErrorSample): void {
    this.errorSamples.push(error);
    
    // Keep only recent errors
    if (this.errorSamples.length > this.config.maxErrorSamples) {
      this.errorSamples = this.errorSamples.slice(-this.config.maxErrorSamples);
    }

    // Update error metrics
    this.metrics.errors.totalErrors++;
    
    if (!this.metrics.errors.errorsByType[error.type]) {
      this.metrics.errors.errorsByType[error.type] = 0;
    }
    this.metrics.errors.errorsByType[error.type]++;

    if (error.severity === 'CRITICAL') {
      this.metrics.errors.criticalErrors++;
    }

    this.emit('error:recorded', error);
  }

  /**
   * Update system resource metrics
   */
  updateSystemMetrics(memoryUsage: number, cpuUsage: number, activeConnections: number): void {
    this.metrics.system.memoryUsage.used = memoryUsage;
    this.metrics.system.cpuUsage = cpuUsage;
    this.metrics.system.activeConnections = activeConnections;
  }

  /**
   * Update cache metrics
   */
  updateCacheMetrics(hitRate: number, responseTime: number, memoryUsage: number, keyCount: number): void {
    this.metrics.cache.hitRate = hitRate;
    this.metrics.cache.missRate = 100 - hitRate;
    this.metrics.cache.averageResponseTime = responseTime;
    this.metrics.cache.memoryUsage = memoryUsage;
    this.metrics.cache.keyCount = keyCount;
  }

  /**
   * Update adapter metrics
   */
  updateAdapterMetrics(totalAdapters: number, healthyAdapters: number, avgResponseTime: number): void {
    this.metrics.adapters.totalAdapters = totalAdapters;
    this.metrics.adapters.healthyAdapters = healthyAdapters;
    this.metrics.adapters.averageResponseTime = avgResponseTime;
    this.metrics.adapters.syncSuccessRate = totalAdapters > 0 ? (healthyAdapters / totalAdapters) * 100 : 0;
  }

  /**
   * Update sync metrics
   */
  updateSyncMetrics(activeSyncs: number, throughput: number, avgSyncTime: number, queueSize: number): void {
    this.metrics.sync.activeSyncs = activeSyncs;
    this.metrics.sync.syncThroughput = throughput;
    this.metrics.sync.averageSyncTime = avgSyncTime;
    this.metrics.sync.queueSize = queueSize;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    
    if (alert && !alert.resolved) {
      alert.resolved = true;
      this.emit('alert:resolved', alert);
      return true;
    }
    
    return false;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): any {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    return {
      uptime: uptime,
      status: this.getOverallStatus(),
      activeAlerts: this.getActiveAlerts().length,
      criticalErrors: this.metrics.errors.criticalErrors,
      cacheHitRate: this.metrics.cache.hitRate,
      averageResponseTime: this.metrics.api.averageResponseTime,
      requestsPerSecond: this.metrics.api.requestsPerSecond,
      healthyAdapters: `${this.metrics.adapters.healthyAdapters}/${this.metrics.adapters.totalAdapters}`,
      memoryUsage: this.metrics.system.memoryUsage.percentage
    };
  }

  // Private methods

  private async collectMetrics(): Promise<void> {
    try {
      // Update timestamp
      this.metrics.timestamp = Date.now();
      
      // Update system metrics
      this.updateSystemCalculatedMetrics();
      
      // Update API metrics
      this.updateApiCalculatedMetrics();
      
      // Update error metrics
      this.updateErrorCalculatedMetrics();
      
      // Store metrics in history
      this.storeMetricsInHistory();
      
      // Check for alerts
      if (this.config.enableAlerts) {
        this.checkAlertThresholds();
      }
      
      this.emit('metrics:collected', this.metrics);
      
    } catch (error) {
      console.error('Error collecting metrics:', error);
    }
  }

  private updateSystemCalculatedMetrics(): void {
    const uptime = Date.now() - this.startTime;
    this.metrics.system.uptime = uptime;
    
    // Calculate requests per second
    const recentRequests = this.requestCounts.filter(time => time > Date.now() - 60000);
    this.metrics.system.requestsPerSecond = recentRequests.length / 60;
    
    // Calculate average response time
    if (this.responseTimes.length > 0) {
      this.metrics.system.averageResponseTime = 
        this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    }
  }

  private updateApiCalculatedMetrics(): void {
    // Calculate requests per second
    const recentRequests = this.requestCounts.filter(time => time > Date.now() - 60000);
    this.metrics.api.requestsPerSecond = recentRequests.length / 60;
    
    // Calculate average response time
    if (this.responseTimes.length > 0) {
      this.metrics.api.averageResponseTime = 
        this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    }
    
    // Calculate error rate
    const recentErrors = this.errorSamples.filter(error => 
      error.timestamp > Date.now() - 60000 && error.source === 'api'
    );
    this.metrics.api.errorRate = recentRequests.length > 0 ? 
      (recentErrors.length / recentRequests.length) * 100 : 0;
  }

  private updateErrorCalculatedMetrics(): void {
    // Calculate error rate
    const recentErrors = this.errorSamples.filter(error => error.timestamp > Date.now() - 60000);
    const totalRecentRequests = this.requestCounts.filter(time => time > Date.now() - 60000).length;
    
    this.metrics.errors.errorRate = totalRecentRequests > 0 ? 
      (recentErrors.length / totalRecentRequests) * 100 : 0;
    
    // Update recent errors
    this.metrics.errors.recentErrors = recentErrors.slice(-10); // Last 10 errors
  }

  private storeMetricsInHistory(): void {
    this.metricsHistory.push({ ...this.metrics });
    
    // Clean up old metrics
    const cutoff = Date.now() - this.config.metricsRetentionPeriod;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);
  }

  private checkAlertThresholds(): void {
    for (const threshold of this.config.alertThresholds) {
      if (!threshold.enabled) continue;
      
      const currentValue = this.getMetricValue(threshold.metric);
      
      if (currentValue >= threshold.criticalThreshold) {
        this.createAlert(threshold.metric, 'CRITICAL', threshold.criticalThreshold, currentValue);
      } else if (currentValue >= threshold.warningThreshold) {
        this.createAlert(threshold.metric, 'WARNING', threshold.warningThreshold, currentValue);
      }
    }
  }

  private getMetricValue(metricPath: string): number {
    const parts = metricPath.split('.');
    let value: any = this.metrics;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return typeof value === 'number' ? value : 0;
  }

  private createAlert(metric: string, severity: 'WARNING' | 'CRITICAL', threshold: number, currentValue: number): void {
    // Check if similar alert already exists
    const existingAlert = this.alerts.find(alert => 
      alert.metric === metric && 
      alert.severity === severity && 
      !alert.resolved
    );
    
    if (existingAlert) return; // Don't create duplicate alerts
    
    const alert: PerformanceAlert = {
      id: this.generateAlertId(),
      type: this.getAlertType(metric),
      severity,
      message: `${metric} exceeded ${severity.toLowerCase()} threshold`,
      metric,
      threshold,
      currentValue,
      timestamp: Date.now(),
      resolved: false
    };
    
    this.alerts.push(alert);
    
    console.warn(`Performance alert: ${alert.message} (${currentValue} >= ${threshold})`);
    
    this.emit('alert:created', alert);
  }

  private getAlertType(metric: string): AlertType {
    if (metric.includes('responseTime')) return 'HIGH_RESPONSE_TIME';
    if (metric.includes('hitRate')) return 'LOW_CACHE_HIT_RATE';
    if (metric.includes('errorRate')) return 'HIGH_ERROR_RATE';
    if (metric.includes('memoryUsage')) return 'HIGH_MEMORY_USAGE';
    if (metric.includes('cpuUsage')) return 'HIGH_CPU_USAGE';
    if (metric.includes('healthyAdapters')) return 'ADAPTER_UNHEALTHY';
    if (metric.includes('queueSize')) return 'SYNC_BACKLOG';
    if (metric.includes('activeConnections')) return 'CONNECTION_LIMIT';
    
    return 'HIGH_RESPONSE_TIME'; // Default
  }

  private getOverallStatus(): 'HEALTHY' | 'DEGRADED' | 'CRITICAL' {
    const criticalAlerts = this.getActiveAlerts().filter(alert => alert.severity === 'CRITICAL');
    const warningAlerts = this.getActiveAlerts().filter(alert => alert.severity === 'WARNING');
    
    if (criticalAlerts.length > 0) return 'CRITICAL';
    if (warningAlerts.length > 0) return 'DEGRADED';
    
    return 'HEALTHY';
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      system: {
        uptime: 0,
        memoryUsage: { used: 0, total: 0, percentage: 0 },
        cpuUsage: 0,
        activeConnections: 0,
        requestsPerSecond: 0,
        averageResponseTime: 0
      },
      cache: {
        hitRate: 0,
        missRate: 0,
        averageResponseTime: 0,
        memoryUsage: 0,
        keyCount: 0,
        evictionRate: 0
      },
      adapters: {
        totalAdapters: 0,
        healthyAdapters: 0,
        averageResponseTime: 0,
        syncSuccessRate: 0,
        errorRate: 0,
        dataValidationRate: 0
      },
      sync: {
        activeSyncs: 0,
        syncThroughput: 0,
        averageSyncTime: 0,
        queueSize: 0,
        backlogSize: 0,
        syncSuccessRate: 0
      },
      api: {
        requestsPerSecond: 0,
        averageResponseTime: 0,
        errorRate: 0,
        slowRequestsCount: 0,
        timeoutCount: 0
      },
      errors: {
        totalErrors: 0,
        errorsByType: {},
        errorRate: 0,
        criticalErrors: 0,
        recentErrors: []
      },
      timestamp: Date.now()
    };
  }
}