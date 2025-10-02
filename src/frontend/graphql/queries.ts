import { gql } from '@apollo/client';

export const GET_DASHBOARD_DATA = gql`
  query GetDashboardData($playerId: ID!) {
    getDashboardData(playerId: $playerId) {
      profile {
        playerId
        cartridgeId
        displayName
        avatar
        totalAchievements
        createdAt
        socialSettings {
          profileVisibility
          showAchievements
          showAssets
          allowFriendRequests
        }
      }
      recentAchievements {
        id
        gameId
        gameName
        title
        description
        rarity
        earnedAt
        icon
      }
      gameStatistics {
        gameId
        gameName
        hoursPlayed
        level
        experience
        rank
        lastPlayed
      }
      assetSummary {
        totalValue
        totalAssets
        byGame {
          gameId
          gameName
          assetCount
          totalValue
        }
      }
      progressData {
        gameId
        gameName
        progress
        nextMilestone
      }
    }
  }
`;

export const ACHIEVEMENT_UPDATES = gql`
  subscription AchievementUpdates($playerId: ID!) {
    achievementEarned(playerId: $playerId) {
      id
      gameId
      gameName
      title
      description
      rarity
      earnedAt
      icon
    }
  }
`;

export const GET_PLAYER_PROFILE = gql`
  query GetPlayerProfile($playerId: ID!) {
    getPlayerProfile(playerId: $playerId) {
      playerId
      cartridgeId
      displayName
      avatar
      totalAchievements
      crossGameAssets {
        id
        gameId
        gameName
        assetType
        metadata {
          name
          description
          image
        }
        estimatedValue
      }
      createdAt
    }
  }
`;