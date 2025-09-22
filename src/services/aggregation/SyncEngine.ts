/**
 * Real-time data synchronization engine
 * Manages WebSocket connections, Redis pub/sub, and data validation for live updates
 */

import { EventEmitter } from 'events';
import { GameAdapter } from './GameAdapter';
import { AdapterRegistry } from './AdapterRegistry';
import { ErrorHandler, CircuitBreaker } from './ErrorHandler';
import {
  StandardizedGameData,
  PlayerGameData,
  GameHubError,
  Timestamp
} from '../../types/core';

export interface SyncEngineConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  sync: {
    batchSize: number;
    batchIntervalMs: number;
    maxRetries: number;
    validationEnabled: boolean;
  };
  websocket: {
    heartbeatIntervalMs: number;
    reconnectDelayMs: number;
    maxReconnectAttempts: number;
  };
}

export interface SyncEvent {
  type: 'player_update' | 'asset_transfer' | 'achievement_earned' | 'sync_error';
  gameId: string;
  playerId: string;
  data: any;
  timestamp: Timestamp;
}

export interface SyncStatus {
  gameId: string;
  isConnected: boolean;
  lastSyncTime: Timestamp;
  pendingUpdates: number;
  errorCount: number;
  lastError?: GameHubError;
}

export class SyncEngine extends EventEmitter {
  private config: SyncEngineConfig;
  private adapterRegistry: AdapterRegistry;
  private redisClient: any; // Redis client type
  private redisPub: any;
  private redisSub: any;
  private syncStatuses = new Map<string, SyncStatus>();
  private updateQueue = new Map<string, PlayerGameData[]>();
  private batchProcessor: NodeJS.Timeout | null = null;
  private circuitBreaker: CircuitBreaker;
  private isRunning = false;

  constructor(config: SyncEngineConfig, adapterRegistry: AdapterRegistry) {
    super();
    this.config = config;
    this.adapterRegistry = adapterRegistry;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000
    });
  }

  /**
   * Initialize the sync engine
   */
  async initialize(): Promise<void> {
    try {
      await this.initializeRedis();
      await this.setupEventListeners();
      await this.startBatchProcessor();
      
      this.isRunning = true;
      console.log('Sync engine initialized successfully');
      
      this.emit('sync_engine:initialized');
    } catch (error) {
      console.error('Failed to initialize sync engine:', error);
      throw error;
    }
  }

  /**
   * Start synchronization for a specific game
   */
  async startGameSync(gameId: string): Promise<void> {
    const adapter = this.adapterRegistry.getAdapter(gameId);
    
    if (!adapter) {
      throw new Error(`No adapter found for game: ${gameId}`);
    }

    if (this.syncStatuses.has(gameId)) {
      throw new Error(`Sync already started for game: ${gameId}`);
    }

    try {
      // Initialize sync status
      const status: SyncStatus = {
        gameId,
        isConnected: false,
        lastSyncTime: 0,
        pendingUpdates: 0,
        errorCount: 0
      };
      
      this.syncStatuses.set(gameId, status);
      this.updateQueue.set(gameId, []);

      // Subscribe to adapter updates
      await adapter.subscribeToUpdates((data: PlayerGameData) => {
        this.handlePlayerUpdate(data);
      });

      status.isConnected = true;
      status.lastSyncTime = Date.now();

      console.log(`Started sync for game: ${gameId}`);
      
      this.emit('game_sync:started', { gameId });
    } catch (error) {
      this.handleSyncError(gameId, error);
      throw error;
    }
  }

  /**
   * Stop synchronization for a specific game
   */
  async stopGameSync(gameId: string): Promise<void> {
    const adapter = this.adapterRegistry.getAdapter(gameId);
    const status = this.syncStatuses.get(gameId);

    if (!status) {
      return; // Already stopped
    }

    try {
      if (adapter) {
        await adapter.unsubscribeFromUpdates();
      }

      // Process remaining updates in queue
      await this.processPendingUpdates(gameId);

      this.syncStatuses.delete(gameId);
      this.updateQueue.delete(gameId);

      console.log(`Stopped sync for game: ${gameId}`);
      
      this.emit('game_sync:stopped', { gameId });
    } catch (error) {
      console.error(`Error stopping sync for game ${gameId}:`, error);
    }
  }

  /**
   * Get synchronization status for all games
   */
  getSyncStatuses(): SyncStatus[] {
    return Array.from(this.syncStatuses.values());
  }

  /**
   * Get synchronization status for a specific game
   */
  getSyncStatus(gameId: string): SyncStatus | null {
    return this.syncStatuses.get(gameId) || null;
  }

  /**
   * Manually trigger sync for a player across all games
   */
  async syncPlayer(playerId: string): Promise<StandardizedGameData[]> {
    const adapters = this.adapterRegistry.getAllAdapters();
    const results: StandardizedGameData[] = [];

    for (const adapter of adapters) {
      try {
        const playerData = await this.circuitBreaker.execute(
          () => adapter.fetchPlayerData(playerId),
          `sync-player-${adapter.gameId}`
        );

        results.push(playerData.normalizedData);
        
        // Emit sync event
        this.emitSyncEvent({
          type: 'player_update',
          gameId: adapter.gameId,
          playerId,
          data: playerData.normalizedData,
          timestamp: Date.now()
        });

      } catch (error) {
        this.handleSyncError(adapter.gameId, error);
      }
    }

    return results;
  }

  /**
   * Validate player data integrity
   */
  async validatePlayerData(data: PlayerGameData): Promise<boolean> {
    if (!this.config.sync.validationEnabled) {
      return true;
    }

    try {
      // Basic validation checks
      if (!data.playerId || !data.gameId || !data.normalizedData) {
        return false;
      }

      // Validate timestamps
      if (data.syncedAt > Date.now() + 60000) { // Future timestamp with 1min tolerance
        return false;
      }

      // Validate assets if present
      if (data.normalizedData.assets) {
        const adapter = this.adapterRegistry.getAdapter(data.gameId);
        if (adapter) {
          for (const asset of data.normalizedData.assets) {
            const isValid = await adapter.validateAsset(asset);
            if (!isValid) {
              console.warn(`Invalid asset detected: ${asset.id} for player ${data.playerId}`);
              return false;
            }
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Data validation error:', error);
      return false;
    }
  }

  /**
   * Shutdown the sync engine
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;

    // Stop all game syncs
    const gameIds = Array.from(this.syncStatuses.keys());
    for (const gameId of gameIds) {
      await this.stopGameSync(gameId);
    }

    // Stop batch processor
    if (this.batchProcessor) {
      clearInterval(this.batchProcessor);
      this.batchProcessor = null;
    }

    // Close Redis connections
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    if (this.redisPub) {
      await this.redisPub.quit();
    }
    if (this.redisSub) {
      await this.redisSub.quit();
    }

    console.log('Sync engine shutdown complete');
    
    this.emit('sync_engine:shutdown');
  }

  // Private methods

  private async initializeRedis(): Promise<void> {
    // Note: In a real implementation, you would use the actual Redis client
    // For now, we'll simulate the Redis setup
    
    const redisConfig = {
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db
    };

    // Simulate Redis client initialization
    this.redisClient = {
      publish: async (channel: string, message: string) => {
        console.log(`Redis publish to ${channel}:`, message);
      },
      subscribe: async (channel: string) => {
        console.log(`Redis subscribe to ${channel}`);
      },
      quit: async () => {
        console.log('Redis client disconnected');
      }
    };

    this.redisPub = this.redisClient;
    this.redisSub = this.redisClient;

    // Set up Redis pub/sub message handling
    this.setupRedisMessageHandling();
  }

  private setupRedisMessageHandling(): void {
    // Simulate Redis message handling
    // In real implementation, this would handle actual Redis pub/sub messages
    
    const handleMessage = (channel: string, message: string) => {
      try {
        const syncEvent: SyncEvent = JSON.parse(message);
        this.emit('sync_event', syncEvent);
        
        // Update sync status
        const status = this.syncStatuses.get(syncEvent.gameId);
        if (status) {
          status.lastSyncTime = syncEvent.timestamp;
        }
      } catch (error) {
        console.error('Error handling Redis message:', error);
      }
    };

    // Subscribe to sync channels
    this.redisSub.subscribe('game_updates');
    this.redisSub.subscribe('player_updates');
    this.redisSub.subscribe('asset_updates');
  }

  private async setupEventListeners(): void {
    // Listen for adapter registry events
    this.adapterRegistry.eventService.on('adapter:registered', ({ gameId }) => {
      console.log(`Adapter registered for ${gameId}, starting sync...`);
      this.startGameSync(gameId).catch(error => {
        console.error(`Failed to start sync for ${gameId}:`, error);
      });
    });

    this.adapterRegistry.eventService.on('adapter:unregistered', ({ gameId }) => {
      console.log(`Adapter unregistered for ${gameId}, stopping sync...`);
      this.stopGameSync(gameId).catch(error => {
        console.error(`Failed to stop sync for ${gameId}:`, error);
      });
    });

    this.adapterRegistry.eventService.on('adapter:error', ({ gameId, error }) => {
      this.handleSyncError(gameId, error);
    });
  }

  private async startBatchProcessor(): Promise<void> {
    this.batchProcessor = setInterval(
      () => this.processBatchUpdates(),
      this.config.sync.batchIntervalMs
    );
  }

  private async processBatchUpdates(): Promise<void> {
    if (!this.isRunning) return;

    for (const [gameId, updates] of this.updateQueue.entries()) {
      if (updates.length === 0) continue;

      try {
        // Process updates in batches
        const batchSize = this.config.sync.batchSize;
        const batches = this.chunkArray(updates, batchSize);

        for (const batch of batches) {
          await this.processBatch(gameId, batch);
        }

        // Clear processed updates
        this.updateQueue.set(gameId, []);

        // Update sync status
        const status = this.syncStatuses.get(gameId);
        if (status) {
          status.pendingUpdates = 0;
          status.lastSyncTime = Date.now();
        }

      } catch (error) {
        this.handleSyncError(gameId, error);
      }
    }
  }

  private async processBatch(gameId: string, batch: PlayerGameData[]): Promise<void> {
    for (const update of batch) {
      try {
        // Validate data
        const isValid = await this.validatePlayerData(update);
        if (!isValid) {
          console.warn(`Invalid data for player ${update.playerId} in game ${gameId}`);
          continue;
        }

        // Publish to Redis
        await this.publishUpdate(update);

        // Emit local event
        this.emitSyncEvent({
          type: 'player_update',
          gameId: update.gameId,
          playerId: update.playerId,
          data: update.normalizedData,
          timestamp: update.syncedAt
        });

      } catch (error) {
        console.error(`Error processing update for player ${update.playerId}:`, error);
      }
    }
  }

  private async processPendingUpdates(gameId: string): Promise<void> {
    const updates = this.updateQueue.get(gameId) || [];
    if (updates.length > 0) {
      await this.processBatch(gameId, updates);
    }
  }

  private async publishUpdate(update: PlayerGameData): Promise<void> {
    const message = JSON.stringify({
      type: 'player_update',
      gameId: update.gameId,
      playerId: update.playerId,
      data: update.normalizedData,
      timestamp: update.syncedAt
    });

    await this.redisPub.publish('player_updates', message);
  }

  private handlePlayerUpdate(data: PlayerGameData): void {
    const queue = this.updateQueue.get(data.gameId) || [];
    queue.push(data);
    this.updateQueue.set(data.gameId, queue);

    // Update pending count
    const status = this.syncStatuses.get(data.gameId);
    if (status) {
      status.pendingUpdates = queue.length;
    }
  }

  private handleSyncError(gameId: string, error: any): void {
    const gameError = ErrorHandler.classifyError(error);
    
    const status = this.syncStatuses.get(gameId);
    if (status) {
      status.errorCount++;
      status.lastError = gameError;
    }

    console.error(`Sync error for game ${gameId}:`, gameError);

    this.emitSyncEvent({
      type: 'sync_error',
      gameId,
      playerId: '',
      data: gameError,
      timestamp: Date.now()
    });
  }

  private emitSyncEvent(event: SyncEvent): void {
    this.emit('sync_event', event);
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}