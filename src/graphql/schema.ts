import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  # Scalar types
  scalar Timestamp
  scalar Address

  # Enums
  enum AssetType {
    NFT
    CURRENCY
    ITEM
  }

  enum Rarity {
    COMMON
    RARE
    EPIC
    LEGENDARY
  }

  enum TransactionStatus {
    PENDING
    CONFIRMED
    COMPLETED
    FAILED
    REFUNDED
  }

  enum ListingStatus {
    ACTIVE
    SOLD
    CANCELLED
    EXPIRED
  }

  enum ProfileVisibility {
    PUBLIC
    FRIENDS_ONLY
    PRIVATE
  }

  enum QuestStatus {
    ACTIVE
    COMPLETED
    EXPIRED
  }

  enum NotificationType {
    ACHIEVEMENT
    FRIEND_REQUEST
    TRANSACTION
    QUEST
    SYSTEM
  }

  # Core Types
  type Player {
    id: ID!
    cartridgeId: String!
    walletAddress: Address!
    profile: UnifiedProfile!
    gameProfiles: [GameProfile!]!
    socialConnections: [SocialConnection!]!
  }

  type UnifiedProfile {
    playerId: ID!
    cartridgeId: String!
    displayName: String!
    avatar: String!
    totalAchievements: Int!
    crossGameAssets: [CrossGameAsset!]!
    socialSettings: SocialSettings!
    createdAt: Timestamp!
  }

  type GameProfile {
    gameId: String!
    playerId: ID!
    gameSpecificData: JSON
    lastActive: Timestamp!
  }

  type SocialSettings {
    profileVisibility: ProfileVisibility!
    showAchievements: Boolean!
    showAssets: Boolean!
    allowFriendRequests: Boolean!
  }

  type SocialConnection {
    id: ID!
    playerId: ID!
    friendId: ID!
    friend: UnifiedProfile!
    status: String!
    createdAt: Timestamp!
  }

  type GameAsset {
    id: ID!
    gameId: String!
    tokenId: String!
    contractAddress: Address!
    assetType: AssetType!
    metadata: AssetMetadata!
    owner: Address!
    tradeable: Boolean!
  }

  type AssetMetadata {
    name: String!
    description: String!
    image: String!
    attributes: [AssetAttribute!]!
    rarity: Rarity
  }

  type AssetAttribute {
    trait_type: String!
    value: String!
    display_type: String
  }

  type CrossGameAsset {
    gameId: String!
    assets: [GameAsset!]!
    totalValue: Float!
  }

  type Achievement {
    id: ID!
    gameId: String!
    playerId: ID!
    achievementType: String!
    title: String!
    description: String!
    rarity: Rarity!
    earnedAt: Timestamp!
    nftBadgeId: String
  }

  type GameStatistics {
    gameId: String!
    playerId: ID!
    playtime: Int!
    level: Int!
    score: Int!
    customStats: JSON
  }

  type Transaction {
    id: ID!
    type: String!
    buyerId: ID!
    sellerId: ID!
    asset: GameAsset!
    btcAmount: Float!
    starknetAmount: Float
    status: TransactionStatus!
    txHash: String!
    createdAt: Timestamp!
    completedAt: Timestamp
  }

  type MarketplaceListing {
    listingId: ID!
    sellerId: ID!
    seller: UnifiedProfile!
    asset: GameAsset!
    priceInBTC: Float!
    priceInStarknet: Float
    status: ListingStatus!
    createdAt: Timestamp!
    expiresAt: Timestamp
  }

  type CommunityQuest {
    id: ID!
    title: String!
    description: String!
    requirements: [QuestRequirement!]!
    rewards: [QuestReward!]!
    startDate: Timestamp!
    endDate: Timestamp!
    participants: [ID!]!
    participantProfiles: [UnifiedProfile!]!
    status: QuestStatus!
  }

  type QuestRequirement {
    type: String!
    gameId: String
    criteria: JSON!
  }

  type QuestReward {
    type: String!
    amount: Int
    metadata: AssetMetadata
  }

  type Notification {
    id: ID!
    playerId: ID!
    type: NotificationType!
    title: String!
    message: String!
    data: JSON
    read: Boolean!
    createdAt: Timestamp!
  }

  # Pagination
  type PageInfo {
    hasNext: Boolean!
    hasPrevious: Boolean!
    total: Int!
    page: Int!
    limit: Int!
  }

  type MarketplaceListingsConnection {
    items: [MarketplaceListing!]!
    pageInfo: PageInfo!
  }

  type PlayersConnection {
    items: [UnifiedProfile!]!
    pageInfo: PageInfo!
  }

  type AchievementsConnection {
    items: [Achievement!]!
    pageInfo: PageInfo!
  }

  type TransactionsConnection {
    items: [Transaction!]!
    pageInfo: PageInfo!
  }

  # Input Types
  input SocialSettingsInput {
    profileVisibility: ProfileVisibility
    showAchievements: Boolean
    showAssets: Boolean
    allowFriendRequests: Boolean
  }

  input ListingFiltersInput {
    gameId: String
    assetType: AssetType
    minPrice: Float
    maxPrice: Float
    rarity: Rarity
    page: Int = 1
    limit: Int = 20
  }

  input CreateListingInput {
    assetId: ID!
    priceInBTC: Float!
    priceInStarknet: Float
    expiresAt: Timestamp
  }

  input CreateQuestInput {
    title: String!
    description: String!
    requirements: [QuestRequirementInput!]!
    rewards: [QuestRewardInput!]!
    startDate: Timestamp!
    endDate: Timestamp!
  }

  input QuestRequirementInput {
    type: String!
    gameId: String
    criteria: JSON!
  }

  input QuestRewardInput {
    type: String!
    amount: Int
    metadata: JSON
  }

  # Custom scalar for JSON
  scalar JSON

  # Queries
  type Query {
    # Player and Profile queries
    me: Player
    player(id: ID!): Player
    profile(playerId: ID!): UnifiedProfile
    searchPlayers(query: String!, limit: Int = 10): PlayersConnection!
    
    # Asset and Achievement queries
    playerAssets(playerId: ID!, gameId: String): [GameAsset!]!
    playerAchievements(playerId: ID!, gameId: String, page: Int = 1, limit: Int = 20): AchievementsConnection!
    crossGameAssets(playerId: ID!): [CrossGameAsset!]!
    
    # Marketplace queries
    marketplaceListings(filters: ListingFiltersInput): MarketplaceListingsConnection!
    marketplaceListing(listingId: ID!): MarketplaceListing
    playerTransactions(playerId: ID!, page: Int = 1, limit: Int = 20): TransactionsConnection!
    
    # Social queries
    friends(playerId: ID!): [UnifiedProfile!]!
    friendRequests(playerId: ID!): [SocialConnection!]!
    
    # Quest queries
    activeQuests(playerId: ID): [CommunityQuest!]!
    quest(questId: ID!): CommunityQuest
    
    # Notification queries
    notifications(playerId: ID!, unreadOnly: Boolean = false): [Notification!]!
    
    # Game data queries
    gameStatistics(playerId: ID!, gameId: String!): GameStatistics
    playerGameData(playerId: ID!, gameId: String!): JSON
  }

  # Mutations
  type Mutation {
    # Profile mutations
    updateProfile(displayName: String, avatar: String, socialSettings: SocialSettingsInput): UnifiedProfile!
    
    # Social mutations
    sendFriendRequest(friendId: ID!, message: String): SocialConnection!
    acceptFriendRequest(requestId: ID!): SocialConnection!
    declineFriendRequest(requestId: ID!): Boolean!
    removeFriend(friendId: ID!): Boolean!
    
    # Marketplace mutations
    createListing(input: CreateListingInput!): MarketplaceListing!
    cancelListing(listingId: ID!): Boolean!
    purchaseWithBTC(listingId: ID!, buyerWallet: String!): Transaction!
    
    # Quest mutations
    createCommunityQuest(input: CreateQuestInput!): CommunityQuest!
    joinQuest(questId: ID!): Boolean!
    leaveQuest(questId: ID!): Boolean!
    
    # Notification mutations
    markNotificationAsRead(notificationId: ID!): Boolean!
    markAllNotificationsAsRead: Boolean!
    
    # Game integration mutations
    syncPlayerData(gameId: String): Boolean!
    registerGameAdapter(gameId: String!, gameName: String!): Boolean!
  }

  # Subscriptions
  type Subscription {
    # Real-time profile updates
    profileUpdated(playerId: ID!): UnifiedProfile!
    
    # Real-time achievement notifications
    achievementEarned(playerId: ID!): Achievement!
    
    # Real-time marketplace updates
    listingCreated(gameId: String): MarketplaceListing!
    listingPurchased(sellerId: ID): Transaction!
    
    # Real-time social notifications
    friendRequestReceived(playerId: ID!): SocialConnection!
    friendRequestAccepted(playerId: ID!): SocialConnection!
    
    # Real-time quest updates
    questJoined(questId: ID!): CommunityQuest!
    questCompleted(playerId: ID!): CommunityQuest!
    
    # Real-time notifications
    notificationReceived(playerId: ID!): Notification!
  }
`;