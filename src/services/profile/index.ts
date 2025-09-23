/**
 * Profile Service Module
 * Exports all profile-related services and components
 */

export { ProfileServiceImpl } from './ProfileService';
export { CartridgeAuthService, CartridgeSession, CartridgeAuthConfig } from './CartridgeAuthService';
export { ProfileAggregationService, ProfileStatistics, GameStats, RecentActivity } from './ProfileAggregationService';
export { CrossGameAggregator, AggregatedPlayerData, UnifiedDashboardData } from './CrossGameAggregator';
export { RealTimeUpdateManager, ProfileUpdate, UpdateFilter } from './RealTimeUpdateManager';
export { ProfileSecurityService, PrivacySettings, DataExportRequest, DataDeletionRequest } from './ProfileSecurityService';
export { ProfileController } from './ProfileController';
export { GDPRController } from './GDPRController';
export { createProfileRoutes } from './ProfileRoutes';
export { createGDPRRoutes } from './GDPRRoutes';

// Re-export types for convenience
export type {
  ProfileService,
  AuthService,
  AggregatedData
} from '@/types/services';

export type {
  UnifiedProfile,
  Player,
  SocialSettings,
  CrossGameAsset
} from '@/types/core';