"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventSystem = void 0;
const events_1 = require("events");
const ErrorHandler_1 = require("./ErrorHandler");
class EventSystem extends events_1.EventEmitter {
    constructor() {
        super();
        this.subscriptions = new Map();
        this.eventHistory = [];
        this.maxHistorySize = 1000;
        this.processingTimes = [];
        this.maxProcessingTimesSamples = 100;
        this.metrics = {
            totalEvents: 0,
            eventsByType: {},
            eventsByGame: {},
            errorCount: 0,
            lastEventTime: 0,
            averageProcessingTime: 0
        };
    }
    async publishEvent(event) {
        const gameEvent = {
            ...event,
            id: this.generateEventId(),
            timestamp: Date.now()
        };
        const startTime = Date.now();
        try {
            this.addToHistory(gameEvent);
            this.updateMetrics(gameEvent);
            await this.processSubscriptions(gameEvent);
            this.emit('event:published', gameEvent);
            const processingTime = Date.now() - startTime;
            this.recordProcessingTime(processingTime);
        }
        catch (error) {
            this.metrics.errorCount++;
            const gameError = ErrorHandler_1.ErrorHandler.classifyError(error);
            console.error('Error publishing event:', gameError);
            this.emit('event:error', { event: gameEvent, error: gameError });
            throw gameError;
        }
    }
    subscribe(subscription) {
        const subscriptionId = this.generateSubscriptionId();
        const fullSubscription = {
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
    unsubscribe(subscriptionId) {
        const subscription = this.subscriptions.get(subscriptionId);
        if (!subscription) {
            return false;
        }
        this.subscriptions.delete(subscriptionId);
        console.log(`Event subscription removed: ${subscriptionId}`);
        this.emit('subscription:removed', { subscriptionId });
        return true;
    }
    setSubscriptionActive(subscriptionId, active) {
        const subscription = this.subscriptions.get(subscriptionId);
        if (!subscription) {
            return false;
        }
        subscription.active = active;
        console.log(`Subscription ${subscriptionId} ${active ? 'activated' : 'deactivated'}`);
        return true;
    }
    getActiveSubscriptions() {
        return Array.from(this.subscriptions.values()).filter(sub => sub.active);
    }
    getSubscription(subscriptionId) {
        return this.subscriptions.get(subscriptionId) || null;
    }
    getEventHistory(limit, eventType, gameId) {
        let events = [...this.eventHistory];
        if (eventType) {
            events = events.filter(event => event.type === eventType);
        }
        if (gameId) {
            events = events.filter(event => event.gameId === gameId);
        }
        if (limit) {
            events = events.slice(-limit);
        }
        return events.reverse();
    }
    getMetrics() {
        return { ...this.metrics };
    }
    clearHistory() {
        this.eventHistory = [];
        console.log('Event history cleared');
    }
    resetMetrics() {
        this.metrics = {
            totalEvents: 0,
            eventsByType: {},
            eventsByGame: {},
            errorCount: 0,
            lastEventTime: 0,
            averageProcessingTime: 0
        };
        this.processingTimes = [];
        console.log('Event metrics reset');
    }
    async publishPlayerUpdate(gameId, playerId, data) {
        await this.publishEvent({
            type: 'player.updated',
            gameId,
            playerId,
            data,
            source: 'aggregation_engine'
        });
    }
    async publishAssetTransfer(gameId, asset, fromPlayer, toPlayer) {
        await this.publishEvent({
            type: 'asset.transferred',
            gameId,
            playerId: toPlayer,
            data: { asset, fromPlayer, toPlayer },
            source: 'aggregation_engine',
            metadata: { assetId: asset.id, tokenId: asset.tokenId }
        });
    }
    async publishAchievementEarned(gameId, playerId, achievement) {
        await this.publishEvent({
            type: 'achievement.earned',
            gameId,
            playerId,
            data: achievement,
            source: 'aggregation_engine',
            metadata: { achievementId: achievement.id, rarity: achievement.rarity }
        });
    }
    async publishSyncCompleted(gameId, playerId, syncData) {
        await this.publishEvent({
            type: 'sync.completed',
            gameId,
            playerId,
            data: syncData,
            source: 'sync_engine'
        });
    }
    async publishSyncFailed(gameId, playerId, error) {
        await this.publishEvent({
            type: 'sync.failed',
            gameId,
            playerId,
            data: error,
            source: 'sync_engine'
        });
    }
    async publishValidationFailed(gameId, playerId, validationErrors) {
        await this.publishEvent({
            type: 'validation.failed',
            gameId,
            playerId,
            data: validationErrors,
            source: 'data_validator'
        });
    }
    async processSubscriptions(event) {
        const matchingSubscriptions = this.findMatchingSubscriptions(event);
        matchingSubscriptions.sort((a, b) => b.priority - a.priority);
        const subscriptionGroups = this.groupByPriority(matchingSubscriptions);
        for (const group of subscriptionGroups) {
            const promises = group.map(subscription => this.executeSubscription(subscription, event));
            await Promise.allSettled(promises);
        }
    }
    findMatchingSubscriptions(event) {
        return Array.from(this.subscriptions.values()).filter(subscription => {
            if (!subscription.active)
                return false;
            if (!subscription.eventTypes.includes(event.type))
                return false;
            if (subscription.gameIds && !subscription.gameIds.includes(event.gameId))
                return false;
            if (subscription.playerIds && event.playerId && !subscription.playerIds.includes(event.playerId))
                return false;
            if (subscription.filter && !subscription.filter(event))
                return false;
            return true;
        });
    }
    groupByPriority(subscriptions) {
        const groups = new Map();
        for (const subscription of subscriptions) {
            const priority = subscription.priority;
            if (!groups.has(priority)) {
                groups.set(priority, []);
            }
            groups.get(priority).push(subscription);
        }
        return Array.from(groups.values());
    }
    async executeSubscription(subscription, event) {
        try {
            await subscription.callback(event);
        }
        catch (error) {
            console.error(`Error executing subscription ${subscription.id}:`, error);
            this.emit('subscription:error', {
                subscriptionId: subscription.id,
                event,
                error: ErrorHandler_1.ErrorHandler.classifyError(error)
            });
        }
    }
    addToHistory(event) {
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
        }
    }
    updateMetrics(event) {
        this.metrics.totalEvents++;
        this.metrics.lastEventTime = event.timestamp;
        if (!this.metrics.eventsByType[event.type]) {
            this.metrics.eventsByType[event.type] = 0;
        }
        this.metrics.eventsByType[event.type]++;
        if (!this.metrics.eventsByGame[event.gameId]) {
            this.metrics.eventsByGame[event.gameId] = 0;
        }
        this.metrics.eventsByGame[event.gameId]++;
    }
    recordProcessingTime(processingTime) {
        this.processingTimes.push(processingTime);
        if (this.processingTimes.length > this.maxProcessingTimesSamples) {
            this.processingTimes = this.processingTimes.slice(-this.maxProcessingTimesSamples);
        }
        this.metrics.averageProcessingTime =
            this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
    }
    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    generateSubscriptionId() {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.EventSystem = EventSystem;
//# sourceMappingURL=EventSystem.js.map