import { GraphQLError } from 'graphql';
import { Context } from '../context';
import { MarketplaceListing, Transaction } from '../../types/core';
import { withCache, withErrorHandling } from '../utils/resolverUtils';

export const marketplaceResolvers = {
  Query: {
    marketplaceListings: withErrorHandling(async (
      _: any,
      { filters }: { filters?: any },
      context: Context
    ) => {
      const cacheKey = `marketplaceListings:${JSON.stringify(filters || {})}`;
      
      return withCache(
        cacheKey,
        async () => {
          const result = await context.services.marketplaceService.getListings(filters);
          return {
            items: result.items,
            pageInfo: {
              hasNext: result.hasNext,
              hasPrevious: result.page > 1,
              total: result.total,
              page: result.page,
              limit: result.limit
            }
          };
        },
        60 // 1 minute cache for marketplace listings
      );
    }),

    marketplaceListing: withErrorHandling(async (
      _: any,
      { listingId }: { listingId: string },
      context: Context
    ) => {
      const listing = await withCache(
        `listing:${listingId}`,
        () => context.services.marketplaceService.getListing(listingId),
        300
      );
      
      if (!listing) {
        throw new GraphQLError('Listing not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }
      
      return listing;
    }),

    playerTransactions: withErrorHandling(async (
      _: any,
      { playerId, page = 1, limit = 20 }: { 
        playerId: string; 
        page?: number; 
        limit?: number; 
      },
      context: Context
    ) => {
      // Check if user can access these transactions
      if (!context.user || (context.user.id !== playerId && !context.user.isAdmin)) {
        throw new GraphQLError('Access denied', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      const cacheKey = `transactions:${playerId}:${page}:${limit}`;
      
      return withCache(
        cacheKey,
        async () => {
          // This would need to be implemented in the marketplace service
          // For now, return mock structure
          return {
            items: [],
            pageInfo: {
              hasNext: false,
              hasPrevious: false,
              total: 0,
              page,
              limit
            }
          };
        },
        180
      );
    }),
  },

  Mutation: {
    createListing: withErrorHandling(async (
      _: any,
      { input }: { input: any },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      // Validate input
      if (!input.assetId || !input.priceInBTC || input.priceInBTC <= 0) {
        throw new GraphQLError('Invalid listing input', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      // Get the asset to verify ownership
      const aggregatedData = await context.services.profileService.aggregateGameData(context.user.id);
      const asset = aggregatedData.crossGameAssets
        .flatMap(cga => cga.assets)
        .find(a => a.id === input.assetId);

      if (!asset) {
        throw new GraphQLError('Asset not found or not owned by user', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      if (!asset.tradeable) {
        throw new GraphQLError('Asset is not tradeable', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      const listingId = await context.services.marketplaceService.createListing(
        asset,
        input.priceInBTC
      );

      // Invalidate marketplace cache
      await context.cache.invalidatePattern('marketplaceListings:*');

      return context.services.marketplaceService.getListing(listingId);
    }),

    cancelListing: withErrorHandling(async (
      _: any,
      { listingId }: { listingId: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const listing = await context.services.marketplaceService.getListing(listingId);
      
      if (!listing) {
        throw new GraphQLError('Listing not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      if (listing.sellerId !== context.user.id && !context.user.isAdmin) {
        throw new GraphQLError('Access denied', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      await context.services.marketplaceService.cancelListing(listingId, context.user.id);

      // Invalidate caches
      await context.cache.delete(`listing:${listingId}`);
      await context.cache.invalidatePattern('marketplaceListings:*');

      return true;
    }),

    purchaseWithBTC: withErrorHandling(async (
      _: any,
      { listingId, buyerWallet }: { listingId: string; buyerWallet: string },
      context: Context
    ) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const listing = await context.services.marketplaceService.getListing(listingId);
      
      if (!listing) {
        throw new GraphQLError('Listing not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      if (listing.status !== 'ACTIVE') {
        throw new GraphQLError('Listing is not active', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      if (listing.sellerId === context.user.id) {
        throw new GraphQLError('Cannot purchase your own listing', {
          extensions: { code: 'INVALID_INPUT' }
        });
      }

      const transaction = await context.services.marketplaceService.purchaseWithBTC(
        listingId,
        buyerWallet
      );

      // Invalidate caches
      await context.cache.delete(`listing:${listingId}`);
      await context.cache.invalidatePattern('marketplaceListings:*');
      await context.cache.invalidatePattern(`transactions:${context.user.id}*`);

      // Publish subscription events
      context.pubsub.publish(`LISTING_PURCHASED:${listing.sellerId}`, {
        listingPurchased: transaction
      });

      return transaction;
    }),
  },

  Subscription: {
    listingCreated: {
      subscribe: withErrorHandling(async (
        _: any,
        { gameId }: { gameId?: string },
        context: Context
      ) => {
        const topic = gameId ? `LISTING_CREATED:${gameId}` : 'LISTING_CREATED';
        return context.pubsub.asyncIterator(topic);
      }),
    },

    listingPurchased: {
      subscribe: withErrorHandling(async (
        _: any,
        { sellerId }: { sellerId?: string },
        context: Context
      ) => {
        if (!context.user) {
          throw new GraphQLError('Authentication required', {
            extensions: { code: 'UNAUTHENTICATED' }
          });
        }

        const topic = sellerId ? `LISTING_PURCHASED:${sellerId}` : `LISTING_PURCHASED:${context.user.id}`;
        return context.pubsub.asyncIterator(topic);
      }),
    },
  },

  // Type resolvers
  MarketplaceListing: {
    seller: async (parent: MarketplaceListing, _: any, context: Context) => {
      return withCache(
        `profile:${parent.sellerId}`,
        () => context.services.profileService.getProfile(parent.sellerId),
        300
      );
    },

    asset: async (parent: MarketplaceListing, _: any, context: Context) => {
      // Asset should already be included in the listing
      return parent.asset;
    },
  },

  Transaction: {
    asset: async (parent: Transaction, _: any, context: Context) => {
      // Asset should already be included in the transaction
      return parent.asset;
    },
  },
};