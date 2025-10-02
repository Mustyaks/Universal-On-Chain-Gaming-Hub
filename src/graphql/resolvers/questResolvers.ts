import { GraphQLError } from 'graphql';
import { Context } from '../context';
import { CommunityQuest } from '../../types/core';
import { withCache, withErrorHandling } from '../utils/resolverUtils';

export const questResolvers = {
  Query: {
    activeQuests: withErrorHandling(async (
      _: any,
      { playerId }: { playerId?: string },
      context: Context
    ) => {
      return withCache(
        `activeQuests:${playerId || 'all'}`,
        () => context.services.socialService.getActiveQuests(playerId),
        300
      );
    }),

    quest: withErrorHandling(async (
      _: any,
      { questId }: { questId: string },
      context: Context
    ) => {
      const quest = await withCache(
        `quest:${questId}`,
        async () => {
          const quests = await context.services.socialService.getActiveQuests();
          return quests.find(q => q.id === questId);
        },
        300
      );

      if (!quest) {
        throw new GraphQLError('Quest not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      return quest;
    }),
  },

  Mutation: {
    createCommunityQuest: withErrorHandling(async (
      _: any,
      { input }: { input: any },
      context: Context
    ) => {
      if (!context.user || !context.user.isAdmin) {
        throw new GraphQLError('Admin access required', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      // Validate input
      if (!input.title || !input.description || !input.requirements || !input.rewards) {
        throw new GraphQLError('Invalid quest input', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      if (input.startDate >= input.endDate) {
        throw new GraphQLError('End date must be after start date', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      const questId = await context.services.socialService.createCommunityQuest({
        title: input.title,
        description: input.description,
        requirements: input.requirements,
        rewards: input.rewards,
        startDate: input.startDate,
        endDate: input.endDate,
        status: 'ACTIVE'
      });

      // Invalidate cache
      await context.cache.invalidatePattern('activeQuests:*');

      const quest = await context.services.socialService.getActiveQuests();
      return quest.find(q => q.id === questId);
    }),

    joinQuest: withErrorHandling(async (
      _: any,
      { questId }: { questId: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const quest = await context.services.socialService.getActiveQuests();
      const targetQuest = quest.find(q => q.id === questId);

      if (!targetQuest) {
        throw new GraphQLError('Quest not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      if (targetQuest.status !== 'ACTIVE') {
        throw new GraphQLError('Quest is not active', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      if (targetQuest.participants.includes(context.user.id)) {
        throw new GraphQLError('Already participating in this quest', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      if (Date.now() > targetQuest.endDate) {
        throw new GraphQLError('Quest has expired', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      await context.services.socialService.joinQuest(questId, context.user.id);

      // Invalidate caches
      await context.cache.delete(`quest:${questId}`);
      await context.cache.invalidatePattern('activeQuests:*');

      // Publish subscription event
      const updatedQuest = await context.services.socialService.getActiveQuests();
      const quest = updatedQuest.find(q => q.id === questId);
      
      context.pubsub.publish(`QUEST_JOINED:${questId}`, {
        questJoined: quest
      });

      return true;
    }),

    leaveQuest: withErrorHandling(async (
      _: any,
      { questId }: { questId: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const quests = await context.services.socialService.getActiveQuests();
      const quest = quests.find(q => q.id === questId);

      if (!quest) {
        throw new GraphQLError('Quest not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      if (!quest.participants.includes(context.user.id)) {
        throw new GraphQLError('Not participating in this quest', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      // In a real implementation, you'd remove the user from participants
      // For now, just invalidate caches
      await context.cache.delete(`quest:${questId}`);
      await context.cache.invalidatePattern('activeQuests:*');

      return true;
    }),
  },

  Subscription: {
    questJoined: {
      subscribe: withErrorHandling(async (
        _: any,
        { questId }: { questId: string },
        context: Context
      ) => {
        return context.pubsub.asyncIterator(`QUEST_JOINED:${questId}`);
      }),
    },

    questCompleted: {
      subscribe: withErrorHandling(async (
        _: any,
        { playerId }: { playerId: string },
        context: Context
      ) => {
        if (!context.user || context.user.id !== playerId) {
          throw new GraphQLError('Access denied', {
            extensions: { code: 'FORBIDDEN' }
          });
        }

        return context.pubsub.asyncIterator(`QUEST_COMPLETED:${playerId}`);
      }),
    },
  },

  // Type resolvers
  CommunityQuest: {
    participantProfiles: async (parent: CommunityQuest, _: any, context: Context) => {
      return withCache(
        `questParticipants:${parent.id}`,
        async () => {
          const profiles = await Promise.all(
            parent.participants.map(playerId =>
              context.services.profileService.getProfile(playerId)
            )
          );
          return profiles.filter(Boolean);
        },
        300
      );
    },
  },
};