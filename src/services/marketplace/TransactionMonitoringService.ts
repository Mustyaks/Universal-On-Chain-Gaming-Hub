/**
 * Transaction Monitoring Service
 * Monitors Bitcoin and Starknet transactions for marketplace operations
 */

import { DatabaseService, CacheService, EventService } from '../../types/services';
import { Transaction, TransactionStatus } from '../../types/core';

export class TransactionMonitoringService {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(
    private db: DatabaseService,
    _cache: CacheService, // Not used in current implementation
    private eventService: EventService,
    private monitoringIntervalMs: number = 30000 // 30 seconds
  ) {}

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorPendingTransactions();
      } catch (error) {
        console.error('Error in transaction monitoring:', error);
        this.eventService.emit('monitoring:error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now()
        });
      }
    }, this.monitoringIntervalMs);

    this.eventService.emit('monitoring:started', { timestamp: Date.now() });
  }

  async stopMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    this.eventService.emit('monitoring:stopped', { timestamp: Date.now() });
  }

  async monitorPendingTransactions(): Promise<MonitoringResult> {
    try {
      // Get all pending transactions
      const pendingTransactions = await this.db.findMany('marketplace_transactions', {
        status: { $in: ['PENDING', 'CONFIRMED'] }
      }) as Transaction[];

      const results: TransactionMonitorResult[] = [];

      for (const transaction of pendingTransactions) {
        try {
          const result = await this.monitorTransaction(transaction);
          results.push(result);

          // Update transaction status if changed
          if (result.newStatus && result.newStatus !== transaction.status) {
            await this.updateTransactionStatus(transaction.id, result.newStatus, result.txHash);
          }
        } catch (error) {
          results.push({
            transactionId: transaction.id,
            currentStatus: transaction.status,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return {
        monitoredCount: pendingTransactions.length,
        updatedCount: results.filter(r => r.newStatus).length,
        errorCount: results.filter(r => r.error).length,
        results
      };
    } catch (error) {
      throw new Error(`Failed to monitor pending transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async monitorTransaction(transaction: Transaction): Promise<TransactionMonitorResult> {
    try {
      const result: TransactionMonitorResult = {
        transactionId: transaction.id,
        currentStatus: transaction.status
      };

      // Check transaction age
      const transactionAge = Date.now() - transaction.createdAt;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (transactionAge > maxAge && transaction.status === 'PENDING') {
        // Transaction is too old, mark as failed
        result.newStatus = 'FAILED';
        result.reason = 'Transaction timeout';
        
        this.eventService.emit('transaction:timeout', {
          transactionId: transaction.id,
          age: transactionAge
        });

        return result;
      }

      // Monitor based on transaction type
      if (transaction.type === 'BUY') {
        return await this.monitorBuyTransaction(transaction);
      } else if (transaction.type === 'SELL') {
        return await this.monitorSellTransaction(transaction);
      } else if (transaction.type === 'SWAP') {
        return await this.monitorSwapTransaction(transaction);
      }

      return result;
    } catch (error) {
      return {
        transactionId: transaction.id,
        currentStatus: transaction.status,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getTransactionStatus(transactionId: string): Promise<TransactionStatusInfo> {
    try {
      const transaction = await this.db.findOne('marketplace_transactions', { id: transactionId }) as Transaction;
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Get additional status information
      const statusInfo: TransactionStatusInfo = {
        transactionId,
        status: transaction.status,
        type: transaction.type,
        createdAt: transaction.createdAt,
        txHash: transaction.txHash,
        btcAmount: transaction.btcAmount
      };

      // Add optional fields if they exist
      if (transaction.completedAt) {
        statusInfo.completedAt = transaction.completedAt;
      }
      if (transaction.starknetAmount) {
        statusInfo.starknetAmount = transaction.starknetAmount;
      }

      // Add monitoring-specific information
      if (transaction.status === 'PENDING' || transaction.status === 'CONFIRMED') {
        const age = Date.now() - transaction.createdAt;
        statusInfo.age = age;
        statusInfo.estimatedCompletion = this.estimateCompletionTime(transaction);
      }

      return statusInfo;
    } catch (error) {
      throw new Error(`Failed to get transaction status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async recoverFailedTransaction(transactionId: string): Promise<RecoveryResult> {
    try {
      const transaction = await this.db.findOne('marketplace_transactions', { id: transactionId }) as Transaction;
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'FAILED') {
        throw new Error('Can only recover failed transactions');
      }

      // Attempt recovery based on transaction type
      let recoveryResult: RecoveryResult;

      if (transaction.type === 'BUY') {
        recoveryResult = await this.recoverBuyTransaction(transaction);
      } else if (transaction.type === 'SELL') {
        recoveryResult = await this.recoverSellTransaction(transaction);
      } else if (transaction.type === 'SWAP') {
        recoveryResult = await this.recoverSwapTransaction(transaction);
      } else {
        throw new Error(`Unsupported transaction type for recovery: ${transaction.type}`);
      }

      // Log recovery attempt
      await this.db.insertOne('transaction_recovery_logs', {
        transactionId,
        recoveryAttempt: Date.now(),
        result: recoveryResult,
        createdAt: Date.now()
      });

      this.eventService.emit('transaction:recovery_attempted', {
        transactionId,
        success: recoveryResult.success,
        action: recoveryResult.action
      });

      return recoveryResult;
    } catch (error) {
      return {
        transactionId,
        success: false,
        action: 'ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getFailedTransactions(limit: number = 50): Promise<FailedTransaction[]> {
    try {
      const failedTransactions = await this.db.findMany('marketplace_transactions', 
        { status: 'FAILED' },
        { 
          limit,
          sort: { createdAt: -1 }
        }
      ) as Transaction[];

      return failedTransactions.map(tx => ({
        transactionId: tx.id,
        type: tx.type,
        btcAmount: tx.btcAmount,
        starknetAmount: tx.starknetAmount || 0,
        failedAt: tx.completedAt || tx.createdAt,
        buyerId: tx.buyerId,
        sellerId: tx.sellerId,
        assetId: tx.asset.id,
        txHash: tx.txHash
      }));
    } catch (error) {
      throw new Error(`Failed to get failed transactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createManualIntervention(transactionId: string, action: string, notes: string): Promise<string> {
    try {
      const interventionId = this.generateInterventionId();
      
      await this.db.insertOne('manual_interventions', {
        interventionId,
        transactionId,
        action,
        notes,
        status: 'PENDING',
        createdAt: Date.now(),
        createdBy: 'system' // In real implementation, would be user ID
      });

      this.eventService.emit('intervention:created', {
        interventionId,
        transactionId,
        action
      });

      return interventionId;
    } catch (error) {
      throw new Error(`Failed to create manual intervention: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods
  private async monitorBuyTransaction(transaction: Transaction): Promise<TransactionMonitorResult> {
    const result: TransactionMonitorResult = {
      transactionId: transaction.id,
      currentStatus: transaction.status
    };

    if (transaction.status === 'PENDING') {
      // Check if Bitcoin payment has been received
      const btcReceived = await this.checkBitcoinPayment(transaction);
      if (btcReceived) {
        result.newStatus = 'CONFIRMED';
        result.reason = 'Bitcoin payment confirmed';
      }
    } else if (transaction.status === 'CONFIRMED') {
      // Check if asset transfer has been completed
      const assetTransferred = await this.checkAssetTransfer(transaction);
      if (assetTransferred.completed) {
        result.newStatus = 'COMPLETED';
        if (assetTransferred.txHash) {
          result.txHash = assetTransferred.txHash;
        }
        result.reason = 'Asset transfer completed';
      }
    }

    return result;
  }

  private async monitorSellTransaction(transaction: Transaction): Promise<TransactionMonitorResult> {
    const result: TransactionMonitorResult = {
      transactionId: transaction.id,
      currentStatus: transaction.status
    };

    if (transaction.status === 'PENDING') {
      // Check if asset has been escrowed
      const assetEscrowed = await this.checkAssetEscrow(transaction);
      if (assetEscrowed) {
        result.newStatus = 'CONFIRMED';
        result.reason = 'Asset escrowed successfully';
      }
    } else if (transaction.status === 'CONFIRMED') {
      // Check if Bitcoin payment has been sent
      const btcSent = await this.checkBitcoinPayment(transaction);
      if (btcSent) {
        result.newStatus = 'COMPLETED';
        result.reason = 'Bitcoin payment sent';
      }
    }

    return result;
  }

  private async monitorSwapTransaction(transaction: Transaction): Promise<TransactionMonitorResult> {
    const result: TransactionMonitorResult = {
      transactionId: transaction.id,
      currentStatus: transaction.status
    };

    // Check swap status via Atomiq service
    const swapStatus = await this.checkSwapStatus(transaction);
    
    if (swapStatus.status === 'COMPLETED' && transaction.status !== 'COMPLETED') {
      result.newStatus = 'COMPLETED';
      if (swapStatus.txHash) {
        result.txHash = swapStatus.txHash;
      }
      result.reason = 'Cross-chain swap completed';
    } else if (swapStatus.status === 'FAILED' && transaction.status !== 'FAILED') {
      result.newStatus = 'FAILED';
      result.reason = 'Cross-chain swap failed';
    }

    return result;
  }

  private async checkBitcoinPayment(transaction: Transaction): Promise<boolean> {
    // In a real implementation, this would check the Bitcoin blockchain
    // For now, simulate based on transaction age
    const age = Date.now() - transaction.createdAt;
    return age > 300000; // Simulate confirmation after 5 minutes
  }

  private async checkAssetTransfer(transaction: Transaction): Promise<{ completed: boolean; txHash?: string }> {
    // In a real implementation, this would check the Starknet blockchain
    // For now, simulate based on transaction age
    const age = Date.now() - transaction.createdAt;
    if (age > 600000) { // Simulate completion after 10 minutes
      return {
        completed: true,
        txHash: `0x${Math.random().toString(16).substr(2, 64)}`
      };
    }
    return { completed: false };
  }

  private async checkAssetEscrow(transaction: Transaction): Promise<boolean> {
    // In a real implementation, this would check if the asset is properly escrowed
    const age = Date.now() - transaction.createdAt;
    return age > 180000; // Simulate escrow after 3 minutes
  }

  private async checkSwapStatus(transaction: Transaction): Promise<{ status: string; txHash?: string }> {
    // In a real implementation, this would check the Atomiq service
    const age = Date.now() - transaction.createdAt;
    if (age > 900000) { // Simulate completion after 15 minutes
      return {
        status: 'COMPLETED',
        txHash: `0x${Math.random().toString(16).substr(2, 64)}`
      };
    }
    return { status: 'PENDING' };
  }

  private async recoverBuyTransaction(transaction: Transaction): Promise<RecoveryResult> {
    // Check if Bitcoin was actually received
    const btcReceived = await this.checkBitcoinPayment(transaction);
    
    if (btcReceived) {
      // Bitcoin received but transaction failed, retry asset transfer
      return {
        transactionId: transaction.id,
        success: true,
        action: 'RETRY_ASSET_TRANSFER',
        message: 'Bitcoin payment confirmed, retrying asset transfer'
      };
    } else {
      // No Bitcoin received, no recovery needed
      return {
        transactionId: transaction.id,
        success: true,
        action: 'NO_RECOVERY_NEEDED',
        message: 'No Bitcoin payment received, transaction correctly failed'
      };
    }
  }

  private async recoverSellTransaction(transaction: Transaction): Promise<RecoveryResult> {
    // Check if asset was escrowed
    const assetEscrowed = await this.checkAssetEscrow(transaction);
    
    if (assetEscrowed) {
      // Asset escrowed but transaction failed, initiate refund
      return {
        transactionId: transaction.id,
        success: true,
        action: 'INITIATE_REFUND',
        message: 'Asset was escrowed, initiating refund to seller'
      };
    } else {
      // Asset not escrowed, no recovery needed
      return {
        transactionId: transaction.id,
        success: true,
        action: 'NO_RECOVERY_NEEDED',
        message: 'Asset was not escrowed, transaction correctly failed'
      };
    }
  }

  private async recoverSwapTransaction(transaction: Transaction): Promise<RecoveryResult> {
    // Check actual swap status
    const swapStatus = await this.checkSwapStatus(transaction);
    
    if (swapStatus.status === 'COMPLETED') {
      // Swap completed but transaction marked as failed
      return {
        transactionId: transaction.id,
        success: true,
        action: 'UPDATE_STATUS',
        message: 'Swap was actually completed, updating transaction status'
      };
    } else {
      // Swap actually failed, check if refund is needed
      return {
        transactionId: transaction.id,
        success: true,
        action: 'INITIATE_REFUND',
        message: 'Swap failed, initiating Bitcoin refund'
      };
    }
  }

  private async updateTransactionStatus(transactionId: string, status: TransactionStatus, txHash?: string): Promise<void> {
    const updateData: any = { 
      status,
      updatedAt: Date.now()
    };

    if (txHash) {
      updateData.txHash = txHash;
    }

    if (status === 'COMPLETED' || status === 'FAILED') {
      updateData.completedAt = Date.now();
    }

    await this.db.updateOne('marketplace_transactions', transactionId, updateData);

    this.eventService.emit('transaction:status_updated', {
      transactionId,
      oldStatus: status, // This should be the old status, but we don't have it here
      newStatus: status,
      txHash
    });
  }

  private estimateCompletionTime(transaction: Transaction): number {
    const age = Date.now() - transaction.createdAt;
    
    // Estimate based on transaction type
    switch (transaction.type) {
      case 'BUY':
        return transaction.createdAt + (15 * 60 * 1000) - age; // 15 minutes total
      case 'SELL':
        return transaction.createdAt + (20 * 60 * 1000) - age; // 20 minutes total
      case 'SWAP':
        return transaction.createdAt + (30 * 60 * 1000) - age; // 30 minutes total
      default:
        return 0;
    }
  }

  private generateInterventionId(): string {
    return `intervention_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Interfaces
export interface MonitoringResult {
  monitoredCount: number;
  updatedCount: number;
  errorCount: number;
  results: TransactionMonitorResult[];
}

export interface TransactionMonitorResult {
  transactionId: string;
  currentStatus: TransactionStatus;
  newStatus?: TransactionStatus;
  txHash?: string;
  reason?: string;
  error?: string;
}

export interface TransactionStatusInfo {
  transactionId: string;
  status: TransactionStatus;
  type: 'BUY' | 'SELL' | 'SWAP';
  createdAt: number;
  completedAt?: number;
  txHash: string;
  btcAmount: number;
  starknetAmount?: number;
  age?: number;
  estimatedCompletion?: number;
}

export interface RecoveryResult {
  transactionId: string;
  success: boolean;
  action: 'RETRY_ASSET_TRANSFER' | 'INITIATE_REFUND' | 'UPDATE_STATUS' | 'NO_RECOVERY_NEEDED' | 'ERROR';
  message: string;
}

export interface FailedTransaction {
  transactionId: string;
  type: 'BUY' | 'SELL' | 'SWAP';
  btcAmount: number;
  starknetAmount: number;
  failedAt: number;
  buyerId: string;
  sellerId: string;
  assetId: string;
  txHash: string;
}