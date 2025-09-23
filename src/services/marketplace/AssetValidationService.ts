/**
 * Asset Validation Service
 * Handles asset verification and validation for marketplace listings
 */

import { GameAsset } from '../../types/core';
import { DatabaseService } from '../../types/services';

export class AssetValidationService {
  constructor(private db: DatabaseService) {}

  async validateAssetForListing(asset: GameAsset): Promise<ValidationResult> {
    const errors: string[] = [];

    // Basic asset validation
    if (!asset.id) {
      errors.push('Asset ID is required');
    }

    if (!asset.gameId) {
      errors.push('Game ID is required');
    }

    if (!asset.tokenId) {
      errors.push('Token ID is required');
    }

    if (!asset.contractAddress) {
      errors.push('Contract address is required');
    }

    if (!asset.owner) {
      errors.push('Asset owner is required');
    }

    if (!asset.tradeable) {
      errors.push('Asset is not marked as tradeable');
    }

    // Metadata validation
    if (!asset.metadata) {
      errors.push('Asset metadata is required');
    } else {
      if (!asset.metadata.name) {
        errors.push('Asset name is required');
      }

      if (!asset.metadata.description) {
        errors.push('Asset description is required');
      }

      if (!asset.metadata.image) {
        errors.push('Asset image is required');
      }
    }

    // Check if asset exists in our system
    const existingAsset = await this.db.findOne<GameAsset>('game_assets', {
      id: asset.id
    });

    if (!existingAsset) {
      errors.push('Asset not found in system');
    }

    // Verify asset is not already listed
    const existingListing = await this.db.findOne('marketplace_listings', {
      'asset.id': asset.id,
      status: 'ACTIVE'
    });

    if (existingListing) {
      errors.push('Asset is already listed for sale');
    }

    // On-chain validation (placeholder)
    const onChainValid = await this.validateOnChain(asset);
    if (!onChainValid.valid) {
      errors.push(...onChainValid.errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async validateAssetOwnership(asset: GameAsset, claimedOwner: string): Promise<boolean> {
    // Check database record
    if (asset.owner !== claimedOwner) {
      return false;
    }

    // Verify on-chain ownership (placeholder)
    return await this.verifyOnChainOwnership(asset, claimedOwner);
  }

  async validateAssetTransferability(asset: GameAsset): Promise<boolean> {
    // Check if asset is locked in any contracts
    const isLocked = await this.checkAssetLocked(asset);
    if (isLocked) {
      return false;
    }

    // Check if asset has any pending transactions
    const hasPendingTx = await this.checkPendingTransactions(asset);
    if (hasPendingTx) {
      return false;
    }

    return asset.tradeable;
  }

  private async validateOnChain(asset: GameAsset): Promise<ValidationResult> {
    // Placeholder for on-chain validation
    // In a real implementation, this would:
    // 1. Query the contract to verify the asset exists
    // 2. Check the current owner
    // 3. Verify the asset is not locked or frozen
    // 4. Validate metadata matches on-chain data

    try {
      // Simulate on-chain validation
      const contractExists = await this.verifyContractExists(asset.contractAddress);
      if (!contractExists) {
        return {
          valid: false,
          errors: ['Contract address does not exist']
        };
      }

      const tokenExists = await this.verifyTokenExists(asset.contractAddress, asset.tokenId);
      if (!tokenExists) {
        return {
          valid: false,
          errors: ['Token does not exist in contract']
        };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [`On-chain validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  private async verifyOnChainOwnership(_asset: GameAsset, _claimedOwner: string): Promise<boolean> {
    // Placeholder for on-chain ownership verification
    // In a real implementation, this would query the blockchain
    return true;
  }

  private async checkAssetLocked(_asset: GameAsset): Promise<boolean> {
    // Check if asset is locked in any smart contracts
    // Placeholder implementation
    return false;
  }

  private async checkPendingTransactions(asset: GameAsset): Promise<boolean> {
    const pendingTx = await this.db.findOne('marketplace_transactions', {
      'asset.id': asset.id,
      status: 'PENDING'
    });

    return !!pendingTx;
  }

  private async verifyContractExists(_contractAddress: string): Promise<boolean> {
    // Placeholder for contract existence verification
    return true;
  }

  private async verifyTokenExists(_contractAddress: string, _tokenId: string): Promise<boolean> {
    // Placeholder for token existence verification
    return true;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}