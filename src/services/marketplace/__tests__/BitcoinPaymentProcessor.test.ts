/**
 * Bitcoin Payment Processor Tests
 */

import { BitcoinPaymentProcessor } from '../BitcoinPaymentProcessor';
// import { XverseWalletService } from '../XverseWalletService';
import { DatabaseService, CacheService, EventService } from '../../../types/services';
import { Transaction, GameAsset } from '../../../types/core';

// Mock dependencies
const mockXverseService = {
  connectWallet: jest.fn(),
  signTransaction: jest.fn(),
  getBalance: jest.fn(),
  sendBitcoin: jest.fn(),
  createPaymentRequest: jest.fn(),
  verifyPayment: jest.fn(),
  getCurrentConnection: jest.fn(),
  disconnect: jest.fn()
} as any;

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

describe('BitcoinPaymentProcessor', () => {
  let paymentProcessor: BitcoinPaymentProcessor;
  let mockTransaction: Transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    paymentProcessor = new BitcoinPaymentProcessor(
      mockXverseService,
      mockDb,
      mockCache,
      mockEventService
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
      createdAt: Date.now()
    };
  });

  describe('initiatePayment', () => {
    it('should initiate payment successfully', async () => {
      const mockPaymentRequest = {
        paymentId: 'payment_123',
        amount: 0.001,
        description: 'Purchase of Test Asset',
        recipientAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        expiresAt: Date.now() + 1800000,
        status: 'PENDING' as const
      };

      mockXverseService.createPaymentRequest.mockResolvedValueOnce(mockPaymentRequest);
      mockDb.insertOne.mockResolvedValueOnce('payment_id');

      const result = await paymentProcessor.initiatePayment(mockTransaction);

      expect(result).toEqual(mockPaymentRequest);
      expect(mockXverseService.createPaymentRequest).toHaveBeenCalledWith(
        0.001,
        'Purchase of Test Asset'
      );
      expect(mockDb.insertOne).toHaveBeenCalledWith('payment_requests', expect.objectContaining({
        ...mockPaymentRequest,
        transactionId: 'tx_123',
        buyerId: 'buyer_123',
        sellerId: 'seller_123'
      }));
      expect(mockCache.set).toHaveBeenCalledWith(
        'payment:payment_123',
        mockPaymentRequest,
        1800
      );
      expect(mockEventService.emit).toHaveBeenCalledWith('payment:initiated', expect.any(Object));
    });

    it('should throw error for non-BUY transactions', async () => {
      const sellTransaction = { ...mockTransaction, type: 'SELL' as const };

      await expect(paymentProcessor.initiatePayment(sellTransaction))
        .rejects.toThrow('Only BUY transactions support Bitcoin payments');
    });

    it('should throw error for non-PENDING transactions', async () => {
      const confirmedTransaction = { ...mockTransaction, status: 'CONFIRMED' as const };

      await expect(paymentProcessor.initiatePayment(confirmedTransaction))
        .rejects.toThrow('Transaction must be in PENDING status');
    });
  });

  describe('processPayment', () => {
    it('should process payment successfully', async () => {
      const mockPaymentRequest = {
        paymentId: 'payment_123',
        amount: 0.001,
        expiresAt: Date.now() + 1800000,
        status: 'PENDING'
      };

      const mockVerification = {
        paymentId: 'payment_123',
        verified: true,
        txid: 'btc_tx_123',
        amount: 0.001,
        confirmations: 1,
        timestamp: Date.now()
      };

      const mockPaymentData = {
        paymentId: 'payment_123',
        transactionId: 'tx_123'
      };

      mockCache.get.mockResolvedValueOnce(mockPaymentRequest);
      mockXverseService.verifyPayment.mockResolvedValueOnce(mockVerification);
      mockDb.findOne.mockResolvedValueOnce(mockPaymentData);

      const result = await paymentProcessor.processPayment('payment_123');

      expect(result.success).toBe(true);
      expect(result.txid).toBe('btc_tx_123');
      expect(mockDb.updateOne).toHaveBeenCalledWith('payment_requests', 'payment_123', expect.objectContaining({
        status: 'COMPLETED',
        txid: 'btc_tx_123',
        confirmations: 1
      }));
      expect(mockEventService.emit).toHaveBeenCalledWith('payment:completed', expect.any(Object));
    });

    it('should handle expired payment', async () => {
      const expiredPaymentRequest = {
        paymentId: 'payment_123',
        amount: 0.001,
        expiresAt: Date.now() - 1000, // Expired
        status: 'PENDING'
      };

      mockCache.get.mockResolvedValueOnce(expiredPaymentRequest);

      const result = await paymentProcessor.processPayment('payment_123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should handle verification failure', async () => {
      const mockPaymentRequest = {
        paymentId: 'payment_123',
        amount: 0.001,
        expiresAt: Date.now() + 1800000,
        status: 'PENDING'
      };

      const mockVerification = {
        paymentId: 'payment_123',
        verified: false,
        error: 'Insufficient confirmations',
        timestamp: Date.now()
      };

      mockCache.get.mockResolvedValueOnce(mockPaymentRequest);
      mockXverseService.verifyPayment.mockResolvedValueOnce(mockVerification);

      const result = await paymentProcessor.processPayment('payment_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient confirmations');
    });
  });

  describe('trackPaymentStatus', () => {
    it('should return payment status successfully', async () => {
      const mockPaymentRequest = {
        paymentId: 'payment_123',
        amount: 0.001,
        expiresAt: Date.now() + 1800000,
        status: 'COMPLETED',
        txid: 'btc_tx_123',
        confirmations: 3
      };

      mockCache.get.mockResolvedValueOnce(mockPaymentRequest);

      const status = await paymentProcessor.trackPaymentStatus('payment_123');

      expect(status).toMatchObject({
        paymentId: 'payment_123',
        status: 'COMPLETED',
        amount: 0.001,
        txid: 'btc_tx_123',
        confirmations: 3
      });
    });

    it('should handle expired payment', async () => {
      const expiredPaymentRequest = {
        paymentId: 'payment_123',
        amount: 0.001,
        expiresAt: Date.now() - 1000,
        status: 'PENDING'
      };

      mockCache.get.mockResolvedValueOnce(expiredPaymentRequest);

      const status = await paymentProcessor.trackPaymentStatus('payment_123');

      expect(status.status).toBe('EXPIRED');
      expect(mockDb.updateOne).toHaveBeenCalledWith('payment_requests', 'payment_123', {
        status: 'EXPIRED'
      });
    });

    it('should handle payment not found', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      mockDb.findOne.mockResolvedValueOnce(null);

      const status = await paymentProcessor.trackPaymentStatus('nonexistent');

      expect(status.status).toBe('NOT_FOUND');
      expect(status.error).toBe('Payment request not found');
    });
  });

  describe('refundPayment', () => {
    it('should process refund successfully', async () => {
      const mockPaymentRequest = {
        paymentId: 'payment_123',
        amount: 0.001,
        status: 'COMPLETED'
      };

      const mockPaymentData = {
        paymentId: 'payment_123',
        transactionId: 'tx_123'
      };

      mockCache.get.mockResolvedValueOnce(mockPaymentRequest);
      mockDb.findOne.mockResolvedValueOnce(mockPaymentData);
      mockDb.insertOne.mockResolvedValueOnce('refund_id');

      const result = await paymentProcessor.refundPayment('payment_123', 'Customer request');

      expect(result.success).toBe(true);
      expect(result.amount).toBe(0.001);
      expect(mockDb.insertOne).toHaveBeenCalledWith('payment_refunds', expect.objectContaining({
        paymentId: 'payment_123',
        amount: 0.001,
        reason: 'Customer request',
        status: 'PENDING'
      }));
      expect(mockEventService.emit).toHaveBeenCalledWith('payment:refunded', expect.any(Object));
    });

    it('should throw error for non-completed payments', async () => {
      const mockPaymentRequest = {
        paymentId: 'payment_123',
        amount: 0.001,
        status: 'PENDING'
      };

      mockCache.get.mockResolvedValueOnce(mockPaymentRequest);

      const result = await paymentProcessor.refundPayment('payment_123', 'Test reason');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Can only refund completed payments');
    });
  });
});