import { GraphQLError } from 'graphql';
import { Context } from '../context';
import { withCache, withErrorHandling } from '../utils/resolverUtils';

export const gameResolvers = {
  Query: {
    gameStatistics: withErrorHandling(async (
      _: any,
      { playerId, gameId }: { playerId: string; gameId: string },
      context: Context
    ) => {
      // Check privacy settings if not the user's own data
      if (context.user?.id !== playerId) {
        const profile = await context.services.profileService.getProfile(playerId);
        if (profile?.socialSettings.profileVisibility === 'PRIVATE') {
          throw new GraphQLError('Profile is private', {
            extensions: { code: 'FORBIDDEN' }
          });
        }
      }

      return withCache(
        `gameStats:${playerId}:${gameId}`,
        async () => {
          const gameData = await context.services.aggregationService.getPlayerGameData(playerId, gameId);
          return gameData?.normalizedData?.statistics || null;
        },
        300
      );
    }),

    playerGameData: withErrorHandling(async (
      _: any,
      { playerId, gameId }: { playerId: string; gameId: string },
      context: Context
    ) => {
      // Only allow users to access their own raw game data or admins
      if (!context.user || (context.user.id !== playerId && !context.user.isAdmin)) {
        throw new GraphQLError('Access denied', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      return withCache(
        `playerGameData:${playerId}:${gameId}`,
        async () => {
          const gameData = await context.services.aggregationService.getPlayerGameData(playerId, gameId);
          return gameData?.rawData || null;
        },
        180
      );
    }),
  },

  Mutation: {
    // Game mutations are already covered in playerResolvers
  },

  Subscription: {
    // Game subscriptions would be handled through the aggregation service
  },
};