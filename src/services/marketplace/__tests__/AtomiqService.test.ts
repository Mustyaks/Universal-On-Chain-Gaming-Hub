/**
 * Atomiq Service Tests
 */

import { AtomiqService } from '../AtomiqService';
import { DatabaseService, CacheService, EventService } from '../../../types/services';

// Mock dependencies
const mockDb: jest.Mocked<DatabaseService> = {
  findOne: jest.fn(),
  findMany: jest.fn(),
  insertOne: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn()
};

const mockCache: jest.Mocked<CacheService> = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  invalidatePattern: jest.fn()
};

const mockEventService: jest.Mocked<EventService> = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
};

describe('AtomiqService', () => {
  let atomiqService: AtomiqService;

  beforeEach(() => {
    jest.clearAllMocks();
    atomiqService = new AtomiqService(mockDb, mockCache, mockEventService, 'test-api-key');
  });

  describe('initializeSwap', () => {
    it('should initialize swap successfully', async () => {
      mockDb.insertOne.mockResolvedValueOnce('swap_id');

      const result = await atomiqService.initializeSwap(0.001, 'ETH');

      expect(result).toMatchObject({
        btcAddress: expect.any(String),
        expectedAmount: expect.any(Number),
        expiresAt: expect.any(Number)
      });

      expect(result.swapId).toBeDefined();
      expect(result.expectedAmount).toBeGreaterThan(0);
      expect(result.expiresAt).toBeGreaterThan(Date.now());

      expect(mockDb.insertOne).toHaveBeenCalledWith('atomiq_swaps', expect.objectContaining({
        swapId: result.swapId,
        btcAmount: 0.001,
        targetAsset: 'ETH',
        status: 'INITIATED'
      }));

      expect(mockCache.set).toHaveBeenCalledWith(
        `swap:${result.swapId}`,
        result,
        1800
      );

      expect(mockEventService.emit).toHaveBeenCalledWith('swap:initiated', expect.any(Object));
    });

    it('should throw error for invalid BTC amount', async () => {
      await expect(atomiqService.initializeSwap(0, 'ETH'))
        .rejects.toThrow('BTC amount must be greater than 0');

      await expect(atomiqService.initializeSwap(-0.001, 'ETH'))
        .rejects.toThrow('BTC amount must be greater than 0');
    });

    it('should throw error for missing target asset', async () => {
      await expect(atomiqService.initializeSwap(0.001, ''))
        .rejects.toThrow('Target asset is required');
    });

    it('should calculate expected amounts for different assets', async () => {
      mockDb.insertOne.mockResolvedValue('swap_id');

      const ethSwap = await atomiqService.initializeSwap(0.001, 'ETH');
      const strkSwap = await atomiqService.initializeSwap(0.001, 'STRK');
      const usdcSwap = await atomiqService.initializeSwap(0.001, 'USDC');

      expect(ethSwap.expectedAmount).toBeCloseTo(0.001 * 15 * 0.995, 6);
      expect(strkSwap.expectedAmount).toBeCloseTo(0.001 * 50000 * 0.995, 2);
      expect(usdcSwap.expectedAmount).toBeCloseTo(0.001 * 45000 * 0.995, 2);
    });
  });

  describe('executeSwap', () => {
    const mockSwapData = {
      swapId: 'swap_123',
      btcAmount: 0.001,
      targetAsset: 'ETH',
      expectedAmount: 0.01492,
      btcAddress: 'bc1qtest123',
      expiresAt: Date.now() + 1800000,
      status: 'INITIATED'
    };

    it('should execute swap successfully when BTC is received', async () => {
      // Mock swap data retrieval
      mockCache.get.mockResolvedValueOnce(mockSwapData);

      // Mock BTC payment check (simulate payment received)
      jest.spyOn(atomiqService as any, 'checkBtcPayment').mockResolvedValueOnce(true);

      const result = await atomiqService.executeSwap('swap_123');

      expect(result).toMatchObject({
        swapId: 'swap_123',
        btcAmount: 0.001,
        starknetAmount: 0.01492,
        status: 'COMPLETED',
        txHash: expect.any(String)
      });

      expect(mockDb.updateOne).toHaveBeenCalledWith('atomiq_swaps', 'swap_123', {
        status: 'COMPLETED',
        updatedAt: expect.any(Number)
      });

      expect(mockEventService.emit).toHaveBeenCalledWith('swap:completed', expect.any(Object));
    });

    it('should return pending status when BTC not yet received', async () => {
      mockCache.get.mockResolvedValueOnce(mockSwapData);

      // Mock BTC payment check (simulate payment not received)
      jest.spyOn(atomiqService as any, 'checkBtcPayment').mockResolvedValueOnce(false);

      const result = await atomiqService.executeSwap('swap_123');

      expect(result).toMatchObject({
        swapId: 'swap_123',
        status: 'PENDING'
      });
    });

    it('should throw error for expired swap', async () => {
      const expiredSwapData = {
        ...mockSwapData,
        expiresAt: Date.now() - 1000 // Expired
      };

      mockCache.get.mockResolvedValueOnce(expiredSwapData);

      await expect(atomiqService.executeSwap('swap_123'))
        .rejects.toThrow('Swap has expired');

      expect(mockDb.updateOne).toHaveBeenCalledWith('atomiq_swaps', 'swap_123', {
        status: 'FAILED',
        updatedAt: expect.any(Number)
      });
    });

    it('should throw error for non-existent swap', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      mockDb.findOne.mockResolvedValueOnce(null);

      await expect(atomiqService.executeSwap('nonexistent'))
        .rejects.toThrow('Swap not found');
    });
  });

  describe('getSwapStatus', () => {
    it('should return swap status successfully', async () => {
      const mockSwapData = {
        swapId: 'swap_123',
        btcAmount: 0.001,
        expectedAmount: 0.01492,
        status: 'COMPLETED',
        txHash: '0xabc123',
        expiresAt: Date.now() + 1800000
      };

      mockCache.get.mockResolvedValueOnce(mockSwapData);

      const result = await atomiqService.getSwapStatus('swap_123');

      expect(result).toEqual({
        swapId: 'swap_123',
        btcAmount: 0.001,
        starknetAmount: 0.01492,
        status: 'COMPLETED',
        txHash: '0xabc123'
      });
    });

    it('should mark expired swaps as failed', async () => {
      const expiredSwapData = {
        swapId: 'swap_123',
        btcAmount: 0.001,
        expectedAmount: 0.01492,
        status: 'INITIATED',
        expiresAt: Date.now() - 1000 // Expired
      };

      mockCache.get.mockResolvedValueOnce(expiredSwapData);

      const result = await atomiqService.getSwapStatus('swap_123');

      expect(result.status).toBe('FAILED');
      expect(mockDb.updateOne).toHaveBeenCalledWith('atomiq_swaps', 'swap_123', {
        status: 'FAILED',
        updatedAt: expect.any(Number)
      });
    });

    it('should throw error for non-existent swap', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      mockDb.findOne.mockResolvedValueOnce(null);

      await expect(atomiqService.getSwapStatus('nonexistent'))
        .rejects.toThrow('Swap not found');
    });
  });

  describe('cancelSwap', () => {
    it('should cancel initiated swap successfully', async () => {
      const mockSwapData = {
        swapId: 'swap_123',
        status: 'INITIATED'
      };

      mockCache.get.mockResolvedValueOnce(mockSwapData);

      await atomiqService.cancelSwap('swap_123');

      expect(mockDb.updateOne).toHaveBeenCalledWith('atomiq_swaps', 'swap_123', {
        status: 'CANCELLED',
        updatedAt: expect.any(Number)
      });

      expect(mockCache.delete).toHaveBeenCalledWith('swap:swap_123');
      expect(mockEventService.emit).toHaveBeenCalledWith('swap:cancelled', { swapId: 'swap_123' });
    });

    it('should cancel pending swap successfully', async () => {
      const mockSwapData = {
        swapId: 'swap_123',
        status: 'PENDING'
      };

      mockCache.get.mockResolvedValueOnce(mockSwapData);

      await atomiqService.cancelSwap('swap_123');

      expect(mockDb.updateOne).toHaveBeenCalledWith('atomiq_swaps', 'swap_123', {
        status: 'CANCELLED',
        updatedAt: expect.any(Number)
      });
    });

    it('should throw error for completed swap', async () => {
      const mockSwapData = {
        swapId: 'swap_123',
        status: 'COMPLETED'
      };

      mockCache.get.mockResolvedValueOnce(mockSwapData);

      await expect(atomiqService.cancelSwap('swap_123'))
        .rejects.toThrow('Can only cancel initiated or pending swaps');
    });

    it('should throw error for non-existent swap', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      mockDb.findOne.mockResolvedValueOnce(null);

      await expect(atomiqService.cancelSwap('nonexistent'))
        .rejects.toThrow('Swap not found');
    });
  });

  describe('getSwapHistory', () => {
    it('should return user swap history', async () => {
      const mockSwaps = [
        {
          swapId: 'swap_1',
          btcAmount: 0.001,
          expectedAmount: 0.01492,
          status: 'COMPLETED',
          txHash: '0xabc123'
        },
        {
          swapId: 'swap_2',
          btcAmount: 0.002,
          expectedAmount: 0.02984,
          status: 'PENDING'
        }
      ];

      mockDb.findMany.mockResolvedValueOnce(mockSwaps);

      const result = await atomiqService.getSwapHistory('user_123', 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        swapId: 'swap_1',
        btcAmount: 0.001,
        starknetAmount: 0.01492,
        status: 'COMPLETED',
        txHash: '0xabc123'
      });

      expect(mockDb.findMany).toHaveBeenCalledWith(
        'atomiq_swaps',
        { userId: 'user_123' },
        { limit: 10, sort: { createdAt: -1 } }
      );
    });

    it('should use default limit if not specified', async () => {
      mockDb.findMany.mockResolvedValueOnce([]);

      await atomiqService.getSwapHistory('user_123');

      expect(mockDb.findMany).toHaveBeenCalledWith(
        'atomiq_swaps',
        { userId: 'user_123' },
        { limit: 20, sort: { createdAt: -1 } }
      );
    });
  });
});