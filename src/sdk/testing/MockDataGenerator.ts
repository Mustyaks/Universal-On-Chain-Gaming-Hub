/**
 * Mock data generator for testing SDK integration
 * Generates realistic test data for various scenarios
 */

import { StandardizedGameData, GameAsset, Achievement, GameStatistics } from '../../types/core';

export class MockDataGenerator {
  private gameIds = ['dojo-chess', 'dojo-rpg', 'dojo-racing', 'dojo-strategy'];
  private assetTypes: Array<'NFT' | 'CURRENCY' | 'ITEM'> = ['NFT', 'CURRENCY', 'ITEM'];
  private rarities: Array<'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'> = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

  /**
   * Generate complete player data for testing
   */
  generatePlayerData(gameId?: string): StandardizedGameData {
    const selectedGameId = gameId || this.randomChoice(this.gameIds);
    const playerId = `test-player-${Math.random().toString(36).substr(2, 9)}`;

    return {
      playerId,
      gameId: selectedGameId,
      assets: this.generateAssets(selectedGameId, Math.floor(Math.random() * 10) + 1),
      achievements: this.generateAchievements(selectedGameId, playerId, Math.floor(Math.random() * 5) + 1),
      statistics: this.generateStatistics(selectedGameId, playerId),
      lastUpdated: Date.now() - Math.floor(Math.random() * 3600000) // Random time within last hour
    };
  }

  /**
   * Generate empty player data (edge case)
   */
  generateEmptyPlayerData(): StandardizedGameData {
    const playerId = `empty-player-${Math.random().toString(36).substr(2, 9)}`;
    const gameId = this.randomChoice(this.gameIds);

    return {
      playerId,
      gameId,
      assets: [],
      achievements: [],
      statistics: this.generateMinimalStatistics(gameId, playerId),
      lastUpdated: Date.now()
    };
  }

  /**
   * Generate large player data (stress test)
   */
  generateLargePlayerData(): StandardizedGameData {
    const playerId = `large-player-${Math.random().toString(36).substr(2, 9)}`;
    const gameId = this.randomChoice(this.gameIds);

    return {
      playerId,
      gameId,
      assets: this.generateAssets(gameId, 100), // Large number of assets
      achievements: this.generateAchievements(gameId, playerId, 50), // Many achievements
      statistics: this.generateDetailedStatistics(gameId, playerId),
      lastUpdated: Date.now()
    };
  }

  /**
   * Generate player data with special characters (edge case)
   */
  generatePlayerDataWithSpecialCharacters(): StandardizedGameData {
    const playerId = `special-player-${Math.random().toString(36).substr(2, 9)}`;
    const gameId = this.randomChoice(this.gameIds);

    const data = this.generatePlayerData(gameId);
    data.playerId = playerId;

    // Add special characters to asset names
    data.assets.forEach(asset => {
      asset.metadata.name = `${asset.metadata.name} 🗡️ Special™`;
      asset.metadata.description = `${asset.metadata.description} with émojis & spëcial chars`;
    });

    // Add special characters to achievement titles
    data.achievements.forEach(achievement => {
      achievement.title = `${achievement.title} ⭐ Spëcial`;
      achievement.description = `${achievement.description} with ümlauts & émojis`;
    });

    return data;
  }

  /**
   * Generate malformed data for error testing
   */
  generateMalformedData(): Partial<StandardizedGameData> {
    return {
      playerId: '', // Invalid empty player ID
      gameId: null as any, // Invalid null game ID
      assets: 'not-an-array' as any, // Invalid type
      achievements: [
        {
          id: '', // Missing required fields
          rarity: 'INVALID_RARITY' as any, // Invalid enum value
          earnedAt: -1 // Invalid timestamp
        } as any
      ],
      statistics: null as any, // Invalid null statistics
      lastUpdated: 'invalid-timestamp' as any // Invalid timestamp type
    };
  }

  /**
   * Generate single asset for testing
   */
  generateAsset(gameId?: string): GameAsset {
    const selectedGameId = gameId || this.randomChoice(this.gameIds);
    const assetType = this.randomChoice(this.assetTypes);
    const rarity = this.randomChoice(this.rarities);

    return {
      id: `asset-${Math.random().toString(36).substr(2, 9)}`,
      gameId: selectedGameId,
      tokenId: Math.floor(Math.random() * 10000).toString(),
      contractAddress: this.generateAddress(),
      assetType,
      metadata: {
        name: this.generateAssetName(assetType, selectedGameId),
        description: this.generateAssetDescription(assetType),
        image: `https://example.com/assets/${assetType.toLowerCase()}-${Math.floor(Math.random() * 100)}.png`,
        attributes: this.generateAssetAttributes(assetType, rarity),
        rarity
      },
      owner: this.generateAddress(),
      tradeable: Math.random() > 0.2 // 80% chance of being tradeable
    };
  }

  /**
   * Generate multiple assets
   */
  generateAssets(gameId: string, count: number): GameAsset[] {
    return Array.from({ length: count }, () => this.generateAsset(gameId));
  }

  /**
   * Generate game-specific assets
   */
  generateGameSpecificAssets(gameId: string): GameAsset[] {
    const assets: GameAsset[] = [];

    switch (gameId) {
      case 'dojo-chess':
        assets.push(
          this.createSpecificAsset(gameId, 'NFT', 'Chess Piece', 'RARE'),
          this.createSpecificAsset(gameId, 'CURRENCY', 'Chess Coins', 'COMMON'),
          this.createSpecificAsset(gameId, 'ITEM', 'Chess Board', 'EPIC')
        );
        break;

      case 'dojo-rpg':
        assets.push(
          this.createSpecificAsset(gameId, 'NFT', 'Magic Sword', 'LEGENDARY'),
          this.createSpecificAsset(gameId, 'ITEM', 'Health Potion', 'COMMON'),
          this.createSpecificAsset(gameId, 'CURRENCY', 'Gold Coins', 'COMMON')
        );
        break;

      case 'dojo-racing':
        assets.push(
          this.createSpecificAsset(gameId, 'NFT', 'Race Car', 'EPIC'),
          this.createSpecificAsset(gameId, 'ITEM', 'Turbo Boost', 'RARE'),
          this.createSpecificAsset(gameId, 'CURRENCY', 'Racing Points', 'COMMON')
        );
        break;

      default:
        assets.push(...this.generateAssets(gameId, 3));
    }

    return assets;
  }

  /**
   * Generate achievements for testing
   */
  generateAchievements(gameId: string, playerId: string, count: number): Achievement[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `achievement-${Math.random().toString(36).substr(2, 9)}`,
      gameId,
      playerId,
      achievementType: this.generateAchievementType(gameId, index),
      title: this.generateAchievementTitle(gameId, index),
      description: this.generateAchievementDescription(gameId, index),
      rarity: this.randomChoice(this.rarities),
      earnedAt: Date.now() - Math.floor(Math.random() * 86400000 * 30), // Random time within last 30 days
      ...(Math.random() > 0.5 && { nftBadgeId: `badge-${Math.random().toString(36).substr(2, 9)}` })
    }));
  }

  /**
   * Generate game-specific achievements
   */
  generateGameSpecificAchievements(gameId: string): Achievement[] {
    const playerId = `test-player-${Math.random().toString(36).substr(2, 9)}`;
    const achievements: Achievement[] = [];

    switch (gameId) {
      case 'dojo-chess':
        achievements.push(
          this.createSpecificAchievement(gameId, playerId, 'first_checkmate', 'First Checkmate', 'COMMON'),
          this.createSpecificAchievement(gameId, playerId, 'grandmaster', 'Grandmaster', 'LEGENDARY'),
          this.createSpecificAchievement(gameId, playerId, 'speed_chess', 'Speed Chess Master', 'RARE')
        );
        break;

      case 'dojo-rpg':
        achievements.push(
          this.createSpecificAchievement(gameId, playerId, 'first_kill', 'First Blood', 'COMMON'),
          this.createSpecificAchievement(gameId, playerId, 'dragon_slayer', 'Dragon Slayer', 'LEGENDARY'),
          this.createSpecificAchievement(gameId, playerId, 'level_50', 'Level 50 Reached', 'EPIC')
        );
        break;

      case 'dojo-racing':
        achievements.push(
          this.createSpecificAchievement(gameId, playerId, 'first_race', 'First Race', 'COMMON'),
          this.createSpecificAchievement(gameId, playerId, 'speed_demon', 'Speed Demon', 'RARE'),
          this.createSpecificAchievement(gameId, playerId, 'champion', 'Racing Champion', 'LEGENDARY')
        );
        break;

      default:
        achievements.push(...this.generateAchievements(gameId, playerId, 3));
    }

    return achievements;
  }

  /**
   * Generate game statistics
   */
  generateStatistics(gameId: string, playerId: string): GameStatistics {
    return {
      gameId,
      playerId,
      playtime: Math.floor(Math.random() * 100000), // Random playtime in seconds
      level: Math.floor(Math.random() * 100) + 1, // Level 1-100
      score: Math.floor(Math.random() * 1000000), // Random score
      customStats: this.generateCustomStats(gameId)
    };
  }

  /**
   * Generate minimal statistics for edge cases
   */
  generateMinimalStatistics(gameId: string, playerId: string): GameStatistics {
    return {
      gameId,
      playerId,
      playtime: 0,
      level: 1,
      score: 0,
      customStats: {}
    };
  }

  /**
   * Generate detailed statistics for stress testing
   */
  generateDetailedStatistics(gameId: string, playerId: string): GameStatistics {
    return {
      gameId,
      playerId,
      playtime: Math.floor(Math.random() * 1000000),
      level: Math.floor(Math.random() * 1000) + 1,
      score: Math.floor(Math.random() * 10000000),
      customStats: this.generateExtensiveCustomStats(gameId)
    };
  }

  // Private helper methods

  private randomChoice<T>(array: T[]): T {
    const index = Math.floor(Math.random() * array.length);
    const result = array[index];
    if (result === undefined) {
      throw new Error('Array is empty or index out of bounds');
    }
    return result;
  }

  private generateAddress(): string {
    return `0x${Math.random().toString(16).substr(2, 40)}`;
  }

  private generateAssetName(assetType: string, _gameId: string): string {
    const names = {
      NFT: ['Legendary Sword', 'Magic Shield', 'Dragon Egg', 'Ancient Rune', 'Crystal Orb'],
      CURRENCY: ['Gold Coins', 'Gems', 'Energy Crystals', 'Battle Points', 'Experience Orbs'],
      ITEM: ['Health Potion', 'Mana Elixir', 'Speed Boost', 'Armor Upgrade', 'Weapon Enhancement']
    };

    return this.randomChoice(names[assetType as keyof typeof names]);
  }

  private generateAssetDescription(assetType: string): string {
    const descriptions = {
      NFT: 'A unique and powerful artifact with special properties.',
      CURRENCY: 'Valuable currency used for trading and upgrades.',
      ITEM: 'A useful item that provides various benefits to the player.'
    };

    return descriptions[assetType as keyof typeof descriptions];
  }

  private generateAssetAttributes(assetType: string, rarity: string): Array<{ trait_type: string; value: string | number }> {
    const baseAttributes = [
      { trait_type: 'Rarity', value: rarity },
      { trait_type: 'Type', value: assetType }
    ];

    if (assetType === 'NFT') {
      baseAttributes.push(
        { trait_type: 'Power', value: (Math.floor(Math.random() * 100) + 1).toString() },
        { trait_type: 'Durability', value: (Math.floor(Math.random() * 100) + 1).toString() }
      );
    } else if (assetType === 'CURRENCY') {
      baseAttributes.push(
        { trait_type: 'Denomination', value: (Math.floor(Math.random() * 1000) + 1).toString() }
      );
    } else if (assetType === 'ITEM') {
      baseAttributes.push(
        { trait_type: 'Effect', value: 'Beneficial' },
        { trait_type: 'Duration', value: (Math.floor(Math.random() * 60) + 1).toString() }
      );
    }

    return baseAttributes;
  }

  private generateAchievementType(_gameId: string, index: number): string {
    const types = ['first_action', 'milestone', 'skill_mastery', 'collection', 'social'];
    return `${types[index % types.length]}_${Math.floor(Math.random() * 100)}`;
  }

  private generateAchievementTitle(_gameId: string, index: number): string {
    const titles = [
      'First Steps', 'Milestone Reached', 'Master of Skills', 'Collector Supreme', 'Social Butterfly',
      'Speed Demon', 'Perfectionist', 'Explorer', 'Champion', 'Legend'
    ];
    const title = titles[index % titles.length];
    if (!title) throw new Error('No title available');
    return title;
  }

  private generateAchievementDescription(_gameId: string, index: number): string {
    const descriptions = [
      'Completed your first action in the game',
      'Reached an important milestone',
      'Mastered a difficult skill',
      'Collected a rare set of items',
      'Made friends with other players'
    ];
    const description = descriptions[index % descriptions.length];
    if (!description) throw new Error('No description available');
    return description;
  }

  private generateCustomStats(gameId: string): Record<string, number> {
    const baseStats = {
      battles_won: Math.floor(Math.random() * 100),
      items_collected: Math.floor(Math.random() * 500),
      distance_traveled: Math.floor(Math.random() * 10000)
    };

    // Add game-specific stats
    switch (gameId) {
      case 'dojo-chess':
        return {
          ...baseStats,
          games_played: Math.floor(Math.random() * 200),
          checkmates: Math.floor(Math.random() * 50),
          draws: Math.floor(Math.random() * 30)
        };

      case 'dojo-rpg':
        return {
          ...baseStats,
          monsters_defeated: Math.floor(Math.random() * 1000),
          quests_completed: Math.floor(Math.random() * 100),
          dungeons_explored: Math.floor(Math.random() * 50)
        };

      case 'dojo-racing':
        return {
          ...baseStats,
          races_won: Math.floor(Math.random() * 50),
          top_speed: Math.floor(Math.random() * 300) + 100,
          laps_completed: Math.floor(Math.random() * 1000)
        };

      default:
        return baseStats;
    }
  }

  private generateExtensiveCustomStats(gameId: string): Record<string, number> {
    const stats = this.generateCustomStats(gameId);
    
    // Add many more stats for stress testing
    for (let i = 0; i < 50; i++) {
      stats[`custom_stat_${i}`] = Math.floor(Math.random() * 1000);
    }
    
    return stats;
  }

  private createSpecificAsset(gameId: string, assetType: 'NFT' | 'CURRENCY' | 'ITEM', name: string, rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'): GameAsset {
    return {
      id: `${gameId}-${assetType.toLowerCase()}-${Math.random().toString(36).substr(2, 9)}`,
      gameId,
      tokenId: Math.floor(Math.random() * 10000).toString(),
      contractAddress: this.generateAddress(),
      assetType,
      metadata: {
        name,
        description: this.generateAssetDescription(assetType),
        image: `https://example.com/${gameId}/${assetType.toLowerCase()}.png`,
        attributes: this.generateAssetAttributes(assetType, rarity),
        rarity
      },
      owner: this.generateAddress(),
      tradeable: true
    };
  }

  private createSpecificAchievement(gameId: string, playerId: string, type: string, title: string, rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'): Achievement {
    return {
      id: `${gameId}-${type}-${Math.random().toString(36).substr(2, 9)}`,
      gameId,
      playerId,
      achievementType: type,
      title,
      description: `Achievement earned for ${title.toLowerCase()}`,
      rarity,
      earnedAt: Date.now() - Math.floor(Math.random() * 86400000 * 7), // Random time within last week
      ...(rarity === 'LEGENDARY' && { nftBadgeId: `badge-${Math.random().toString(36).substr(2, 9)}` })
    };
  }
}