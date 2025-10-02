import { gql } from '@apollo/client';

export const GET_FRIENDS = gql`
  query GetFriends($playerId: ID!) {
    getFriends(playerId: $playerId) {
      friendId
      playerId
      displayName
      avatar
      status
      lastSeen
      mutualFriends
      gamesInCommon
      addedAt
    }
  }
`;

export const GET_FRIEND_REQUESTS = gql`
  query GetFriendRequests($playerId: ID!) {
    getFriendRequests(playerId: $playerId) {
      requestId
      fromPlayerId
      fromPlayerName
      fromPlayerAvatar
      toPlayerId
      message
      status
      createdAt
    }
  }
`;

export const GET_COMMUNITY_QUESTS = gql`
  query GetCommunityQuests {
    getCommunityQuests {
      questId
      title
      description
      gameId
      gameName
      type
      difficulty
      requirements {
        type
        description
        target
        current
      }
      rewards {
        type
        name
        description
        value
        rarity
      }
      participants
      maxParticipants
      progress
      status
      startDate
      endDate
      createdBy
    }
  }
`;

export const GET_PLAYER_SUGGESTIONS = gql`
  query GetPlayerSuggestions($playerId: ID!) {
    getPlayerSuggestions(playerId: $playerId) {
      playerId
      displayName
      avatar
      mutualFriends
      gamesInCommon
      recentAchievements
      matchScore
      reason
    }
  }
`;

export const SEND_FRIEND_REQUEST_MUTATION = gql`
  mutation SendFriendRequest($targetPlayerId: ID!, $message: String) {
    sendFriendRequest(targetPlayerId: $targetPlayerId, message: $message) {
      requestId
      status
      createdAt
    }
  }
`;

export const RESPOND_TO_FRIEND_REQUEST_MUTATION = gql`
  mutation RespondToFriendRequest($requestId: ID!, $accept: Boolean!) {
    respondToFriendRequest(requestId: $requestId, accept: $accept) {
      success
      message
    }
  }
`;

export const JOIN_QUEST_MUTATION = gql`
  mutation JoinQuest($questId: ID!) {
    joinQuest(questId: $questId) {
      success
      message
      participation {
        questId
        playerId
        joinedAt
        progress {
          type
          description
          target
          current
        }
      }
    }
  }
`;

export const FRIEND_STATUS_UPDATES = gql`
  subscription FriendStatusUpdates($playerId: ID!) {
    friendStatusChanged(playerId: $playerId) {
      friendId
      status
      lastSeen
    }
  }
`;