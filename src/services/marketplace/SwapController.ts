/**
 * Swap Controller
 * Handles HTTP requests for cross-chain swap operations
 */

import { Request, Response } from 'express';
import { AtomiqService } from './AtomiqService';

export class SwapController {
  constructor(private atomiqService: AtomiqService) {}

  async initiateSwap(req: Request, res: Response): Promise<void> {
    try {
      const { btcAmount, targetAsset } = req.body;

      if (!btcAmount || !targetAsset) {
        res.status(400).json({
          success: false,
          error: 'BTC amount and target asset are required',
          timestamp: Date.now()
        });
        return;
      }

      if (btcAmount <= 0) {
        res.status(400).json({
          success: false,
          error: 'BTC amount must be greater than 0',
          timestamp: Date.now()
        });
        return;
      }

      const swapInitiation = await this.atomiqService.initializeSwap(btcAmount, targetAsset);

      res.status(201).json({
        success: true,
        data: swapInitiation,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate swap',
        timestamp: Date.now()
      });
    }
  }

  async executeSwap(req: Request, res: Response): Promise<void> {
    try {
      const { swapId } = req.params;

      if (!swapId) {
        res.status(400).json({
          success: false,
          error: 'Swap ID is required',
          timestamp: Date.now()
        });
        return;
      }

      const swapResult = await this.atomiqService.executeSwap(swapId);

      res.json({
        success: true,
        data: swapResult,
        timestamp: Date.now()
      });
    } catch (error) {
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute swap',
        timestamp: Date.now()
      });
    }
  }

  async getSwapStatus(req: Request, res: Response): Promise<void> {
    try {
      const { swapId } = req.params;

      if (!swapId) {
        res.status(400).json({
          success: false,
          error: 'Swap ID is required',
          timestamp: Date.now()
        });
        return;
      }

      const swapStatus = await this.atomiqService.getSwapStatus(swapId);

      res.json({
        success: true,
        data: swapStatus,
        timestamp: Date.now()
      });
    } catch (error) {
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get swap status',
        timestamp: Date.now()
      });
    }
  }

  async cancelSwap(req: Request, res: Response): Promise<void> {
    try {
      const { swapId } = req.params;

      if (!swapId) {
        res.status(400).json({
          success: false,
          error: 'Swap ID is required',
          timestamp: Date.now()
        });
        return;
      }

      await this.atomiqService.cancelSwap(swapId);

      res.json({
        success: true,
        data: { message: 'Swap cancelled successfully' },
        timestamp: Date.now()
      });
    } catch (error) {
      const statusCode = error instanceof Error && 
        (error.message.includes('not found') || error.message.includes('Can only cancel')) ? 400 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel swap',
        timestamp: Date.now()
      });
    }
  }

  async getSwapHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 20;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
          timestamp: Date.now()
        });
        return;
      }

      if (limit < 1 || limit > 100) {
        res.status(400).json({
          success: false,
          error: 'Limit must be between 1 and 100',
          timestamp: Date.now()
        });
        return;
      }

      const swapHistory = await this.atomiqService.getSwapHistory(userId, limit);

      res.json({
        success: true,
        data: swapHistory,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get swap history',
        timestamp: Date.now()
      });
    }
  }
}