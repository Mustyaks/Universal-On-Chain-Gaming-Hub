-- Universal Gaming Hub Database Schema
-- Initialize database tables for development environment

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cartridge_id VARCHAR(255) UNIQUE NOT NULL,
    wallet_address VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game profiles table
CREATE TABLE IF NOT EXISTS game_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    game_id VARCHAR(100) NOT NULL,
    game_specific_data JSONB,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, game_id)
);

-- Game assets table
CREATE TABLE IF NOT EXISTS game_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id VARCHAR(100) NOT NULL,
    token_id VARCHAR(255) NOT NULL,
    contract_address VARCHAR(255) NOT NULL,
    asset_type VARCHAR(20) CHECK (asset_type IN ('NFT', 'CURRENCY', 'ITEM')),
    metadata JSONB,
    owner_address VARCHAR(255) NOT NULL,
    tradeable BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id VARCHAR(100) NOT NULL,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    achievement_type VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    rarity VARCHAR(20) CHECK (rarity IN ('COMMON', 'RARE', 'EPIC', 'LEGENDARY')),
    nft_badge_id VARCHAR(255),
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Marketplace listings table
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id VARCHAR(255) UNIQUE NOT NULL,
    seller_id UUID REFERENCES players(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES game_assets(id) ON DELETE CASCADE,
    price_btc DECIMAL(18, 8) NOT NULL,
    price_starknet DECIMAL(18, 8),
    status VARCHAR(20) CHECK (status IN ('ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(10) CHECK (transaction_type IN ('BUY', 'SELL', 'SWAP')),
    buyer_id UUID REFERENCES players(id),
    seller_id UUID REFERENCES players(id),
    asset_id UUID REFERENCES game_assets(id),
    btc_amount DECIMAL(18, 8),
    starknet_amount DECIMAL(18, 8),
    status VARCHAR(20) CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'FAILED', 'REFUNDED')),
    tx_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Social connections table
CREATE TABLE IF NOT EXISTS social_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    friend_id UUID REFERENCES players(id) ON DELETE CASCADE,
    status VARCHAR(20) CHECK (status IN ('PENDING', 'ACCEPTED', 'BLOCKED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, friend_id)
);

-- Community quests table
CREATE TABLE IF NOT EXISTS community_quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    requirements JSONB,
    rewards JSONB,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    status VARCHAR(20) CHECK (status IN ('ACTIVE', 'COMPLETED', 'EXPIRED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quest participants table
CREATE TABLE IF NOT EXISTS quest_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_id UUID REFERENCES community_quests(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    UNIQUE(quest_id, player_id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    notification_type VARCHAR(20) CHECK (notification_type IN ('ACHIEVEMENT', 'FRIEND_REQUEST', 'TRANSACTION', 'QUEST', 'SYSTEM')),
    title VARCHAR(200) NOT NULL,
    message TEXT,
    data JSONB,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_players_cartridge_id ON players(cartridge_id);
CREATE INDEX IF NOT EXISTS idx_players_wallet_address ON players(wallet_address);
CREATE INDEX IF NOT EXISTS idx_game_profiles_player_game ON game_profiles(player_id, game_id);
CREATE INDEX IF NOT EXISTS idx_game_assets_owner ON game_assets(owner_address);
CREATE INDEX IF NOT EXISTS idx_game_assets_game_id ON game_assets(game_id);
CREATE INDEX IF NOT EXISTS idx_achievements_player_id ON achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_achievements_game_id ON achievements(game_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer_id ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_player_id ON social_connections(player_id);
CREATE INDEX IF NOT EXISTS idx_notifications_player_id ON notifications(player_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(player_id, read) WHERE read = false;