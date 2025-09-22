/**
 * Plugin registry system for managing different Dojo game adapters
 * Provides centralized registration, discovery, and lifecycle management
 */

import { GameAdapter, GameAdapterConfig, GameFeature } from './GameAdapter';
import { GameHubError } from '../../types/core';
import { EventService } from '../../types/services';

export interface AdapterRegistration {
  adapter: GameAdapter;
  config: GameAdapterConfig;
  registeredAt: number;
  isActive: boolean;
  lastHealthCheck: number;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
}

export interface RegistryEvents {
  'adapter:registered': { gameId: string; adapter: GameAdapter };
  'adapter:unregistered': { gameId: string };
  'adapter:health_changed': { gameId: string; status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' };
  'adapter:error': { gameId: string; error: GameHubError };
}

export class AdapterRegistry {
  private adapters = new Map<string, AdapterRegistration>();
  private eventService: EventService;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

  constructor(eventService: EventService) {
    this.eventService = eventService;
    this.startHealthChecking();
  }

  /**
   * Register a new game adapter
   */
  async registerAdapter(adapter: GameAdapter, config: GameAdapterConfig): Promise<void> {
    const gameId = adapter.gameId;
    
    if (this.adapters.has(gameId)) {
      throw new Error(`Adapter for game ${gameId} is already registered`);
    }

    // Validate adapter configuration
    this.validateAdapterConfig(config);

    // Perform initial health check
    const isHealthy = await adapter.isHealthy();
    
    const registration: AdapterRegistration = {
      adapter,
      config,
      registeredAt: Date.now(),
      isActive: true,
      lastHealthCheck: Date.now(),
      healthStatus: isHealthy ? 'HEALTHY' : 'UNHEALTHY'
    };

    this.adapters.set(gameId, registration);
    
    console.log(`Registered adapter for game: ${gameId} (${adapter.gameName})`);
    
    this.eventService.emit('adapter:registered', { gameId, adapter });
  }

  /**
   * Unregister a game adapter
   */
  async unregisterAdapter(gameId: string): Promise<void> {
    const registration = this.adapters.get(gameId);
    
    if (!registration) {
      throw new Error(`No adapter registered for game: ${gameId}`);
    }

    // Clean up adapter resources
    try {
      await registration.adapter.unsubscribeFromUpdates();
    } catch (error) {
      console.warn(`Error cleaning up adapter ${gameId}:`, error);
    }

    this.adapters.delete(gameId);
    
    console.log(`Unregistered adapter for game: ${gameId}`);
    
    this.eventService.emit('adapter:unregistered', { gameId });
  }

  /**
   * Get a registered adapter by game ID
   */
  getAdapter(gameId: string): GameAdapter | null {
    const registration = this.adapters.get(gameId);
    return registration?.isActive ? registration.adapter : null;
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): GameAdapter[] {
    return Array.from(this.adapters.values())
      .filter(reg => reg.isActive)
      .map(reg => reg.adapter);
  }

  /**
   * Get adapters that support specific features
   */
  getAdaptersByFeature(feature: GameFeature): GameAdapter[] {
    return this.getAllAdapters().filter(adapter => 
      adapter.supportedFeatures.includes(feature)
    );
  }

  /**
   * Get adapter registration info
   */
  getAdapterInfo(gameId: string): AdapterRegistration | null {
    return this.adapters.get(gameId) || null;
  }

  /**
   * Get all adapter registrations with their status
   */
  getAllAdapterInfo(): AdapterRegistration[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check if a game is supported
   */
  isGameSupported(gameId: string): boolean {
    const registration = this.adapters.get(gameId);
    return registration?.isActive === true;
  }

  /**
   * Get list of supported game IDs
   */
  getSupportedGames(): string[] {
    return Array.from(this.adapters.keys()).filter(gameId => {
      const registration = this.adapters.get(gameId);
      return registration?.isActive === true;
    });
  }

  /**
   * Activate/deactivate an adapter
   */
  setAdapterActive(gameId: string, active: boolean): void {
    const registration = this.adapters.get(gameId);
    
    if (!registration) {
      throw new Error(`No adapter registered for game: ${gameId}`);
    }

    registration.isActive = active;
    
    console.log(`Adapter ${gameId} ${active ? 'activated' : 'deactivated'}`);
  }

  /**
   * Perform health check on all adapters
   */
  async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.adapters.entries()).map(
      async ([gameId, registration]) => {
        if (!registration.isActive) return;

        try {
          const isHealthy = await registration.adapter.isHealthy();
          const newStatus = isHealthy ? 'HEALTHY' : 'UNHEALTHY';
          
          if (registration.healthStatus !== newStatus) {
            registration.healthStatus = newStatus;
            this.eventService.emit('adapter:health_changed', { gameId, status: newStatus });
          }
          
          registration.lastHealthCheck = Date.now();
        } catch (error) {
          const gameError = registration.adapter.handleError(error);
          registration.healthStatus = 'UNHEALTHY';
          
          console.error(`Health check failed for adapter ${gameId}:`, gameError);
          
          this.eventService.emit('adapter:error', { gameId, error: gameError });
          this.eventService.emit('adapter:health_changed', { gameId, status: 'UNHEALTHY' });
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Get health summary of all adapters
   */
  getHealthSummary(): {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    inactive: number;
  } {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let inactive = 0;

    for (const registration of this.adapters.values()) {
      if (!registration.isActive) {
        inactive++;
      } else {
        switch (registration.healthStatus) {
          case 'HEALTHY':
            healthy++;
            break;
          case 'DEGRADED':
            degraded++;
            break;
          case 'UNHEALTHY':
            unhealthy++;
            break;
        }
      }
    }

    return {
      total: this.adapters.size,
      healthy,
      degraded,
      unhealthy,
      inactive
    };
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.HEALTH_CHECK_INTERVAL_MS
    );
  }

  /**
   * Stop periodic health checking
   */
  stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Validate adapter configuration
   */
  private validateAdapterConfig(config: GameAdapterConfig): void {
    if (!config.gameId) {
      throw new Error('Game ID is required');
    }

    if (!config.gameName) {
      throw new Error('Game name is required');
    }

    if (!config.contractAddress) {
      throw new Error('Contract address is required');
    }

    if (!config.rpcEndpoint) {
      throw new Error('RPC endpoint is required');
    }

    if (!config.retryConfig) {
      throw new Error('Retry configuration is required');
    }

    if (!config.cacheConfig) {
      throw new Error('Cache configuration is required');
    }

    // Validate retry config
    const { maxRetries, baseDelayMs, maxDelayMs, backoffMultiplier } = config.retryConfig;
    
    if (maxRetries < 0 || maxRetries > 10) {
      throw new Error('Max retries must be between 0 and 10');
    }

    if (baseDelayMs < 100 || baseDelayMs > 10000) {
      throw new Error('Base delay must be between 100ms and 10s');
    }

    if (maxDelayMs < baseDelayMs) {
      throw new Error('Max delay must be greater than base delay');
    }

    if (backoffMultiplier < 1 || backoffMultiplier > 5) {
      throw new Error('Backoff multiplier must be between 1 and 5');
    }

    // Validate cache config
    const { ttlSeconds, maxEntries } = config.cacheConfig;
    
    if (ttlSeconds < 60 || ttlSeconds > 3600) {
      throw new Error('Cache TTL must be between 60s and 1 hour');
    }

    if (maxEntries < 100 || maxEntries > 10000) {
      throw new Error('Max cache entries must be between 100 and 10000');
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    this.stopHealthChecking();
    
    // Unregister all adapters
    const gameIds = Array.from(this.adapters.keys());
    
    for (const gameId of gameIds) {
      try {
        await this.unregisterAdapter(gameId);
      } catch (error) {
        console.error(`Error unregistering adapter ${gameId}:`, error);
      }
    }
  }
}