import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { BrowserRouter } from 'react-router-dom';
import Marketplace from '../components/marketplace/Marketplace';
import { GET_MARKETPLACE_LISTINGS, GET_USER_TRANSACTIONS } from '../graphql/marketplaceQueries';

const mockListings = [
  {
    listingId: 'listing-1',
    sellerId: 'seller-1',
    sellerName: 'Test Seller',
    asset: {
      id: 'asset-1',
      gameId: 'game-1',
      gameName: 'Test Game',
      tokenId: '123',
      contractAddress: '0x123',
      assetType: 'NFT',
      metadata: {
        name: 'Rare Sword',
        description: 'A powerful weapon',
        image: 'https://example.com/sword.jpg',
        attributes: [
          { trait_type: 'Attack', value: 100 },
          { trait_type: 'Durability', value: 95 }
        ]
      },
      rarity: 'RARE',
      estimatedValue: 150
    },
    priceInBTC: 0.001,
    status: 'ACTIVE',
    createdAt: '2024-01-15T10:00:00Z'
  }
];

const mockTransactions = [
  {
    id: 'tx-1',
    type: 'BUY',
    buyerId: 'user-1',
    sellerId: 'seller-1',
    asset: {
      id: 'asset-1',
      gameId: 'game-1',
      gameName: 'Test Game',
      metadata: {
        name: 'Rare Sword',
        description: 'A powerful weapon',
        image: 'https://example.com/sword.jpg'
      },
      assetType: 'NFT',
      rarity: 'RARE'
    },
    btcAmount: 0.001,
    status: 'COMPLETED',
    txHash: 'tx_hash_123',
    createdAt: '2024-01-15T12:00:00Z',
    completedAt: '2024-01-15T12:30:00Z'
  }
];

const mocks = [
  {
    request: {
      query: GET_MARKETPLACE_LISTINGS,
      variables: { filters: {} }
    },
    result: {
      data: {
        getMarketplaceListings: mockListings
      }
    }
  },
  {
    request: {
      query: GET_USER_TRANSACTIONS,
      variables: { userId: 'test-user' }
    },
    result: {
      data: {
        getUserTransactions: mockTransactions
      }
    }
  }
];

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </MockedProvider>
  );
};

describe('Marketplace', () => {
  it('renders marketplace layout', () => {
    renderWithProviders(<Marketplace userId="test-user" />);
    
    expect(screen.getByText('Asset Marketplace')).toBeInTheDocument();
    expect(screen.getByText('Browse Assets')).toBeInTheDocument();
    expect(screen.getByText('My Transactions')).toBeInTheDocument();
  });

  it('displays asset listings after loading', async () => {
    renderWithProviders(<Marketplace userId="test-user" />);
    
    await waitFor(() => {
      expect(screen.getByText('Rare Sword')).toBeInTheDocument();
    });

    expect(screen.getByText('Test Game')).toBeInTheDocument();
    expect(screen.getByText('0.001000')).toBeInTheDocument(); // BTC price
    expect(screen.getByText('Buy Now')).toBeInTheDocument();
  });

  it('shows transaction history when tab is clicked', async () => {
    renderWithProviders(<Marketplace userId="test-user" />);
    
    // Click on transactions tab
    fireEvent.click(screen.getByText('My Transactions'));
    
    await waitFor(() => {
      expect(screen.getByText('Transaction History')).toBeInTheDocument();
    });

    expect(screen.getByText('Purchase')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });

  it('opens purchase modal when buy now is clicked', async () => {
    renderWithProviders(<Marketplace userId="test-user" />);
    
    await waitFor(() => {
      expect(screen.getByText('Rare Sword')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Buy Now'));
    
    await waitFor(() => {
      expect(screen.getByText('Purchase Asset')).toBeInTheDocument();
    });

    expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();
  });

  it('shows wallet connection prompt when not connected', async () => {
    renderWithProviders(<Marketplace userId="test-user" />);
    
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
  });
});