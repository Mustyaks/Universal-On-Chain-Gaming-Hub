import { Player, UnifiedProfile, GameAsset, Achievement, Transaction, MarketplaceListing, StandardizedGameData, PlayerGameData, CommunityQuest, PaginatedResponse, Address, Timestamp } from './core';
export interface GameAdapter {
    gameId: string;
    gameName: string;
    normalize(rawData: any): StandardizedGameData;
    fetchPlayerData(playerId: string): Promise<PlayerGameData>;
    subscribeToUpdates(callback: (data: PlayerGameData) => void): void;
    validateAsset(asset: GameAsset): Promise<boolean>;
}
export interface AggregationService {
    registerGame(adapter: GameAdapter): Promise<void>;
    syncPlayerData(playerId: string, gameId?: string): Promise<StandardizedGameData[]>;
    getPlayerGameData(playerId: string, gameId: string): Promise<PlayerGameData>;
    subscribeToPlayerUpdates(playerId: string, callback: (data: StandardizedGameData) => void): void;
}
export interface ProfileService {
    createProfile(cartridgeId: string): Promise<UnifiedProfile>;
    getProfile(playerId: string): Promise<UnifiedProfile>;
    updateProfile(playerId: string, updates: Partial<UnifiedProfile>): Promise<void>;
    aggregateGameData(playerId: string): Promise<AggregatedData>;
    searchProfiles(query: string, limit?: number): Promise<UnifiedProfile[]>;
}
export interface AggregatedData {
    totalAchievements: number;
    totalAssets: number;
    crossGameAssets: GameAsset[];
    recentAchievements: Achievement[];
    gameStatistics: Record<string, any>;
}
export interface MarketplaceService {
    createListing(asset: GameAsset, priceInBTC: number): Promise<string>;
    getListing(listingId: string): Promise<MarketplaceListing>;
    getListings(filters?: ListingFilters): Promise<PaginatedResponse<MarketplaceListing>>;
    purchaseWithBTC(listingId: string, buyerWallet: string): Promise<Transaction>;
    executeSwap(btcAmount: number, targetAsset: string): Promise<SwapResult>;
    cancelListing(listingId: string, sellerId: string): Promise<void>;
}
export interface ListingFilters {
    gameId?: string;
    assetType?: 'NFT' | 'CURRENCY' | 'ITEM';
    minPrice?: number;
    maxPrice?: number;
    rarity?: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
    page?: number;
    limit?: number;
}
export interface SwapResult {
    swapId: string;
    btcAmount: number;
    starknetAmount: number;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    txHash?: string;
}
export interface SocialService {
    addFriend(playerId: string, friendId: string): Promise<void>;
    removeFriend(playerId: string, friendId: string): Promise<void>;
    getFriends(playerId: string): Promise<UnifiedProfile[]>;
    getFriendRequests(playerId: string): Promise<FriendRequest[]>;
    searchPlayers(query: string, limit?: number): Promise<UnifiedProfile[]>;
    createCommunityQuest(quest: Omit<CommunityQuest, 'id' | 'participants'>): Promise<string>;
    joinQuest(questId: string, playerId: string): Promise<void>;
    getActiveQuests(playerId?: string): Promise<CommunityQuest[]>;
}
export interface FriendRequest {
    id: string;
    fromPlayerId: string;
    toPlayerId: string;
    message?: string;
    createdAt: Timestamp;
    status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
}
export interface AuthService {
    authenticateWithCartridge(cartridgeId: string): Promise<AuthResult>;
    validateSession(sessionToken: string): Promise<Player>;
    refreshToken(refreshToken: string): Promise<AuthResult>;
    logout(sessionToken: string): Promise<void>;
}
export interface AuthResult {
    player: Player;
    sessionToken: string;
    refreshToken: string;
    expiresAt: Timestamp;
}
export interface XverseWalletService {
    connectWallet(): Promise<WalletConnection>;
    signTransaction(transaction: any): Promise<string>;
    getBalance(address: Address): Promise<number>;
}
export interface WalletConnection {
    address: Address;
    publicKey: string;
    connected: boolean;
}
export interface AtomiqService {
    initializeSwap(btcAmount: number, targetAsset: string): Promise<SwapInitiation>;
    executeSwap(swapId: string): Promise<SwapResult>;
    getSwapStatus(swapId: string): Promise<SwapResult>;
}
export interface SwapInitiation {
    swapId: string;
    btcAddress: string;
    expectedAmount: number;
    expiresAt: Timestamp;
}
export interface NotificationService {
    sendNotification(playerId: string, notification: Notification): Promise<void>;
    getNotifications(playerId: string, unreadOnly?: boolean): Promise<Notification[]>;
    markAsRead(notificationId: string): Promise<void>;
}
export interface Notification {
    id: string;
    playerId: string;
    type: 'ACHIEVEMENT' | 'FRIEND_REQUEST' | 'TRANSACTION' | 'QUEST' | 'SYSTEM';
    title: string;
    message: string;
    data?: Record<string, any>;
    read: boolean;
    createdAt: Timestamp;
}
export interface CacheService {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    delete(key: string): Promise<void>;
    invalidatePattern(pattern: string): Promise<void>;
}
export interface DatabaseService {
    findOne<T>(collection: string, query: Record<string, any>): Promise<T | null>;
    findMany<T>(collection: string, query: Record<string, any>, options?: QueryOptions): Promise<T[]>;
    insertOne<T>(collection: string, document: T): Promise<string>;
    updateOne(collection: string, id: string, updates: Record<string, any>): Promise<void>;
    deleteOne(collection: string, id: string): Promise<void>;
}
export interface QueryOptions {
    limit?: number;
    offset?: number;
    sort?: Record<string, 1 | -1>;
}
export interface EventService {
    emit(event: string, data: any): void;
    on(event: string, handler: (data: any) => void): void;
    off(event: string, handler: (data: any) => void): void;
}
export interface HealthCheckService {
    checkHealth(): Promise<HealthStatus>;
    checkDependencies(): Promise<DependencyStatus[]>;
}
export interface HealthStatus {
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    timestamp: Timestamp;
    uptime: number;
    dependencies: DependencyStatus[];
}
export interface DependencyStatus {
    name: string;
    status: 'HEALTHY' | 'UNHEALTHY';
    responseTime?: number;
    error?: string;
}
//# sourceMappingURL=services.d.ts.map