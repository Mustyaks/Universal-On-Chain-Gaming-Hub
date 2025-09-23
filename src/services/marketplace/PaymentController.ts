/**
 * Payment Controller
 * Handles HTTP requests for Bitcoin payment operations
 */

import { Request, Response } from 'express';
import { BitcoinPaymentProcessor } from './BitcoinPaymentProcessor';
import { XverseWalletService } from './XverseWalletService';

export class PaymentController {
  constructor(
    private paymentProcessor: BitcoinPaymentProcessor,
    private xverseService: XverseWalletService
  ) {}

  async connectWallet(req: Request, res: Response): Promise<void> {
    try {
      const connection = await this.xverseService.connectWallet();

      res.json({
        success: true,
        data: connection,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect wallet',
        timestamp: Date.now()
      });
    }
  }

  async getWalletBalance(req: Request, res: Response): Promise<void> {
    try {
      const { address } = req.params;

      if (!address) {
        res.status(400).json({
          success: false,
          error: 'Wallet address is required',
          timestamp: Date.now()
        });
        return;
      }

      const balance = await this.xverseService.getBalance(address);

      res.json({
        success: true,
        data: { address, balance },
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get balance',
        timestamp: Date.now()
      });
    }
  }

  async initiatePayment(req: Request, res: Response): Promise<void> {
    try {
      const { transactionId } = req.body;

      if (!transactionId) {
        res.status(400).json({
          success: false,
          error: 'Transaction ID is required',
          timestamp: Date.now()
        });
        return;
      }

      // This would typically get the transaction from the database
      // For now, we'll expect it to be passed in the request
      const { transaction } = req.body;

      if (!transaction) {
        res.status(400).json({
          success: false,
          error: 'Transaction data is required',
          timestamp: Date.now()
        });
        return;
      }

      const paymentRequest = await this.paymentProcessor.initiatePayment(transaction);

      res.status(201).json({
        success: true,
        data: paymentRequest,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate payment',
        timestamp: Date.now()
      });
    }
  }

  async processPayment(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;

      if (!paymentId) {
        res.status(400).json({
          success: false,
          error: 'Payment ID is required',
          timestamp: Date.now()
        });
        return;
      }

      const result = await this.paymentProcessor.processPayment(paymentId);

      const statusCode = result.success ? 200 : 400;

      res.status(statusCode).json({
        success: result.success,
        data: result,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process payment',
        timestamp: Date.now()
      });
    }
  }

  async getPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;

      if (!paymentId) {
        res.status(400).json({
          success: false,
          error: 'Payment ID is required',
          timestamp: Date.now()
        });
        return;
      }

      const status = await this.paymentProcessor.trackPaymentStatus(paymentId);

      res.json({
        success: true,
        data: status,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get payment status',
        timestamp: Date.now()
      });
    }
  }

  async refundPayment(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      const { reason } = req.body;

      if (!paymentId) {
        res.status(400).json({
          success: false,
          error: 'Payment ID is required',
          timestamp: Date.now()
        });
        return;
      }

      if (!reason) {
        res.status(400).json({
          success: false,
          error: 'Refund reason is required',
          timestamp: Date.now()
        });
        return;
      }

      const result = await this.paymentProcessor.refundPayment(paymentId, reason);

      const statusCode = result.success ? 200 : 400;

      res.status(statusCode).json({
        success: result.success,
        data: result,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process refund',
        timestamp: Date.now()
      });
    }
  }

  async sendBitcoin(req: Request, res: Response): Promise<void> {
    try {
      const { toAddress, amount } = req.body;

      if (!toAddress || !amount) {
        res.status(400).json({
          success: false,
          error: 'Recipient address and amount are required',
          timestamp: Date.now()
        });
        return;
      }

      if (amount <= 0) {
        res.status(400).json({
          success: false,
          error: 'Amount must be greater than 0',
          timestamp: Date.now()
        });
        return;
      }

      const result = await this.xverseService.sendBitcoin(toAddress, amount);

      res.status(201).json({
        success: true,
        data: result,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send Bitcoin',
        timestamp: Date.now()
      });
    }
  }

  async getWalletConnection(req: Request, res: Response): Promise<void> {
    try {
      const connection = this.xverseService.getCurrentConnection();

      if (!connection) {
        res.status(404).json({
          success: false,
          error: 'No wallet connection found',
          timestamp: Date.now()
        });
        return;
      }

      res.json({
        success: true,
        data: connection,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get wallet connection',
        timestamp: Date.now()
      });
    }
  }

  async disconnectWallet(req: Request, res: Response): Promise<void> {
    try {
      this.xverseService.disconnect();

      res.json({
        success: true,
        data: { message: 'Wallet disconnected successfully' },
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disconnect wallet',
        timestamp: Date.now()
      });
    }
  }
}