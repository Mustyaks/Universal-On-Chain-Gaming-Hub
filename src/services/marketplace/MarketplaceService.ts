/**
 * Marketplace Service Implementation
 * Handles asset listing creation, management, and trading operations
 */

import {
  MarketplaceService as IMarketplaceService,
  ListingFilters,
  SwapResult,
  DatabaseService,
  CacheService,
  EventService
} from '../../types/services';
import {
  GameAsset,
  MarketplaceListing,
  Transaction,
  PaginatedResponse,
  ListingStatus
} from '../../types/core';

export class MarketplaceService implements IMarketplaceService {
  constructor(
    private db: DatabaseService,
    private cache: CacheService,
    private eventService: EventService
  ) {}

  async createListing(asset: GameAsset, priceInBTC: number): Promise<string> {
    // Validate asset ownership and tradeability
    await this.validateAssetForListing(asset);

    const listingId = this.generateListingId();
    const listing: MarketplaceListing = {
      listingId,
      sellerId: asset.owner,
      asset,
      priceInBTC,
      status: 'ACTIVE',
      createdAt: Date.now(),
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
    };

    // Store listing in database
    await this.db.insertOne('marketplace_listings', listing);

    // Cache the listing for quick access
    await this.cache.set(`listing:${listingId}`, listing, 3600);

    // Emit listing created event
    this.eventService.emit('listing:created', { listingId, sellerId: asset.owner });

    return listingId;
  }

  async getListing(listingId: string): Promise<MarketplaceListing> {
    // Try cache first
    const cached = await this.cache.get<MarketplaceListing>(`listing:${listingId}`);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const listing = await this.db.findOne<MarketplaceListing>(
      'marketplace_listings',
      { listingId }
    );

    if (!listing) {
      throw new Error(`Listing ${listingId} not found`);
    }

    // Cache for future requests
    await this.cache.set(`listing:${listingId}`, listing, 3600);

    return listing;
  }

  async getListings(filters: ListingFilters = {}): Promise<PaginatedResponse<MarketplaceListing>> {
    const {
      gameId,
      assetType,
      minPrice,
      maxPrice,
      rarity,
      page = 1,
      limit = 20
    } = filters;

    // Build query
    const query: Record<string, any> = {
      status: 'ACTIVE'
    };

    if (gameId) {
      query['asset.gameId'] = gameId;
    }

    if (assetType) {
      query['asset.assetType'] = assetType;
    }

    if (minPrice !== undefined) {
      query['priceInBTC'] = { ...query['priceInBTC'], $gte: minPrice };
    }

    if (maxPrice !== undefined) {
      query['priceInBTC'] = { ...query['priceInBTC'], $lte: maxPrice };
    }

    if (rarity) {
      query['asset.metadata.rarity'] = rarity;
    }

    // Execute query with pagination
    const offset = (page - 1) * limit;
    const listings = await this.db.findMany<MarketplaceListing>(
      'marketplace_listings',
      query,
      {
        limit,
        offset,
        sort: { createdAt: -1 }
      }
    );

    // Get total count for pagination
    const total = await this.getListingsCount(query);

    return {
      items: listings,
      total,
      page,
      limit,
      hasNext: offset + limit < total
    };
  }

  async purchaseWithBTC(listingId: string, buyerWallet: string): Promise<Transaction> {
    const listing = await this.getListing(listingId);

    // Validate listing is still active
    if (listing.status !== 'ACTIVE') {
      throw new Error('Listing is no longer active');
    }

    // Check if listing has expired
    if (listing.expiresAt && listing.expiresAt < Date.now()) {
      await this.expireListing(listingId);
      throw new Error('Listing has expired');
    }

    // Create transaction record
    const transactionId = this.generateTransactionId();
    const transaction: Transaction = {
      id: transactionId,
      type: 'BUY',
      buyerId: buyerWallet,
      sellerId: listing.sellerId,
      asset: listing.asset,
      btcAmount: listing.priceInBTC,
      status: 'PENDING',
      txHash: '', // Will be updated when Bitcoin transaction is confirmed
      createdAt: Date.now()
    };

    // Store transaction
    await this.db.insertOne('marketplace_transactions', transaction);

    // Mark listing as pending sale
    await this.updateListingStatus(listingId, 'ACTIVE'); // Keep active until payment confirmed

    // Emit purchase initiated event
    this.eventService.emit('purchase:initiated', {
      transactionId,
      listingId,
      buyerId: buyerWallet,
      sellerId: listing.sellerId
    });

    return transaction;
  }

  async executeSwap(_btcAmount: number, _targetAsset: string): Promise<SwapResult> {
    // This method now delegates to the AtomiqService
    // In a real implementation, this would be injected as a dependency
    throw new Error('Swap functionality requires AtomiqService integration - see AtomiqService.ts');
  }

  async cancelListing(listingId: string, sellerId: string): Promise<void> {
    const listing = await this.getListing(listingId);

    // Verify ownership
    if (listing.sellerId !== sellerId) {
      throw new Error('Only the seller can cancel this listing');
    }

    // Verify listing can be cancelled
    if (listing.status !== 'ACTIVE') {
      throw new Error('Only active listings can be cancelled');
    }

    // Update listing status
    await this.updateListingStatus(listingId, 'CANCELLED');

    // Remove from cache
    await this.cache.delete(`listing:${listingId}`);

    // Emit cancellation event
    this.eventService.emit('listing:cancelled', { listingId, sellerId });
  }

  // Private helper methods
  private async validateAssetForListing(asset: GameAsset): Promise<void> {
    if (!asset.tradeable) {
      throw new Error('Asset is not tradeable');
    }

    // Verify asset ownership on-chain (placeholder for actual implementation)
    const isOwner = await this.verifyAssetOwnership(asset);
    if (!isOwner) {
      throw new Error('Asset ownership verification failed');
    }

    // Check if asset is already listed
    const existingListing = await this.db.findOne<MarketplaceListing>(
      'marketplace_listings',
      {
        'asset.id': asset.id,
        status: 'ACTIVE'
      }
    );

    if (existingListing) {
      throw new Error('Asset is already listed for sale');
    }
  }

  private async verifyAssetOwnership(_asset: GameAsset): Promise<boolean> {
    // Placeholder for on-chain verification
    // In a real implementation, this would query the blockchain
    return true;
  }

  private generateListingId(): string {
    return `listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async updateListingStatus(listingId: string, status: ListingStatus): Promise<void> {
    await this.db.updateOne('marketplace_listings', listingId, { status });
    await this.cache.delete(`listing:${listingId}`);
  }

  private async expireListing(listingId: string): Promise<void> {
    await this.updateListingStatus(listingId, 'EXPIRED');
    this.eventService.emit('listing:expired', { listingId });
  }

  private async getListingsCount(query: Record<string, any>): Promise<number> {
    // Placeholder implementation - in real scenario would use database count
    const allListings = await this.db.findMany<MarketplaceListing>(
      'marketplace_listings',
      query
    );
    return allListings.length;
  }
}