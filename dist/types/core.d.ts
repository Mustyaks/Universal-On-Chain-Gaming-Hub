export type Address = string;
export type Timestamp = number;
export type TokenId = string;
export interface Player {
    id: string;
    cartridgeId: string;
    walletAddress: Address;
    profile: UnifiedProfile;
    gameProfiles: GameProfile[];
    socialConnections: SocialConnection[];
}
export interface UnifiedProfile {
    playerId: string;
    cartridgeId: string;
    displayName: string;
    avatar: string;
    totalAchievements: number;
    crossGameAssets: CrossGameAsset[];
    socialSettings: SocialSettings;
    createdAt: Timestamp;
}
export interface GameProfile {
    gameId: string;
    playerId: string;
    gameSpecificData: Record<string, any>;
    lastActive: Timestamp;
}
export interface SocialSettings {
    profileVisibility: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE';
    showAchievements: boolean;
    showAssets: boolean;
    allowFriendRequests: boolean;
}
export interface SocialConnection {
    id: string;
    playerId: string;
    friendId: string;
    status: 'PENDING' | 'ACCEPTED' | 'BLOCKED';
    createdAt: Timestamp;
}
export interface GameAsset {
    id: string;
    gameId: string;
    tokenId: TokenId;
    contractAddress: Address;
    assetType: 'NFT' | 'CURRENCY' | 'ITEM';
    metadata: AssetMetadata;
    owner: Address;
    tradeable: boolean;
}
export interface AssetMetadata {
    name: string;
    description: string;
    image: string;
    attributes: AssetAttribute[];
    rarity?: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
}
export interface AssetAttribute {
    trait_type: string;
    value: string | number;
    display_type?: string;
}
export interface CrossGameAsset {
    gameId: string;
    assets: GameAsset[];
    totalValue: number;
}
export interface Achievement {
    id: string;
    gameId: string;
    playerId: string;
    achievementType: string;
    title: string;
    description: string;
    rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
    earnedAt: Timestamp;
    nftBadgeId?: string;
}
export interface GameStatistics {
    gameId: string;
    playerId: string;
    playtime: number;
    level: number;
    score: number;
    customStats: Record<string, number>;
}
export interface Transaction {
    id: string;
    type: 'BUY' | 'SELL' | 'SWAP';
    buyerId: string;
    sellerId: string;
    asset: GameAsset;
    btcAmount: number;
    starknetAmount?: number;
    status: TransactionStatus;
    txHash: string;
    createdAt: Timestamp;
    completedAt?: Timestamp;
}
export type TransactionStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export interface MarketplaceListing {
    listingId: string;
    sellerId: string;
    asset: GameAsset;
    priceInBTC: number;
    priceInStarknet?: number;
    status: ListingStatus;
    createdAt: Timestamp;
    expiresAt?: Timestamp;
}
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED';
export interface StandardizedGameData {
    playerId: string;
    gameId: string;
    assets: GameAsset[];
    achievements: Achievement[];
    statistics: GameStatistics;
    lastUpdated: Timestamp;
}
export interface PlayerGameData {
    playerId: string;
    gameId: string;
    rawData: any;
    normalizedData: StandardizedGameData;
    syncedAt: Timestamp;
}
export interface CommunityQuest {
    id: string;
    title: string;
    description: string;
    requirements: QuestRequirement[];
    rewards: QuestReward[];
    startDate: Timestamp;
    endDate: Timestamp;
    participants: string[];
    status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
}
export interface QuestRequirement {
    type: 'ACHIEVEMENT' | 'ASSET_OWNERSHIP' | 'GAME_ACTIVITY';
    gameId?: string;
    criteria: Record<string, any>;
}
export interface QuestReward {
    type: 'NFT' | 'CURRENCY' | 'BADGE';
    amount?: number;
    metadata?: AssetMetadata;
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: Timestamp;
}
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    hasNext: boolean;
}
export interface GameHubError {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: Timestamp;
}
export type ErrorCode = 'NETWORK_ERROR' | 'AUTH_ERROR' | 'DATA_INTEGRITY_ERROR' | 'BUSINESS_LOGIC_ERROR' | 'EXTERNAL_SERVICE_ERROR';
//# sourceMappingURL=core.d.ts.map