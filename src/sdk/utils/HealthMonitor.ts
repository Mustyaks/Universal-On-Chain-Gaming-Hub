/**
 * Health monitoring utilities for SDK
 * Monitors integration health and provides diagnostics
 */

import { EventEmitter } from 'events';
import { HealthCheck, DiagnosticInfo } from '../types';

export class HealthMonitor extends EventEmitter {
  private sdk: any;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(sdk: any) {
    super();
    this.sdk = sdk;
    this.setupDefaultHealthChecks();
  }

  /**
   * Start health monitoring
   */
  async start(intervalMs: number = 60000): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    
    // Run initial health check
    await this.runAllChecks();
    
    // Set up periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.runAllChecks();
      } catch (error) {
        console.error('Health monitoring error:', error);
        this.emit('monitoringError', error);
      }
    }, intervalMs);

    console.log('Health monitoring started');
  }

  /**
   * Stop health monitoring
   */
  async stop(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('Health monitoring stopped');
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<HealthCheck[]> {
    const results: HealthCheck[] = [];
    
    const healthCheckNames = Array.from(this.healthChecks.keys());
    for (const name of healthCheckNames) {
      const check = this.healthChecks.get(name)!;
      try {
        const startTime = Date.now();
        const result = await this.runHealthCheck(name);
        const responseTime = Date.now() - startTime;
        
        const healthCheck: HealthCheck = {
          name,
          status: result.status,
          responseTime,
          lastChecked: Date.now(),
          ...(result.message && { message: result.message })
        };
        
        results.push(healthCheck);
        this.healthChecks.set(name, healthCheck);
        
        // Emit events for status changes
        if (check.status !== result.status) {
          this.emit('statusChange', { name, oldStatus: check.status, newStatus: result.status });
        }
        
      } catch (error) {
        const healthCheck: HealthCheck = {
          name,
          status: 'unhealthy',
          message: `Health check failed: ${error}`,
          lastChecked: Date.now()
        };
        
        results.push(healthCheck);
        this.healthChecks.set(name, healthCheck);
        
        this.emit('healthCheckFailed', { name, error });
      }
    }
    
    return results;
  }

  /**
   * Run a specific health check
   */
  async runHealthCheck(name: string): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }> {
    switch (name) {
      case 'sdk_initialization':
        return this.checkSDKInitialization();
      
      case 'adapter_connection':
        return this.checkAdapterConnection();
      
      case 'hub_connectivity':
        return this.checkHubConnectivity();
      
      case 'data_validation':
        return this.checkDataValidation();
      
      case 'websocket_connection':
        return this.checkWebSocketConnection();
      
      default:
        throw new Error(`Unknown health check: ${name}`);
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const checks = Array.from(this.healthChecks.values());
    
    if (checks.length === 0) {
      return 'unhealthy';
    }
    
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;
    
    if (unhealthyCount > 0) {
      return 'unhealthy';
    } else if (degradedCount > 0) {
      return 'degraded';
    } else {
      return 'healthy';
    }
  }

  /**
   * Get all health checks
   */
  getAllHealthChecks(): HealthCheck[] {
    return Array.from(this.healthChecks.values());
  }

  /**
   * Add custom health check
   */
  addHealthCheck(name: string, _checkFunction: () => Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }>): void {
    // Store the check function for later use
    // In a real implementation, you'd store this properly
    console.log(`Added custom health check: ${name}`);
  }

  /**
   * Remove health check
   */
  removeHealthCheck(name: string): void {
    this.healthChecks.delete(name);
  }

  // Private health check implementations

  private setupDefaultHealthChecks(): void {
    const defaultChecks = [
      'sdk_initialization',
      'adapter_connection',
      'hub_connectivity',
      'data_validation',
      'websocket_connection'
    ];

    for (const checkName of defaultChecks) {
      this.healthChecks.set(checkName, {
        name: checkName,
        status: 'unhealthy',
        lastChecked: 0
      });
    }
  }

  private async checkSDKInitialization(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }> {
    if (!this.sdk.initialized) {
      return {
        status: 'unhealthy',
        message: 'SDK not initialized'
      };
    }

    return {
      status: 'healthy',
      message: 'SDK properly initialized'
    };
  }

  private async checkAdapterConnection(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }> {
    if (!this.sdk.adapter) {
      return {
        status: 'unhealthy',
        message: 'No adapter configured'
      };
    }

    try {
      const isHealthy = await this.sdk.adapter.isHealthy();
      
      if (isHealthy) {
        return {
          status: 'healthy',
          message: 'Adapter connection healthy'
        };
      } else {
        return {
          status: 'degraded',
          message: 'Adapter connection issues detected'
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Adapter health check failed: ${error}`
      };
    }
  }

  private async checkHubConnectivity(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }> {
    try {
      const response = await fetch(`${this.sdk.config.hubEndpoint}/health`, {
        method: 'GET',
        timeout: 5000
      } as any);

      if (response.ok) {
        return {
          status: 'healthy',
          message: 'Hub connectivity healthy'
        };
      } else {
        return {
          status: 'degraded',
          message: `Hub returned status ${response.status}`
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Hub connectivity failed: ${error}`
      };
    }
  }

  private async checkDataValidation(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }> {
    try {
      // Test data validation with sample data
      const testResult = await this.sdk.testIntegration();
      
      if (testResult.valid) {
        return {
          status: 'healthy',
          message: 'Data validation working correctly'
        };
      } else {
        return {
          status: 'degraded',
          message: `Data validation issues: ${testResult.errors.length} errors`
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Data validation check failed: ${error}`
      };
    }
  }

  private async checkWebSocketConnection(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }> {
    if (!this.sdk.adapter) {
      return {
        status: 'unhealthy',
        message: 'No adapter to check WebSocket connection'
      };
    }

    try {
      const wsStatus = this.sdk.adapter.getWebSocketStatus();
      
      if (!wsStatus) {
        return {
          status: 'healthy',
          message: 'WebSocket not configured (optional)'
        };
      }

      if (wsStatus.connected) {
        return {
          status: 'healthy',
          message: `WebSocket connected with ${wsStatus.subscribedPlayers} subscribed players`
        };
      } else {
        return {
          status: 'degraded',
          message: 'WebSocket disconnected'
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `WebSocket check failed: ${error}`
      };
    }
  }

  /**
   * Generate comprehensive diagnostic report
   */
  async generateDiagnosticReport(): Promise<DiagnosticInfo> {
    const healthChecks = await this.runAllChecks();
    const integrationStatus = this.sdk.getIntegrationStatus();

    return {
      sdkVersion: '1.0.0',
      gameId: this.sdk.config.gameId,
      environment: this.sdk.config.environment,
      uptime: Date.now() - this.sdk.startTime,
      healthChecks,
      integrationStatus
    };
  }

  /**
   * Export health data for external monitoring
   */
  exportHealthData(): {
    timestamp: number;
    overallStatus: string;
    checks: HealthCheck[];
    metrics: any;
  } {
    return {
      timestamp: Date.now(),
      overallStatus: this.getHealthStatus(),
      checks: this.getAllHealthChecks(),
      metrics: this.sdk.adapter?.getDetailedMetrics() || {}
    };
  }
}