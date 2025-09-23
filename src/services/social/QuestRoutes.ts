/**
 * Quest Routes
 * Defines API endpoints for quest management
 */

import { Router } from 'express';
import { QuestController } from './QuestController';

export function createQuestRoutes(questController: QuestController): Router {
  const router = Router();

  // Quest management routes
  router.post('/quests', (req, res) => questController.createQuest(req as any, res));
  router.get('/quests', (req, res) => questController.getActiveQuests(req as any, res));
  router.get('/quests/stats', (req, res) => questController.getQuestStats(req, res));
  router.get('/quests/discovery', (req, res) => questController.getQuestDiscovery(req as any, res));
  
  // Quest participation routes
  router.post('/quests/:questId/join', (req, res) => questController.joinQuest(req as any, res));
  router.put('/quests/:questId/progress', (req, res) => questController.updateProgress(req as any, res));
  router.get('/quests/participation', (req, res) => questController.getPlayerParticipation(req as any, res));
  
  // Quest leaderboard and completion
  router.get('/quests/:questId/leaderboard', (req, res) => questController.getQuestLeaderboard(req, res));
  router.post('/quests/:questId/complete', (req, res) => questController.completeQuest(req, res));

  return router;
}