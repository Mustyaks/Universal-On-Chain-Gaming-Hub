/**
 * Event-driven update system for real-time data synchronization
 * Manages event publishing, subscription, and routing across the aggregation engine
 */

import { EventEmitter } from 'events';
import { ErrorHandler } from './ErrorHandler';
import {
  StandardizedGameData,
  PlayerGameData,
  GameAsset,
  Achievement,
  GameHubError,
  Timestamp
} from '../../types/core';

export interface GameEvent {
  id: string;
  type: GameEventType;
  gameId: string;
  playerId?: string;
  data: any;
  timestamp: Timestamp;
  source: string;
  metadata?: Record<string, any>;
}

export type GameEventType = 
  | 'player.updated'
  | 'player.created'
  | 'asset.transferred'
  | 'asset.created'
  | 'asset.updated'
  | 'achievement.earned'
  | 'achievement.updated'
  | 'game.connected'
  | 'game.disconnected'
  | 'sync.started'
  | 'sync.completed'
  | 'sync.failed'
  | 'validation.failed'
  | 'error.occurred';

export interface EventSubscription {
  id: string;
  eventTypes: GameEventType[];
  gameIds?: string[];
  playerIds?: string[];
  callback: (event: GameEvent) => Promise<void> | void;
  filter?: (event: GameEvent) => boolean;
  priority: number;
  active: boolean;
  createdAt: Timestamp;
}

export interface EventMetrics {
  totalEvents: number;
  eventsByType: Record<GameEventType, number>;
  eventsByGame: Record<string, number>;
  errorCount: number;
  lastEventTime: Timestamp;
  averageProcessingTime: number;
}

export class EventSystem extends EventEmitter {
  private subscriptions = new Map<string, EventSubscription>();
  private eventHistory: GameEvent[] = [];
  private metrics: EventMetrics;
  private maxHistorySize = 1000;
  private processingTimes: number[] = [];
  private maxProcessingTimesSamples = 100;

  constructor() {
    super();
    this.metrics = {
      totalEvents: 0,
      eventsByType: {} as Record<GameEventType, number>,
      eventsByGame: {},
      errorCount: 0,
      lastEventTime: 0,
      averageProcessingTime: 0
    };
  }

  /**
   * Publish a game event
   */
  async publishEvent(event: Omit<GameEvent, 'id' | 'timestamp'>): Promise<void> {
    const gameEvent: GameEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: Date.now()
    };

    const startTime = Date.now();

    try {
      // Add to history
      this.addToHistory(gameEvent);

      // Update metrics
      this.updateMetrics(gameEvent);

      // Process subscriptions
      await this.processSubscriptions(gameEvent);

      // Emit internal event
      this.emit('event:published', gameEvent);

      // Record processing time
      const processingTime = Date.now() - startTime;
      this.recordProcessingTime(processingTime);

    } catch (error) {
      this.metrics.errorCount++;
      
      const gameError = ErrorHandler.classifyError(error);
      
      console.error('Error publishing event:', gameError);
      
      this.emit('event:error', { event: gameEvent, error: gameError });
      
      throw gameError;
    }
  }

  /**
   * Subscribe to game events
   */
  subscribe(subscription: Omit<EventSubscription, 'id' | 'createdAt' | 'active'>): string {
    const subscriptionId = this.generateSubscriptionId();
    
    const fullSubscription: EventSubscription = {
      ...subscription,
      id: subscriptionId,
      active: true,
      createdAt: Date.now()
    };

    this.subscriptions.set(subscriptionId, fullSubscription);

    console.log(`Event subscription created: ${subscriptionId} for events: ${subscription.eventTypes.join(', ')}`);

    this.emit('subscription:created', fullSubscription);

    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription) {
      return false;
    }

    this.subscriptions.delete(subscriptionId);

    console.log(`Event subscription removed: ${subscriptionId}`);

    this.emit('subscription:removed', { subscriptionId });

    return true;
  }

  /**
   * Activate/deactivate subscription
   */
  setSubscriptionActive(subscriptionId: string, active: boolean): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription) {
      return false;
    }

    subscription.active = active;

    console.log(`Subscription ${subscriptionId} ${active ? 'activated' : 'deactivated'}`);

    return true;
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.active);
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): EventSubscription | null {
    return this.subscriptions.get(subscriptionId) || null;
  }

  /**
   * Get event history
   */
  getEventHistory(limit?: number, eventType?: GameEventType, gameId?: string): GameEvent[] {
    let events = [...this.eventHistory];

    // Filter by event type
    if (eventType) {
      events = events.filter(event => event.type === eventType);
    }

    // Filter by game ID
    if (gameId) {
      events = events.filter(event => event.gameId === gameId);
    }

    // Apply limit
    if (limit) {
      events = events.slice(-limit);
    }

    return events.reverse(); // Most recent first
  }

  /**
   * Get event metrics
   */
  getMetrics(): EventMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    console.log('Event history cleared');
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalEvents: 0,
      eventsByType: {} as Record<GameEventType, number>,
      eventsByGame: {},
      errorCount: 0,
      lastEventTime: 0,
      averageProcessingTime: 0
    };
    this.processingTimes = [];
    console.log('Event metrics reset');
  }

  // Convenience methods for common events

  /**
   * Publish player update event
   */
  async publishPlayerUpdate(gameId: string, playerId: string, data: StandardizedGameData): Promise<void> {
    await this.publishEvent({
      type: 'player.updated',
      gameId,
      playerId,
      data,
      source: 'aggregation_engine'
    });
  }

  /**
   * Publish asset transfer event
   */
  async publishAssetTransfer(gameId: string, asset: GameAsset, fromPlayer: string, toPlayer: string): Promise<void> {
    await this.publishEvent({
      type: 'asset.transferred',
      gameId,
      playerId: toPlayer,
      data: { asset, fromPlayer, toPlayer },
      source: 'aggregation_engine',
      metadata: { assetId: asset.id, tokenId: asset.tokenId }
    });
  }

  /**
   * Publish achievement earned event
   */
  async publishAchievementEarned(gameId: string, playerId: string, achievement: Achievement): Promise<void> {
    await this.publishEvent({
      type: 'achievement.earned',
      gameId,
      playerId,
      data: achievement,
      source: 'aggregation_engine',
      metadata: { achievementId: achievement.id, rarity: achievement.rarity }
    });
  }

  /**
   * Publish sync completion event
   */
  async publishSyncCompleted(gameId: string, playerId: string, syncData: PlayerGameData): Promise<void> {
    await this.publishEvent({
      type: 'sync.completed',
      gameId,
      playerId,
      data: syncData,
      source: 'sync_engine'
    });
  }

  /**
   * Publish sync failure event
   */
  async publishSyncFailed(gameId: string, playerId: string, error: GameHubError): Promise<void> {
    await this.publishEvent({
      type: 'sync.failed',
      gameId,
      playerId,
      data: error,
      source: 'sync_engine'
    });
  }

  /**
   * Publish validation failure event
   */
  async publishValidationFailed(gameId: string, playerId: string, validationErrors: any): Promise<void> {
    await this.publishEvent({
      type: 'validation.failed',
      gameId,
      playerId,
      data: validationErrors,
      source: 'data_validator'
    });
  }

  // Private methods

  private async processSubscriptions(event: GameEvent): Promise<void> {
    const matchingSubscriptions = this.findMatchingSubscriptions(event);
    
    // Sort by priority (higher priority first)
    matchingSubscriptions.sort((a, b) => b.priority - a.priority);

    // Process subscriptions in parallel within same priority level
    const subscriptionGroups = this.groupByPriority(matchingSubscriptions);
    
    for (const group of subscriptionGroups) {
      const promises = group.map(subscription => this.executeSubscription(subscription, event));
      await Promise.allSettled(promises);
    }
  }

  private findMatchingSubscriptions(event: GameEvent): EventSubscription[] {
    return Array.from(this.subscriptions.values()).filter(subscription => {
      if (!subscription.active) return false;

      // Check event type
      if (!subscription.eventTypes.includes(event.type)) return false;

      // Check game ID filter
      if (subscription.gameIds && !subscription.gameIds.includes(event.gameId)) return false;

      // Check player ID filter
      if (subscription.playerIds && event.playerId && !subscription.playerIds.includes(event.playerId)) return false;

      // Check custom filter
      if (subscription.filter && !subscription.filter(event)) return false;

      return true;
    });
  }

  private groupByPriority(subscriptions: EventSubscription[]): EventSubscription[][] {
    const groups = new Map<number, EventSubscription[]>();
    
    for (const subscription of subscriptions) {
      const priority = subscription.priority;
      if (!groups.has(priority)) {
        groups.set(priority, []);
      }
      groups.get(priority)!.push(subscription);
    }

    return Array.from(groups.values());
  }

  private async executeSubscription(subscription: EventSubscription, event: GameEvent): Promise<void> {
    try {
      await subscription.callback(event);
    } catch (error) {
      console.error(`Error executing subscription ${subscription.id}:`, error);
      
      this.emit('subscription:error', {
        subscriptionId: subscription.id,
        event,
        error: ErrorHandler.classifyError(error)
      });
    }
  }

  private addToHistory(event: GameEvent): void {
    this.eventHistory.push(event);
    
    // Maintain history size limit
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private updateMetrics(event: GameEvent): void {
    this.metrics.totalEvents++;
    this.metrics.lastEventTime = event.timestamp;

    // Update event type metrics
    if (!this.metrics.eventsByType[event.type]) {
      this.metrics.eventsByType[event.type] = 0;
    }
    this.metrics.eventsByType[event.type]++;

    // Update game metrics
    if (!this.metrics.eventsByGame[event.gameId]) {
      this.metrics.eventsByGame[event.gameId] = 0;
    }
    this.metrics.eventsByGame[event.gameId]++;
  }

  private recordProcessingTime(processingTime: number): void {
    this.processingTimes.push(processingTime);
    
    // Maintain sample size limit
    if (this.processingTimes.length > this.maxProcessingTimesSamples) {
      this.processingTimes = this.processingTimes.slice(-this.maxProcessingTimesSamples);
    }

    // Update average
    this.metrics.averageProcessingTime = 
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}