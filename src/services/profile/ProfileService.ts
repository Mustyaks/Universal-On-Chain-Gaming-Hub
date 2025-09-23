/**
 * Profile Service Implementation
 * Handles unified player profiles with Cartridge Controller integration
 */

import {
  ProfileService,
  AggregatedData,
  DatabaseService,
  CacheService,
  EventService
} from '@/types/services';
import {
  UnifiedProfile,
  GameAsset,
  Achievement,
  SocialSettings,
  CrossGameAsset,
  Timestamp
} from '@/types/core';

export class ProfileServiceImpl implements ProfileService {
  constructor(
    private database: DatabaseService,
    private cache: CacheService,
    private eventService: EventService
  ) {}

  /**
   * Create a new unified profile for a player
   */
  async createProfile(cartridgeId: string): Promise<UnifiedProfile> {
    // Check if profile already exists
    const existingProfile = await this.database.findOne<UnifiedProfile>(
      'profiles',
      { cartridgeId }
    );

    if (existingProfile) {
      throw new Error(`Profile already exists for Cartridge ID: ${cartridgeId}`);
    }

    // Generate unique player ID
    const playerId = this.generatePlayerId();
    const now = Date.now();

    // Create default profile
    const profile: UnifiedProfile = {
      playerId,
      cartridgeId,
      displayName: `Player_${playerId.slice(-8)}`,
      avatar: this.getDefaultAvatar(),
      totalAchievements: 0,
      crossGameAssets: [],
      socialSettings: this.getDefaultSocialSettings(),
      createdAt: now
    };

    // Save to database
    await this.database.insertOne('profiles', profile);

    // Cache the profile
    await this.cache.set(`profile:${playerId}`, profile, 3600); // 1 hour TTL

    // Emit profile created event
    this.eventService.emit('profile:created', { playerId, cartridgeId });

    return profile;
  }

  /**
   * Get unified profile by player ID
   */
  async getProfile(playerId: string): Promise<UnifiedProfile> {
    // Try cache first
    const cachedProfile = await this.cache.get<UnifiedProfile>(`profile:${playerId}`);
    if (cachedProfile) {
      return cachedProfile;
    }

    // Fetch from database
    const profile = await this.database.findOne<UnifiedProfile>(
      'profiles',
      { playerId }
    );

    if (!profile) {
      throw new Error(`Profile not found for player ID: ${playerId}`);
    }

    // Cache the result
    await this.cache.set(`profile:${playerId}`, profile, 3600);

    return profile;
  }

  /**
   * Update unified profile
   */
  async updateProfile(playerId: string, updates: Partial<UnifiedProfile>): Promise<void> {
    // Validate the profile exists
    await this.getProfile(playerId);

    // Validate updates
    this.validateProfileUpdates(updates);

    // Prepare update data (exclude immutable fields)
    const allowedUpdates = this.filterAllowedUpdates(updates);

    // Update in database
    await this.database.updateOne('profiles', playerId, allowedUpdates);

    // Invalidate cache
    await this.cache.delete(`profile:${playerId}`);

    // Emit profile updated event
    this.eventService.emit('profile:updated', { playerId, updates: allowedUpdates });
  }

  /**
   * Aggregate game data for a player's profile
   */
  async aggregateGameData(playerId: string): Promise<AggregatedData> {
    // Try cache first
    const cacheKey = `aggregated:${playerId}`;
    const cached = await this.cache.get<AggregatedData>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch all game data for the player
    const [assets, achievements] = await Promise.all([
      this.database.findMany<GameAsset>('game_assets', { owner: playerId }),
      this.database.findMany<Achievement>('achievements', { playerId })
    ]);

    // Group assets by game
    const crossGameAssets = this.groupAssetsByGame(assets);

    // Get recent achievements (last 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentAchievements = achievements
      .filter(achievement => achievement.earnedAt > thirtyDaysAgo)
      .sort((a, b) => b.earnedAt - a.earnedAt)
      .slice(0, 10);

    // Calculate game statistics
    const gameStatistics = this.calculateGameStatistics(assets, achievements);

    const aggregatedData: AggregatedData = {
      totalAchievements: achievements.length,
      totalAssets: assets.length,
      crossGameAssets,
      recentAchievements,
      gameStatistics
    };

    // Cache for 15 minutes
    await this.cache.set(cacheKey, aggregatedData, 900);

    return aggregatedData;
  }

  /**
   * Search profiles by display name or player ID
   */
  async searchProfiles(query: string, limit: number = 20): Promise<UnifiedProfile[]> {
    const searchQuery = {
      $or: [
        { displayName: { $regex: query, $options: 'i' } },
        { playerId: { $regex: query, $options: 'i' } }
      ]
    };

    const profiles = await this.database.findMany<UnifiedProfile>(
      'profiles',
      searchQuery,
      { limit, sort: { createdAt: -1 } }
    );

    // Filter out private profiles
    return profiles.filter(profile => 
      profile.socialSettings.profileVisibility === 'PUBLIC'
    );
  }

  /**
   * Generate unique player ID
   */
  private generatePlayerId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default avatar URL
   */
  private getDefaultAvatar(): string {
    const avatarId = Math.floor(Math.random() * 10) + 1;
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarId}`;
  }

  /**
   * Get default social settings
   */
  private getDefaultSocialSettings(): SocialSettings {
    return {
      profileVisibility: 'PUBLIC',
      showAchievements: true,
      showAssets: true,
      allowFriendRequests: true
    };
  }

  /**
   * Validate profile updates
   */
  private validateProfileUpdates(updates: Partial<UnifiedProfile>): void {
    if (updates.displayName && updates.displayName.length > 50) {
      throw new Error('Display name cannot exceed 50 characters');
    }

    if (updates.displayName && updates.displayName.length < 3) {
      throw new Error('Display name must be at least 3 characters');
    }

    if (updates.avatar && !this.isValidUrl(updates.avatar)) {
      throw new Error('Avatar must be a valid URL');
    }
  }

  /**
   * Filter allowed updates (exclude immutable fields)
   */
  private filterAllowedUpdates(updates: Partial<UnifiedProfile>): Record<string, any> {
    const allowed = ['displayName', 'avatar', 'socialSettings'];
    const filtered: Record<string, any> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Group assets by game ID
   */
  private groupAssetsByGame(assets: GameAsset[]): CrossGameAsset[] {
    const gameGroups = new Map<string, GameAsset[]>();

    for (const asset of assets) {
      if (!gameGroups.has(asset.gameId)) {
        gameGroups.set(asset.gameId, []);
      }
      gameGroups.get(asset.gameId)!.push(asset);
    }

    return Array.from(gameGroups.entries()).map(([gameId, gameAssets]) => ({
      gameId,
      assets: gameAssets,
      totalValue: this.calculateAssetsValue(gameAssets)
    }));
  }

  /**
   * Calculate total value of assets (placeholder implementation)
   */
  private calculateAssetsValue(assets: GameAsset[]): number {
    // This would integrate with marketplace pricing in a real implementation
    return assets.length * 100; // Placeholder value
  }

  /**
   * Calculate game statistics from assets and achievements
   */
  private calculateGameStatistics(assets: GameAsset[], achievements: Achievement[]): Record<string, any> {
    const stats: Record<string, any> = {};

    // Group by game
    const gameIds = new Set([
      ...assets.map(a => a.gameId),
      ...achievements.map(a => a.gameId)
    ]);

    for (const gameId of gameIds) {
      const gameAssets = assets.filter(a => a.gameId === gameId);
      const gameAchievements = achievements.filter(a => a.gameId === gameId);

      stats[gameId] = {
        totalAssets: gameAssets.length,
        totalAchievements: gameAchievements.length,
        rarityBreakdown: this.calculateRarityBreakdown(gameAchievements),
        lastActivity: this.getLastActivity(gameAssets, gameAchievements)
      };
    }

    return stats;
  }

  /**
   * Calculate rarity breakdown for achievements
   */
  private calculateRarityBreakdown(achievements: Achievement[]): Record<string, number> {
    const breakdown = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };

    for (const achievement of achievements) {
      breakdown[achievement.rarity]++;
    }

    return breakdown;
  }

  /**
   * Get last activity timestamp
   */
  private getLastActivity(_assets: GameAsset[], achievements: Achievement[]): Timestamp {
    const timestamps = achievements.map(a => a.earnedAt);
    return timestamps.length > 0 ? Math.max(...timestamps) : 0;
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}