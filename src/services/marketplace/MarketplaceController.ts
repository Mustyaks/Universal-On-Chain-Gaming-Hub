/**
 * Marketplace Controller
 * Handles HTTP requests for marketplace operations
 */

import { Request, Response } from 'express';
import { MarketplaceService } from './MarketplaceService';
import { ListingFilters } from '../../types/services';

export class MarketplaceController {
    constructor(private marketplaceService: MarketplaceService) { }

    async createListing(req: Request, res: Response): Promise<void> {
        try {
            const { asset, priceInBTC } = req.body;

            // Validate required fields
            if (!asset || !priceInBTC) {
                res.status(400).json({
                    success: false,
                    error: 'Asset and priceInBTC are required',
                    timestamp: Date.now()
                });
                return;
            }

            // Validate price is positive
            if (priceInBTC <= 0) {
                res.status(400).json({
                    success: false,
                    error: 'Price must be greater than 0',
                    timestamp: Date.now()
                });
                return;
            }

            const listingId = await this.marketplaceService.createListing(asset, priceInBTC);

            res.status(201).json({
                success: true,
                data: { listingId },
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            });
        }
    }

    async getListing(req: Request, res: Response): Promise<void> {
        try {
            const { listingId } = req.params;

            if (!listingId) {
                res.status(400).json({
                    success: false,
                    error: 'Listing ID is required',
                    timestamp: Date.now()
                });
                return;
            }

            const listing = await this.marketplaceService.getListing(listingId);

            res.json({
                success: true,
                data: listing,
                timestamp: Date.now()
            });
        } catch (error) {
            const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;

            res.status(statusCode).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            });
        }
    }

    async getListings(req: Request, res: Response): Promise<void> {
        try {
            const filters: ListingFilters = {
                page: req.query['page'] ? parseInt(req.query['page'] as string) : 1,
                limit: req.query['limit'] ? parseInt(req.query['limit'] as string) : 20
            };

            // Add optional filters only if they exist
            if (req.query['gameId']) {
                filters.gameId = req.query['gameId'] as string;
            }
            if (req.query['assetType']) {
                filters.assetType = req.query['assetType'] as 'NFT' | 'CURRENCY' | 'ITEM';
            }
            if (req.query['minPrice']) {
                filters.minPrice = parseFloat(req.query['minPrice'] as string);
            }
            if (req.query['maxPrice']) {
                filters.maxPrice = parseFloat(req.query['maxPrice'] as string);
            }
            if (req.query['rarity']) {
                filters.rarity = req.query['rarity'] as 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
            }

            // Validate pagination parameters
            if (filters.page && filters.page < 1) {
                res.status(400).json({
                    success: false,
                    error: 'Page must be greater than 0',
                    timestamp: Date.now()
                });
                return;
            }

            if (filters.limit && (filters.limit < 1 || filters.limit > 100)) {
                res.status(400).json({
                    success: false,
                    error: 'Limit must be between 1 and 100',
                    timestamp: Date.now()
                });
                return;
            }

            const result = await this.marketplaceService.getListings(filters);

            res.json({
                success: true,
                data: result,
                timestamp: Date.now()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            });
        }
    }

    async purchaseWithBTC(req: Request, res: Response): Promise<void> {
        try {
            const { listingId } = req.params;
            const { buyerWallet } = req.body;

            if (!listingId || !buyerWallet) {
                res.status(400).json({
                    success: false,
                    error: 'Listing ID and buyer wallet are required',
                    timestamp: Date.now()
                });
                return;
            }

            const transaction = await this.marketplaceService.purchaseWithBTC(listingId, buyerWallet);

            res.status(201).json({
                success: true,
                data: transaction,
                timestamp: Date.now()
            });
        } catch (error) {
            const statusCode = error instanceof Error &&
                (error.message.includes('not found') || error.message.includes('expired')) ? 404 : 500;

            res.status(statusCode).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            });
        }
    }

    async cancelListing(req: Request, res: Response): Promise<void> {
        try {
            const { listingId } = req.params;
            const { sellerId } = req.body;

            if (!listingId || !sellerId) {
                res.status(400).json({
                    success: false,
                    error: 'Listing ID and seller ID are required',
                    timestamp: Date.now()
                });
                return;
            }

            await this.marketplaceService.cancelListing(listingId, sellerId);

            res.json({
                success: true,
                data: { message: 'Listing cancelled successfully' },
                timestamp: Date.now()
            });
        } catch (error) {
            const statusCode = error instanceof Error &&
                (error.message.includes('not found') || error.message.includes('Only')) ? 403 : 500;

            res.status(statusCode).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            });
        }
    }
}