import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { MarketplaceListing, SearchFilters, MarketplaceTransaction } from '../types/marketplace';
import { 
  GET_MARKETPLACE_LISTINGS, 
  GET_USER_TRANSACTIONS,
  CREATE_LISTING_MUTATION,
  PURCHASE_ASSET_MUTATION 
} from '../graphql/marketplaceQueries';

export const useMarketplace = () => {
  const [filters, setFilters] = useState<SearchFilters>({});
  const [listings, setListings] = useState<MarketplaceListing[]>([]);

  const { data, loading, error, refetch } = useQuery(GET_MARKETPLACE_LISTINGS, {
    variables: { filters },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  });

  const [createListing] = useMutation(CREATE_LISTING_MUTATION);
  const [purchaseAsset] = useMutation(PURCHASE_ASSET_MUTATION);

  useEffect(() => {
    if (data?.getMarketplaceListings) {
      setListings(data.getMarketplaceListings);
    }
  }, [data]);

  const updateFilters = (newFilters: Partial<SearchFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const createNewListing = async (assetId: string, priceInBTC: number) => {
    try {
      const result = await createListing({
        variables: { assetId, priceInBTC }
      });
      await refetch();
      return result.data?.createListing;
    } catch (error) {
      console.error('Failed to create listing:', error);
      throw error;
    }
  };

  const purchaseAssetWithBTC = async (listingId: string, walletAddress: string) => {
    try {
      const result = await purchaseAsset({
        variables: { listingId, walletAddress }
      });
      await refetch();
      return result.data?.purchaseAsset;
    } catch (error) {
      console.error('Failed to purchase asset:', error);
      throw error;
    }
  };

  return {
    listings,
    loading,
    error,
    filters,
    updateFilters,
    clearFilters,
    createNewListing,
    purchaseAssetWithBTC,
    refetch
  };
};

export const useUserTransactions = (userId: string) => {
  const { data, loading, error, refetch } = useQuery(GET_USER_TRANSACTIONS, {
    variables: { userId },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  });

  const transactions: MarketplaceTransaction[] = data?.getUserTransactions || [];

  return {
    transactions,
    loading,
    error,
    refetch
  };
};