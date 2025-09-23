/**
 * Notification Service Tests
 */

import { NotificationService } from '../NotificationService';
import {
  DatabaseService,
  CacheService,
  EventService
} from '../../../types/services';
import { Notification } from '../../../types/services';

// Reuse mock implementations from SocialService tests
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
      collectionData.set(id, { ...existing, ...updates });
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
      } else if (typeof value === 'object' && value !== null) {
        if (value.$lt !== undefined) {
          if (!(item[key] < value.$lt)) return false;
        }
      } else {
        if (item[key] !== value) return false;
      }
    }
    return true;
  }

  seed(collection: string, data: any[]): void {
    if (!this.data.has(collection)) {
      this.data.set(collection, new Map());
    }
    const collectionData = this.data.get(collection)!;
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

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockDb: MockDatabaseService;
  let mockCache: MockCacheService;
  let mockEvents: MockEventService;

  const testNotification: Notification = {
    id: 'notif1',
    playerId: 'player1',
    type: 'FRIEND_REQUEST',
    title: 'New Friend Request',
    message: 'TestPlayer2 wants to be your friend',
    data: { fromPlayerId: 'player2' },
    read: false,
    createdAt: Date.now()
  };

  beforeEach(() => {
    mockDb = new MockDatabaseService();
    mockCache = new MockCacheService();
    mockEvents = new MockEventService();
    
    notificationService = new NotificationService(mockDb, mockCache, mockEvents);
  });

  afterEach(() => {
    mockDb.clear();
    mockCache.clear();
    mockEvents.clear();
  });

  describe('sendNotification', () => {
    it('should send notification successfully', async () => {
      await notificationService.sendNotification('player1', testNotification);

      const stored = await mockDb.findOne<Notification>('notifications', { id: 'notif1' });
      expect(stored).toBeTruthy();
      expect(stored?.title).toBe('New Friend Request');
      
      expect(mockEvents.emittedEvents).toHaveLength(1);
      expect(mockEvents.emittedEvents[0]?.event).toBe('notification');
    });

    it('should invalidate cache after sending notification', async () => {
      // Set some cache data first
      await mockCache.set('notifications:player1', []);
      await mockCache.set('unread_notifications:player1', []);

      await notificationService.sendNotification('player1', testNotification);

      const cached = await mockCache.get('notifications:player1');
      expect(cached).toBeNull();
    });
  });

  describe('getNotifications', () => {
    beforeEach(() => {
      const notifications = [
        { ...testNotification, id: 'notif1', read: false },
        { ...testNotification, id: 'notif2', read: true, title: 'Read Notification' }
      ];
      mockDb.seed('notifications', notifications);
    });

    it('should get all notifications for a player', async () => {
      const notifications = await notificationService.getNotifications('player1');
      
      expect(notifications).toHaveLength(2);
      expect(notifications.map(n => n.id)).toContain('notif1');
      expect(notifications.map(n => n.id)).toContain('notif2');
    });

    it('should get only unread notifications when specified', async () => {
      const notifications = await notificationService.getNotifications('player1', true);
      
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.id).toBe('notif1');
      expect(notifications[0]?.read).toBe(false);
    });

    it('should return cached results on subsequent calls', async () => {
      // First call
      const notifications1 = await notificationService.getNotifications('player1');
      
      // Second call should return cached results
      const notifications2 = await notificationService.getNotifications('player1');
      
      expect(notifications1).toEqual(notifications2);
    });
  });

  describe('markAsRead', () => {
    beforeEach(() => {
      mockDb.seed('notifications', [testNotification]);
    });

    it('should mark notification as read', async () => {
      await notificationService.markAsRead('notif1');

      const updated = await mockDb.findOne<Notification>('notifications', { id: 'notif1' });
      expect(updated?.read).toBe(true);
      
      expect(mockEvents.emittedEvents.some(e => e.event === 'notification_read')).toBe(true);
    });

    it('should throw error when notification not found', async () => {
      await expect(notificationService.markAsRead('nonexistent'))
        .rejects.toThrow('Notification not found');
    });

    it('should invalidate cache after marking as read', async () => {
      await mockCache.set('notifications:player1', [testNotification]);

      await notificationService.markAsRead('notif1');

      const cached = await mockCache.get('notifications:player1');
      expect(cached).toBeNull();
    });
  });

  describe('getUnreadCount', () => {
    beforeEach(() => {
      const notifications = [
        { ...testNotification, id: 'notif1', read: false },
        { ...testNotification, id: 'notif2', read: false },
        { ...testNotification, id: 'notif3', read: true }
      ];
      mockDb.seed('notifications', notifications);
    });

    it('should return correct unread count', async () => {
      const count = await notificationService.getUnreadCount('player1');
      expect(count).toBe(2);
    });

    it('should return cached count on subsequent calls', async () => {
      const count1 = await notificationService.getUnreadCount('player1');
      const count2 = await notificationService.getUnreadCount('player1');
      
      expect(count1).toBe(count2);
      expect(count1).toBe(2);
    });
  });

  describe('markAllAsRead', () => {
    beforeEach(() => {
      const notifications = [
        { ...testNotification, id: 'notif1', read: false },
        { ...testNotification, id: 'notif2', read: false },
        { ...testNotification, id: 'notif3', read: true }
      ];
      mockDb.seed('notifications', notifications);
    });

    it('should mark all notifications as read', async () => {
      await notificationService.markAllAsRead('player1');

      const allNotifications = await mockDb.findMany<Notification>('notifications', { playerId: 'player1' });
      const unreadCount = allNotifications.filter(n => !n.read).length;
      
      expect(unreadCount).toBe(0);
      expect(mockEvents.emittedEvents.some(e => e.event === 'all_notifications_read')).toBe(true);
    });
  });

  describe('cleanupOldNotifications', () => {
    beforeEach(() => {
      const oldDate = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      const recentDate = Date.now() - (1 * 24 * 60 * 60 * 1000); // 1 day ago
      
      const notifications = [
        { ...testNotification, id: 'old1', read: true, createdAt: oldDate },
        { ...testNotification, id: 'old2', read: true, createdAt: oldDate },
        { ...testNotification, id: 'recent1', read: true, createdAt: recentDate },
        { ...testNotification, id: 'unread1', read: false, createdAt: oldDate }
      ];
      mockDb.seed('notifications', notifications);
    });

    it('should delete old read notifications', async () => {
      const deletedCount = await notificationService.cleanupOldNotifications(30);
      
      expect(deletedCount).toBe(2);
      
      const remaining = await mockDb.findMany<Notification>('notifications', { playerId: 'player1' });
      expect(remaining).toHaveLength(2);
      expect(remaining.map(n => n.id)).toContain('recent1');
      expect(remaining.map(n => n.id)).toContain('unread1');
    });
  });

  describe('sendBulkNotification', () => {
    it('should send notifications to multiple players', async () => {
      const playerIds = ['player1', 'player2', 'player3'];
      const template = {
        type: 'SYSTEM' as const,
        title: 'System Announcement',
        message: 'Important system update',
        data: { version: '1.0.0' }
      };

      await notificationService.sendBulkNotification(playerIds, template);

      const allNotifications = await mockDb.findMany<Notification>('notifications', {});
      expect(allNotifications).toHaveLength(3);
      
      const playerNotifications = allNotifications.map(n => n.playerId);
      expect(playerNotifications).toContain('player1');
      expect(playerNotifications).toContain('player2');
      expect(playerNotifications).toContain('player3');
      
      expect(mockEvents.emittedEvents).toHaveLength(3);
    });
  });

  describe('notification preferences', () => {
    it('should get default notification preferences', async () => {
      const prefs = await notificationService.getNotificationPreferences('player1');
      
      expect(prefs.friendRequests).toBe(true);
      expect(prefs.achievements).toBe(true);
      expect(prefs.transactions).toBe(true);
      expect(prefs.quests).toBe(true);
      expect(prefs.system).toBe(true);
    });

    it('should update notification preferences', async () => {
      await notificationService.updateNotificationPreferences('player1', {
        friendRequests: false,
        achievements: false
      });

      const prefs = await notificationService.getNotificationPreferences('player1');
      expect(prefs.friendRequests).toBe(false);
      expect(prefs.achievements).toBe(false);
      expect(prefs.transactions).toBe(true); // Should remain default
    });
  });
});