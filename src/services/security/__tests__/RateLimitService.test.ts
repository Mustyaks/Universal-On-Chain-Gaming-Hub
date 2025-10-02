import { RateLimitService, MemoryRateLimitStore } from '../RateLimitService';
import { Request, Response } from 'express';

// Mock Express request and response
const mockRequest = (overrides: Partial<Request> = {}): Request => ({
  ip: '127.0.0.1',
  user: undefined,
  connection: { remoteAddress: '127.0.0.1' },
  ...overrides
} as Request);

const mockResponse = (): Response => {
  const res = {} as Response;
  res.set = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('RateLimitService', () => {
  let rateLimitService: RateLimitService;
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
    rateLimitService = new RateLimitService(store);
  });

  describe('MemoryRateLimitStore', () => {
    it('should increment and track requests', async () => {
      const key = 'test-key';
      const ttl = 60000; // 1 minute

      const count1 = await store.increment(key, ttl);
      expect(count1).toBe(1);

      const count2 = await store.increment(key, ttl);
      expect(count2).toBe(2);

      const retrieved = await store.get(key);
      expect(retrieved).toBe(2);
    });

    it('should reset count after TTL expires', async () => {
      const key = 'test-key';
      const ttl = 1; // 1ms

      await store.increment(key, ttl);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const retrieved = await store.get(key);
      expect(retrieved).toBeNull();
    });

    it('should delete keys', async () => {
      const key = 'test-key';
      await store.set(key, 5, 60000);
      
      await store.delete(key);
      
      const retrieved = await store.get(key);
      expect(retrieved).toBeNull();
    });
  });

  describe('createMiddleware', () => {
    it('should allow requests within limit', async () => {
      const middleware = rateLimitService.createMiddleware({
        windowMs: 60000,
        maxRequests: 5
      });

      const req = mockRequest();
      const res = mockResponse();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith({
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': '4',
        'X-RateLimit-Reset': expect.any(String)
      });
    });

    it('should block requests exceeding limit', async () => {
      const middleware = rateLimitService.createMiddleware({
        windowMs: 60000,
        maxRequests: 2,
        message: 'Too many requests'
      });

      const req = mockRequest();
      const res = mockResponse();
      const next = jest.fn();

      // First two requests should pass
      await middleware(req, res, next);
      await middleware(req, res, next);
      
      expect(next).toHaveBeenCalledTimes(2);

      // Third request should be blocked
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        retryAfter: 60
      });
      expect(next).toHaveBeenCalledTimes(2); // Should not call next for blocked request
    });

    it('should use custom key generator', async () => {
      const middleware = rateLimitService.createMiddleware({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator: (req) => `custom:${req.user?.id || 'anonymous'}`
      });

      const req1 = mockRequest({ user: { id: 'user1' } as any });
      const req2 = mockRequest({ user: { id: 'user2' } as any });
      const res1 = mockResponse();
      const res2 = mockResponse();
      const next = jest.fn();

      // Different users should have separate limits
      await middleware(req1, res1, next);
      await middleware(req2, res2, next);

      expect(next).toHaveBeenCalledTimes(2);
    });

    it('should handle store errors gracefully', async () => {
      const errorStore = {
        increment: jest.fn().mockRejectedValue(new Error('Store error')),
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn()
      };

      const errorRateLimitService = new RateLimitService(errorStore);
      const middleware = errorRateLimitService.createMiddleware({
        windowMs: 60000,
        maxRequests: 5
      });

      const req = mockRequest();
      const res = mockResponse();
      const next = jest.fn();

      await middleware(req, res, next);

      // Should continue despite store error
      expect(next).toHaveBeenCalled();
    });
  });

  describe('checkLimit', () => {
    it('should check limit without incrementing', async () => {
      const config = {
        windowMs: 60000,
        maxRequests: 5
      };

      // Increment manually
      await store.increment('test-key', config.windowMs);
      await store.increment('test-key', config.windowMs);

      const result = await rateLimitService.checkLimit('test-key', config);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(2);
      expect(result.remaining).toBe(3);
    });
  });

  describe('resetLimit', () => {
    it('should reset limit for a key', async () => {
      const key = 'test-key';
      await store.increment(key, 60000);
      
      await rateLimitService.resetLimit(key);
      
      const retrieved = await store.get(key);
      expect(retrieved).toBeNull();
    });
  });

  describe('createConfigs', () => {
    it('should return predefined rate limit configurations', () => {
      const configs = RateLimitService.createConfigs();

      expect(configs).toHaveProperty('auth');
      expect(configs).toHaveProperty('api');
      expect(configs).toHaveProperty('graphql');
      expect(configs).toHaveProperty('sensitive');
      expect(configs).toHaveProperty('perUser');

      expect(configs.auth.maxRequests).toBe(5);
      expect(configs.api.maxRequests).toBe(100);
      expect(configs.sensitive.maxRequests).toBe(10);
    });
  });
});