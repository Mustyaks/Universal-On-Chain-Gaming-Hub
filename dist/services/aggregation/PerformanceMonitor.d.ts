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
    syncThroughput: number;
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
export type AlertType = 'HIGH_RESPONSE_TIME' | 'LOW_CACHE_HIT_RATE' | 'HIGH_ERROR_RATE' | 'HIGH_MEMORY_USAGE' | 'HIGH_CPU_USAGE' | 'ADAPTER_UNHEALTHY' | 'SYNC_BACKLOG' | 'CONNECTION_LIMIT';
export interface AlertThreshold {
    metric: string;
    warningThreshold: number;
    criticalThreshold: number;
    enabled: boolean;
}
export interface PerformanceConfig {
    metricsCollectionInterval: number;
    metricsRetentionPeriod: number;
    alertThresholds: AlertThreshold[];
    enableDetailedMetrics: boolean;
    enableAlerts: boolean;
    maxErrorSamples: number;
}
export declare class PerformanceMonitor extends EventEmitter {
    private config;
    private metrics;
    private metricsHistory;
    private alerts;
    private errorSamples;
    private metricsInterval;
    private startTime;
    private requestCounts;
    private responseTimes;
    constructor(config: PerformanceConfig);
    start(): void;
    stop(): void;
    getCurrentMetrics(): PerformanceMetrics;
    getMetricsHistory(limit?: number): PerformanceMetrics[];
    getActiveAlerts(): PerformanceAlert[];
    getAllAlerts(limit?: number): PerformanceAlert[];
    recordApiRequest(responseTime: number, success: boolean): void;
    recordCacheOperation(operation: 'hit' | 'miss', responseTime: number): void;
    recordAdapterOperation(gameId: string, operation: string, responseTime: number, success: boolean): void;
    recordSyncOperation(gameId: string, playerId: string, syncTime: number, success: boolean): void;
    recordError(error: ErrorSample): void;
    updateSystemMetrics(memoryUsage: number, cpuUsage: number, activeConnections: number): void;
    updateCacheMetrics(hitRate: number, responseTime: number, memoryUsage: number, keyCount: number): void;
    updateAdapterMetrics(totalAdapters: number, healthyAdapters: number, avgResponseTime: number): void;
    updateSyncMetrics(activeSyncs: number, throughput: number, avgSyncTime: number, queueSize: number): void;
    resolveAlert(alertId: string): boolean;
    getPerformanceSummary(): any;
    private collectMetrics;
    private updateSystemCalculatedMetrics;
    private updateApiCalculatedMetrics;
    private updateErrorCalculatedMetrics;
    private storeMetricsInHistory;
    private checkAlertThresholds;
    private getMetricValue;
    private createAlert;
    private getAlertType;
    private getOverallStatus;
    private generateAlertId;
    private initializeMetrics;
}
//# sourceMappingURL=PerformanceMonitor.d.ts.map