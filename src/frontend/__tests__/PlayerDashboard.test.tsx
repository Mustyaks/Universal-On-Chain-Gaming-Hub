import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { BrowserRouter } from 'react-router-dom';
import PlayerDashboard from '../components/dashboard/PlayerDashboard';
import { GET_DASHBOARD_DATA } from '../graphql/queries';

const mockDashboardData = {
  profile: {
    playerId: 'test-player',
    cartridgeId: 'test-cartridge',
    displayName: 'Test Player',
    avatar: 'https://example.com/avatar.jpg',
    totalAchievements: 15,
    createdAt: '2024-01-01T00:00:00Z',
    socialSettings: {
      profileVisibility: 'PUBLIC',
      showAchievements: true,
      showAssets: true,
      allowFriendRequests: true
    }
  },
  recentAchievements: [
    {
      id: 'achievement-1',
      gameId: 'game-1',
      gameName: 'Test Game',
      title: 'First Victory',
      description: 'Win your first match',
      rarity: 'COMMON',
      earnedAt: '2024-01-15T10:00:00Z',
      icon: 'trophy'
    }
  ],
  gameStatistics: [
    {
      gameId: 'game-1',
      gameName: 'Test Game',
      hoursPlayed: 25.5,
      level: 10,
      experience: 1500,
      rank: 'Silver',
      lastPlayed: '2024-01-15T18:00:00Z'
    }
  ],
  assetSummary: {
    totalValue: 0.05,
    totalAssets: 3,
    byGame: [
      {
        gameId: 'game-1',
        gameName: 'Test Game',
        assetCount: 3,
        totalValue: 0.05
      }
    ]
  },
  progressData: [
    {
      gameId: 'game-1',
      gameName: 'Test Game',
      progress: 75,
      nextMilestone: 'Reach Level 15'
    }
  ]
};

const mocks = [
  {
    request: {
      query: GET_DASHBOARD_DATA,
      variables: {
        playerId: 'test-player'
      }
    },
    result: {
      data: {
        getDashboardData: mockDashboardData
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

describe('PlayerDashboard', () => {
  it('renders loading state initially', () => {
    renderWithProviders(<PlayerDashboard playerId="test-player" />);
    
    // Check for loading spinner by class name since it doesn't have text
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders dashboard data after loading', async () => {
    renderWithProviders(<PlayerDashboard playerId="test-player" />);
    
    await waitFor(() => {
      expect(screen.getByText('Gaming Dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Achievements')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Total Assets')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('displays recent achievements', async () => {
    renderWithProviders(<PlayerDashboard playerId="test-player" />);
    
    await waitFor(() => {
      expect(screen.getByText('Recent Achievements')).toBeInTheDocument();
    });

    expect(screen.getByText('First Victory')).toBeInTheDocument();
    expect(screen.getByText('Win your first match')).toBeInTheDocument();
  });

  it('shows game progress information', async () => {
    renderWithProviders(<PlayerDashboard playerId="test-player" />);
    
    await waitFor(() => {
      expect(screen.getByText('Game Progress Details')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Test Game')).toHaveLength(2); // Appears in multiple places
    expect(screen.getByText('Level 10')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });
});