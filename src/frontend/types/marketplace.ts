export interface MarketplaceListing {
  listingId: string;
  sellerId: string;
  sellerName: string;
  asset: MarketplaceAsset;
  priceInBTC: number;
  priceInStarknet?: number;
  status: ListingStatus;
  createdAt: string;
  expiresAt?: string;
}

export interface MarketplaceAsset {
  id: string;
  gameId: string;
  gameName: string;
  tokenId: string;
  contractAddress: string;
  assetType: 'NFT' | 'CURRENCY' | 'ITEM';
  metadata: AssetMetadata;
  owner: string;
  tradeable: boolean;
  estimatedValue?: number;
  rarity?: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
}

export interface AssetMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

export type ListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED';

export interface MarketplaceTransaction {
  id: string;
  type: 'BUY' | 'SELL' | 'SWAP';
  buyerId: string;
  sellerId: string;
  asset: MarketplaceAsset;
  btcAmount: number;
  starknetAmount?: number;
  status: TransactionStatus;
  txHash?: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export type TransactionStatus = 
  | 'PENDING' 
  | 'CONFIRMING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'CANCELLED' 
  | 'REFUNDED';

export interface SearchFilters {
  gameId?: string | undefined;
  assetType?: string | undefined;
  rarity?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'oldest' | 'rarity' | undefined;
  searchTerm?: string | undefined;
}

export interface XverseWalletInfo {
  address: string;
  publicKey: string;
  connected: boolean;
}

export interface PaymentFlow {
  step: 'CONNECT_WALLET' | 'CONFIRM_PURCHASE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  listingId: string;
  btcAmount: number;
  walletAddress?: string;
  txHash?: string;
  errorMessage?: string;
}