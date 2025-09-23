/**
 * Swap Routes
 * Defines HTTP endpoints for cross-chain swap operations
 */

import { Router } from 'express';
import { SwapController } from './SwapController';

export function createSwapRoutes(controller: SwapController): Router {
  const router = Router();

  // Swap management endpoints
  router.post('/swaps/initiate', controller.initiateSwap.bind(controller));
  router.post('/swaps/:swapId/execute', controller.executeSwap.bind(controller));
  router.get('/swaps/:swapId/status', controller.getSwapStatus.bind(controller));
  router.delete('/swaps/:swapId', controller.cancelSwap.bind(controller));

  // Swap history endpoint
  router.get('/users/:userId/swaps', controller.getSwapHistory.bind(controller));

  return router;
}