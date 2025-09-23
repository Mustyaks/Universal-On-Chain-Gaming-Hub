/**
 * Notification Service Implementation
 * Handles social notifications and real-time updates
 */

import {
  NotificationService as INotificationService,
  Notification,
  DatabaseService,
  CacheService,
  EventService
} from '../../types/services';

export class NotificationService implements INotificationService {
  constructor(
    private db: DatabaseService,
    private cache: CacheService,
    private events: EventService
  ) {}

  /**
   * Send a notification to a player
   */
  async sendNotification(playerId: string, notification: Notification): Promise<void> {
    // Store notification in database
    await this.db.insertOne('notifications', notification);

    // Emit real-time event
    this.events.emit('notification', { playerId, notification });

    // Invalidate cache
    await this.cache.delete(`notifications:${playerId}`);
    await this.cache.delete(`unread_notifications:${playerId}`);

    // Update unread count cache
    const unreadCount = await this.getUnreadCount(playerId);
    await this.cache.set(`unread_count:${playerId}`, unreadCount, 300);
  }

  /**
   * Get notifications for a player
   */
  async getNotifications(playerId: string, unreadOnly: boolean = false): Promise<Notification[]> {
    const cacheKey = unreadOnly ? `unread_notifications:${playerId}` : `notifications:${playerId}`;
    const cached = await this.cache.get<Notification[]>(cacheKey);
    if (cached) {
      return cached;
    }

    let query: any = { playerId };
    if (unreadOnly) {
      query.read = false;
    }

    const notifications = await this.db.findMany<Notification>('notifications', query, {
      sort: { createdAt: -1 },
      limit: 50
    });

    // Cache for 2 minutes
    await this.cache.set(cacheKey, notifications, 120);

    return notifications;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const notification = await this.db.findOne<Notification>('notifications', { id: notificationId });
    if (!notification) {
      throw new Error('Notification not found');
    }

    await this.db.updateOne('notifications', notificationId, { read: true });

    // Invalidate cache
    await this.cache.delete(`notifications:${notification.playerId}`);
    await this.cache.delete(`unread_notifications:${notification.playerId}`);
    await this.cache.delete(`unread_count:${notification.playerId}`);

    // Emit event
    this.events.emit('notification_read', { notificationId, playerId: notification.playerId });
  }

  /**
   * Mark all notifications as read for a player
   */
  async markAllAsRead(playerId: string): Promise<void> {
    // Update all unread notifications for the player
    const unreadNotifications = await this.db.findMany<Notification>('notifications', {
      playerId,
      read: false
    });

    for (const notification of unreadNotifications) {
      await this.db.updateOne('notifications', notification.id, { read: true });
    }

    // Invalidate cache
    await this.cache.delete(`notifications:${playerId}`);
    await this.cache.delete(`unread_notifications:${playerId}`);
    await this.cache.delete(`unread_count:${playerId}`);

    // Emit event
    this.events.emit('all_notifications_read', { playerId });
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(playerId: string): Promise<number> {
    const cacheKey = `unread_count:${playerId}`;
    const cached = await this.cache.get<number>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const unreadNotifications = await this.db.findMany<Notification>('notifications', {
      playerId,
      read: false
    });

    const count = unreadNotifications.length;

    // Cache for 5 minutes
    await this.cache.set(cacheKey, count, 300);

    return count;
  }

  /**
   * Delete old notifications (cleanup job)
   */
  async cleanupOldNotifications(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    const oldNotifications = await this.db.findMany<Notification>('notifications', {
      createdAt: { $lt: cutoffDate },
      read: true
    });

    let deletedCount = 0;
    for (const notification of oldNotifications) {
      await this.db.deleteOne('notifications', notification.id);
      deletedCount++;
    }

    // Invalidate all notification caches
    await this.cache.invalidatePattern('notifications:*');
    await this.cache.invalidatePattern('unread_notifications:*');
    await this.cache.invalidatePattern('unread_count:*');

    return deletedCount;
  }

  /**
   * Send bulk notifications (for system announcements)
   */
  async sendBulkNotification(
    playerIds: string[], 
    notificationTemplate: Omit<Notification, 'id' | 'playerId' | 'createdAt' | 'read'>
  ): Promise<void> {
    const notifications: Notification[] = playerIds.map(playerId => ({
      ...notificationTemplate,
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      playerId,
      read: false,
      createdAt: Date.now()
    }));

    // Batch insert notifications
    for (const notification of notifications) {
      await this.db.insertOne('notifications', notification);
      
      // Emit real-time event
      this.events.emit('notification', { playerId: notification.playerId, notification });
    }

    // Invalidate caches for all affected players
    for (const playerId of playerIds) {
      await this.cache.delete(`notifications:${playerId}`);
      await this.cache.delete(`unread_notifications:${playerId}`);
      await this.cache.delete(`unread_count:${playerId}`);
    }
  }

  /**
   * Get notification preferences for a player
   */
  async getNotificationPreferences(playerId: string): Promise<{
    friendRequests: boolean;
    achievements: boolean;
    transactions: boolean;
    quests: boolean;
    system: boolean;
  }> {
    const cacheKey = `notification_prefs:${playerId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get from database or use defaults
    const dbPrefs = await this.db.findOne<any>('notification_preferences', { playerId });
    const defaultPrefs = {
      friendRequests: true,
      achievements: true,
      transactions: true,
      quests: true,
      system: true
    };

    const prefs = dbPrefs ? {
      friendRequests: dbPrefs.friendRequests ?? defaultPrefs.friendRequests,
      achievements: dbPrefs.achievements ?? defaultPrefs.achievements,
      transactions: dbPrefs.transactions ?? defaultPrefs.transactions,
      quests: dbPrefs.quests ?? defaultPrefs.quests,
      system: dbPrefs.system ?? defaultPrefs.system
    } : defaultPrefs;

    // Cache for 1 hour
    await this.cache.set(cacheKey, prefs, 3600);

    return prefs;
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    playerId: string, 
    preferences: Partial<{
      friendRequests: boolean;
      achievements: boolean;
      transactions: boolean;
      quests: boolean;
      system: boolean;
    }>
  ): Promise<void> {
    const existing = await this.db.findOne<any>('notification_preferences', { playerId });
    
    if (existing && existing.id) {
      await this.db.updateOne('notification_preferences', existing.id, preferences);
    } else {
      await this.db.insertOne('notification_preferences', {
        id: `prefs_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        playerId,
        friendRequests: true,
        achievements: true,
        transactions: true,
        quests: true,
        system: true,
        ...preferences
      });
    }

    // Invalidate cache
    await this.cache.delete(`notification_prefs:${playerId}`);
  }
}