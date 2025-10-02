import { gql } from '@apollo/client';

export const GET_MARKETPLACE_LISTINGS = gql`
  query GetMarketplaceListings($filters: SearchFilters) {
    getMarketplaceListings(filters: $filters) {
      listingId
      sellerId
      sellerName
      asset {
        id
        gameId
        gameName
        tokenId
        contractAddress
        assetType
        metadata {
          name
          description
          image
          attributes {
            trait_type
            value
          }
        }
        rarity
        estimatedValue
      }
      priceInBTC
      priceInStarknet
      status
      createdAt
      expiresAt
    }
  }
`;

export const GET_USER_TRANSACTIONS = gql`
  query GetUserTransactions($userId: ID!) {
    getUserTransactions(userId: $userId) {
      id
      type
      buyerId
      sellerId
      asset {
        id
        gameId
        gameName
        metadata {
          name
          description
          image
        }
        assetType
        rarity
      }
      btcAmount
      starknetAmount
      status
      txHash
      createdAt
      completedAt
      errorMessage
    }
  }
`;

export const CREATE_LISTING_MUTATION = gql`
  mutation CreateListing($assetId: ID!, $priceInBTC: Float!) {
    createListing(assetId: $assetId, priceInBTC: $priceInBTC) {
      listingId
      status
      createdAt
    }
  }
`;

export const PURCHASE_ASSET_MUTATION = gql`
  mutation PurchaseAsset($listingId: ID!, $walletAddress: String!) {
    purchaseAsset(listingId: $listingId, walletAddress: $walletAddress) {
      transactionId
      status
      txHash
      estimatedConfirmationTime
    }
  }
`;

export const CANCEL_LISTING_MUTATION = gql`
  mutation CancelListing($listingId: ID!) {
    cancelListing(listingId: $listingId) {
      success
      message
    }
  }
`;