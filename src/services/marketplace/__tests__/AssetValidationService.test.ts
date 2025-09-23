/**
 * Asset Validation Service Tests
 */

import { AssetValidationService } from '../AssetValidationService';
import { DatabaseService } from '../../../types/services';
import { GameAsset } from '../../../types/core';

// Mock dependencies
const mockDb: jest.Mocked<DatabaseService> = {
  findOne: jest.fn(),
  findMany: jest.fn(),
  insertOne: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn()
};

describe('AssetValidationService', () => {
  let validationService: AssetValidationService;
  let validAsset: GameAsset;

  beforeEach(() => {
    jest.clearAllMocks();
    validationService = new AssetValidationService(mockDb);

    validAsset = {
      id: 'asset_123',
      gameId: 'game_1',
      tokenId: 'token_456',
      contractAddress: '0x123456789',
      assetType: 'NFT',
      metadata: {
        name: 'Test Asset',
        description: 'A test asset for validation',
        image: 'https://example.com/image.png',
        attributes: [
          { trait_type: 'rarity', value: 'rare' }
        ],
        rarity: 'RARE'
      },
      owner: 'owner_123',
      tradeable: true
    };
  });

  describe('validateAssetForListing', () => {
    it('should validate a correct asset successfully', async () => {
      // Mock database responses
      mockDb.findOne
        .mockResolvedValueOnce(validAsset) // Asset exists
        .mockResolvedValueOnce(null); // No existing listing

      const result = await validationService.validateAssetForListing(validAsset);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', async () => {
      const invalidAsset = {
        ...validAsset,
        id: '',
        gameId: '',
        tokenId: '',
        contractAddress: '',
        owner: ''
      };

      mockDb.findOne.mockResolvedValueOnce(null); // Asset not found

      const result = await validationService.validateAssetForListing(invalidAsset);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Asset ID is required');
      expect(result.errors).toContain('Game ID is required');
      expect(result.errors).toContain('Token ID is required');
      expect(result.errors).toContain('Contract address is required');
      expect(result.errors).toContain('Asset owner is required');
    });

    it('should return error if asset is not tradeable', async () => {
      const nonTradeableAsset = {
        ...validAsset,
        tradeable: false
      };

      const result = await validationService.validateAssetForListing(nonTradeableAsset);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Asset is not marked as tradeable');
    });

    it('should return errors for missing metadata', async () => {
      const assetWithoutMetadata = {
        ...validAsset,
        metadata: {
          name: '',
          description: '',
          image: '',
          attributes: []
        }
      };

      mockDb.findOne
        .mockResolvedValueOnce(assetWithoutMetadata)
        .mockResolvedValueOnce(null);

      const result = await validationService.validateAssetForListing(assetWithoutMetadata);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Asset name is required');
      expect(result.errors).toContain('Asset description is required');
      expect(result.errors).toContain('Asset image is required');
    });

    it('should return error if asset not found in system', async () => {
      mockDb.findOne.mockResolvedValueOnce(null); // Asset not found

      const result = await validationService.validateAssetForListing(validAsset);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Asset not found in system');
    });

    it('should return error if asset is already listed', async () => {
      const existingListing = {
        listingId: 'existing_123',
        'asset.id': validAsset.id,
        status: 'ACTIVE'
      };

      mockDb.findOne
        .mockResolvedValueOnce(validAsset) // Asset exists
        .mockResolvedValueOnce(existingListing); // Already listed

      const result = await validationService.validateAssetForListing(validAsset);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Asset is already listed for sale');
    });
  });

  describe('validateAssetOwnership', () => {
    it('should return true for correct owner', async () => {
      const result = await validationService.validateAssetOwnership(validAsset, 'owner_123');

      expect(result).toBe(true);
    });

    it('should return false for incorrect owner', async () => {
      const result = await validationService.validateAssetOwnership(validAsset, 'wrong_owner');

      expect(result).toBe(false);
    });
  });

  describe('validateAssetTransferability', () => {
    it('should return true for transferable asset', async () => {
      mockDb.findOne.mockResolvedValueOnce(null); // No pending transactions

      const result = await validationService.validateAssetTransferability(validAsset);

      expect(result).toBe(true);
    });

    it('should return false for non-tradeable asset', async () => {
      const nonTradeableAsset = {
        ...validAsset,
        tradeable: false
      };

      const result = await validationService.validateAssetTransferability(nonTradeableAsset);

      expect(result).toBe(false);
    });

    it('should return false if asset has pending transactions', async () => {
      const pendingTransaction = {
        id: 'tx_123',
        'asset.id': validAsset.id,
        status: 'PENDING'
      };

      mockDb.findOne.mockResolvedValueOnce(pendingTransaction);

      const result = await validationService.validateAssetTransferability(validAsset);

      expect(result).toBe(false);
    });
  });
});