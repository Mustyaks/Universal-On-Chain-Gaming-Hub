/**
 * Quest Service Implementation
 * Handles community quest creation, management, and participation tracking
 */

import {
    DatabaseService,
    CacheService,
    NotificationService,
    EventService
} from '../../types/services';
import {
    CommunityQuest,
    QuestRequirement,
    QuestReward,
    UnifiedProfile
} from '../../types/core';

export interface QuestParticipation {
    questId: string;
    playerId: string;
    joinedAt: number;
    progress: QuestProgress[];
    completed: boolean;
    completedAt?: number;
    rewardsReceived: boolean;
}

export interface QuestProgress {
    requirementIndex: number;
    currentValue: number;
    targetValue: number;
    completed: boolean;
    completedAt?: number;
}

export interface QuestCreationData {
    title: string;
    description: string;
    requirements: QuestRequirement[];
    rewards: QuestReward[];
    startDate: number;
    endDate: number;
    maxParticipants?: number;
    createdBy: string;
    category: 'ACHIEVEMENT' | 'SOCIAL' | 'TRADING' | 'EXPLORATION' | 'SPECIAL';
    difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'LEGENDARY';
}

export interface QuestStats {
    totalQuests: number;
    activeQuests: number;
    completedQuests: number;
    totalParticipants: number;
    averageCompletionRate: number;
    popularCategories: Array<{ category: string; count: number }>;
}

export class QuestService {
    constructor(
        private db: DatabaseService,
        private cache: CacheService,
        private notifications: NotificationService,
        private events: EventService
    ) { }

    /**
     * Create a new community quest
     */
    async createQuest(questData: QuestCreationData): Promise<string> {
        // Validate quest data
        this.validateQuestData(questData);

        const questId = `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const quest: CommunityQuest = {
            id: questId,
            title: questData.title,
            description: questData.description,
            requirements: questData.requirements,
            rewards: questData.rewards,
            startDate: questData.startDate,
            endDate: questData.endDate,
            participants: [],
            status: questData.startDate <= Date.now() ? 'ACTIVE' : 'ACTIVE' // Will be activated when start date arrives
        };

        // Store quest
        await this.db.insertOne('community_quests', quest);

        // Store quest metadata
        await this.db.insertOne('quest_metadata', {
            id: `meta_${questId}`,
            questId,
            maxParticipants: questData.maxParticipants,
            createdBy: questData.createdBy,
            category: questData.category,
            difficulty: questData.difficulty,
            createdAt: Date.now()
        });

        // Emit event
        this.events.emit('quest_created', { questId, quest, metadata: questData });

        // Invalidate cache
        await this.cache.invalidatePattern('quests:*');

        // Send notifications to eligible players if quest is active
        if (quest.status === 'ACTIVE') {
            await this.notifyEligiblePlayers(quest);
        }

        return questId;
    }

    /**
     * Join a community quest
     */
    async joinQuest(questId: string, playerId: string): Promise<void> {
        const quest = await this.db.findOne<CommunityQuest>('community_quests', { id: questId });

        if (!quest) {
            throw new Error('Quest not found');
        }

        if (quest.status !== 'ACTIVE') {
            throw new Error('Quest is not active');
        }

        if (quest.participants.includes(playerId)) {
            throw new Error('Already participating in this quest');
        }

        if (quest.endDate < Date.now()) {
            throw new Error('Quest has expired');
        }

        // Check max participants
        const metadata = await this.db.findOne<any>('quest_metadata', { questId });
        if (metadata?.maxParticipants && quest.participants.length >= metadata.maxParticipants) {
            throw new Error('Quest is full');
        }

        // Check if player meets requirements
        const eligible = await this.checkPlayerEligibility(quest, playerId);
        if (!eligible) {
            throw new Error('Player does not meet quest requirements');
        }

        // Add player to participants
        await this.db.updateOne('community_quests', questId, {
            $push: { participants: playerId }
        });

        // Create participation record
        const participation: QuestParticipation = {
            questId,
            playerId,
            joinedAt: Date.now(),
            progress: quest.requirements.map((req, index) => ({
                requirementIndex: index,
                currentValue: 0,
                targetValue: this.getRequirementTargetValue(req),
                completed: false
            })),
            completed: false,
            rewardsReceived: false
        };

        await this.db.insertOne('quest_participation', participation);

        // Send notification
        await this.notifications.sendNotification(playerId, {
            id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            playerId,
            type: 'QUEST',
            title: 'Quest Joined',
            message: `You've joined the quest: ${quest.title}`,
            data: { questId },
            read: false,
            createdAt: Date.now()
        });

        // Emit event
        this.events.emit('quest_joined', { questId, playerId });

        // Invalidate cache
        await this.cache.invalidatePattern('quests:*');
        await this.cache.delete(`quest_participation:${playerId}`);
    }

    /**
     * Update quest progress for a player
     */
    async updateQuestProgress(
        playerId: string,
        questId: string,
        requirementIndex: number,
        newValue: number
    ): Promise<void> {
        const participation = await this.db.findOne<QuestParticipation>('quest_participation', {
            questId,
            playerId
        });

        if (!participation) {
            throw new Error('Player is not participating in this quest');
        }

        if (participation.completed) {
            return; // Already completed
        }

        // Update progress
        const progress = participation.progress[requirementIndex];
        if (!progress) {
            throw new Error('Invalid requirement index');
        }

        const oldValue = progress.currentValue;
        progress.currentValue = Math.max(progress.currentValue, newValue);

        // Check if requirement is now completed
        if (!progress.completed && progress.currentValue >= progress.targetValue) {
            progress.completed = true;
            progress.completedAt = Date.now();

            // Send progress notification
            await this.notifications.sendNotification(playerId, {
                id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                playerId,
                type: 'QUEST',
                title: 'Quest Progress',
                message: `You've completed a quest requirement!`,
                data: { questId, requirementIndex },
                read: false,
                createdAt: Date.now()
            });
        }

        // Check if all requirements are completed
        const allCompleted = participation.progress.every(p => p.completed);
        if (allCompleted && !participation.completed) {
            participation.completed = true;
            participation.completedAt = Date.now();

            // Award rewards
            await this.awardQuestRewards(questId, playerId);

            // Send completion notification
            const quest = await this.db.findOne<CommunityQuest>('community_quests', { id: questId });
            await this.notifications.sendNotification(playerId, {
                id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                playerId,
                type: 'QUEST',
                title: 'Quest Completed!',
                message: `Congratulations! You've completed: ${quest?.title}`,
                data: { questId },
                read: false,
                createdAt: Date.now()
            });

            // Emit event
            this.events.emit('quest_completed', { questId, playerId });
        }

        // Update participation record
        await this.db.updateOne('quest_participation', participation.questId + '_' + participation.playerId, {
            progress: participation.progress,
            completed: participation.completed,
            completedAt: participation.completedAt
        });

        // Emit progress event
        this.events.emit('quest_progress_updated', {
            questId,
            playerId,
            requirementIndex,
            oldValue,
            newValue: progress.currentValue,
            completed: progress.completed
        });
    }

    /**
     * Get active quests with optional filtering
     */
    async getActiveQuests(filters?: {
        category?: string;
        difficulty?: string;
        playerId?: string;
        participating?: boolean;
    }): Promise<CommunityQuest[]> {
        const cacheKey = `active_quests:${JSON.stringify(filters || {})}`;
        const cached = await this.cache.get<CommunityQuest[]>(cacheKey);
        if (cached) {
            return cached;
        }

        let query: any = {
            status: 'ACTIVE',
            endDate: { $gt: Date.now() }
        };

        if (filters?.participating && filters?.playerId) {
            query.participants = { $in: [filters.playerId] };
        }

        const quests = await this.db.findMany<CommunityQuest>('community_quests', query, {
            sort: { startDate: -1 },
            limit: 50
        });

        // Apply additional filters
        let filteredQuests = quests;

        if (filters?.category || filters?.difficulty) {
            const questIds = quests.map(q => q.id);
            const metadata = await this.db.findMany<any>('quest_metadata', {
                questId: { $in: questIds }
            });

            const metadataMap = new Map(metadata.map(m => [m.questId, m]));

            filteredQuests = quests.filter(quest => {
                const meta = metadataMap.get(quest.id);
                if (filters?.category && meta?.category !== filters.category) {
                    return false;
                }
                if (filters?.difficulty && meta?.difficulty !== filters.difficulty) {
                    return false;
                }
                return true;
            });
        }

        // Cache for 2 minutes
        await this.cache.set(cacheKey, filteredQuests, 120);

        return filteredQuests;
    }

    /**
     * Get quest participation for a player
     */
    async getPlayerQuestParticipation(playerId: string): Promise<QuestParticipation[]> {
        const cacheKey = `quest_participation:${playerId}`;
        const cached = await this.cache.get<QuestParticipation[]>(cacheKey);
        if (cached) {
            return cached;
        }

        const participation = await this.db.findMany<QuestParticipation>('quest_participation', {
            playerId
        }, {
            sort: { joinedAt: -1 },
            limit: 100
        });

        // Cache for 5 minutes
        await this.cache.set(cacheKey, participation, 300);

        return participation;
    }

    /**
     * Get quest statistics
     */
    async getQuestStats(): Promise<QuestStats> {
        const cacheKey = 'quest_stats';
        const cached = await this.cache.get<QuestStats>(cacheKey);
        if (cached) {
            return cached;
        }

        const [allQuests, activeQuests, completedQuests, allParticipation, metadata] = await Promise.all([
            this.db.findMany<CommunityQuest>('community_quests', {}),
            this.db.findMany<CommunityQuest>('community_quests', { status: 'ACTIVE' }),
            this.db.findMany<CommunityQuest>('community_quests', { status: 'COMPLETED' }),
            this.db.findMany<QuestParticipation>('quest_participation', {}),
            this.db.findMany<any>('quest_metadata', {})
        ]);

        const totalParticipants = new Set(allParticipation.map(p => p.playerId)).size;
        const completedParticipation = allParticipation.filter(p => p.completed);
        const averageCompletionRate = allParticipation.length > 0
            ? (completedParticipation.length / allParticipation.length) * 100
            : 0;

        // Calculate popular categories
        const categoryCount = new Map<string, number>();
        metadata.forEach(meta => {
            const count = categoryCount.get(meta.category) || 0;
            categoryCount.set(meta.category, count + 1);
        });

        const popularCategories = Array.from(categoryCount.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const stats: QuestStats = {
            totalQuests: allQuests.length,
            activeQuests: activeQuests.length,
            completedQuests: completedQuests.length,
            totalParticipants,
            averageCompletionRate,
            popularCategories
        };

        // Cache for 10 minutes
        await this.cache.set(cacheKey, stats, 600);

        return stats;
    }

    /**
     * Complete a quest (admin function)
     */
    async completeQuest(questId: string): Promise<void> {
        const quest = await this.db.findOne<CommunityQuest>('community_quests', { id: questId });
        if (!quest) {
            throw new Error('Quest not found');
        }

        await this.db.updateOne('community_quests', questId, {
            status: 'COMPLETED'
        });

        // Notify all participants
        const participations = await this.db.findMany<QuestParticipation>('quest_participation', {
            questId
        });

        for (const participation of participations) {
            await this.notifications.sendNotification(participation.playerId, {
                id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                playerId: participation.playerId,
                type: 'QUEST',
                title: 'Quest Ended',
                message: `The quest "${quest.title}" has ended`,
                data: { questId },
                read: false,
                createdAt: Date.now()
            });
        }

        // Emit event
        this.events.emit('quest_ended', { questId, quest });

        // Invalidate cache
        await this.cache.invalidatePattern('quests:*');
    }

    /**
     * Private helper methods
     */
    private validateQuestData(questData: QuestCreationData): void {
        if (!questData.title || questData.title.trim().length < 3) {
            throw new Error('Quest title must be at least 3 characters');
        }

        if (!questData.description || questData.description.trim().length < 10) {
            throw new Error('Quest description must be at least 10 characters');
        }

        if (!questData.requirements || questData.requirements.length === 0) {
            throw new Error('Quest must have at least one requirement');
        }

        if (!questData.rewards || questData.rewards.length === 0) {
            throw new Error('Quest must have at least one reward');
        }

        if (questData.startDate >= questData.endDate) {
            throw new Error('Quest end date must be after start date');
        }

        if (questData.endDate <= Date.now()) {
            throw new Error('Quest end date must be in the future');
        }
    }

    private async checkPlayerEligibility(_quest: CommunityQuest, _playerId: string): Promise<boolean> {
        // For now, all players are eligible
        // In a real implementation, this would check player achievements, assets, etc.
        return true;
    }

    private getRequirementTargetValue(requirement: QuestRequirement): number {
        // Extract target value from requirement criteria
        if (requirement.criteria['count']) {
            return requirement.criteria['count'] as number;
        }
        if (requirement.criteria['amount']) {
            return requirement.criteria['amount'] as number;
        }
        return 1; // Default target
    }

    private async awardQuestRewards(questId: string, playerId: string): Promise<void> {
        const quest = await this.db.findOne<CommunityQuest>('community_quests', { id: questId });
        if (!quest) return;

        // Award each reward
        for (const reward of quest.rewards) {
            await this.awardReward(playerId, reward, questId);
        }

        // Mark rewards as received
        await this.db.updateOne('quest_participation', questId + '_' + playerId, {
            rewardsReceived: true
        });
    }

    private async awardReward(playerId: string, reward: QuestReward, questId: string): Promise<void> {
        // Implementation would depend on the reward type
        // For now, just emit an event
        this.events.emit('reward_awarded', {
            playerId,
            reward,
            questId,
            awardedAt: Date.now()
        });
    }

    private async notifyEligiblePlayers(quest: CommunityQuest): Promise<void> {
        // Get all players (in a real implementation, this would be more targeted)
        const players = await this.db.findMany<UnifiedProfile>('profiles', {
            'socialSettings.profileVisibility': { $in: ['PUBLIC', 'FRIENDS_ONLY'] }
        }, { limit: 1000 });

        // Send notifications to eligible players
        for (const player of players) {
            const eligible = await this.checkPlayerEligibility(quest, player.playerId);
            if (eligible) {
                await this.notifications.sendNotification(player.playerId, {
                    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    playerId: player.playerId,
                    type: 'QUEST',
                    title: 'New Quest Available',
                    message: `A new quest is available: ${quest.title}`,
                    data: { questId: quest.id },
                    read: false,
                    createdAt: Date.now()
                });
            }
        }
    }
}