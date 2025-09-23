/**
 * Comprehensive test suite for CacheManager
 * Tests Redis integration, cache invalidation strategies, and performance monitoring
 */

import { CacheManager, CacheConfig, CacheKey, InvalidationTrigger } from '../CacheManager';
import { EventEmitter } from 'events';

// Mock Redis client
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn(),
  setEx: jest.fn().mockResolvedValue('OK'),
  del: jest.fn(),
  keys: jest.fn(),
  info: jest.fn(),
  dbSize: jest.fn(),
  ttl: jest.fn(),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  isOpen: true
};

// Mock the redis module
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient)
}));

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let config: CacheConfig;

  beforeEach(() => {
    config = {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        keyPrefix: 'test-hub'
      },
      defaultTtl: 3600,
      maxMemoryUsage: 1024 * 1024 * 100, // 100MB
      compressionEnabled: true,
      metricsEnabled: true,
      invalidationStrategies: [
        {
          name: 'player_data_invalidation',
          pattern: 'player_data:*:{playerId}',
          triggers: ['player_update', 'game_sync']
        }
      ]
    };

    cacheManager = new CacheManager(config);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await cacheManager.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize Redis client successfully', async () => {
      await cacheManager.initialize();

      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should set up event listeners for Redis client', async () => {
      await cacheManager.initialize();

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should throw error if Redis connection fails', async () => {
      mockRedisClient.connect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(cacheManager.initialize()).rejects.toThrow('Redis initialization failed');
    });
  });

  describe('Cache Operations', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    describe('get()', () => {
      it('should return cached data when key exists', async () => {
        const cacheKey: CacheKey = {
          type: 'player_data',
          gameId: 'game1',
          playerId: 'player1'
        };

        const cachedEntry = {
          key: 'test-hub:player_data:game1:player1',
          value: { name: 'Test Player', level: 10 },
          ttl: 3600,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          accessCount: 1,
          compressed: false,
          size: 100
        };

        mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cachedEntry));
        mockRedisClient.setEx.mockResolvedValueOnce('OK');

        const result = await cacheManager.get(cacheKey);

        expect(result).toEqual({ name: 'Test Player', level: 10 });
        expect(mockRedisClient.get).toHaveBeenCalledWith('test-hub:player_data:game1:player1');
      });

      it('should return null when key does not exist', async () => {
        const cacheKey: CacheKey = {
          type: 'player_data',
          gameId: 'game1',
          playerId: 'player1'
        };

        mockRedisClient.get.mockResolvedValueOnce(null);

        const result = await cacheManager.get(cacheKey);

        expect(result).toBeNull();
      });

      it('should handle Redis errors gracefully', async () => {
        const cacheKey: CacheKey = {
          type: 'player_data',
          gameId: 'game1',
          playerId: 'player1'
        };

        mockRedisClient.get.mockRejectedValueOnce(new Error('Redis error'));

        const result = await cacheManager.get(cacheKey);

        expect(result).toBeNull();
      });
    });

    describe('set()', () => {
      it('should store data in cache with default TTL', async () => {
        const cacheKey: CacheKey = {
          type: 'player_data',
          gameId: 'game1',
          playerId: 'player1'
        };

        const data = { name: 'Test Player', level: 10 };

        await cacheManager.set(cacheKey, data);

        expect(mockRedisClient.setEx).toHaveBeenCalledWith(
          'test-hub:player_data:game1:player1',
          3600,
          expect.stringContaining('"value":{"name":"Test Player","level":10}')
        );
      });

      it('should store data with custom TTL', async () => {
        const cacheKey: CacheKey = {
          type: 'player_data',
          gameId: 'game1',
          playerId: 'player1'
        };

        const data = { name: 'Test Player', level: 10 };

        await cacheManager.set(cacheKey, data, 1800);

        expect(mockRedisClient.setEx).toHaveBeenCalledWith(
          'test-hub:player_data:game1:player1',
          1800,
          expect.any(String)
        );
      });
    });

    describe('delete()', () => {
      it('should delete key from cache', async () => {
        const cacheKey: CacheKey = {
          type: 'player_data',
          gameId: 'game1',
          playerId: 'player1'
        };

        mockRedisClient.del.mockResolvedValueOnce(1);

        const result = await cacheManager.delete(cacheKey);

        expect(result).toBe(true);
        expect(mockRedisClient.del).toHaveBeenCalledWith('test-hub:player_data:game1:player1');
      });
    });
  });

  describe('Cache Invalidation', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    describe('invalidatePattern()', () => {
      it('should invalidate keys matching pattern', async () => {
        const pattern = 'player_data:game1:*';
        const keys = ['test-hub:player_data:game1:player1', 'test-hub:player_data:game1:player2'];

        mockRedisClient.keys.mockResolvedValueOnce(keys);
        mockRedisClient.del.mockResolvedValueOnce(2);

        const result = await cacheManager.invalidatePattern(pattern);

        expect(result).toBe(2);
        expect(mockRedisClient.keys).toHaveBeenCalledWith('test-hub:player_data:game1:*');
        expect(mockRedisClient.del).toHaveBeenCalledWith(...keys);
      });
    });

    describe('invalidateByTrigger()', () => {
      it('should invalidate cache based on trigger', async () => {
        const trigger: InvalidationTrigger = 'player_update';
        const context = { playerId: 'player1' };

        mockRedisClient.keys.mockResolvedValueOnce(['test-hub:player_data:game1:player1']);
        mockRedisClient.del.mockResolvedValueOnce(1);

        await cacheManager.invalidateByTrigger(trigger, context);

        expect(mockRedisClient.keys).toHaveBeenCalledWith('test-hub:player_data:*:player1');
      });
    });

    describe('smartInvalidate()', () => {
      it('should perform smart invalidation for player updates', async () => {
        mockRedisClient.keys.mockResolvedValue([]);
        mockRedisClient.del.mockResolvedValue(0);

        await cacheManager.smartInvalidate('player_update', 'player1', 'game1');

        // Should call keys multiple times for different patterns
        expect(mockRedisClient.keys).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    describe('getMetrics()', () => {
      it('should return current cache metrics', () => {
        const metrics = cacheManager.getMetrics();

        expect(metrics).toHaveProperty('hits');
        expect(metrics).toHaveProperty('misses');
        expect(metrics).toHaveProperty('hitRate');
        expect(metrics).toHaveProperty('totalRequests');
        expect(metrics).toHaveProperty('averageResponseTime');
      });
    });

    describe('getDetailedMetrics()', () => {
      it('should return detailed performance metrics', async () => {
        mockRedisClient.info.mockResolvedValueOnce('used_memory:1048576\nused_memory_human:1.00M');
        mockRedisClient.dbSize.mockResolvedValueOnce(100);
        mockRedisClient.keys.mockResolvedValueOnce([]);

        const metrics = await cacheManager.getDetailedMetrics();

        expect(metrics).toHaveProperty('memoryStats');
        expect(metrics).toHaveProperty('responseTimePercentiles');
        expect(metrics).toHaveProperty('cacheEfficiency');
        expect(metrics).toHaveProperty('topKeys');
        expect(metrics).toHaveProperty('errorRate');
      });
    });

    describe('getHealthStatus()', () => {
      it('should return healthy status when cache is performing well', async () => {
        mockRedisClient.ping.mockResolvedValueOnce('PONG');
        mockRedisClient.info.mockResolvedValueOnce('used_memory:1048576');
        mockRedisClient.dbSize.mockResolvedValueOnce(100);
        mockRedisClient.keys.mockResolvedValueOnce([]);

        const health = await cacheManager.getHealthStatus();

        expect(health.status).toBe('HEALTHY');
        expect(health.pingTime).toBeGreaterThan(0);
        expect(health.issues).toHaveLength(0);
      });

      it('should return unhealthy status when Redis is down', async () => {
        mockRedisClient.ping.mockRejectedValueOnce(new Error('Connection refused'));

        const health = await cacheManager.getHealthStatus();

        expect(health.status).toBe('UNHEALTHY');
        expect(health.pingTime).toBe(-1);
        expect(health.issues.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Cache Warmup', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    it('should warm up cache for specified players', async () => {
      const gameId = 'game1';
      const playerIds = ['player1', 'player2'];

      mockRedisClient.get.mockResolvedValue(null); // Simulate cache miss

      await cacheManager.warmUp(gameId, playerIds);

      // Should attempt to get cached data for each player
      expect(mockRedisClient.get).toHaveBeenCalledTimes(playerIds.length * 4); // 4 cache types per player
    });
  });

  describe('Cache Cleanup', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    it('should clean up expired keys', async () => {
      const keys = ['test-hub:key1', 'test-hub:key2', 'test-hub:key3'];
      
      mockRedisClient.keys.mockResolvedValueOnce(keys);
      mockRedisClient.ttl
        .mockResolvedValueOnce(-2) // Expired
        .mockResolvedValueOnce(3600) // Valid
        .mockResolvedValueOnce(-2); // Expired
      mockRedisClient.del.mockResolvedValue(1);

      await cacheManager.cleanup();

      expect(mockRedisClient.del).toHaveBeenCalledTimes(2); // Two expired keys
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await cacheManager.initialize();
    });

    it('should emit cache hit events', async () => {
      const eventSpy = jest.fn();
      cacheManager.on('cache:hit', eventSpy);

      const cacheKey: CacheKey = {
        type: 'player_data',
        gameId: 'game1',
        playerId: 'player1'
      };

      const cachedEntry = {
        key: 'test-hub:player_data:game1:player1',
        value: { name: 'Test Player' },
        ttl: 3600,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 1,
        compressed: false,
        size: 100
      };

      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cachedEntry));
      mockRedisClient.setEx.mockResolvedValueOnce('OK');

      await cacheManager.get(cacheKey);

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        key: 'test-hub:player_data:game1:player1',
        responseTime: expect.any(Number)
      }));
    });

    it('should emit cache miss events', async () => {
      const eventSpy = jest.fn();
      cacheManager.on('cache:miss', eventSpy);

      const cacheKey: CacheKey = {
        type: 'player_data',
        gameId: 'game1',
        playerId: 'player1'
      };

      mockRedisClient.get.mockResolvedValueOnce(null);

      await cacheManager.get(cacheKey);

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        key: 'test-hub:player_data:game1:player1',
        responseTime: expect.any(Number)
      }));
    });
  });
});