/**
 * Transaction Recovery Routes
 * Defines HTTP endpoints for transaction monitoring and recovery operations
 */

import { Router } from 'express';
import { TransactionRecoveryController } from './TransactionRecoveryController';

export function createTransactionRecoveryRoutes(controller: TransactionRecoveryController): Router {
  const router = Router();

  // Transaction monitoring endpoints
  router.get('/transactions/:transactionId/status', controller.getTransactionStatus.bind(controller));
  router.post('/transactions/:transactionId/monitor', controller.monitorTransaction.bind(controller));
  router.post('/transactions/:transactionId/recover', controller.recoverTransaction.bind(controller));

  // Failed transactions management
  router.get('/transactions/failed', controller.getFailedTransactions.bind(controller));

  // Manual intervention endpoints
  router.post('/interventions', controller.createManualIntervention.bind(controller));

  // Monitoring control endpoints
  router.post('/monitoring/start', controller.startMonitoring.bind(controller));
  router.post('/monitoring/stop', controller.stopMonitoring.bind(controller));
  router.get('/monitoring/status', controller.getMonitoringStatus.bind(controller));

  return router;
}