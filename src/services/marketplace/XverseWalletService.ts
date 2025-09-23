/**
 * Xverse Wallet Service
 * Handles Bitcoin wallet connection and payment processing through Xverse
 */

import { XverseWalletService as IXverseWalletService, WalletConnection } from '../../types/services';
import { Address } from '../../types/core';

// Declare window interface for Xverse
declare global {
  interface Window {
    XverseProviders?: {
      BitcoinProvider?: any;
    };
  }
}

export class XverseWalletService implements IXverseWalletService {
  private isConnected: boolean = false;
  private currentConnection: WalletConnection | null = null;

  async connectWallet(): Promise<WalletConnection> {
    try {
      // Check if Xverse is available in the browser
      if (!this.isXverseAvailable()) {
        throw new Error('Xverse wallet is not installed. Please install Xverse browser extension.');
      }

      // Request wallet connection
      const xverse = this.getXverseProvider();
      if (!xverse) {
        throw new Error('Xverse Bitcoin provider not found');
      }

      // Request account access
      const response = await xverse.request('getAccounts', null);
      
      if (!response || !response.result || response.result.length === 0) {
        throw new Error('No Bitcoin accounts found in Xverse wallet');
      }

      const account = response.result[0];
      
      this.currentConnection = {
        address: account.address,
        publicKey: account.publicKey,
        connected: true
      };

      this.isConnected = true;

      return this.currentConnection;
    } catch (error) {
      this.isConnected = false;
      this.currentConnection = null;
      throw new Error(`Failed to connect to Xverse wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async signTransaction(transaction: BitcoinTransaction): Promise<string> {
    if (!this.isConnected || !this.currentConnection) {
      throw new Error('Wallet not connected. Please connect your Xverse wallet first.');
    }

    try {
      const xverse = this.getXverseProvider();
      if (!xverse) {
        throw new Error('Xverse Bitcoin provider not found');
      }

      // Sign the transaction
      const signResponse = await xverse.request('signTransaction', {
        hex: transaction.hex,
        broadcast: false // We'll handle broadcasting separately
      });

      if (!signResponse || !signResponse.result) {
        throw new Error('Transaction signing failed');
      }

      return signResponse.result.hex;
    } catch (error) {
      throw new Error(`Failed to sign transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getBalance(_address: Address): Promise<number> {
    try {
      if (!this.isXverseAvailable()) {
        throw new Error('Xverse wallet is not available');
      }

      const xverse = this.getXverseProvider();
      if (!xverse) {
        throw new Error('Xverse Bitcoin provider not found');
      }

      // Get balance for the address
      const balanceResponse = await xverse.request('getBalance', null);
      
      if (!balanceResponse || balanceResponse.result === undefined) {
        throw new Error('Failed to retrieve balance');
      }

      // Convert from satoshis to BTC
      return balanceResponse.result.confirmed / 100000000;
    } catch (error) {
      throw new Error(`Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sendBitcoin(toAddress: Address, amount: number): Promise<BitcoinTransactionResult> {
    if (!this.isConnected || !this.currentConnection) {
      throw new Error('Wallet not connected. Please connect your Xverse wallet first.');
    }

    try {
      const xverse = this.getXverseProvider();
      if (!xverse) {
        throw new Error('Xverse Bitcoin provider not found');
      }

      // Convert BTC to satoshis
      const amountInSatoshis = Math.floor(amount * 100000000);

      // Create and send transaction
      const sendResponse = await xverse.request('sendTransfer', {
        recipients: [
          {
            address: toAddress,
            amount: amountInSatoshis
          }
        ]
      });

      if (!sendResponse || !sendResponse.result) {
        throw new Error('Transaction failed');
      }

      return {
        txid: sendResponse.result.txid,
        amount: amount,
        toAddress: toAddress,
        fromAddress: this.currentConnection.address,
        status: 'PENDING'
      };
    } catch (error) {
      throw new Error(`Failed to send Bitcoin: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createPaymentRequest(amount: number, description?: string): Promise<PaymentRequest> {
    if (!this.isConnected || !this.currentConnection) {
      throw new Error('Wallet not connected. Please connect your Xverse wallet first.');
    }

    // Generate a unique payment ID
    const paymentId = this.generatePaymentId();

    return {
      paymentId,
      amount,
      description: description || 'Gaming Hub Marketplace Payment',
      recipientAddress: this.currentConnection.address,
      expiresAt: Date.now() + (30 * 60 * 1000), // 30 minutes
      status: 'PENDING'
    };
  }

  async verifyPayment(paymentId: string, expectedAmount: number): Promise<PaymentVerification> {
    try {
      // In a real implementation, this would check the Bitcoin blockchain
      // for transactions to the payment address with the expected amount
      
      // For now, return a placeholder verification
      return {
        paymentId,
        verified: true,
        txid: `mock_tx_${paymentId}`,
        amount: expectedAmount,
        confirmations: 1,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        paymentId,
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  getCurrentConnection(): WalletConnection | null {
    return this.currentConnection;
  }

  disconnect(): void {
    this.isConnected = false;
    this.currentConnection = null;
  }

  private isXverseAvailable(): boolean {
    return typeof globalThis !== 'undefined' && 
           typeof (globalThis as any).window !== 'undefined' &&
           !!(globalThis as any).window.XverseProviders?.BitcoinProvider;
  }

  private getXverseProvider(): any {
    if (typeof globalThis === 'undefined' || typeof (globalThis as any).window === 'undefined') {
      return null;
    }
    return (globalThis as any).window.XverseProviders?.BitcoinProvider;
  }

  private generatePaymentId(): string {
    return `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Additional interfaces for Bitcoin operations
export interface BitcoinTransaction {
  hex: string;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
}

export interface TransactionInput {
  txid: string;
  vout: number;
  scriptSig: string;
}

export interface TransactionOutput {
  address: string;
  amount: number; // in satoshis
}

export interface BitcoinTransactionResult {
  txid: string;
  amount: number; // in BTC
  toAddress: Address;
  fromAddress: Address;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
}

export interface PaymentRequest {
  paymentId: string;
  amount: number; // in BTC
  description: string;
  recipientAddress: Address;
  expiresAt: number;
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'FAILED';
}

export interface PaymentVerification {
  paymentId: string;
  verified: boolean;
  txid?: string;
  amount?: number;
  confirmations?: number;
  timestamp: number;
  error?: string;
}