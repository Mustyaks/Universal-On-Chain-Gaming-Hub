"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = void 0;
const events_1 = require("events");
class PerformanceMonitor extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.metricsHistory = [];
        this.alerts = [];
        this.errorSamples = [];
        this.metricsInterval = null;
        this.requestCounts = [];
        this.responseTimes = [];
        this.config = config;
        this.startTime = Date.now();
        this.metrics = this.initializeMetrics();
    }
    start() {
        this.metricsInterval = setInterval(() => this.collectMetrics(), this.config.metricsCollectionInterval);
        console.log('Performance monitoring started');
        this.emit('monitor:started');
    }
    stop() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
        console.log('Performance monitoring stopped');
        this.emit('monitor:stopped');
    }
    getCurrentMetrics() {
        return { ...this.metrics };
    }
    getMetricsHistory(limit) {
        const history = [...this.metricsHistory];
        return limit ? history.slice(-limit) : history;
    }
    getActiveAlerts() {
        return this.alerts.filter(alert => !alert.resolved);
    }
    getAllAlerts(limit) {
        const alerts = [...this.alerts];
        return limit ? alerts.slice(-limit) : alerts;
    }
    recordApiRequest(responseTime, success) {
        this.responseTimes.push(responseTime);
        this.requestCounts.push(Date.now());
        const cutoff = Date.now() - 60000;
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
        if (responseTime > 5000) {
            this.metrics.api.slowRequestsCount++;
        }
    }
    recordCacheOperation(operation, responseTime) {
    }
    recordAdapterOperation(gameId, operation, responseTime, success) {
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
    recordSyncOperation(gameId, playerId, syncTime, success) {
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
    recordError(error) {
        this.errorSamples.push(error);
        if (this.errorSamples.length > this.config.maxErrorSamples) {
            this.errorSamples = this.errorSamples.slice(-this.config.maxErrorSamples);
        }
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
    updateSystemMetrics(memoryUsage, cpuUsage, activeConnections) {
        this.metrics.system.memoryUsage.used = memoryUsage;
        this.metrics.system.cpuUsage = cpuUsage;
        this.metrics.system.activeConnections = activeConnections;
    }
    updateCacheMetrics(hitRate, responseTime, memoryUsage, keyCount) {
        this.metrics.cache.hitRate = hitRate;
        this.metrics.cache.missRate = 100 - hitRate;
        this.metrics.cache.averageResponseTime = responseTime;
        this.metrics.cache.memoryUsage = memoryUsage;
        this.metrics.cache.keyCount = keyCount;
    }
    updateAdapterMetrics(totalAdapters, healthyAdapters, avgResponseTime) {
        this.metrics.adapters.totalAdapters = totalAdapters;
        this.metrics.adapters.healthyAdapters = healthyAdapters;
        this.metrics.adapters.averageResponseTime = avgResponseTime;
        this.metrics.adapters.syncSuccessRate = totalAdapters > 0 ? (healthyAdapters / totalAdapters) * 100 : 0;
    }
    updateSyncMetrics(activeSyncs, throughput, avgSyncTime, queueSize) {
        this.metrics.sync.activeSyncs = activeSyncs;
        this.metrics.sync.syncThroughput = throughput;
        this.metrics.sync.averageSyncTime = avgSyncTime;
        this.metrics.sync.queueSize = queueSize;
    }
    resolveAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert && !alert.resolved) {
            alert.resolved = true;
            this.emit('alert:resolved', alert);
            return true;
        }
        return false;
    }
    getPerformanceSummary() {
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
    async collectMetrics() {
        try {
            this.metrics.timestamp = Date.now();
            this.updateSystemCalculatedMetrics();
            this.updateApiCalculatedMetrics();
            this.updateErrorCalculatedMetrics();
            this.storeMetricsInHistory();
            if (this.config.enableAlerts) {
                this.checkAlertThresholds();
            }
            this.emit('metrics:collected', this.metrics);
        }
        catch (error) {
            console.error('Error collecting metrics:', error);
        }
    }
    updateSystemCalculatedMetrics() {
        const uptime = Date.now() - this.startTime;
        this.metrics.system.uptime = uptime;
        const recentRequests = this.requestCounts.filter(time => time > Date.now() - 60000);
        this.metrics.system.requestsPerSecond = recentRequests.length / 60;
        if (this.responseTimes.length > 0) {
            this.metrics.system.averageResponseTime =
                this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
        }
    }
    updateApiCalculatedMetrics() {
        const recentRequests = this.requestCounts.filter(time => time > Date.now() - 60000);
        this.metrics.api.requestsPerSecond = recentRequests.length / 60;
        if (this.responseTimes.length > 0) {
            this.metrics.api.averageResponseTime =
                this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
        }
        const recentErrors = this.errorSamples.filter(error => error.timestamp > Date.now() - 60000 && error.source === 'api');
        this.metrics.api.errorRate = recentRequests.length > 0 ?
            (recentErrors.length / recentRequests.length) * 100 : 0;
    }
    updateErrorCalculatedMetrics() {
        const recentErrors = this.errorSamples.filter(error => error.timestamp > Date.now() - 60000);
        const totalRecentRequests = this.requestCounts.filter(time => time > Date.now() - 60000).length;
        this.metrics.errors.errorRate = totalRecentRequests > 0 ?
            (recentErrors.length / totalRecentRequests) * 100 : 0;
        this.metrics.errors.recentErrors = recentErrors.slice(-10);
    }
    storeMetricsInHistory() {
        this.metricsHistory.push({ ...this.metrics });
        const cutoff = Date.now() - this.config.metricsRetentionPeriod;
        this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);
    }
    checkAlertThresholds() {
        for (const threshold of this.config.alertThresholds) {
            if (!threshold.enabled)
                continue;
            const currentValue = this.getMetricValue(threshold.metric);
            if (currentValue >= threshold.criticalThreshold) {
                this.createAlert(threshold.metric, 'CRITICAL', threshold.criticalThreshold, currentValue);
            }
            else if (currentValue >= threshold.warningThreshold) {
                this.createAlert(threshold.metric, 'WARNING', threshold.warningThreshold, currentValue);
            }
        }
    }
    getMetricValue(metricPath) {
        const parts = metricPath.split('.');
        let value = this.metrics;
        for (const part of parts) {
            value = value?.[part];
        }
        return typeof value === 'number' ? value : 0;
    }
    createAlert(metric, severity, threshold, currentValue) {
        const existingAlert = this.alerts.find(alert => alert.metric === metric &&
            alert.severity === severity &&
            !alert.resolved);
        if (existingAlert)
            return;
        const alert = {
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
    getAlertType(metric) {
        if (metric.includes('responseTime'))
            return 'HIGH_RESPONSE_TIME';
        if (metric.includes('hitRate'))
            return 'LOW_CACHE_HIT_RATE';
        if (metric.includes('errorRate'))
            return 'HIGH_ERROR_RATE';
        if (metric.includes('memoryUsage'))
            return 'HIGH_MEMORY_USAGE';
        if (metric.includes('cpuUsage'))
            return 'HIGH_CPU_USAGE';
        if (metric.includes('healthyAdapters'))
            return 'ADAPTER_UNHEALTHY';
        if (metric.includes('queueSize'))
            return 'SYNC_BACKLOG';
        if (metric.includes('activeConnections'))
            return 'CONNECTION_LIMIT';
        return 'HIGH_RESPONSE_TIME';
    }
    getOverallStatus() {
        const criticalAlerts = this.getActiveAlerts().filter(alert => alert.severity === 'CRITICAL');
        const warningAlerts = this.getActiveAlerts().filter(alert => alert.severity === 'WARNING');
        if (criticalAlerts.length > 0)
            return 'CRITICAL';
        if (warningAlerts.length > 0)
            return 'DEGRADED';
        return 'HEALTHY';
    }
    generateAlertId() {
        return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    initializeMetrics() {
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
exports.PerformanceMonitor = PerformanceMonitor;
//# sourceMappingURL=PerformanceMonitor.js.map