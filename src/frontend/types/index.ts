export interface UnifiedProfile {
  playerId: string;
  cartridgeId: string;
  displayName: string;
  avatar: string;
  totalAchievements: number;
  crossGameAssets: CrossGameAsset[];
  socialSettings: SocialSettings;
  createdAt: string;
}

export interface CrossGameAsset {
  id: string;
  gameId: string;
  gameName: string;
  tokenId: string;
  contractAddress: string;
  assetType: 'NFT' | 'CURRENCY' | 'ITEM';
  metadata: AssetMetadata;
  owner: string;
  tradeable: boolean;
  estimatedValue?: number;
}

export interface AssetMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export interface Achievement {
  id: string;
  gameId: string;
  gameName: string;
  playerId: string;
  achievementType: string;
  title: string;
  description: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  earnedAt: string;
  nftBadgeId?: string;
  icon?: string;
}

export interface GameStatistics {
  gameId: string;
  gameName: string;
  hoursPlayed: number;
  level: number;
  experience: number;
  rank?: string;
  lastPlayed: string;
}

export interface SocialSettings {
  profileVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  showAchievements: boolean;
  showAssets: boolean;
  allowFriendRequests: boolean;
}

export interface DashboardData {
  profile: UnifiedProfile;
  recentAchievements: Achievement[];
  gameStatistics: GameStatistics[];
  assetSummary: {
    totalValue: number;
    totalAssets: number;
    byGame: Array<{
      gameId: string;
      gameName: string;
      assetCount: number;
      totalValue: number;
    }>;
  };
  progressData: Array<{
    gameId: string;
    gameName: string;
    progress: number;
    nextMilestone: string;
  }>;
}