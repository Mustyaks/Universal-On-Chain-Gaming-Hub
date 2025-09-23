"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisEventManager = void 0;
const redis_1 = require("redis");
const events_1 = require("events");
class RedisEventManager extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.subscriptions = new Map();
        this.isConnected = false;
        this.config = config;
        this.publisher = (0, redis_1.createClient)({ url: config.url });
        this.subscriber = (0, redis_1.createClient)({ url: config.url });
        this.cache = (0, redis_1.createClient)({ url: config.url });
        this.setupErrorHandlers();
    }
    async initialize() {
        try {
            await Promise.all([
                this.publisher.connect(),
                this.subscriber.connect(),
                this.cache.connect()
            ]);
            this.isConnected = true;
            this.emit('connected');
            console.log('RedisEventManager initialized successfully');
        }
        catch (error) {
            console.error('Failed to initialize RedisEventManager:', error);
            throw error;
        }
    }
    async publishEvent(channel, data) {
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
        }
        catch (error) {
            console.error(`Failed to publish event to channel ${channel}:`, error);
            throw error;
        }
    }
    async subscribeToChannel(channel, callback) {
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
                }
                catch (error) {
                    console.error(`Failed to parse message from channel ${channel}:`, error);
                }
            });
            this.subscriptions.set(subscriptionId, {
                channel: channelKey,
                callback
            });
            console.log(`Subscribed to channel: ${channel}`);
        }
        catch (error) {
            console.error(`Failed to subscribe to channel ${channel}:`, error);
            throw error;
        }
    }
    async subscribeToPattern(pattern, callback) {
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
                }
                catch (error) {
                    console.error(`Failed to parse pattern message from channel ${channel}:`, error);
                }
            });
            this.subscriptions.set(subscriptionId, {
                channel: patternKey,
                pattern: patternKey,
                callback
            });
            console.log(`Subscribed to pattern: ${pattern}`);
        }
        catch (error) {
            console.error(`Failed to subscribe to pattern ${pattern}:`, error);
            throw error;
        }
    }
    async unsubscribeFromChannel(channel) {
        const channelKey = this.getChannelKey(channel);
        try {
            await this.subscriber.unsubscribe(channelKey);
            for (const [id, sub] of this.subscriptions.entries()) {
                if (sub.channel === channelKey && !sub.pattern) {
                    this.subscriptions.delete(id);
                    break;
                }
            }
            console.log(`Unsubscribed from channel: ${channel}`);
        }
        catch (error) {
            console.error(`Failed to unsubscribe from channel ${channel}:`, error);
            throw error;
        }
    }
    async cacheGameData(playerId, gameId, data, ttl) {
        const key = this.getGameDataKey(playerId, gameId);
        const cacheEntry = {
            data,
            timestamp: Date.now(),
            ttl: ttl || this.config.defaultTTL
        };
        try {
            await this.cache.setEx(key, cacheEntry.ttl, JSON.stringify(cacheEntry));
            this.emit('dataCached', { playerId, gameId, key });
        }
        catch (error) {
            console.error(`Failed to cache game data for ${playerId}/${gameId}:`, error);
            throw error;
        }
    }
    async getCachedGameData(playerId, gameId) {
        const key = this.getGameDataKey(playerId, gameId);
        try {
            const cached = await this.cache.get(key);
            if (!cached) {
                return null;
            }
            const cacheEntry = JSON.parse(cached);
            const age = Date.now() - cacheEntry.timestamp;
            if (age > cacheEntry.ttl * 1000) {
                await this.cache.del(key);
                return null;
            }
            return cacheEntry.data;
        }
        catch (error) {
            console.error(`Failed to retrieve cached game data for ${playerId}/${gameId}:`, error);
            return null;
        }
    }
    async invalidatePlayerCache(playerId, gameId) {
        try {
            if (gameId) {
                const key = this.getGameDataKey(playerId, gameId);
                await this.cache.del(key);
            }
            else {
                const pattern = this.getGameDataKey(playerId, '*');
                const keys = await this.cache.keys(pattern);
                if (keys.length > 0) {
                    await this.cache.del(keys);
                }
            }
            this.emit('cacheInvalidated', { playerId, gameId });
        }
        catch (error) {
            console.error(`Failed to invalidate cache for ${playerId}:`, error);
            throw error;
        }
    }
    async publishPlayerUpdate(playerId, gameId, data, updateType = 'FULL_SYNC') {
        const updateEvent = {
            playerId,
            gameId,
            updateType,
            data,
            timestamp: Date.now()
        };
        await this.cacheGameData(playerId, gameId, data);
        await this.publishEvent(`player:${playerId}:updates`, updateEvent);
        await this.publishEvent(`game:${gameId}:updates`, updateEvent);
        await this.publishEvent('global:updates', updateEvent);
    }
    async getCacheStats() {
        try {
            const info = await this.cache.info('memory');
            const keyCount = await this.cache.dbSize();
            const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
            const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'Unknown';
            return {
                totalKeys: keyCount,
                memoryUsage,
                hitRate: 0
            };
        }
        catch (error) {
            console.error('Failed to get cache stats:', error);
            return {
                totalKeys: 0,
                memoryUsage: 'Unknown',
                hitRate: 0
            };
        }
    }
    async shutdown() {
        try {
            this.subscriptions.clear();
            await Promise.all([
                this.publisher.quit(),
                this.subscriber.quit(),
                this.cache.quit()
            ]);
            this.isConnected = false;
            this.emit('disconnected');
            console.log('RedisEventManager shutdown complete');
        }
        catch (error) {
            console.error('Error during RedisEventManager shutdown:', error);
            throw error;
        }
    }
    async isHealthy() {
        try {
            await Promise.all([
                this.publisher.ping(),
                this.subscriber.ping(),
                this.cache.ping()
            ]);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    setupErrorHandlers() {
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
    getChannelKey(channel) {
        return `${this.config.keyPrefix}:${channel}`;
    }
    removeChannelPrefix(channel) {
        const prefix = `${this.config.keyPrefix}:`;
        return channel.startsWith(prefix) ? channel.slice(prefix.length) : channel;
    }
    getGameDataKey(playerId, gameId) {
        return `${this.config.keyPrefix}:gamedata:${playerId}:${gameId}`;
    }
}
exports.RedisEventManager = RedisEventManager;
//# sourceMappingURL=RedisEventManager.js.map