import { GraphQLError } from 'graphql';
import { Context } from '../context';
import { UnifiedProfile, Player, GameProfile, SocialConnection } from '../../types/core';
import { withCache, withErrorHandling } from '../utils/resolverUtils';

export const playerResolvers = {
  Query: {
    me: withErrorHandling(async (_: any, __: any, context: Context) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }
      
      return withCache(
        `player:${context.user.id}`,
        () => context.services.profileService.getProfile(context.user.id),
        300 // 5 minutes cache
      );
    }),

    player: withErrorHandling(async (_: any, { id }: { id: string }, context: Context) => {
      const player = await withCache(
        `player:${id}`,
        () => context.services.profileService.getProfile(id),
        300
      );
      
      if (!player) {
        throw new GraphQLError('Player not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }
      
      return player;
    }),

    profile: withErrorHandling(async (_: any, { playerId }: { playerId: string }, context: Context) => {
      const profile = await withCache(
        `profile:${playerId}`,
        () => context.services.profileService.getProfile(playerId),
        300
      );
      
      if (!profile) {
        throw new GraphQLError('Profile not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }
      
      return profile;
    }),

    searchPlayers: withErrorHandling(async (
      _: any, 
      { query, limit = 10 }: { query: string; limit?: number }, 
      context: Context
    ) => {
      if (query.length < 2) {
        throw new GraphQLError('Search query must be at least 2 characters', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      const profiles = await context.services.profileService.searchProfiles(query, limit);
      
      return {
        items: profiles,
        pageInfo: {
          hasNext: profiles.length === limit,
          hasPrevious: false,
          total: profiles.length,
          page: 1,
          limit
        }
      };
    }),

    playerAssets: withErrorHandling(async (
      _: any,
      { playerId, gameId }: { playerId: string; gameId?: string },
      context: Context
    ) => {
      const cacheKey = gameId ? `assets:${playerId}:${gameId}` : `assets:${playerId}`;
      
      return withCache(
        cacheKey,
        async () => {
          const aggregatedData = await context.services.profileService.aggregateGameData(playerId);
          
          if (gameId) {
            const gameAssets = aggregatedData.crossGameAssets.find(cga => cga.gameId === gameId);
            return gameAssets?.assets || [];
          }
          
          return aggregatedData.crossGameAssets.flatMap(cga => cga.assets);
        },
        180 // 3 minutes cache for assets
      );
    }),

    playerAchievements: withErrorHandling(async (
      _: any,
      { playerId, gameId, page = 1, limit = 20 }: { 
        playerId: string; 
        gameId?: string; 
        page?: number; 
        limit?: number; 
      },
      context: Context
    ) => {
      const cacheKey = `achievements:${playerId}:${gameId || 'all'}:${page}:${limit}`;
      
      return withCache(
        cacheKey,
        async () => {
          const aggregatedData = await context.services.profileService.aggregateGameData(playerId);
          let achievements = aggregatedData.recentAchievements;
          
          if (gameId) {
            achievements = achievements.filter(a => a.gameId === gameId);
          }
          
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedAchievements = achievements.slice(startIndex, endIndex);
          
          return {
            items: paginatedAchievements,
            pageInfo: {
              hasNext: endIndex < achievements.length,
              hasPrevious: page > 1,
              total: achievements.length,
              page,
              limit
            }
          };
        },
        180
      );
    }),

    crossGameAssets: withErrorHandling(async (
      _: any,
      { playerId }: { playerId: string },
      context: Context
    ) => {
      return withCache(
        `crossGameAssets:${playerId}`,
        async () => {
          const aggregatedData = await context.services.profileService.aggregateGameData(playerId);
          return aggregatedData.crossGameAssets;
        },
        300
      );
    }),
  },

  Mutation: {
    updateProfile: withErrorHandling(async (
      _: any,
      { displayName, avatar, socialSettings }: {
        displayName?: string;
        avatar?: string;
        socialSettings?: any;
      },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const updates: Partial<UnifiedProfile> = {};
      if (displayName !== undefined) updates.displayName = displayName;
      if (avatar !== undefined) updates.avatar = avatar;
      if (socialSettings !== undefined) updates.socialSettings = socialSettings;

      await context.services.profileService.updateProfile(context.user.id, updates);
      
      // Invalidate cache
      await context.cache.delete(`profile:${context.user.id}`);
      await context.cache.delete(`player:${context.user.id}`);
      
      return context.services.profileService.getProfile(context.user.id);
    }),

    syncPlayerData: withErrorHandling(async (
      _: any,
      { gameId }: { gameId?: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      await context.services.aggregationService.syncPlayerData(context.user.id, gameId);
      
      // Invalidate related caches
      const cachePatterns = [
        `profile:${context.user.id}`,
        `assets:${context.user.id}*`,
        `achievements:${context.user.id}*`,
        `crossGameAssets:${context.user.id}`
      ];
      
      for (const pattern of cachePatterns) {
        await context.cache.invalidatePattern(pattern);
      }
      
      return true;
    }),

    registerGameAdapter: withErrorHandling(async (
      _: any,
      { gameId, gameName }: { gameId: string; gameName: string },
      context: Context
    ) => {
      if (!context.user || !context.user.isAdmin) {
        throw new GraphQLError('Admin access required', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      // This would register a new game adapter
      // Implementation depends on the adapter registration system
      return true;
    }),
  },

  Subscription: {
    profileUpdated: {
      subscribe: withErrorHandling(async (
        _: any,
        { playerId }: { playerId: string },
        context: Context
      ) => {
        if (!context.user) {
          throw new GraphQLError('Authentication required', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }

        return context.pubsub.asyncIterator(`PROFILE_UPDATED:${playerId}`);
      }),
    },

    achievementEarned: {
      subscribe: withErrorHandling(async (
        _: any,
        { playerId }: { playerId: string },
        context: Context
      ) => {
        if (!context.user) {
          throw new GraphQLError('Authentication required', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }

        return context.pubsub.asyncIterator(`ACHIEVEMENT_EARNED:${playerId}`);
      }),
    },
  },

  // Type resolvers for nested fields
  Player: {
    profile: async (parent: Player, _: any, context: Context) => {
      return withCache(
        `profile:${parent.id}`,
        () => context.services.profileService.getProfile(parent.id),
        300
      );
    },

    gameProfiles: async (parent: Player, _: any, context: Context) => {
      return withCache(
        `gameProfiles:${parent.id}`,
        async () => {
          const aggregatedData = await context.services.profileService.aggregateGameData(parent.id);
          // Convert aggregated data to game profiles format
          return Object.keys(aggregatedData.gameStatistics).map(gameId => ({
            gameId,
            playerId: parent.id,
            gameSpecificData: aggregatedData.gameStatistics[gameId],
            lastActive: Date.now()
          }));
        },
        300
      );
    },

    socialConnections: async (parent: Player, _: any, context: Context) => {
      return withCache(
        `socialConnections:${parent.id}`,
        () => context.services.socialService.getFriends(parent.id),
        300
      );
    },
  },

  UnifiedProfile: {
    crossGameAssets: async (parent: UnifiedProfile, _: any, context: Context) => {
      return withCache(
        `crossGameAssets:${parent.playerId}`,
        async () => {
          const aggregatedData = await context.services.profileService.aggregateGameData(parent.playerId);
          return aggregatedData.crossGameAssets;
        },
        300
      );
    },
  },
};