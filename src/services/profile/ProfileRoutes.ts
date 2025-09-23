/**
 * Profile API Routes
 * Express router configuration for profile endpoints
 */

import { Router } from 'express';
import { ProfileController } from './ProfileController';

export function createProfileRoutes(profileController: ProfileController): Router {
  const router = Router();

  // Profile CRUD operations
  router.post('/', profileController.createProfile.bind(profileController));
  router.get('/search', profileController.searchProfiles.bind(profileController));
  router.get('/:playerId', profileController.getProfile.bind(profileController));
  router.put('/:playerId', profileController.updateProfile.bind(profileController));

  // Profile aggregation endpoints
  router.get('/:playerId/aggregated', profileController.getAggregatedData.bind(profileController));
  router.get('/:playerId/statistics', profileController.getProfileStatistics.bind(profileController));
  router.get('/:playerId/cross-game-assets', profileController.getCrossGameAssets.bind(profileController));

  // Social settings
  router.put('/:playerId/social-settings', profileController.updateSocialSettings.bind(profileController));

  return router;
}