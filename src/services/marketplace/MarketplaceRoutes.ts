/**
 * Marketplace Routes
 * Defines HTTP endpoints for marketplace operations
 */

import { Router } from 'express';
import { MarketplaceController } from './MarketplaceController';

export function createMarketplaceRoutes(controller: MarketplaceController): Router {
  const router = Router();

  // Create a new listing
  router.post('/listings', controller.createListing.bind(controller));

  // Get all listings with optional filters
  router.get('/listings', controller.getListings.bind(controller));

  // Get a specific listing by ID
  router.get('/listings/:listingId', controller.getListing.bind(controller));

  // Purchase an asset with Bitcoin
  router.post('/listings/:listingId/purchase', controller.purchaseWithBTC.bind(controller));

  // Cancel a listing
  router.delete('/listings/:listingId', controller.cancelListing.bind(controller));

  return router;
}