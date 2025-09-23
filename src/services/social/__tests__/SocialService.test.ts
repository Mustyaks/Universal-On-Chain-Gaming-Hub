/**
 * Social Service Tests
 */

import { SocialService } from '../SocialService';
import { NotificationService } from '../NotificationService';
import {
  DatabaseService,
  CacheService,
  EventService
} from '../../../types/services';
import {
  UnifiedProfile,
  SocialConnection,
  CommunityQuest
} from '../../../types/core';

// Mock implementations
class MockDatabaseService implements DatabaseService {
  private data: Map<string, Map<string, any>> = new Map();

  async findOne<T>(collection: string, query: Record<string, any>): Promise<T | null> {
    const collectionData = this.data.get(collection) || new Map();
    
    for (const [, item] of collectionData) {
      if (this.matchesQuery(item, query)) {
        return item as T;
      }
    }
    return null;
  }

  async findMany<T>(collection: string, query: Record<string, any>, options?: any): Promise<T[]> {
    const collectionData = this.data.get(collection) || new Map();
    const results: T[] = [];
    
    for (const [, item] of collectionData) {
      if (this.matchesQuery(item, query)) {
        results.push(item as T);
      }
    }

    if (options?.limit) {
      return results.slice(0, options.limit);
    }
    
    return results;
  }

  async insertOne<T>(collection: string, document: T): Promise<string> {
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map());
    }
    
    const id = (document as any).id || `${Date.now()}_${Math.random()}`;
    this.data.get(collection)!.set(id, document);
    return id;
  }

  async updateOne(collection: string, id: string, updates: Record<string, any>): Promise<void> {
    const collectionData = this.data.get(collection);
    if (collectionData && collectionData.has(id)) {
      const existing = collectionData.get(id);
      const updated = { ...existing };
      
      for (const [key, value] of Object.entries(updates)) {
        if (key === '$push') {
          // Handle $push operations
          for (const [field, pushValue] of Object.entries(value)) {
            if (!updated[field]) {
              updated[field] = [];
            }
            if (Array.isArray(updated[field])) {
              updated[field].push(pushValue);
            }
          }
        } else {
          updated[key] = value;
        }
      }
      
      collectionData.set(id, updated);
    }
  }

  async deleteOne(collection: string, id: string): Promise<void> {
    const collectionData = this.data.get(collection);
    if (collectionData) {
      collectionData.delete(id);
    }
  }

  private matchesQuery(item: any, query: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(query)) {
      if (key === '$or') {
        const orConditions = value as any[];
        const matches = orConditions.some(condition => this.matchesQuery(item, condition));
        if (!matches) return false;
      } else if (key === '$and') {
        const andConditions = value as any[];
        const matches = andConditions.every(condition => this.matchesQuery(item, condition));
        if (!matches) return false;
      } else if (key === '$push') {
        // Handle $push operations for updates
        continue;
      } else if (typeof value === 'object' && value !== null) {
        if (value.$in && Array.isArray(value.$in)) {
          const itemValue = this.getNestedValue(item, key);
          if (Array.isArray(itemValue)) {
            // Check if any item in the array matches any value in $in
            const hasMatch = itemValue.some((itemVal: any) => value.$in.includes(itemVal));
            if (!hasMatch) return false;
          } else {
            if (!value.$in.includes(itemValue)) return false;
          }
        } else if (value.$regex) {
          const itemValue = this.getNestedValue(item, key);
          const regex = new RegExp(value.$regex, value.$options || '');
          if (itemValue === null || itemValue === undefined || !regex.test(itemValue.toString())) return false;
        } else if (value.$gt !== undefined) {
          const itemValue = this.getNestedValue(item, key);
          if (!(itemValue > value.$gt)) return false;
        } else if (value.$lt !== undefined) {
          const itemValue = this.getNestedValue(item, key);
          if (!(itemValue < value.$lt)) return false;
        }
      } else {
        const itemValue = this.getNestedValue(item, key);
        if (itemValue !== value) return false;
      }
    }
    return true;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // Helper method to seed test data
  seed(collection: string, data: any[]): void {
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map());
    }
    const collectionData = this.data.get(collection)!;
    // Clear existing data first
    collectionData.clear();
    data.forEach(item => {
      // Use appropriate ID field based on the item type
      const id = item.id || item.playerId || item.listingId || item.questId || `${Date.now()}_${Math.random()}`;
      collectionData.set(id, item);
    });
  }

  clear(): void {
    this.data.clear();
  }
}

class MockCacheService implements CacheService {
  private cache: Map<string, { value: any; expiry?: number }> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const item: { value: T; expiry?: number } = { value };
    if (ttlSeconds) {
      item.expiry = Date.now() + (ttlSeconds * 1000);
    }
    this.cache.set(key, item);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

class MockEventService implements EventService {
  private listeners: Map<string, Function[]> = new Map();
  public emittedEvents: Array<{ event: string; data: any }> = [];

  emit(event: string, data: any): void {
    this.emittedEvents.push({ event, data });
    const handlers = this.listeners.get(event) || [];
    handlers.forEach(handler => handler(data));
  }

  on(event: string, handler: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  off(event: string, handler: (data: any) => void): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
    this.emittedEvents = [];
  }
}

describe('SocialService', () => {
  let socialService: SocialService;
  let mockDb: MockDatabaseService;
  let mockCache: MockCacheService;
  let mockNotifications: NotificationService;
  let mockEvents: MockEventService;

  const testPlayer1: UnifiedProfile = {
    playerId: 'player1',
    cartridgeId: 'cartridge1',
    displayName: 'TestPlayer1',
    avatar: 'avatar1.png',
    totalAchievements: 5,
    crossGameAssets: [],
    socialSettings: {
      profileVisibility: 'PUBLIC',
      showAchievements: true,
      showAssets: true,
      allowFriendRequests: true
    },
    createdAt: Date.now()
  };

  const testPlayer2: UnifiedProfile = {
    playerId: 'player2',
    cartridgeId: 'cartridge2',
    displayName: 'TestPlayer2',
    avatar: 'avatar2.png',
    totalAchievements: 3,
    crossGameAssets: [],
    socialSettings: {
      profileVisibility: 'PUBLIC',
      showAchievements: true,
      showAssets: true,
      allowFriendRequests: true
    },
    createdAt: Date.now()
  };

  beforeEach(() => {
    mockDb = new MockDatabaseService();
    mockCache = new MockCacheService();
    mockEvents = new MockEventService();
    mockNotifications = new NotificationService(mockDb, mockCache, mockEvents);
    
    socialService = new SocialService(mockDb, mockCache, mockNotifications, mockEvents);

    // Seed test data
    mockDb.seed('profiles', [testPlayer1, testPlayer2]);
  });

  afterEach(() => {
    mockDb.clear();
    mockCache.clear();
    mockEvents.clear();
  });

  describe('addFriend', () => {
    it('should send a friend request successfully', async () => {
      await socialService.addFriend('player1', 'player2');

      const connection = await mockDb.findOne<SocialConnection>('social_connections', {
        playerId: 'player1',
        friendId: 'player2'
      });

      expect(connection).toBeTruthy();
      expect(connection?.status).toBe('PENDING');
      expect(mockEvents.emittedEvents).toHaveLength(2); // notification + friend_request_sent
      expect(mockEvents.emittedEvents.some(e => e.event === 'friend_request_sent')).toBe(true);
    });

    it('should throw error when trying to add self as friend', async () => {
      await expect(socialService.addFriend('player1', 'player1'))
        .rejects.toThrow('Cannot add yourself as a friend');
    });

    it('should throw error when friend does not exist', async () => {
      await expect(socialService.addFriend('player1', 'nonexistent'))
        .rejects.toThrow('Player not found');
    });

    it('should throw error when friend requests are disabled', async () => {
      const privatePlayer: UnifiedProfile = {
        ...testPlayer2,
        socialSettings: {
          ...testPlayer2.socialSettings,
          allowFriendRequests: false
        }
      };
      
      mockDb.seed('profiles', [testPlayer1, privatePlayer]);

      await expect(socialService.addFriend('player1', 'player2'))
        .rejects.toThrow('This player is not accepting friend requests');
    });

    it('should throw error when already friends', async () => {
      const existingConnection: SocialConnection = {
        id: 'conn1',
        playerId: 'player1',
        friendId: 'player2',
        status: 'ACCEPTED',
        createdAt: Date.now()
      };
      
      mockDb.seed('social_connections', [existingConnection]);

      await expect(socialService.addFriend('player1', 'player2'))
        .rejects.toThrow('Already friends with this player');
    });
  });

  describe('getFriends', () => {
    it('should return list of friends', async () => {
      const connection: SocialConnection = {
        id: 'conn1',
        playerId: 'player1',
        friendId: 'player2',
        status: 'ACCEPTED',
        createdAt: Date.now()
      };
      
      mockDb.seed('social_connections', [connection]);

      const friends = await socialService.getFriends('player1');
      
      expect(friends).toHaveLength(1);
      expect(friends[0]?.playerId).toBe('player2');
    });

    it('should return empty array when no friends', async () => {
      const friends = await socialService.getFriends('player1');
      expect(friends).toHaveLength(0);
    });

    it('should filter out private profiles', async () => {
      const privatePlayer: UnifiedProfile = {
        ...testPlayer2,
        socialSettings: {
          ...testPlayer2.socialSettings,
          profileVisibility: 'PRIVATE'
        }
      };
      
      const connection: SocialConnection = {
        id: 'conn1',
        playerId: 'player1',
        friendId: 'player2',
        status: 'ACCEPTED',
        createdAt: Date.now()
      };
      
      mockDb.seed('profiles', [testPlayer1, privatePlayer]);
      mockDb.seed('social_connections', [connection]);

      const friends = await socialService.getFriends('player1');
      expect(friends).toHaveLength(0);
    });
  });

  describe('searchPlayers', () => {
    it('should search players by display name', async () => {
      const results = await socialService.searchPlayers('TestPlayer');
      
      expect(results).toHaveLength(2);
      expect(results.map(p => p.playerId)).toContain('player1');
      expect(results.map(p => p.playerId)).toContain('player2');
    });

    it('should throw error for short query', async () => {
      await expect(socialService.searchPlayers('a'))
        .rejects.toThrow('Search query must be at least 2 characters');
    });

    it('should respect search limit', async () => {
      const results = await socialService.searchPlayers('TestPlayer', 1);
      expect(results).toHaveLength(1);
    });

    it('should filter out private profiles from search', async () => {
      const privatePlayer: UnifiedProfile = {
        ...testPlayer2,
        socialSettings: {
          ...testPlayer2.socialSettings,
          profileVisibility: 'PRIVATE'
        }
      };
      
      // Clear and re-seed with specific data for this test
      mockDb.clear();
      mockDb.seed('profiles', [testPlayer1, privatePlayer]);

      const results = await socialService.searchPlayers('TestPlayer');
      expect(results).toHaveLength(1);
      expect(results[0]?.playerId).toBe('player1');
    });
  });

  describe('createCommunityQuest', () => {
    it('should create a community quest successfully', async () => {
      const questData = {
        title: 'Test Quest',
        description: 'A test quest',
        requirements: [{ type: 'ACHIEVEMENT' as const, criteria: { count: 5 } }],
        rewards: [{ type: 'NFT' as const, amount: 1 }],
        startDate: Date.now(),
        endDate: Date.now() + 86400000, // 24 hours
        status: 'ACTIVE' as const
      };

      const questId = await socialService.createCommunityQuest(questData);
      
      expect(questId).toBeTruthy();
      expect(questId.startsWith('quest_')).toBe(true);
      
      const quest = await mockDb.findOne<CommunityQuest>('community_quests', { id: questId });
      expect(quest).toBeTruthy();
      expect(quest?.title).toBe('Test Quest');
      expect(quest?.participants).toEqual([]);
    });
  });

  describe('joinQuest', () => {
    it('should join a quest successfully', async () => {
      const quest: CommunityQuest = {
        id: 'quest1',
        title: 'Test Quest',
        description: 'A test quest',
        requirements: [],
        rewards: [],
        startDate: Date.now() - 3600000, // 1 hour ago
        endDate: Date.now() + 86400000, // 24 hours from now
        participants: [],
        status: 'ACTIVE'
      };
      
      mockDb.seed('community_quests', [quest]);

      await socialService.joinQuest('quest1', 'player1');
      
      const updatedQuest = await mockDb.findOne<CommunityQuest>('community_quests', { id: 'quest1' });
      expect(updatedQuest?.participants).toContain('player1');
      expect(mockEvents.emittedEvents.some(e => e.event === 'quest_joined')).toBe(true);
    });

    it('should throw error when quest does not exist', async () => {
      await expect(socialService.joinQuest('nonexistent', 'player1'))
        .rejects.toThrow('Quest not found');
    });

    it('should throw error when quest is not active', async () => {
      const quest: CommunityQuest = {
        id: 'quest1',
        title: 'Test Quest',
        description: 'A test quest',
        requirements: [],
        rewards: [],
        startDate: Date.now(),
        endDate: Date.now() + 86400000,
        participants: [],
        status: 'COMPLETED'
      };
      
      mockDb.seed('community_quests', [quest]);

      await expect(socialService.joinQuest('quest1', 'player1'))
        .rejects.toThrow('Quest is not active');
    });

    it('should throw error when already participating', async () => {
      const quest: CommunityQuest = {
        id: 'quest1',
        title: 'Test Quest',
        description: 'A test quest',
        requirements: [],
        rewards: [],
        startDate: Date.now(),
        endDate: Date.now() + 86400000,
        participants: ['player1'],
        status: 'ACTIVE'
      };
      
      mockDb.seed('community_quests', [quest]);

      await expect(socialService.joinQuest('quest1', 'player1'))
        .rejects.toThrow('Already participating in this quest');
    });
  });

  describe('acceptFriendRequest', () => {
    it('should accept friend request successfully', async () => {
      const connection: SocialConnection = {
        id: 'conn1',
        playerId: 'player1',
        friendId: 'player2',
        status: 'PENDING',
        createdAt: Date.now()
      };
      
      mockDb.seed('social_connections', [connection]);

      await socialService.acceptFriendRequest('conn1', 'player2');
      
      const updatedConnection = await mockDb.findOne<SocialConnection>('social_connections', { id: 'conn1' });
      expect(updatedConnection?.status).toBe('ACCEPTED');
      expect(mockEvents.emittedEvents.some(e => e.event === 'friend_request_accepted')).toBe(true);
    });

    it('should throw error when request not found', async () => {
      await expect(socialService.acceptFriendRequest('nonexistent', 'player2'))
        .rejects.toThrow('Friend request not found');
    });
  });

  describe('getSocialStats', () => {
    it('should return correct social statistics', async () => {
      const connections: SocialConnection[] = [
        {
          id: 'conn1',
          playerId: 'player1',
          friendId: 'player2',
          status: 'ACCEPTED',
          createdAt: Date.now()
        },
        {
          id: 'conn2',
          playerId: 'player3',
          friendId: 'player1',
          status: 'PENDING',
          createdAt: Date.now()
        }
      ];

      const quests: CommunityQuest[] = [
        {
          id: 'quest1',
          title: 'Quest 1',
          description: 'Description',
          requirements: [],
          rewards: [],
          startDate: Date.now(),
          endDate: Date.now() + 86400000,
          participants: ['player1'],
          status: 'ACTIVE'
        },
        {
          id: 'quest2',
          title: 'Quest 2',
          description: 'Description',
          requirements: [],
          rewards: [],
          startDate: Date.now(),
          endDate: Date.now() + 86400000,
          participants: ['player1'],
          status: 'COMPLETED'
        }
      ];
      
      mockDb.seed('social_connections', connections);
      mockDb.seed('community_quests', quests);

      const stats = await socialService.getSocialStats('player1');
      
      expect(stats.friendCount).toBe(1);
      expect(stats.pendingRequests).toBe(1);
      expect(stats.questsParticipated).toBe(2);
      expect(stats.questsCompleted).toBe(1);
    });
  });
});