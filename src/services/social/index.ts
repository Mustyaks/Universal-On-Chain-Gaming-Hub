/**
 * Social Service Module
 * Exports all social-related services and types
 */

export { SocialService } from './SocialService';
export { SocialController } from './SocialController';
export { createSocialRoutes } from './SocialRoutes';
export { NotificationService } from './NotificationService';
export { QuestService } from './QuestService';
export { QuestController } from './QuestController';
export { createQuestRoutes } from './QuestRoutes';

// Re-export relevant types
export type {
  SocialService as ISocialService,
  FriendRequest,
  NotificationService as INotificationService,
  Notification
} from '../../types/services';

export type {
  SocialConnection,
  SocialSettings,
  CommunityQuest,
  QuestRequirement,
  QuestReward
} from '../../types/core';

export type {
  QuestCreationData,
  QuestParticipation,
  QuestProgress,
  QuestStats
} from './QuestService';