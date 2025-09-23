/**
 * Quest Service Tests
 */

import { QuestService, QuestCreationData, QuestParticipation } from '../QuestService';
import { NotificationService } from '../NotificationService';
import {
  DatabaseService,
  CacheService,
  EventService
} from '../../../types/services';
import {
  CommunityQuest,
  UnifiedProfile
} from '../../../types/core';

// Mock implementations (reusing from SocialService tests)
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
    
    const id = (document as any).id || (document as any).playerId || `${Date.now()}_${Math.random()}`;
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
        continue;
      } else if (typeof value === 'object' && value !== null) {
        if (value.$in && Array.isArray(value.$in)) {
          const itemValue = this.getNestedValue(item, key);
          if (Array.isArray(itemValue)) {
            const hasMatch = itemValue.some((itemVal: any) => value.$in.includes(itemVal));
            if (!hasMatch) return false;
          } else {
            if (!value.$in.includes(itemValue)) return false;
          }
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

  seed(collection: string, data: any[]): void {
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map());
    }
    const collectionData = this.data.get(collection)!;
    collectionData.clear();
    data.forEach(item => {
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

describe('QuestService', () => {
  let questService: QuestService;
  let mockDb: MockDatabaseService;
  let mockCache: MockCacheService;
  let mockNotifications: NotificationService;
  let mockEvents: MockEventService;

  const testPlayer: UnifiedProfile = {
    playerId: 'player1',
    cartridgeId: 'cartridge1',
    displayName: 'TestPlayer',
    avatar: 'avatar.png',
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

  const testQuestData: QuestCreationData = {
    title: 'Test Quest',
    description: 'A test quest for unit testing',
    requirements: [
      {
        type: 'ACHIEVEMENT',
        criteria: { count: 5 }
      }
    ],
    rewards: [
      {
        type: 'NFT',
        amount: 1
      }
    ],
    startDate: Date.now(),
    endDate: Date.now() + 86400000, // 24 hours
    createdBy: 'player1',
    category: 'ACHIEVEMENT',
    difficulty: 'EASY'
  };

  beforeEach(() => {
    mockDb = new MockDatabaseService();
    mockCache = new MockCacheService();
    mockEvents = new MockEventService();
    mockNotifications = new NotificationService(mockDb, mockCache, mockEvents);
    
    questService = new QuestService(mockDb, mockCache, mockNotifications, mockEvents);

    // Seed test data
    mockDb.seed('profiles', [testPlayer]);
  });

  afterEach(() => {
    mockDb.clear();
    mockCache.clear();
    mockEvents.clear();
  });

  describe('createQuest', () => {
    it('should create a quest successfully', async () => {
      const questId = await questService.createQuest(testQuestData);

      expect(questId).toBeTruthy();
      expect(questId.startsWith('quest_')).toBe(true);

      const quest = await mockDb.findOne<CommunityQuest>('community_quests', { id: questId });
      expect(quest).toBeTruthy();
      expect(quest?.title).toBe('Test Quest');
      expect(quest?.status).toBe('ACTIVE');

      const metadata = await mockDb.findOne<any>('quest_metadata', { questId });
      expect(metadata).toBeTruthy();
      expect(metadata?.category).toBe('ACHIEVEMENT');
      expect(metadata?.difficulty).toBe('EASY');

      expect(mockEvents.emittedEvents.some(e => e.event === 'quest_created')).toBe(true);
    });

    it('should throw error for invalid quest data', async () => {
      const invalidQuest = { ...testQuestData, title: 'ab' }; // Too short

      await expect(questService.createQuest(invalidQuest))
        .rejects.toThrow('Quest title must be at least 3 characters');
    });

    it('should throw error for quest with no requirements', async () => {
      const invalidQuest = { ...testQuestData, requirements: [] };

      await expect(questService.createQuest(invalidQuest))
        .rejects.toThrow('Quest must have at least one requirement');
    });

    it('should throw error for quest with no rewards', async () => {
      const invalidQuest = { ...testQuestData, rewards: [] };

      await expect(questService.createQuest(invalidQuest))
        .rejects.toThrow('Quest must have at least one reward');
    });

    it('should throw error for quest with invalid dates', async () => {
      const invalidQuest = { 
        ...testQuestData, 
        startDate: Date.now() + 86400000,
        endDate: Date.now() 
      };

      await expect(questService.createQuest(invalidQuest))
        .rejects.toThrow('Quest end date must be after start date');
    });
  });

  describe('joinQuest', () => {
    let questId: string;

    beforeEach(async () => {
      questId = await questService.createQuest(testQuestData);
    });

    it('should join quest successfully', async () => {
      await questService.joinQuest(questId, 'player1');

      const quest = await mockDb.findOne<CommunityQuest>('community_quests', { id: questId });
      expect(quest?.participants).toContain('player1');

      const participation = await mockDb.findOne<QuestParticipation>('quest_participation', {
        questId,
        playerId: 'player1'
      });
      expect(participation).toBeTruthy();
      expect(participation?.completed).toBe(false);
      expect(participation?.progress).toHaveLength(1);

      expect(mockEvents.emittedEvents.some(e => e.event === 'quest_joined')).toBe(true);
    });

    it('should throw error when quest not found', async () => {
      await expect(questService.joinQuest('nonexistent', 'player1'))
        .rejects.toThrow('Quest not found');
    });

    it('should throw error when already participating', async () => {
      await questService.joinQuest(questId, 'player1');

      await expect(questService.joinQuest(questId, 'player1'))
        .rejects.toThrow('Already participating in this quest');
    });

    it('should throw error when quest is not active', async () => {
      // Complete the quest
      await mockDb.updateOne('community_quests', questId, { status: 'COMPLETED' });

      await expect(questService.joinQuest(questId, 'player1'))
        .rejects.toThrow('Quest is not active');
    });
  });

  describe('updateQuestProgress', () => {
    let questId: string;

    beforeEach(async () => {
      questId = await questService.createQuest(testQuestData);
      await questService.joinQuest(questId, 'player1');
    });

    it('should update progress successfully', async () => {
      await questService.updateQuestProgress('player1', questId, 0, 3);

      const participation = await mockDb.findOne<QuestParticipation>('quest_participation', {
        questId,
        playerId: 'player1'
      });

      expect(participation?.progress[0]?.currentValue).toBe(3);
      expect(participation?.progress[0]?.completed).toBe(false);

      expect(mockEvents.emittedEvents.some(e => e.event === 'quest_progress_updated')).toBe(true);
    });

    it('should complete requirement when target reached', async () => {
      await questService.updateQuestProgress('player1', questId, 0, 5);

      const participation = await mockDb.findOne<QuestParticipation>('quest_participation', {
        questId,
        playerId: 'player1'
      });

      expect(participation?.progress[0]?.currentValue).toBe(5);
      expect(participation?.progress[0]?.completed).toBe(true);
      expect(participation?.completed).toBe(true);

      expect(mockEvents.emittedEvents.some(e => e.event === 'quest_completed')).toBe(true);
    });

    it('should throw error when player not participating', async () => {
      await expect(questService.updateQuestProgress('player2', questId, 0, 3))
        .rejects.toThrow('Player is not participating in this quest');
    });

    it('should throw error for invalid requirement index', async () => {
      await expect(questService.updateQuestProgress('player1', questId, 5, 3))
        .rejects.toThrow('Invalid requirement index');
    });
  });

  describe('getActiveQuests', () => {
    let questId1: string;
    let questId2: string;

    beforeEach(async () => {
      questId1 = await questService.createQuest(testQuestData);
      questId2 = await questService.createQuest({
        ...testQuestData,
        title: 'Second Quest',
        category: 'SOCIAL',
        difficulty: 'MEDIUM'
      });
    });

    it('should return all active quests', async () => {
      const quests = await questService.getActiveQuests();

      expect(quests).toHaveLength(2);
      expect(quests.map(q => q.id)).toContain(questId1);
      expect(quests.map(q => q.id)).toContain(questId2);
    });

    it('should filter by category', async () => {
      const quests = await questService.getActiveQuests({ category: 'ACHIEVEMENT' });

      expect(quests).toHaveLength(1);
      expect(quests[0]?.id).toBe(questId1);
    });

    it('should filter by difficulty', async () => {
      const quests = await questService.getActiveQuests({ difficulty: 'MEDIUM' });

      expect(quests).toHaveLength(1);
      expect(quests[0]?.id).toBe(questId2);
    });

    it('should filter by participation', async () => {
      await questService.joinQuest(questId1, 'player1');

      const quests = await questService.getActiveQuests({ 
        playerId: 'player1', 
        participating: true 
      });

      expect(quests).toHaveLength(1);
      expect(quests[0]?.id).toBe(questId1);
    });
  });

  describe('getPlayerQuestParticipation', () => {
    let questId: string;

    beforeEach(async () => {
      questId = await questService.createQuest(testQuestData);
      await questService.joinQuest(questId, 'player1');
    });

    it('should return player participation', async () => {
      const participation = await questService.getPlayerQuestParticipation('player1');

      expect(participation).toHaveLength(1);
      expect(participation[0]?.questId).toBe(questId);
      expect(participation[0]?.playerId).toBe('player1');
      expect(participation[0]?.completed).toBe(false);
    });

    it('should return empty array for player with no participation', async () => {
      const participation = await questService.getPlayerQuestParticipation('player2');
      expect(participation).toHaveLength(0);
    });
  });

  describe('getQuestStats', () => {
    beforeEach(async () => {
      const questId1 = await questService.createQuest(testQuestData);
      await questService.createQuest({
        ...testQuestData,
        title: 'Second Quest',
        category: 'SOCIAL'
      });

      await questService.joinQuest(questId1, 'player1');
      await questService.updateQuestProgress('player1', questId1, 0, 5); // Complete
    });

    it('should return correct quest statistics', async () => {
      const stats = await questService.getQuestStats();

      expect(stats.totalQuests).toBe(2);
      expect(stats.activeQuests).toBe(2);
      expect(stats.totalParticipants).toBe(1);
      expect(stats.averageCompletionRate).toBe(100); // 1 completed out of 1 participation
      expect(stats.popularCategories).toHaveLength(2);
    });
  });

  describe('completeQuest', () => {
    let questId: string;

    beforeEach(async () => {
      questId = await questService.createQuest(testQuestData);
      await questService.joinQuest(questId, 'player1');
    });

    it('should complete quest successfully', async () => {
      await questService.completeQuest(questId);

      const quest = await mockDb.findOne<CommunityQuest>('community_quests', { id: questId });
      expect(quest?.status).toBe('COMPLETED');

      expect(mockEvents.emittedEvents.some(e => e.event === 'quest_ended')).toBe(true);
    });

    it('should throw error when quest not found', async () => {
      await expect(questService.completeQuest('nonexistent'))
        .rejects.toThrow('Quest not found');
    });
  });
});