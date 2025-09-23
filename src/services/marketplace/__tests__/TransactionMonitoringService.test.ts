/**
 * Transaction Monitoring Service Tests
 */

import { TransactionMonitoringService } from '../TransactionMonitoringService';
import { DatabaseService, CacheService, EventService } from '../../../types/services';
import { Transaction, GameAsset } from '../../../types/core';

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

describe('TransactionMonitoringService', () => {
  let monitoringService: TransactionMonitoringService;
  let mockTransaction: Transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    monitoringService = new TransactionMonitoringService(
      mockDb,
      mockCache,
      mockEventService,
      1000 // 1 second for testing
    );

    const mockAsset: GameAsset = {
      id: 'asset_123',
      gameId: 'game_1',
      tokenId: 'token_456',
      contractAddress: '0x123456789',
      assetType: 'NFT',
      metadata: {
        name: 'Test Asset',
        description: 'A test asset',
        image: 'https://example.com/image.png',
        attributes: []
      },
      owner: 'seller_123',
      tradeable: true
    };

    mockTransaction = {
      id: 'tx_123',
      type: 'BUY',
      buyerId: 'buyer_123',
      sellerId: 'seller_123',
      asset: mockAsset,
      btcAmount: 0.001,
      status: 'PENDING',
      txHash: '',
      createdAt: Date.now() - 60000 // 1 minute ago
    };
  });

  describe('monitorPendingTransactions', () => {
    it('should monitor all pending transactions', async () => {
      const pendingTransactions = [mockTransaction];
      mockDb.findMany.mockResolvedValueOnce(pendingTransactions);

      // Mock the private methods
      jest.spyOn(monitoringService as any, 'checkBitcoinPayment').mockResolvedValueOnce(true);
      jest.spyOn(monitoringService as any, 'checkAssetTransfer').mockResolvedValueOnce({
        completed: false
      });

      const result = await monitoringService.monitorPendingTransactions();

      expect(result.monitoredCount).toBe(1);
      expect(result.updatedCount).toBe(1);
      expect(result.errorCount).toBe(0);
      expect(result.results[0]?.newStatus).toBe('CONFIRMED');

      expect(mockDb.findMany).toHaveBeenCalledWith('marketplace_transactions', {
        status: { $in: ['PENDING', 'CONFIRMED'] }
      });
    });

    it('should handle monitoring errors gracefully', async () => {
      const pendingTransactions = [mockTransaction];
      mockDb.findMany.mockResolvedValueOnce(pendingTransactions);

      // Mock an error in monitoring
      jest.spyOn(monitoringService, 'monitorTransaction').mockRejectedValueOnce(new Error('Monitoring failed'));

      const result = await monitoringService.monitorPendingTransactions();

      expect(result.monitoredCount).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.results[0]?.error).toBe('Monitoring failed');
    });
  });

  describe('monitorTransaction', () => {
    it('should detect timeout for old pending transactions', async () => {
      const oldTransaction = {
        ...mockTransaction,
        createdAt: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
      };

      const result = await monitoringService.monitorTransaction(oldTransaction);

      expect(result.newStatus).toBe('FAILED');
      expect(result.reason).toBe('Transaction timeout');
      expect(mockEventService.emit).toHaveBeenCalledWith('transaction:timeout', expect.any(Object));
    });

    it('should monitor BUY transaction progression', async () => {
      // Mock Bitcoin payment confirmed
      jest.spyOn(monitoringService as any, 'checkBitcoinPayment').mockResolvedValueOnce(true);

      const result = await monitoringService.monitorTransaction(mockTransaction);

      expect(result.newStatus).toBe('CONFIRMED');
      expect(result.reason).toBe('Bitcoin payment confirmed');
    });

    it('should monitor confirmed BUY transaction for completion', async () => {
      const confirmedTransaction = {
        ...mockTransaction,
        status: 'CONFIRMED' as const
      };

      // Mock asset transfer completed
      jest.spyOn(monitoringService as any, 'checkAssetTransfer').mockResolvedValueOnce({
        completed: true,
        txHash: '0xabc123'
      });

      const result = await monitoringService.monitorTransaction(confirmedTransaction);

      expect(result.newStatus).toBe('COMPLETED');
      expect(result.txHash).toBe('0xabc123');
      expect(result.reason).toBe('Asset transfer completed');
    });

    it('should monitor SELL transactions', async () => {
      const sellTransaction = {
        ...mockTransaction,
        type: 'SELL' as const
      };

      // Mock asset escrowed
      jest.spyOn(monitoringService as any, 'checkAssetEscrow').mockResolvedValueOnce(true);

      const result = await monitoringService.monitorTransaction(sellTransaction);

      expect(result.newStatus).toBe('CONFIRMED');
      expect(result.reason).toBe('Asset escrowed successfully');
    });

    it('should monitor SWAP transactions', async () => {
      const swapTransaction = {
        ...mockTransaction,
        type: 'SWAP' as const
      };

      // Mock swap completed
      jest.spyOn(monitoringService as any, 'checkSwapStatus').mockResolvedValueOnce({
        status: 'COMPLETED',
        txHash: '0xswap123'
      });

      const result = await monitoringService.monitorTransaction(swapTransaction);

      expect(result.newStatus).toBe('COMPLETED');
      expect(result.txHash).toBe('0xswap123');
      expect(result.reason).toBe('Cross-chain swap completed');
    });
  });

  describe('getTransactionStatus', () => {
    it('should return transaction status with additional info', async () => {
      mockDb.findOne.mockResolvedValueOnce(mockTransaction);

      const statusInfo = await monitoringService.getTransactionStatus('tx_123');

      expect(statusInfo).toMatchObject({
        transactionId: 'tx_123',
        status: 'PENDING',
        type: 'BUY',
        btcAmount: 0.001,
        age: expect.any(Number),
        estimatedCompletion: expect.any(Number)
      });
    });

    it('should throw error for non-existent transaction', async () => {
      mockDb.findOne.mockResolvedValueOnce(null);

      await expect(monitoringService.getTransactionStatus('nonexistent'))
        .rejects.toThrow('Transaction not found');
    });
  });

  describe('recoverFailedTransaction', () => {
    it('should recover failed BUY transaction with Bitcoin received', async () => {
      const failedTransaction = {
        ...mockTransaction,
        status: 'FAILED' as const
      };

      mockDb.findOne.mockResolvedValueOnce(failedTransaction);
      jest.spyOn(monitoringService as any, 'checkBitcoinPayment').mockResolvedValueOnce(true);

      const result = await monitoringService.recoverFailedTransaction('tx_123');

      expect(result.success).toBe(true);
      expect(result.action).toBe('RETRY_ASSET_TRANSFER');
      expect(result.message).toContain('Bitcoin payment confirmed');
    });

    it('should handle failed BUY transaction with no Bitcoin received', async () => {
      const failedTransaction = {
        ...mockTransaction,
        status: 'FAILED' as const
      };

      mockDb.findOne.mockResolvedValueOnce(failedTransaction);
      jest.spyOn(monitoringService as any, 'checkBitcoinPayment').mockResolvedValueOnce(false);

      const result = await monitoringService.recoverFailedTransaction('tx_123');

      expect(result.success).toBe(true);
      expect(result.action).toBe('NO_RECOVERY_NEEDED');
    });

    it('should recover failed SELL transaction', async () => {
      const failedSellTransaction = {
        ...mockTransaction,
        type: 'SELL' as const,
        status: 'FAILED' as const
      };

      mockDb.findOne.mockResolvedValueOnce(failedSellTransaction);
      jest.spyOn(monitoringService as any, 'checkAssetEscrow').mockResolvedValueOnce(true);

      const result = await monitoringService.recoverFailedTransaction('tx_123');

      expect(result.success).toBe(true);
      expect(result.action).toBe('INITIATE_REFUND');
      expect(result.message).toContain('initiating refund to seller');
    });

    it('should throw error for non-failed transactions', async () => {
      mockDb.findOne.mockResolvedValueOnce(mockTransaction); // PENDING transaction

      const result = await monitoringService.recoverFailedTransaction('tx_123');

      expect(result.success).toBe(false);
      expect(result.action).toBe('ERROR');
      expect(result.message).toContain('Can only recover failed transactions');
    });
  });

  describe('getFailedTransactions', () => {
    it('should return list of failed transactions', async () => {
      const failedTransactions = [
        {
          ...mockTransaction,
          status: 'FAILED',
          completedAt: Date.now()
        }
      ];

      mockDb.findMany.mockResolvedValueOnce(failedTransactions);

      const result = await monitoringService.getFailedTransactions(10);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        transactionId: 'tx_123',
        type: 'BUY',
        btcAmount: 0.001,
        failedAt: expect.any(Number)
      });

      expect(mockDb.findMany).toHaveBeenCalledWith(
        'marketplace_transactions',
        { status: 'FAILED' },
        { limit: 10, sort: { createdAt: -1 } }
      );
    });
  });

  describe('createManualIntervention', () => {
    it('should create manual intervention record', async () => {
      mockDb.insertOne.mockResolvedValueOnce('intervention_id');

      const interventionId = await monitoringService.createManualIntervention(
        'tx_123',
        'MANUAL_REFUND',
        'Customer requested refund'
      );

      expect(interventionId).toBeDefined();
      expect(mockDb.insertOne).toHaveBeenCalledWith('manual_interventions', expect.objectContaining({
        transactionId: 'tx_123',
        action: 'MANUAL_REFUND',
        notes: 'Customer requested refund',
        status: 'PENDING'
      }));

      expect(mockEventService.emit).toHaveBeenCalledWith('intervention:created', expect.any(Object));
    });
  });

  describe('monitoring lifecycle', () => {
    it('should start and stop monitoring', async () => {
      await monitoringService.startMonitoring();
      expect(mockEventService.emit).toHaveBeenCalledWith('monitoring:started', expect.any(Object));

      await monitoringService.stopMonitoring();
      expect(mockEventService.emit).toHaveBeenCalledWith('monitoring:stopped', expect.any(Object));
    });
  });
});