import { EventEmitter } from 'events';
import { StandardizedGameData, PlayerGameData, GameAsset, Achievement, GameHubError, Timestamp } from '../../types/core';
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
export type GameEventType = 'player.updated' | 'player.created' | 'asset.transferred' | 'asset.created' | 'asset.updated' | 'achievement.earned' | 'achievement.updated' | 'game.connected' | 'game.disconnected' | 'sync.started' | 'sync.completed' | 'sync.failed' | 'validation.failed' | 'error.occurred';
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
export declare class EventSystem extends EventEmitter {
    private subscriptions;
    private eventHistory;
    private metrics;
    private maxHistorySize;
    private processingTimes;
    private maxProcessingTimesSamples;
    constructor();
    publishEvent(event: Omit<GameEvent, 'id' | 'timestamp'>): Promise<void>;
    subscribe(subscription: Omit<EventSubscription, 'id' | 'createdAt' | 'active'>): string;
    unsubscribe(subscriptionId: string): boolean;
    setSubscriptionActive(subscriptionId: string, active: boolean): boolean;
    getActiveSubscriptions(): EventSubscription[];
    getSubscription(subscriptionId: string): EventSubscription | null;
    getEventHistory(limit?: number, eventType?: GameEventType, gameId?: string): GameEvent[];
    getMetrics(): EventMetrics;
    clearHistory(): void;
    resetMetrics(): void;
    publishPlayerUpdate(gameId: string, playerId: string, data: StandardizedGameData): Promise<void>;
    publishAssetTransfer(gameId: string, asset: GameAsset, fromPlayer: string, toPlayer: string): Promise<void>;
    publishAchievementEarned(gameId: string, playerId: string, achievement: Achievement): Promise<void>;
    publishSyncCompleted(gameId: string, playerId: string, syncData: PlayerGameData): Promise<void>;
    publishSyncFailed(gameId: string, playerId: string, error: GameHubError): Promise<void>;
    publishValidationFailed(gameId: string, playerId: string, validationErrors: any): Promise<void>;
    private processSubscriptions;
    private findMatchingSubscriptions;
    private groupByPriority;
    private executeSubscription;
    private addToHistory;
    private updateMetrics;
    private recordProcessingTime;
    private generateEventId;
    private generateSubscriptionId;
}
//# sourceMappingURL=EventSystem.d.ts.map