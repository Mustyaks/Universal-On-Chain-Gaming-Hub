/**
 * Bitcoin Payment Processor
 * Handles Bitcoin payment workflows for marketplace transactions
 */

import { XverseWalletService, PaymentRequest } from './XverseWalletService';
import { DatabaseService, CacheService, EventService } from '../../types/services';
import { Transaction, TransactionStatus } from '../../types/core';

export class BitcoinPaymentProcessor {
  constructor(
    private xverseService: XverseWalletService,
    private db: DatabaseService,
    private cache: CacheService,
    private eventService: EventService
  ) {}

  async initiatePayment(transaction: Transaction): Promise<PaymentRequest> {
    try {
      // Validate transaction
      if (transaction.type !== 'BUY') {
        throw new Error('Only BUY transactions support Bitcoin payments');
      }

      if (transaction.status !== 'PENDING') {
        throw new Error('Transaction must be in PENDING status');
      }

      // Create payment request
      const paymentRequest = await this.xverseService.createPaymentRequest(
        transaction.btcAmount,
        `Purchase of ${transaction.asset.metadata.name}`
      );

      // Store payment request
      await this.db.insertOne('payment_requests', {
        ...paymentRequest,
        transactionId: transaction.id,
        buyerId: transaction.buyerId,
        sellerId: transaction.sellerId
      });

      // Cache payment request for quick access
      await this.cache.set(
        `payment:${paymentRequest.paymentId}`,
        paymentRequest,
        1800 // 30 minutes
      );

      // Update transaction with payment info
      await this.db.updateOne('marketplace_transactions', transaction.id, {
        paymentId: paymentRequest.paymentId,
        status: 'PENDING'
      });

      // Emit payment initiated event
      this.eventService.emit('payment:initiated', {
        transactionId: transaction.id,
        paymentId: paymentRequest.paymentId,
        amount: transaction.btcAmount
      });

      return paymentRequest;
    } catch (error) {
      // Update transaction status to failed
      await this.updateTransactionStatus(transaction.id, 'FAILED');
      
      throw new Error(`Payment initiation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processPayment(paymentId: string): Promise<PaymentProcessingResult> {
    try {
      // Get payment request
      const paymentRequest = await this.getPaymentRequest(paymentId);
      if (!paymentRequest) {
        throw new Error('Payment request not found');
      }

      // Check if payment has expired
      if (paymentRequest.expiresAt < Date.now()) {
        await this.expirePayment(paymentId);
        throw new Error('Payment request has expired');
      }

      // Verify payment on Bitcoin network
      const verification = await this.xverseService.verifyPayment(
        paymentId,
        paymentRequest.amount
      );

      if (!verification.verified) {
        return {
          success: false,
          paymentId,
          error: verification.error || 'Payment verification failed'
        };
      }

      // Update payment status
      await this.db.updateOne('payment_requests', paymentId, {
        status: 'COMPLETED',
        txid: verification.txid,
        confirmations: verification.confirmations,
        completedAt: Date.now()
      });

      // Get associated transaction
      const paymentData = await this.db.findOne('payment_requests', { paymentId }) as any;
      if (paymentData && paymentData.transactionId) {
        await this.updateTransactionStatus(paymentData.transactionId, 'CONFIRMED');
        
        // Emit payment completed event
        this.eventService.emit('payment:completed', {
          paymentId,
          transactionId: paymentData.transactionId,
          txid: verification.txid,
          amount: paymentRequest.amount
        });
      }

      return {
        success: true,
        paymentId,
        txid: verification.txid || '',
        confirmations: verification.confirmations || 0
      };
    } catch (error) {
      return {
        success: false,
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async trackPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      const paymentRequest = await this.getPaymentRequest(paymentId);
      if (!paymentRequest) {
        return {
          paymentId,
          status: 'NOT_FOUND',
          error: 'Payment request not found'
        };
      }

      // Check if expired
      if (paymentRequest.expiresAt < Date.now() && paymentRequest.status === 'PENDING') {
        await this.expirePayment(paymentId);
        return {
          paymentId,
          status: 'EXPIRED',
          expiresAt: paymentRequest.expiresAt
        };
      }

      return {
        paymentId,
        status: paymentRequest.status,
        amount: paymentRequest.amount,
        expiresAt: paymentRequest.expiresAt,
        txid: paymentRequest.txid,
        confirmations: paymentRequest.confirmations
      };
    } catch (error) {
      return {
        paymentId,
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async refundPayment(paymentId: string, reason: string): Promise<RefundResult> {
    try {
      const paymentRequest = await this.getPaymentRequest(paymentId);
      if (!paymentRequest) {
        throw new Error('Payment request not found');
      }

      if (paymentRequest.status !== 'COMPLETED') {
        throw new Error('Can only refund completed payments');
      }

      // Create refund record
      const refundId = this.generateRefundId();
      await this.db.insertOne('payment_refunds', {
        refundId,
        paymentId,
        amount: paymentRequest.amount,
        reason,
        status: 'PENDING',
        createdAt: Date.now()
      });

      // In a real implementation, this would initiate a Bitcoin transaction
      // to send funds back to the buyer
      
      // For now, mark as completed
      await this.db.updateOne('payment_refunds', refundId, {
        status: 'COMPLETED',
        completedAt: Date.now(),
        txid: `refund_tx_${refundId}`
      });

      // Update original payment status
      await this.db.updateOne('payment_requests', paymentId, {
        status: 'REFUNDED'
      });

      // Update associated transaction
      const paymentData = await this.db.findOne('payment_requests', { paymentId }) as any;
      if (paymentData && paymentData.transactionId) {
        await this.updateTransactionStatus(paymentData.transactionId, 'REFUNDED');
      }

      // Emit refund event
      this.eventService.emit('payment:refunded', {
        paymentId,
        refundId,
        amount: paymentRequest.amount,
        reason
      });

      return {
        success: true,
        refundId,
        amount: paymentRequest.amount,
        txid: `refund_tx_${refundId}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getPaymentRequest(paymentId: string): Promise<any> {
    // Try cache first
    const cached = await this.cache.get(`payment:${paymentId}`);
    if (cached) {
      return cached;
    }

    // Fallback to database
    return await this.db.findOne('payment_requests', { paymentId });
  }

  private async expirePayment(paymentId: string): Promise<void> {
    await this.db.updateOne('payment_requests', paymentId, {
      status: 'EXPIRED'
    });

    await this.cache.delete(`payment:${paymentId}`);

    // Update associated transaction
    const paymentData = await this.db.findOne('payment_requests', { paymentId }) as any;
    if (paymentData && paymentData.transactionId) {
      await this.updateTransactionStatus(paymentData.transactionId, 'FAILED');
    }

    this.eventService.emit('payment:expired', { paymentId });
  }

  private async updateTransactionStatus(transactionId: string, status: TransactionStatus): Promise<void> {
    const updateData: any = { status };
    
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'REFUNDED') {
      updateData.completedAt = Date.now();
    }

    await this.db.updateOne('marketplace_transactions', transactionId, updateData);
  }

  private generateRefundId(): string {
    return `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Additional interfaces
export interface PaymentProcessingResult {
  success: boolean;
  paymentId: string;
  txid?: string;
  confirmations?: number;
  error?: string;
}

export interface PaymentStatus {
  paymentId: string;
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'FAILED' | 'REFUNDED' | 'NOT_FOUND' | 'ERROR';
  amount?: number;
  expiresAt?: number;
  txid?: string;
  confirmations?: number;
  error?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  txid?: string;
  error?: string;
}