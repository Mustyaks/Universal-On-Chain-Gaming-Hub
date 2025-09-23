/**
 * Social Routes
 * Defines API endpoints for social features
 */

import { Router } from 'express';
import { SocialController } from './SocialController';

export function createSocialRoutes(socialController: SocialController): Router {
  const router = Router();

  // Friend management routes
  router.post('/friends', (req, res) => socialController.addFriend(req as any, res));
  router.delete('/friends/:friendId', (req, res) => socialController.removeFriend(req as any, res));
  router.get('/friends', (req, res) => socialController.getFriends(req as any, res));

  // Friend request routes
  router.get('/friend-requests', (req, res) => socialController.getFriendRequests(req as any, res));
  router.post('/friend-requests/:requestId/accept', (req, res) => socialController.acceptFriendRequest(req as any, res));

  // Player search and discovery
  router.get('/players/search', (req, res) => socialController.searchPlayers(req, res));

  // Social interactions
  router.post('/block', (req, res) => socialController.blockPlayer(req as any, res));
  router.get('/stats', (req, res) => socialController.getSocialStats(req as any, res));

  // Community quest routes
  router.post('/quests', (req, res) => socialController.createCommunityQuest(req, res));
  router.post('/quests/:questId/join', (req, res) => socialController.joinQuest(req as any, res));
  router.get('/quests', (req, res) => socialController.getActiveQuests(req as any, res));

  return router;
}