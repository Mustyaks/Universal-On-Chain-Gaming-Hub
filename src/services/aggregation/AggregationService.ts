/**
 * Main aggregation service that orchestrates all components
 * Provides a unified interface for game data aggregation and management
 */

import { EventEmitter } from 'events';
import { AdapterRegistry } from './AdapterRegistry';
import { SyncEngine, SyncEngineConfig } from './SyncEngine';
import { DataValidator, ValidationConfig } from './DataValidator';
import { EventSystem } from './EventSystem';
import { CacheManager, CacheConfig } from './CacheManager';
import { PerformanceMonitor, PerformanceConfig } from './PerformanceMonitor';
import { GameAdapter, GameAdapterConfig } from './GameAdapter';
import { ErrorHandler } from './ErrorHandler';
import {
  StandardizedGameData,
  PlayerGameData,
  GameAsset,
  Achievement,
  GameHubError
} from '../../types/core';
import { AggregationService as IAggregationService } from '../../types/services';

export interface AggregationServiceConfig {
  sync: SyncEngineConfig;
  validation: ValidationConfig;
  cache: CacheConfig;
  performance: PerformanceConfig;
  enableRealTimeSync: boolean;
  enableCaching: boolean;
  enablePerformanceMonitoring: boolean;
  enableDataValidation: boolean;
}

export interface AggregationStatus {
  isRunning: boolean;
  registeredGames: number;
  activeSyncs: number;
  cacheHitRate: number;
  averageResponseTime: number;
  errorRate: number;
  lastSyncTime: number;
}

export class AggregationService extends EventEmitter implements IAggregationService {
  private config: AggregationServiceConfig;
  private adapterRegistry: AdapterRegistry;
  private syncEngine: SyncEngine;
  private dataValidator: DataValidator;
  private eventSystem: EventSystem;
  private cacheManager: CacheManager | null = null;
  private performanceMonitor: PerformanceMonitor | null = null;
  private isInitialized = false;
  private isRunning = false;

  constructor(config: AggregationServiceConfig) {
    super();
    this.config = config;
    
    // Initialize core components
    this.eventSystem = new EventSystem();
    this.adapterRegistry = new AdapterRegistry(this.eventSystem);
    this.syncEngine = new SyncEngine(config.sync, this.adapterRegistry);
    this.dataValidator = new DataValidator(this.adapterRegistry, config.validation);
    
    // Initialize optional components
    if (config.enableCaching) {
      this.cacheManager = new CacheManager(config.cache);
    }
    
    if (config.enablePerformanceMonitoring) {
      this.performanceMonitor = new PerformanceMonitor(config.performance);
    }
    
    this.setupEventHandlers();
  }

  /**
   * Initialize the aggregation service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Aggregation service is already initialized');
    }

    try {
      console.log('Initializing aggregation service...');

      // Initialize cache manager if enabled
      if (this.cacheManager) {
        await this.cacheManager.initialize();
      }

      // Initialize sync engine
      await this.syncEngine.initialize();

      // Start performance monitoring if enabled
      if (this.performanceMonitor) {
        this.performanceMonitor.start();
      }

      this.isInitialized = true;
      this.isRunning = true;

      console.log('Aggregation service initialized successfully');
      this.emit('service:initialized');

    } catch (error) {
      console.error('Failed to initialize aggregation service:', error);
      throw error;
    }
  }

  /**
   * Register a new game adapter
   */
  async registerGame(adapter: GameAdapter): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Service must be initialized before registering games');
    }

    try {
      // Create adapter config from adapter properties
      const config: GameAdapterConfig = {
        gameId: adapter.gameId,
        gameName: adapter.gameName,
        contractAddress: '', // Would be provided by concrete adapter
        rpcEndpoint: '', // Would be provided by concrete adapter
        retryConfig: {
          maxRetries: 3,
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          backoffMultiplier: 2
        },
        cacheConfig: {
          ttlSeconds: 300,
          maxEntries: 1000,
          enableCache: this.config.enableCaching
        }
      };

      await this.adapterRegistry.registerAdapter(adapter, config);

      // Start sync for the new game if real-time sync is enabled
      if (this.config.enableRealTimeSync) {
        await this.syncEngine.startGameSync(adapter.gameId);
      }

      console.log(`Game registered: ${adapter.gameId} (${adapter.gameName})`);
      
      this.emit('game:registered', { gameId: adapter.gameId, gameName: adapter.gameName });

    } catch (error) {
      const gameError = ErrorHandler.classifyError(error);
      console.error(`Failed to register game ${adapter.gameId}:`, gameError);
      
      this.emit('game:registration_failed', { gameId: adapter.gameId, error: gameError });
      
      throw gameError;
    }
  }

  /**
   * Sync player data across all games or specific game
   */
  async syncPlayerData(playerId: string, gameId?: string): Promise<StandardizedGameData[]> {
    if (!this.isRunning) {
      throw new Error('Service is not running');
    }

    const startTime = Date.now();

    try {
      let results: StandardizedGameData[] = [];

      if (gameId) {
        // Sync specific game
        const adapter = this.adapterRegistry.getAdapter(gameId);
        if (!adapter) {
          throw new Error(`No adapter found for game: ${gameId}`);
        }

        const playerData = await this.fetchAndValidatePlayerData(adapter, playerId);
        results = [playerData.normalizedData];
      } else {
        // Sync all games
        results = await this.syncEngine.syncPlayer(playerId);
      }

      // Cache results if caching is enabled
      if (this.cacheManager) {
        for (const data of results) {
          await this.cacheManager.set(
            { type: 'player_data', gameId: data.gameId, playerId },
            data
          );
        }
      }

      // Record performance metrics
      if (this.performanceMonitor) {
        const responseTime = Date.now() - startTime;
        this.performanceMonitor.recordApiRequest(responseTime, true);
      }

      // Emit sync completion event
      await this.eventSystem.publishEvent({
        type: 'sync.completed',
        gameId: gameId || 'all',
        playerId,
        data: results,
        source: 'aggregation_service'
      });

      return results;

    } catch (error) {
      const gameError = ErrorHandler.classifyError(error);
      
      // Record performance metrics for failed request
      if (this.performanceMonitor) {
        const responseTime = Date.now() - startTime;
        this.performanceMonitor.recordApiRequest(responseTime, false);
      }

      // Emit sync failure event
      await this.eventSystem.publishEvent({
        type: 'sync.failed',
        gameId: gameId || 'all',
        playerId,
        data: gameError,
        source: 'aggregation_service'
      });

      throw gameError;
    }
  }

  /**
   * Get player game data with caching
   */
  async getPlayerGameData(playerId: string, gameId: string): Promise<PlayerGameData> {
    if (!this.isRunning) {
      throw new Error('Service is not running');
    }

    const startTime = Date.now();

    try {
      // Try cache first if enabled
      if (this.cacheManager) {
        const cached = await this.cacheManager.get<PlayerGameData>({
          type: 'player_data',
          gameId,
          playerId
        });

        if (cached) {
          if (this.performanceMonitor) {
            const responseTime = Date.now() - startTime;
            this.performanceMonitor.recordApiRequest(responseTime, true);
          }
          return cached;
        }
      }

      // Fetch from adapter
      const adapter = this.adapterRegistry.getAdapter(gameId);
      if (!adapter) {
        throw new Error(`No adapter found for game: ${gameId}`);
      }

      const playerData = await this.fetchAndValidatePlayerData(adapter, playerId);

      // Cache the result if caching is enabled
      if (this.cacheManager) {
        await this.cacheManager.set(
          { type: 'player_data', gameId, playerId },
          playerData
        );
      }

      if (this.performanceMonitor) {
        const responseTime = Date.now() - startTime;
        this.performanceMonitor.recordApiRequest(responseTime, true);
      }

      return playerData;

    } catch (error) {
      const gameError = ErrorHandler.classifyError(error);
      
      if (this.performanceMonitor) {
        const responseTime = Date.now() - startTime;
        this.performanceMonitor.recordApiRequest(responseTime, false);
      }

      throw gameError;
    }
  }

  /**
   * Subscribe to player updates
   */
  subscribeToPlayerUpdates(playerId: string, callback: (data: StandardizedGameData) => void): void {
    this.eventSystem.subscribe({
      eventTypes: ['player.updated', 'sync.completed'],
      playerIds: [playerId],
      callback: async (event) => {
        if (event.data && event.data.playerId === playerId) {
          callback(event.data);
        }
      },
      priority: 1
    });
  }

  /**
   * Get aggregation service status
   */
  getStatus(): AggregationStatus {
    const syncStatuses = this.syncEngine.getSyncStatuses();
    const adapterInfo = this.adapterRegistry.getAllAdapterInfo();
    
    return {
      isRunning: this.isRunning,
      registeredGames: adapterInfo.length,
      activeSyncs: syncStatuses.filter(s => s.isConnected).length,
      cacheHitRate: this.cacheManager?.getMetrics().hitRate || 0,
      averageResponseTime: this.performanceMonitor?.getCurrentMetrics().api.averageResponseTime || 0,
      errorRate: this.performanceMonitor?.getCurrentMetrics().errors.errorRate || 0,
      lastSyncTime: Math.max(...syncStatuses.map(s => s.lastSyncTime), 0)
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): any {
    if (!this.performanceMonitor) {
      return null;
    }
    
    return this.performanceMonitor.getCurrentMetrics();
  }

  /**
   * Get cache metrics
   */
  getCacheMetrics(): any {
    if (!this.cacheManager) {
      return null;
    }
    
    return this.cacheManager.getMetrics();
  }

  /**
   * Invalidate cache for player
   */
  async invalidatePlayerCache(playerId: string, gameId?: string): Promise<void> {
    if (!this.cacheManager) {
      return;
    }

    if (gameId) {
      await this.cacheManager.invalidateByTrigger('player_update', { playerId, gameId });
    } else {
      await this.cacheManager.invalidateByTrigger('player_update', { playerId });
    }
  }

  /**
   * Shutdown the aggregation service
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('Shutting down aggregation service...');

      // Stop sync engine
      await this.syncEngine.shutdown();

      // Stop performance monitoring
      if (this.performanceMonitor) {
        this.performanceMonitor.stop();
      }

      // Shutdown cache manager
      if (this.cacheManager) {
        await this.cacheManager.shutdown();
      }

      // Cleanup adapter registry
      await this.adapterRegistry.destroy();

      this.isRunning = false;

      console.log('Aggregation service shutdown complete');
      this.emit('service:shutdown');

    } catch (error) {
      console.error('Error during aggregation service shutdown:', error);
      throw error;
    }
  }

  // Private methods

  private async fetchAndValidatePlayerData(adapter: GameAdapter, playerId: string): Promise<PlayerGameData> {
    const playerData = await adapter.fetchPlayerData(playerId);

    // Validate data if validation is enabled
    if (this.config.enableDataValidation) {
      const validationResult = await this.dataValidator.validatePlayerData(playerData);
      
      if (!validationResult.isValid) {
        const error = new Error(`Data validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
        
        // Emit validation failure event
        await this.eventSystem.publishValidationFailed(
          adapter.gameId,
          playerId,
          validationResult
        );
        
        throw error;
      }
    }

    return playerData;
  }

  private setupEventHandlers(): void {
    // Handle sync events
    this.syncEngine.on('sync_event', (event) => {
      this.emit('sync:event', event);
      
      // Invalidate cache on player updates
      if (this.cacheManager && event.type === 'player_update') {
        this.cacheManager.invalidateByTrigger('player_update', {
          playerId: event.playerId,
          gameId: event.gameId
        });
      }
    });

    // Handle adapter registry events
    this.adapterRegistry.eventService.on('adapter:error', ({ gameId, error }) => {
      this.emit('adapter:error', { gameId, error });
      
      if (this.performanceMonitor) {
        this.performanceMonitor.recordError({
          timestamp: Date.now(),
          type: 'ADAPTER_ERROR',
          message: error.message,
          source: `adapter:${gameId}`,
          severity: 'HIGH'
        });
      }
    });

    // Handle cache events
    if (this.cacheManager) {
      this.cacheManager.on('cache:error', (event) => {
        this.emit('cache:error', event);
      });
    }

    // Handle performance alerts
    if (this.performanceMonitor) {
      this.performanceMonitor.on('alert:created', (alert) => {
        this.emit('performance:alert', alert);
      });
    }
  }
}