/**
 * Quest Routes
 * Defines API endpoints for quest management
 */

import { Router } from 'express';
import { QuestController } from './QuestController';

export function createQuestRoutes(questController: QuestController): Router {
  const router = Router();

  // Quest management routes
  router.post('/quests', questController.createQuest.bind(questController));
  router.get('/quests', questController.getActiveQuests.bind(questController));
  router.get('/quests/stats', questController.getQuestStats.bind(questController));
  router.get('/quests/discovery', questController.getQuestDiscovery.bind(questController));
  
  // Quest participation routes
  router.post('/quests/:questId/join', questController.joinQuest.bind(questController));
  router.put('/quests/:questId/progress', questController.updateProgress.bind(questController));
  router.get('/quests/participation', questController.getPlayerParticipation.bind(questController));
  
  // Quest leaderboard and completion
  router.get('/quests/:questId/leaderboard', questController.getQuestLeaderboard.bind(questController));
  router.post('/quests/:questId/complete', questController.completeQuest.bind(questController));

  return router;
}