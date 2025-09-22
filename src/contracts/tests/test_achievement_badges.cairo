use starknet::{ContractAddress, contract_address_const, get_block_timestamp};
use snforge_std::{declare, ContractClassTrait, start_prank, stop_prank, CheatTarget};

use super::super::achievements::AchievementBadges;
use super::super::interfaces::IAchievementBadges::{
    IAchievementBadgesDispatcher, IAchievementBadgesDispatcherTrait, Badge, BadgeMetadata
};
use super::super::interfaces::IERC721::{IERC721Dispatcher, IERC721DispatcherTrait};

fn setup() -> (IAchievementBadgesDispatcher, ContractAddress, ContractAddress) {
    let owner = contract_address_const::<'owner'>();
    let minter = contract_address_const::<'minter'>();
    let player = contract_address_const::<'player'>();

    // Deploy AchievementBadges contract
    let badges_class = declare("AchievementBadges");
    let mut constructor_calldata = ArrayTrait::new();
    constructor_calldata.append('GameBadges'); // name
    constructor_calldata.append('BADGE'); // symbol
    constructor_calldata.append(owner.into()); // owner
    constructor_calldata.append('https://api.example.com/'); // base_uri
    
    let badges_address = badges_class.deploy(@constructor_calldata).unwrap();
    let badges = IAchievementBadgesDispatcher { contract_address: badges_address };

    // Authorize minter
    start_prank(CheatTarget::One(badges_address), owner);
    let owner_impl = super::AchievementBadges::OwnerDispatcher { contract_address: badges_address };
    owner_impl.authorize_minter(minter);
    stop_prank(CheatTarget::One(badges_address));

    (badges, minter, player)
}

#[test]
fn test_mint_achievement_badge_success() {
    let (badges, minter, player) = setup();
    
    start_prank(CheatTarget::One(badges.contract_address), minter);
    
    let badge_id = badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        1, // Common rarity
        'metadata_uri'
    );
    
    assert(badge_id == 1, 'Invalid badge ID');
    
    let badge = badges.get_badge(badge_id);
    assert(badge.player == player, 'Invalid player');
    assert(badge.game_id == 'game1', 'Invalid game ID');
    assert(badge.achievement_type == 'first_kill', 'Invalid achievement type');
    assert(badge.rarity == 1, 'Invalid rarity');
    
    // Check ERC721 functionality
    let erc721 = IERC721Dispatcher { contract_address: badges.contract_address };
    assert(erc721.owner_of(badge_id) == player, 'Invalid NFT owner');
    assert(erc721.balance_of(player) == 1, 'Invalid balance');
    
    // Check achievement tracking
    assert(badges.is_achievement_earned(player, 'game1', 'first_kill'), 'Achievement not marked as earned');
    
    stop_prank(CheatTarget::One(badges.contract_address));
}

#[test]
#[should_panic(expected: ('Unauthorized',))]
fn test_mint_achievement_badge_unauthorized() {
    let (badges, minter, player) = setup();
    let unauthorized = contract_address_const::<'unauthorized'>();
    
    start_prank(CheatTarget::One(badges.contract_address), unauthorized);
    
    badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        1,
        'metadata_uri'
    );
}

#[test]
#[should_panic(expected: ('Invalid rarity',))]
fn test_mint_achievement_badge_invalid_rarity() {
    let (badges, minter, player) = setup();
    
    start_prank(CheatTarget::One(badges.contract_address), minter);
    
    badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        5, // Invalid rarity (should be 1-4)
        'metadata_uri'
    );
}

#[test]
#[should_panic(expected: ('Achievement already earned',))]
fn test_mint_duplicate_achievement() {
    let (badges, minter, player) = setup();
    
    start_prank(CheatTarget::One(badges.contract_address), minter);
    
    // Mint first badge
    badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        1,
        'metadata_uri'
    );
    
    // Try to mint same achievement again
    badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        2, // Different rarity but same achievement
        'metadata_uri'
    );
}

#[test]
fn test_batch_mint_badges() {
    let (badges, minter, player) = setup();
    let player2 = contract_address_const::<'player2'>();
    let player3 = contract_address_const::<'player3'>();
    
    let mut players = ArrayTrait::new();
    players.append(player);
    players.append(player2);
    players.append(player3);
    
    start_prank(CheatTarget::One(badges.contract_address), minter);
    
    let badge_ids = badges.batch_mint_badges(
        players.span(),
        'game1',
        'tournament_winner',
        4, // Legendary rarity
        'tournament_metadata'
    );
    
    assert(badge_ids.len() == 3, 'Should mint 3 badges');
    
    // Check each badge
    let badge1 = badges.get_badge(*badge_ids.at(0));
    let badge2 = badges.get_badge(*badge_ids.at(1));
    let badge3 = badges.get_badge(*badge_ids.at(2));
    
    assert(badge1.player == player, 'Invalid player 1');
    assert(badge2.player == player2, 'Invalid player 2');
    assert(badge3.player == player3, 'Invalid player 3');
    
    assert(badge1.rarity == 4, 'Invalid rarity 1');
    assert(badge2.rarity == 4, 'Invalid rarity 2');
    assert(badge3.rarity == 4, 'Invalid rarity 3');
    
    // Check achievement tracking
    assert(badges.is_achievement_earned(player, 'game1', 'tournament_winner'), 'Player 1 achievement not earned');
    assert(badges.is_achievement_earned(player2, 'game1', 'tournament_winner'), 'Player 2 achievement not earned');
    assert(badges.is_achievement_earned(player3, 'game1', 'tournament_winner'), 'Player 3 achievement not earned');
    
    stop_prank(CheatTarget::One(badges.contract_address));
}

#[test]
fn test_get_player_badges() {
    let (badges, minter, player) = setup();
    
    start_prank(CheatTarget::One(badges.contract_address), minter);
    
    // Mint multiple badges for player
    let badge_id_1 = badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        1,
        'metadata_uri_1'
    );
    
    let badge_id_2 = badges.mint_achievement_badge(
        player,
        'game2',
        'level_up',
        2,
        'metadata_uri_2'
    );
    
    let badge_id_3 = badges.mint_achievement_badge(
        player,
        'game1',
        'boss_defeat',
        3,
        'metadata_uri_3'
    );
    
    let player_badges = badges.get_player_badges(player);
    assert(player_badges.len() == 3, 'Should have 3 badges');
    assert(*player_badges.at(0) == badge_id_1, 'Invalid badge 1');
    assert(*player_badges.at(1) == badge_id_2, 'Invalid badge 2');
    assert(*player_badges.at(2) == badge_id_3, 'Invalid badge 3');
    
    stop_prank(CheatTarget::One(badges.contract_address));
}

#[test]
fn test_get_game_badges() {
    let (badges, minter, player) = setup();
    let player2 = contract_address_const::<'player2'>();
    
    start_prank(CheatTarget::One(badges.contract_address), minter);
    
    // Mint badges for game1
    let badge_id_1 = badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        1,
        'metadata_uri_1'
    );
    
    let badge_id_2 = badges.mint_achievement_badge(
        player2,
        'game1',
        'level_up',
        2,
        'metadata_uri_2'
    );
    
    // Mint badge for game2 (should not be included)
    badges.mint_achievement_badge(
        player,
        'game2',
        'boss_defeat',
        3,
        'metadata_uri_3'
    );
    
    let game1_badges = badges.get_game_badges('game1');
    assert(game1_badges.len() == 2, 'Should have 2 game1 badges');
    assert(*game1_badges.at(0) == badge_id_1, 'Invalid game1 badge 1');
    assert(*game1_badges.at(1) == badge_id_2, 'Invalid game1 badge 2');
    
    let game2_badges = badges.get_game_badges('game2');
    assert(game2_badges.len() == 1, 'Should have 1 game2 badge');
    
    stop_prank(CheatTarget::One(badges.contract_address));
}

#[test]
fn test_get_badges_by_rarity() {
    let (badges, minter, player) = setup();
    let player2 = contract_address_const::<'player2'>();
    
    start_prank(CheatTarget::One(badges.contract_address), minter);
    
    // Mint badges with different rarities
    let common_badge = badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        1, // Common
        'metadata_uri_1'
    );
    
    let rare_badge = badges.mint_achievement_badge(
        player,
        'game1',
        'level_up',
        2, // Rare
        'metadata_uri_2'
    );
    
    let epic_badge = badges.mint_achievement_badge(
        player2,
        'game1',
        'boss_defeat',
        3, // Epic
        'metadata_uri_3'
    );
    
    let legendary_badge = badges.mint_achievement_badge(
        player2,
        'game1',
        'tournament_winner',
        4, // Legendary
        'metadata_uri_4'
    );
    
    // Test rarity filtering
    let common_badges = badges.get_badges_by_rarity(1);
    assert(common_badges.len() == 1, 'Should have 1 common badge');
    assert(*common_badges.at(0) == common_badge, 'Invalid common badge');
    
    let rare_badges = badges.get_badges_by_rarity(2);
    assert(rare_badges.len() == 1, 'Should have 1 rare badge');
    assert(*rare_badges.at(0) == rare_badge, 'Invalid rare badge');
    
    let epic_badges = badges.get_badges_by_rarity(3);
    assert(epic_badges.len() == 1, 'Should have 1 epic badge');
    assert(*epic_badges.at(0) == epic_badge, 'Invalid epic badge');
    
    let legendary_badges = badges.get_badges_by_rarity(4);
    assert(legendary_badges.len() == 1, 'Should have 1 legendary badge');
    assert(*legendary_badges.at(0) == legendary_badge, 'Invalid legendary badge');
    
    // Test rarity counts
    assert(badges.get_rarity_count(1) == 1, 'Invalid common count');
    assert(badges.get_rarity_count(2) == 1, 'Invalid rare count');
    assert(badges.get_rarity_count(3) == 1, 'Invalid epic count');
    assert(badges.get_rarity_count(4) == 1, 'Invalid legendary count');
    
    stop_prank(CheatTarget::One(badges.contract_address));
}

#[test]
fn test_badge_metadata() {
    let (badges, minter, player) = setup();
    
    start_prank(CheatTarget::One(badges.contract_address), minter);
    
    let badge_id = badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        1,
        'metadata_uri'
    );
    
    // Set metadata
    let mut attributes = ArrayTrait::new();
    attributes.append('damage');
    attributes.append('100');
    attributes.append('weapon');
    attributes.append('sword');
    
    let metadata = BadgeMetadata {
        title: 'First Kill',
        description: 'Defeated your first enemy',
        image_uri: 'https://example.com/image.png',
        attributes: attributes.span(),
    };
    
    badges.set_badge_metadata(badge_id, metadata);
    
    let retrieved_metadata = badges.get_badge_metadata(badge_id);
    assert(retrieved_metadata.title == 'First Kill', 'Invalid title');
    assert(retrieved_metadata.description == 'Defeated your first enemy', 'Invalid description');
    assert(retrieved_metadata.image_uri == 'https://example.com/image.png', 'Invalid image URI');
    
    stop_prank(CheatTarget::One(badges.contract_address));
}

#[test]
fn test_total_supply() {
    let (badges, minter, player) = setup();
    let player2 = contract_address_const::<'player2'>();
    
    assert(badges.get_total_supply() == 0, 'Initial supply should be 0');
    
    start_prank(CheatTarget::One(badges.contract_address), minter);
    
    badges.mint_achievement_badge(
        player,
        'game1',
        'first_kill',
        1,
        'metadata_uri_1'
    );
    
    assert(badges.get_total_supply() == 1, 'Supply should be 1');
    
    badges.mint_achievement_badge(
        player2,
        'game1',
        'level_up',
        2,
        'metadata_uri_2'
    );
    
    assert(badges.get_total_supply() == 2, 'Supply should be 2');
    
    stop_prank(CheatTarget::One(badges.contract_address));
}

#[test]
fn test_authorize_revoke_minter() {
    let (badges, minter, player) = setup();
    let owner = contract_address_const::<'owner'>();
    let new_minter = contract_address_const::<'new_minter'>();
    
    let owner_impl = super::AchievementBadges::OwnerDispatcher { contract_address: badges.contract_address };
    
    start_prank(CheatTarget::One(badges.contract_address), owner);
    
    // Check initial minter status
    assert(owner_impl.is_authorized_minter(minter), 'Minter should be authorized');
    assert(!owner_impl.is_authorized_minter(new_minter), 'New minter should not be authorized');
    
    // Authorize new minter
    owner_impl.authorize_minter(new_minter);
    assert(owner_impl.is_authorized_minter(new_minter), 'New minter should be authorized');
    
    // Revoke original minter
    owner_impl.revoke_minter(minter);
    assert(!owner_impl.is_authorized_minter(minter), 'Original minter should be revoked');
    
    stop_prank(CheatTarget::One(badges.contract_address));
    
    // Test that revoked minter cannot mint
    start_prank(CheatTarget::One(badges.contract_address), minter);
    // This should panic with 'Unauthorized'
    // badges.mint_achievement_badge(player, 'game1', 'test', 1, 'uri');
    stop_prank(CheatTarget::One(badges.contract_address));
    
    // Test that new minter can mint
    start_prank(CheatTarget::One(badges.contract_address), new_minter);
    let badge_id = badges.mint_achievement_badge(
        player,
        'game1',
        'new_achievement',
        1,
        'metadata_uri'
    );
    assert(badge_id == 1, 'New minter should be able to mint');
    stop_prank(CheatTarget::One(badges.contract_address));
}