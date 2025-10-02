export interface Friend {
  friendId: string;
  playerId: string;
  displayName: string;
  avatar: string;
  status: FriendStatus;
  lastSeen: string;
  mutualFriends: number;
  gamesInCommon: string[];
  addedAt: string;
}

export type FriendStatus = 'ONLINE' | 'OFFLINE' | 'IN_GAME' | 'AWAY';

export interface FriendRequest {
  requestId: string;
  fromPlayerId: string;
  fromPlayerName: string;
  fromPlayerAvatar: string;
  toPlayerId: string;
  message?: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

export interface PlayerProfile {
  playerId: string;
  displayName: string;
  avatar: string;
  bio?: string;
  location?: string;
  joinedAt: string;
  totalAchievements: number;
  favoriteGames: string[];
  socialSettings: SocialSettings;
  stats: PlayerStats;
}

export interface PlayerStats {
  totalPlayTime: number;
  gamesPlayed: number;
  achievementsEarned: number;
  friendsCount: number;
  questsCompleted: number;
}

export interface SocialSettings {
  profileVisibility: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  showAchievements: boolean;
  showAssets: boolean;
  showOnlineStatus: boolean;
  allowFriendRequests: boolean;
  allowMessages: boolean;
}

export interface CommunityQuest {
  questId: string;
  title: string;
  description: string;
  gameId: string;
  gameName: string;
  type: 'INDIVIDUAL' | 'TEAM' | 'COMMUNITY';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'LEGENDARY';
  requirements: QuestRequirement[];
  rewards: QuestReward[];
  participants: number;
  maxParticipants?: number;
  progress: number;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
  startDate: string;
  endDate?: string;
  createdBy: string;
}

export interface QuestRequirement {
  type: string;
  description: string;
  target: number;
  current: number;
}

export interface QuestReward {
  type: 'ACHIEVEMENT' | 'NFT' | 'CURRENCY' | 'ITEM';
  name: string;
  description: string;
  value?: number;
  rarity?: string;
}

export interface QuestParticipation {
  questId: string;
  playerId: string;
  joinedAt: string;
  progress: QuestRequirement[];
  completed: boolean;
  completedAt?: string;
}

export interface PlayerDiscovery {
  playerId: string;
  displayName: string;
  avatar: string;
  mutualFriends: number;
  gamesInCommon: string[];
  recentAchievements: number;
  matchScore: number;
  reason: string;
}