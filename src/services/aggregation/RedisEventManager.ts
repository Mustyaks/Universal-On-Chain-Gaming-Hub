/**
 * Redis Event Manager for pub/sub operations
 * Handles event-driven updates and caching for real-time synchronization
 */

import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';
import {
    StandardizedGameData,
    PlayerGameData,
    GameHubError,
    Timestamp
} from '../../types/core';

export interface RedisEventConfig {
    url: string;
    keyPrefix: string;
    defaultTTL: number;
    maxRetries: number;
    retryDelay: number;
}

export interface CacheEntry<T> {
    data: T;
    timestamp: Timestamp;
    ttl: number;
}

export interface EventSubscription {
    channel: string;
    pattern?: string;
    callback: (data: any) => void;
}

export class RedisEventManager extends EventEmitter {
    private config: RedisEventConfig;
    private publisher: RedisClientType;
    private subscriber: RedisClientType;
    private cache: RedisClientType;
    private subscriptions: Map<string, EventSubscription> = new Map();
    private isConnected: boolean = false;

    constructor(config: RedisEventConfig) {
        super();
        this.config = config;
        
        // Create separate Redis clients for different operations
        this.publisher = createClient({ url: config.url });
        this.subscriber = createClient({ url: config.url });
        this.cache = createClient({ url: config.url });
        
        this.setupErrorHandlers();
    }

    /**
     * Initialize Redis connections
     */
    async initialize(): Promise<void> {
        try {
            await Promise.all([
                this.publisher.connect(),
                this.subscriber.connect(),
                this.cache.connect()
            ]);

            this.isConnected = true;
            this.emit('connected');
            
            console.log('RedisEventManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize RedisEventManager:', error);
            throw error;
        }
    }

    /**
     * Publish an event to a specific channel
     */
    async publishEvent(channel: string, data: any): Promise<void> {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }

        try {
            const message = JSON.stringify({
                data,
                timestamp: Date.now(),
                source: 'universal-gaming-hub'
            });

            await this.publisher.publish(this.getChannelKey(channel), message);
            this.emit('eventPublished', { channel, data });
            
        } catch (error) {
            console.error(`Failed to publish event to channel ${channel}:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to events on a specific channel
     */
    async subscribeToChannel(
        channel: string, 
        callback: (data: any) => void
    ): Promise<void> {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }

        const channelKey = this.getChannelKey(channel);
        const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            await this.subscriber.subscribe(channelKey, (message) => {
                try {
                    const parsed = JSON.parse(message);
                    callback(parsed.data);
                } catch (error) {
                    console.error(`Failed to parse message from channel ${channel}:`, error);
                }
            });

            this.subscriptions.set(subscriptionId, {
                channel: channelKey,
                callback
            });

            console.log(`Subscribed to channel: ${channel}`);
            
        } catch (error) {
            console.error(`Failed to subscribe to channel ${channel}:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to events using a pattern
     */
    async subscribeToPattern(
        pattern: string, 
        callback: (channel: string, data: any) => void
    ): Promise<void> {
        if (!this.isConnected) {
            throw new Error('Redis not connected');
        }

        const patternKey = this.getChannelKey(pattern);
        const subscriptionId = `psub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            await this.subscriber.pSubscribe(patternKey, (message, channel) => {
                try {
                    const parsed = JSON.parse(message);
                    const originalChannel = this.removeChannelPrefix(channel);
                    callback(originalChannel, parsed.data);
                } catch (error) {
                    console.error(`Failed to parse pattern message from channel ${channel}:`, error);
                }
            });

            this.subscriptions.set(subscriptionId, {
                channel: patternKey,
                pattern: patternKey,
                callback
            });

            console.log(`Subscribed to pattern: ${pattern}`);
            
        } catch (error) {
            console.error(`Failed to subscribe to pattern ${pattern}:`, error);
            throw error;
        }
    }

    /**
     * Unsubscribe from a channel
     */
    async unsubscribeFromChannel(channel: string): Promise<void> {
        const channelKey = this.getChannelKey(channel);
        
        try {
            await this.subscriber.unsubscribe(channelKey);
            
            // Remove from subscriptions map
            for (const [id, sub] of this.subscriptions.entries()) {
                if (sub.channel === channelKey && !sub.pattern) {
                    this.subscriptions.delete(id);
                    break;
                }
            }
            
            console.log(`Unsubscribed from channel: ${channel}`);
        } catch (error) {
            console.error(`Failed to unsubscribe from channel ${channel}:`, error);
            throw error;
        }
    }

    /**
     * Cache game data with TTL
     */
    async cacheGameData(
        playerId: string, 
        gameId: string, 
        data: StandardizedGameData,
        ttl?: number
    ): Promise<void> {
        const key = this.getGameDataKey(playerId, gameId);
        const cacheEntry: CacheEntry<StandardizedGameData> = {
            data,
            timestamp: Date.now(),
            ttl: ttl || this.config.defaultTTL
        };

        try {
            await this.cache.setEx(
                key, 
                cacheEntry.ttl, 
                JSON.stringify(cacheEntry)
            );
            
            this.emit('dataCached', { playerId, gameId, key });
        } catch (error) {
            console.error(`Failed to cache game data for ${playerId}/${gameId}:`, error);
            throw error;
        }
    }

    /**
     * Retrieve cached game data
     */
    async getCachedGameData(
        playerId: string, 
        gameId: string
    ): Promise<StandardizedGameData | null> {
        const key = this.getGameDataKey(playerId, gameId);
        
        try {
            const cached = await this.cache.get(key);
            
            if (!cached) {
                return null;
            }

            const cacheEntry: CacheEntry<StandardizedGameData> = JSON.parse(cached);
            
            // Check if cache entry is still valid
            const age = Date.now() - cacheEntry.timestamp;
            if (age > cacheEntry.ttl * 1000) {
                await this.cache.del(key);
                return null;
            }

            return cacheEntry.data;
            
        } catch (error) {
            console.error(`Failed to retrieve cached game data for ${playerId}/${gameId}:`, error);
            return null;
        }
    }

    /**
     * Invalidate cached data for a player
     */
    async invalidatePlayerCache(playerId: string, gameId?: string): Promise<void> {
        try {
            if (gameId) {
                // Invalidate specific game data
                const key = this.getGameDataKey(playerId, gameId);
                await this.cache.del(key);
            } else {
                // Invalidate all game data for player
                const pattern = this.getGameDataKey(playerId, '*');
                const keys = await this.cache.keys(pattern);
                
                if (keys.length > 0) {
                    await this.cache.del(keys);
                }
            }
            
            this.emit('cacheInvalidated', { playerId, gameId });
        } catch (error) {
            console.error(`Failed to invalidate cache for ${playerId}:`, error);
            throw error;
        }
    }

    /**
     * Publish player data update event
     */
    async publishPlayerUpdate(
        playerId: string, 
        gameId: string, 
        data: StandardizedGameData,
        updateType: 'ASSET_CHANGE' | 'ACHIEVEMENT_EARNED' | 'STATS_UPDATE' | 'FULL_SYNC' = 'FULL_SYNC'
    ): Promise<void> {
        const updateEvent = {
            playerId,
            gameId,
            updateType,
            data,
            timestamp: Date.now()
        };

        // Cache the updated data
        await this.cacheGameData(playerId, gameId, data);

        // Publish to player-specific channel
        await this.publishEvent(`player:${playerId}:updates`, updateEvent);

        // Publish to game-specific channel
        await this.publishEvent(`game:${gameId}:updates`, updateEvent);

        // Publish to global updates channel
        await this.publishEvent('global:updates', updateEvent);
    }

    /**
     * Get cache statistics
     */
    async getCacheStats(): Promise<{
        totalKeys: number;
        memoryUsage: string;
        hitRate: number;
    }> {
        try {
            const info = await this.cache.info('memory');
            const keyCount = await this.cache.dbSize();
            
            // Parse memory info (simplified)
            const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
            const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'Unknown';

            return {
                totalKeys: keyCount,
                memoryUsage,
                hitRate: 0 // Would need to track hits/misses for accurate calculation
            };
        } catch (error) {
            console.error('Failed to get cache stats:', error);
            return {
                totalKeys: 0,
                memoryUsage: 'Unknown',
                hitRate: 0
            };
        }
    }

    /**
     * Shutdown Redis connections
     */
    async shutdown(): Promise<void> {
        try {
            // Clear all subscriptions
            this.subscriptions.clear();

            // Close connections
            await Promise.all([
                this.publisher.quit(),
                this.subscriber.quit(),
                this.cache.quit()
            ]);

            this.isConnected = false;
            this.emit('disconnected');
            
            console.log('RedisEventManager shutdown complete');
        } catch (error) {
            console.error('Error during RedisEventManager shutdown:', error);
            throw error;
        }
    }

    /**
     * Check if Redis is connected and healthy
     */
    async isHealthy(): Promise<boolean> {
        try {
            await Promise.all([
                this.publisher.ping(),
                this.subscriber.ping(),
                this.cache.ping()
            ]);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Private methods

    private setupErrorHandlers(): void {
        [this.publisher, this.subscriber, this.cache].forEach((client, index) => {
            const clientName = ['publisher', 'subscriber', 'cache'][index];
            
            client.on('error', (error) => {
                console.error(`Redis ${clientName} error:`, error);
                this.emit('error', { client: clientName, error });
            });

            client.on('reconnecting', () => {
                console.log(`Redis ${clientName} reconnecting...`);
                this.emit('reconnecting', { client: clientName });
            });
        });
    }

    private getChannelKey(channel: string): string {
        return `${this.config.keyPrefix}:${channel}`;
    }

    private removeChannelPrefix(channel: string): string {
        const prefix = `${this.config.keyPrefix}:`;
        return channel.startsWith(prefix) ? channel.slice(prefix.length) : channel;
    }

    private getGameDataKey(playerId: string, gameId: string): string {
        return `${this.config.keyPrefix}:gamedata:${playerId}:${gameId}`;
    }
}