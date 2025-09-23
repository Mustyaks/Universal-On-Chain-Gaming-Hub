/**
 * Payment Routes
 * Defines HTTP endpoints for Bitcoin payment operations
 */

import { Router } from 'express';
import { PaymentController } from './PaymentController';

export function createPaymentRoutes(controller: PaymentController): Router {
  const router = Router();

  // Wallet connection endpoints
  router.post('/wallet/connect', controller.connectWallet.bind(controller));
  router.get('/wallet/connection', controller.getWalletConnection.bind(controller));
  router.post('/wallet/disconnect', controller.disconnectWallet.bind(controller));
  router.get('/wallet/balance/:address', controller.getWalletBalance.bind(controller));

  // Bitcoin transaction endpoints
  router.post('/bitcoin/send', controller.sendBitcoin.bind(controller));

  // Payment processing endpoints
  router.post('/payments/initiate', controller.initiatePayment.bind(controller));
  router.post('/payments/:paymentId/process', controller.processPayment.bind(controller));
  router.get('/payments/:paymentId/status', controller.getPaymentStatus.bind(controller));
  router.post('/payments/:paymentId/refund', controller.refundPayment.bind(controller));

  return router;
}