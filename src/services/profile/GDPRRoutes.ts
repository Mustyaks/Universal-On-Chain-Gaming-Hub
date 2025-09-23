/**
 * GDPR Compliance Routes
 * Express router configuration for GDPR-related endpoints
 */

import { Router } from 'express';
import { GDPRController } from './GDPRController';

export function createGDPRRoutes(gdprController: GDPRController): Router {
  const router = Router();

  // Privacy settings
  router.get('/privacy-settings', gdprController.getPrivacySettings.bind(gdprController));
  router.put('/privacy-settings', gdprController.updatePrivacySettings.bind(gdprController));

  // Data export
  router.post('/export-request', gdprController.requestDataExport.bind(gdprController));
  router.get('/export-request/:requestId', gdprController.getDataExportStatus.bind(gdprController));

  // Data deletion
  router.post('/deletion-request', gdprController.requestDataDeletion.bind(gdprController));
  router.delete('/deletion-request/:requestId', gdprController.cancelDataDeletion.bind(gdprController));
  router.get('/deletion-request/:requestId', gdprController.getDataDeletionStatus.bind(gdprController));

  // Consent management
  router.put('/consent', gdprController.updateConsent.bind(gdprController));

  // Information endpoints
  router.get('/data-processing-info', gdprController.getDataProcessingInfo.bind(gdprController));
  router.get('/breach-notifications', gdprController.getBreachNotifications.bind(gdprController));

  return router;
}