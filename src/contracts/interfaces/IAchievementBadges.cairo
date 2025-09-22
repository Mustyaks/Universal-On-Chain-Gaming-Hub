use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store)]
struct Badge {
    badge_id: u256,
    player: ContractAddress,
    game_id: felt252,
    achievement_type: felt252,
    rarity: u8, // 1=Common, 2=Rare, 3=Epic, 4=Legendary
    minted_at: u64,
    metadata_uri: felt252,
}

#[derive(Drop, Serde, starknet::Store)]
struct BadgeMetadata {
    title: felt252,
    description: felt252,
    image_uri: felt252,
    attributes: Span<felt252>,
}

#[starknet::interface]
trait IAchievementBadges<TContractState> {
    fn mint_achievement_badge(
        ref self: TContractState,
        player: ContractAddress,
        game_id: felt252,
        achievement_type: felt252,
        rarity: u8,
        metadata_uri: felt252
    ) -> u256;
    
    fn batch_mint_badges(
        ref self: TContractState,
        players: Span<ContractAddress>,
        game_id: felt252,
        achievement_type: felt252,
        rarity: u8,
        metadata_uri: felt252
    ) -> Span<u256>;
    
    fn get_badge(self: @TContractState, badge_id: u256) -> Badge;
    
    fn get_player_badges(self: @TContractState, player: ContractAddress) -> Array<u256>;
    
    fn get_game_badges(self: @TContractState, game_id: felt252) -> Array<u256>;
    
    fn get_badges_by_rarity(self: @TContractState, rarity: u8) -> Array<u256>;
    
    fn set_badge_metadata(ref self: TContractState, badge_id: u256, metadata: BadgeMetadata);
    
    fn get_badge_metadata(self: @TContractState, badge_id: u256) -> BadgeMetadata;
    
    fn is_achievement_earned(
        self: @TContractState,
        player: ContractAddress,
        game_id: felt252,
        achievement_type: felt252
    ) -> bool;
    
    fn get_total_supply(self: @TContractState) -> u256;
    
    fn get_rarity_count(self: @TContractState, rarity: u8) -> u256;
}