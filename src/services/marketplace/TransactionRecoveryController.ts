/**
 * Transaction Recovery Controller
 * Handles HTTP requests for transaction monitoring and recovery operations
 */

import { Request, Response } from 'express';
import { TransactionMonitoringService } from './TransactionMonitoringService';

export class TransactionRecoveryController {
    constructor(private monitoringService: TransactionMonitoringService) { }

    async getTransactionStatus(req: Request, res: Response): Promise<void> {
        try {
            const { transactionId } = req.params;

            if (!transactionId) {
                res.status(400).json({
                    success: false,
                    error: 'Transaction ID is required',
                    timestamp: Date.now()
                });
                return;
            }

            const statusInfo = await this.monitoringService.getTransactionStatus(transactionId);

            res.json({
                success: true,
                data: statusInfo,
                timestamp: Date.now()
            });
        } catch (error) {
            const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;

            res.status(statusCode).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get transaction status',
                timestamp: Date.now()
            });
        }
    }

    async monitorTransaction(req: Request, res: Response): Promise<void> {
        try {
            const { transactionId } = req.params;

            if (!transactionId) {
                res.status(400).json({
                    success: false,
                    error: 'Transaction ID is required',
                    timestamp: Date.now()
                });
                return;
            }

            // Get transaction from database (simplified for this example)
            const transaction = { id: transactionId } as any; // Would fetch from DB

            const monitorResult = await this.monitoringService.monitorTransaction(transaction);

            res.json({
                success: true,
                data: monitorResult,
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to monitor transaction',
                timestamp: Date.now()
            });
        }
    }

    async recoverTransaction(req: Request, res: Response): Promise<void> {
        try {
            const { transactionId } = req.params;

            if (!transactionId) {
                res.status(400).json({
                    success: false,
                    error: 'Transaction ID is required',
                    timestamp: Date.now()
                });
                return;
            }

            const recoveryResult = await this.monitoringService.recoverFailedTransaction(transactionId);

            const statusCode = recoveryResult.success ? 200 : 400;

            res.status(statusCode).json({
                success: recoveryResult.success,
                data: recoveryResult,
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to recover transaction',
                timestamp: Date.now()
            });
        }
    }

    async getFailedTransactions(req: Request, res: Response): Promise<void> {
        try {
            const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 50;

            if (limit < 1 || limit > 100) {
                res.status(400).json({
                    success: false,
                    error: 'Limit must be between 1 and 100',
                    timestamp: Date.now()
                });
                return;
            }

            const failedTransactions = await this.monitoringService.getFailedTransactions(limit);

            res.json({
                success: true,
                data: failedTransactions,
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get failed transactions',
                timestamp: Date.now()
            });
        }
    }

    async createManualIntervention(req: Request, res: Response): Promise<void> {
        try {
            const { transactionId, action, notes } = req.body;

            if (!transactionId || !action || !notes) {
                res.status(400).json({
                    success: false,
                    error: 'Transaction ID, action, and notes are required',
                    timestamp: Date.now()
                });
                return;
            }

            const interventionId = await this.monitoringService.createManualIntervention(
                transactionId,
                action,
                notes
            );

            res.status(201).json({
                success: true,
                data: { interventionId },
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create manual intervention',
                timestamp: Date.now()
            });
        }
    }

    async startMonitoring(_req: Request, res: Response): Promise<void> {
        try {
            await this.monitoringService.startMonitoring();

            res.json({
                success: true,
                data: { message: 'Transaction monitoring started' },
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to start monitoring',
                timestamp: Date.now()
            });
        }
    }

    async stopMonitoring(_req: Request, res: Response): Promise<void> {
        try {
            await this.monitoringService.stopMonitoring();

            res.json({
                success: true,
                data: { message: 'Transaction monitoring stopped' },
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to stop monitoring',
                timestamp: Date.now()
            });
        }
    }

    async getMonitoringStatus(_req: Request, res: Response): Promise<void> {
        try {
            // In a real implementation, this would check the monitoring service status
            const monitoringResult = await this.monitoringService.monitorPendingTransactions();

            res.json({
                success: true,
                data: {
                    isMonitoring: true, // Would check actual status
                    lastCheck: Date.now(),
                    ...monitoringResult
                },
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to get monitoring status',
                timestamp: Date.now()
            });
        }
    }
}