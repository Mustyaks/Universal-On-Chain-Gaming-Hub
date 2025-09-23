/**
 * Marketplace Service Tests
 */

import { MarketplaceService } from '../MarketplaceService';
import { DatabaseService, CacheService, EventService } from '../../../types/services';
import { GameAsset, MarketplaceListing } from '../../../types/core';

// Mock dependencies
const mockDb: jest.Mocked<DatabaseService> = {
  findOne: jest.fn(),
  findMany: jest.fn(),
  insertOne: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn()
};

const mockCache: jest.Mocked<CacheService> = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  invalidatePattern: jest.fn()
};

const mockEventService: jest.Mocked<EventService> = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
};

describe('MarketplaceService', () => {
  let marketplaceService: MarketplaceService;
  let mockAsset: GameAsset;

  beforeEach(() => {
    jest.clearAllMocks();
    marketplaceService = new MarketplaceService(mockDb, mockCache, mockEventService);

    mockAsset = {
      id: 'asset_123',
      gameId: 'game_1',
      tokenId: 'token_456',
      contractAddress: '0x123456789',
      assetType: 'NFT',
      metadata: {
        name: 'Test Asset',
        description: 'A test asset',
        image: 'https://example.com/image.png',
        attributes: [],
        rarity: 'RARE'
      },
      owner: 'owner_123',
      tradeable: true
    };
  });

  describe('createListing', () => {
    it('should create a listing successfully', async () => {
      // Mock validation checks
      mockDb.findOne.mockResolvedValueOnce(null); // No existing listing
      mockDb.insertOne.mockResolvedValueOnce('listing_id');

      const priceInBTC = 0.001;
      const listingId = await marketplaceService.createListing(mockAsset, priceInBTC);

      expect(listingId).toBeDefined();
      expect(mockDb.insertOne).toHaveBeenCalledWith('marketplace_listings', expect.objectContaining({
        sellerId: mockAsset.owner,
        asset: mockAsset,
        priceInBTC,
        status: 'ACTIVE'
      }));
      expect(mockCache.set).toHaveBeenCalled();
      expect(mockEventService.emit).toHaveBeenCalledWith('listing:created', expect.any(Object));
    });

    it('should throw error if asset is not tradeable', async () => {
      const nonTradeableAsset = { ...mockAsset, tradeable: false };

      await expect(marketplaceService.createListing(nonTradeableAsset, 0.001))
        .rejects.toThrow('Asset is not tradeable');
    });

    it('should throw error if asset is already listed', async () => {
      const existingListing = { listingId: 'existing_123', status: 'ACTIVE' };
      mockDb.findOne.mockResolvedValueOnce(existingListing);

      await expect(marketplaceService.createListing(mockAsset, 0.001))
        .rejects.toThrow('Asset is already listed for sale');
    });
  });

  describe('getListing', () => {
    it('should return listing from cache if available', async () => {
      const mockListing: MarketplaceListing = {
        listingId: 'listing_123',
        sellerId: 'seller_123',
        asset: mockAsset,
        priceInBTC: 0.001,
        status: 'ACTIVE',
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValueOnce(mockListing);

      const result = await marketplaceService.getListing('listing_123');

      expect(result).toEqual(mockListing);
      expect(mockCache.get).toHaveBeenCalledWith('listing:listing_123');
      expect(mockDb.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from database if not in cache', async () => {
      const mockListing: MarketplaceListing = {
        listingId: 'listing_123',
        sellerId: 'seller_123',
        asset: mockAsset,
        priceInBTC: 0.001,
        status: 'ACTIVE',
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValueOnce(null);
      mockDb.findOne.mockResolvedValueOnce(mockListing);

      const result = await marketplaceService.getListing('listing_123');

      expect(result).toEqual(mockListing);
      expect(mockDb.findOne).toHaveBeenCalledWith('marketplace_listings', { listingId: 'listing_123' });
      expect(mockCache.set).toHaveBeenCalledWith('listing:listing_123', mockListing, 3600);
    });

    it('should throw error if listing not found', async () => {
      mockCache.get.mockResolvedValueOnce(null);
      mockDb.findOne.mockResolvedValueOnce(null);

      await expect(marketplaceService.getListing('nonexistent'))
        .rejects.toThrow('Listing nonexistent not found');
    });
  });

  describe('getListings', () => {
    it('should return paginated listings with filters', async () => {
      const mockListings: MarketplaceListing[] = [
        {
          listingId: 'listing_1',
          sellerId: 'seller_1',
          asset: mockAsset,
          priceInBTC: 0.001,
          status: 'ACTIVE',
          createdAt: Date.now()
        }
      ];

      mockDb.findMany
        .mockResolvedValueOnce(mockListings) // For main query
        .mockResolvedValueOnce(mockListings); // For count query

      const filters = {
        gameId: 'game_1',
        assetType: 'NFT' as const,
        page: 1,
        limit: 20
      };

      const result = await marketplaceService.getListings(filters);

      expect(result.items).toEqual(mockListings);
      expect(result.total).toBe(1);
      expect(mockDb.findMany).toHaveBeenCalledWith(
        'marketplace_listings',
        expect.objectContaining({
          status: 'ACTIVE',
          'asset.gameId': 'game_1',
          'asset.assetType': 'NFT'
        }),
        expect.objectContaining({
          limit: 20,
          offset: 0,
          sort: { createdAt: -1 }
        })
      );
    });

    it('should apply price filters correctly', async () => {
      mockDb.findMany
        .mockResolvedValueOnce([]) // For main query
        .mockResolvedValueOnce([]); // For count query

      const filters = {
        minPrice: 0.001,
        maxPrice: 0.01
      };

      await marketplaceService.getListings(filters);

      expect(mockDb.findMany).toHaveBeenCalledWith(
        'marketplace_listings',
        expect.objectContaining({
          'priceInBTC': {
            $gte: 0.001,
            $lte: 0.01
          }
        }),
        expect.any(Object)
      );
    });
  });

  describe('purchaseWithBTC', () => {
    it('should create transaction for valid purchase', async () => {
      const mockListing: MarketplaceListing = {
        listingId: 'listing_123',
        sellerId: 'seller_123',
        asset: mockAsset,
        priceInBTC: 0.001,
        status: 'ACTIVE',
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValueOnce(mockListing);
      mockDb.insertOne.mockResolvedValueOnce('tx_123');

      const transaction = await marketplaceService.purchaseWithBTC('listing_123', 'buyer_wallet');

      expect(transaction.type).toBe('BUY');
      expect(transaction.buyerId).toBe('buyer_wallet');
      expect(transaction.sellerId).toBe('seller_123');
      expect(transaction.btcAmount).toBe(0.001);
      expect(transaction.status).toBe('PENDING');
      expect(mockDb.insertOne).toHaveBeenCalledWith('marketplace_transactions', expect.any(Object));
      expect(mockEventService.emit).toHaveBeenCalledWith('purchase:initiated', expect.any(Object));
    });

    it('should throw error if listing is not active', async () => {
      const inactiveListing: MarketplaceListing = {
        listingId: 'listing_123',
        sellerId: 'seller_123',
        asset: mockAsset,
        priceInBTC: 0.001,
        status: 'SOLD',
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValueOnce(inactiveListing);

      await expect(marketplaceService.purchaseWithBTC('listing_123', 'buyer_wallet'))
        .rejects.toThrow('Listing is no longer active');
    });

    it('should throw error if listing has expired', async () => {
      const expiredListing: MarketplaceListing = {
        listingId: 'listing_123',
        sellerId: 'seller_123',
        asset: mockAsset,
        priceInBTC: 0.001,
        status: 'ACTIVE',
        createdAt: Date.now(),
        expiresAt: Date.now() - 1000 // Expired 1 second ago
      };

      mockCache.get.mockResolvedValueOnce(expiredListing);

      await expect(marketplaceService.purchaseWithBTC('listing_123', 'buyer_wallet'))
        .rejects.toThrow('Listing has expired');
    });
  });

  describe('cancelListing', () => {
    it('should cancel listing successfully', async () => {
      const mockListing: MarketplaceListing = {
        listingId: 'listing_123',
        sellerId: 'seller_123',
        asset: mockAsset,
        priceInBTC: 0.001,
        status: 'ACTIVE',
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValueOnce(mockListing);

      await marketplaceService.cancelListing('listing_123', 'seller_123');

      expect(mockDb.updateOne).toHaveBeenCalledWith('marketplace_listings', 'listing_123', { status: 'CANCELLED' });
      expect(mockCache.delete).toHaveBeenCalledWith('listing:listing_123');
      expect(mockEventService.emit).toHaveBeenCalledWith('listing:cancelled', expect.any(Object));
    });

    it('should throw error if seller does not own listing', async () => {
      const mockListing: MarketplaceListing = {
        listingId: 'listing_123',
        sellerId: 'seller_123',
        asset: mockAsset,
        priceInBTC: 0.001,
        status: 'ACTIVE',
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValueOnce(mockListing);

      await expect(marketplaceService.cancelListing('listing_123', 'different_seller'))
        .rejects.toThrow('Only the seller can cancel this listing');
    });

    it('should throw error if listing is not active', async () => {
      const mockListing: MarketplaceListing = {
        listingId: 'listing_123',
        sellerId: 'seller_123',
        asset: mockAsset,
        priceInBTC: 0.001,
        status: 'SOLD',
        createdAt: Date.now()
      };

      mockCache.get.mockResolvedValueOnce(mockListing);

      await expect(marketplaceService.cancelListing('listing_123', 'seller_123'))
        .rejects.toThrow('Only active listings can be cancelled');
    });
  });
});