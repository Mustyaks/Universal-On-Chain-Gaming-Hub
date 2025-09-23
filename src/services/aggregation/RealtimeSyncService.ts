/**
 * Real-time data synchronization service
 * Handles WebSocket connections and Redis pub/sub for live game data updates
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { createClient, RedisClientType } from 'redis';
import {
    PlayerGameData,
    StandardizedGameData,
    GameHubError,
    Timestamp,
    Address
} from '../../types/core';
import { GameAdapter } from './GameAdapter';

export interface RealtimeSyncConfig {
    redis: {
        url: string;
        keyPrefix: string;
    };
    websocket: {
        port: number;
        heartbeatInterval: number;
        maxConnections: number;
    };
    validation: {
        enableIntegrityChecks: boolean;
        maxDataAge: number; // milliseconds
        requiredFields: string[];
    };
}

export interface GameDataUpdate {
    playerId: string;
    gameId: string;
    updateType: 'ASSET_CHANGE' | 'ACHIEVEMENT_EARNED' | 'STATS_UPDATE' | 'FULL_SYNC';
    data: StandardizedGameData;
    timestamp: Timestamp;
    source: 'WEBSOCKET' | 'POLLING' | 'MANUAL';
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

export class RealtimeSyncService extends EventEmitter {
    private config: RealtimeSyncConfig;
    private redisClient: RedisClientType;
    private redisSubscriber: RedisClientType;
    private wsServer: WebSocket.Server | null = null;
    private gameAdapters: Map<string, GameAdapter> = new Map();
    private activeConnections: Map<string, WebSocket> = new Map();
    private isRunning: boolean = false;

    constructor(config: RealtimeSyncConfig) {
        super();
        this.config = config;
        
        // Initialize Redis clients
        this.redisClient = createClient({ url: config.redis.url });
        this.redisSubscriber = createClient({ url: config.redis.url });
        
        this.setupErrorHandlers();
    }

    /**
     * Initialize the real-time sync service
     */
    async initialize(): Promise<void> {
        try {
            // Connect to Redis
            await this.redisClient.connect();
            await this.redisSubscriber.connect();

            // Set up Redis pub/sub
            await this.setupRedisPubSub();

            // Initialize WebSocket server
            this.setupWebSocketServer();

            this.isRunning = true;
            this.emit('initialized');
            
            console.log('RealtimeSyncService initialized successfully');
        } catch (error) {
            console.error('Failed to initialize RealtimeSyncService:', error);
            throw error;
        }
    }

    /**
     * Register a game adapter for real-time updates
     */
    async registerGameAdapter(adapter: GameAdapter): Promise<void> {
        if (this.gameAdapters.has(adapter.gameId)) {
            throw new Error(`Game adapter for ${adapter.gameId} already registered`);
        }

        this.gameAdapters.set(adapter.gameId, adapter);

        // Subscribe to updates from this adapter
        await adapter.subscribeToUpdates(async (data: PlayerGameData) => {
            await this.handleGameDataUpdate(data, 'WEBSOCKET');
        });

        console.log(`Registered game adapter for ${adapter.gameId}`);
    }

    /**
     * Subscribe to real-time updates for a specific player
     */
    async subscribeToPlayerUpdates(
        playerId: string, 
        callback: (update: GameDataUpdate) => void
    ): Promise<void> {
        const channel = this.getPlayerChannel(playerId);
        
        await this.redisSubscriber.subscribe(channel, (message) => {
            try {
                const update: GameDataUpdate = JSON.parse(message);
                callback(update);
            } catch (error) {
                console.error('Failed to parse Redis message:', error);
            }
        });
    }

    /**
     * Unsubscribe from player updates
     */
    async unsubscribeFromPlayerUpdates(playerId: string): Promise<void> {
        const channel = this.getPlayerChannel(playerId);
        await this.redisSubscriber.unsubscribe(channel);
    }

    /**
     * Publish a game data update
     */
    async publishGameDataUpdate(update: GameDataUpdate): Promise<void> {
        // Validate the update data
        const validation = await this.validateGameData(update.data);
        if (!validation.isValid) {
            throw new Error(`Invalid game data: ${validation.errors.join(', ')}`);
        }

        // Store in Redis cache
        await this.cacheGameData(update);

        // Publish to Redis pub/sub
        const channel = this.getPlayerChannel(update.playerId);
        await this.redisClient.publish(channel, JSON.stringify(update));

        // Broadcast to WebSocket clients
        this.broadcastToWebSocketClients(update);

        this.emit('dataUpdated', update);
    }

    /**
     * Get cached game data for a player
     */
    async getCachedGameData(playerId: string, gameId: string): Promise<StandardizedGameData | null> {
        const key = this.getGameDataKey(playerId, gameId);
        const cached = await this.redisClient.get(key);
        
        if (cached) {
            return JSON.parse(cached);
        }
        
        return null;
    }

    /**
     * Validate game data integrity
     */
    async validateGameData(data: StandardizedGameData): Promise<ValidationResult> {
        const result: ValidationResult = {
            isValid: true,
            errors: [],
            warnings: []
        };

        if (!this.config.validation.enableIntegrityChecks) {
            return result;
        }

        // Check required fields
        for (const field of this.config.validation.requiredFields) {
            if (!this.hasNestedProperty(data, field)) {
                result.errors.push(`Missing required field: ${field}`);
                result.isValid = false;
            }
        }

        // Check data freshness
        const dataAge = Date.now() - data.lastUpdated;
        if (dataAge > this.config.validation.maxDataAge) {
            result.warnings.push(`Data is ${dataAge}ms old, exceeds max age of ${this.config.validation.maxDataAge}ms`);
        }

        // Validate player ID format
        if (!data.playerId || typeof data.playerId !== 'string') {
            result.errors.push('Invalid playerId');
            result.isValid = false;
        }

        // Validate game ID
        if (!data.gameId || typeof data.gameId !== 'string') {
            result.errors.push('Invalid gameId');
            result.isValid = false;
        }

        // Validate assets
        if (data.assets) {
            for (let i = 0; i < data.assets.length; i++) {
                const asset = data.assets[i];
                if (!asset || !asset.id || !asset.contractAddress || !asset.owner) {
                    result.errors.push(`Invalid asset at index ${i}: missing required fields`);
                    result.isValid = false;
                }
            }
        }

        // Validate achievements
        if (data.achievements) {
            for (let i = 0; i < data.achievements.length; i++) {
                const achievement = data.achievements[i];
                if (!achievement || !achievement.id || !achievement.title || !achievement.earnedAt) {
                    result.errors.push(`Invalid achievement at index ${i}: missing required fields`);
                    result.isValid = false;
                }
            }
        }

        return result;
    }

    /**
     * Shutdown the service gracefully
     */
    async shutdown(): Promise<void> {
        this.isRunning = false;

        // Close WebSocket server
        if (this.wsServer) {
            this.wsServer.close();
        }

        // Unsubscribe from all game adapters
        for (const adapter of this.gameAdapters.values()) {
            await adapter.unsubscribeFromUpdates();
        }

        // Close Redis connections
        await this.redisClient.quit();
        await this.redisSubscriber.quit();

        this.emit('shutdown');
        console.log('RealtimeSyncService shutdown complete');
    }

    /**
     * Get service health status
     */
    async getHealthStatus(): Promise<{ healthy: boolean; details: Record<string, any> }> {
        const details: Record<string, any> = {
            isRunning: this.isRunning,
            activeConnections: this.activeConnections.size,
            registeredGames: this.gameAdapters.size,
            redisConnected: this.redisClient.isReady,
            wsServerRunning: this.wsServer !== null
        };

        const healthy = this.isRunning && 
                       this.redisClient.isReady && 
                       this.wsServer !== null;

        return { healthy, details };
    }

    // Private methods

    private setupErrorHandlers(): void {
        this.redisClient.on('error', (error) => {
            console.error('Redis client error:', error);
            this.emit('error', error);
        });

        this.redisSubscriber.on('error', (error) => {
            console.error('Redis subscriber error:', error);
            this.emit('error', error);
        });
    }

    private async setupRedisPubSub(): Promise<void> {
        // Set up pattern subscription for all player channels
        const pattern = `${this.config.redis.keyPrefix}:player:*:updates`;
        
        await this.redisSubscriber.pSubscribe(pattern, (message, channel) => {
            this.emit('redisMessage', { channel, message });
        });
    }

    private setupWebSocketServer(): void {
        this.wsServer = new WebSocket.Server({ 
            port: this.config.websocket.port,
            maxPayload: 1024 * 1024 // 1MB max payload
        });

        this.wsServer.on('connection', (ws: WebSocket, request) => {
            const connectionId = this.generateConnectionId();
            this.activeConnections.set(connectionId, ws);

            console.log(`WebSocket connection established: ${connectionId}`);

            // Set up heartbeat
            const heartbeat = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.ping();
                }
            }, this.config.websocket.heartbeatInterval);

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    await this.handleWebSocketMessage(ws, message);
                } catch (error) {
                    console.error('Failed to handle WebSocket message:', error);
                    ws.send(JSON.stringify({ error: 'Invalid message format' }));
                }
            });

            ws.on('close', () => {
                clearInterval(heartbeat);
                this.activeConnections.delete(connectionId);
                console.log(`WebSocket connection closed: ${connectionId}`);
            });

            ws.on('error', (error) => {
                console.error(`WebSocket error for connection ${connectionId}:`, error);
                clearInterval(heartbeat);
                this.activeConnections.delete(connectionId);
            });
        });

        console.log(`WebSocket server listening on port ${this.config.websocket.port}`);
    }

    private async handleGameDataUpdate(data: PlayerGameData, source: 'WEBSOCKET' | 'POLLING' | 'MANUAL'): Promise<void> {
        const update: GameDataUpdate = {
            playerId: data.playerId,
            gameId: data.gameId,
            updateType: 'FULL_SYNC', // Determine based on data changes
            data: data.normalizedData,
            timestamp: Date.now(),
            source
        };

        await this.publishGameDataUpdate(update);
    }

    private async handleWebSocketMessage(ws: WebSocket, message: any): Promise<void> {
        switch (message.type) {
            case 'subscribe':
                // Handle subscription to player updates
                if (message.playerId) {
                    await this.subscribeToPlayerUpdates(message.playerId, (update) => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'update', data: update }));
                        }
                    });
                }
                break;

            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;

            default:
                ws.send(JSON.stringify({ error: 'Unknown message type' }));
        }
    }

    private async cacheGameData(update: GameDataUpdate): Promise<void> {
        const key = this.getGameDataKey(update.playerId, update.gameId);
        const ttl = 3600; // 1 hour cache TTL
        
        await this.redisClient.setEx(key, ttl, JSON.stringify(update.data));
    }

    private broadcastToWebSocketClients(update: GameDataUpdate): void {
        const message = JSON.stringify({ type: 'update', data: update });
        
        for (const ws of this.activeConnections.values()) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        }
    }

    private getPlayerChannel(playerId: string): string {
        return `${this.config.redis.keyPrefix}:player:${playerId}:updates`;
    }

    private getGameDataKey(playerId: string, gameId: string): string {
        return `${this.config.redis.keyPrefix}:gamedata:${playerId}:${gameId}`;
    }

    private generateConnectionId(): string {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private hasNestedProperty(obj: any, path: string): boolean {
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined || !(key in current)) {
                return false;
            }
            current = current[key];
        }
        
        return true;
    }
}