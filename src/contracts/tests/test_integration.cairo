use starknet::{ContractAddress, contract_address_const};
use snforge_std::{declare, ContractClassTrait, start_prank, stop_prank, CheatTarget};

use super::super::marketplace::UniversalMarketplace;
use super::super::achievements::AchievementBadges;
use super::super::interfaces::IUniversalMarketplace::{
    IUniversalMarketplaceDispatcher, IUniversalMarketplaceDispatcherTrait
};
use super::super::interfaces::IAchievementBadges::{
    IAchievementBadgesDispatcher, IAchievementBadgesDispatcherTrait
};
use super::super::interfaces::IERC721::{IERC721Dispatcher, IERC721DispatcherTrait};

fn setup_integration() -> (
    IUniversalMarketplaceDispatcher,
    IAchievementBadgesDispatcher,
    ContractAddress,
    ContractAddress,
    ContractAddress
) {
    let owner = contract_address_const::<'owner'>();
    let seller = contract_address_const::<'seller'>();
    let buyer = contract_address_const::<'buyer'>();

    // Deploy AchievementBadges contract
    let badges_class = declare("AchievementBadges");
    let mut badges_constructor = ArrayTrait::new();
    badges_constructor.append('GameBadges');
    badges_constructor.append('BADGE');
    badges_constructor.append(owner.into());
    badges_constructor.append('https://api.example.com/');
    
    let badges_address = badges_class.deploy(@badges_constructor).unwrap();
    let badges = IAchievementBadgesDispatcher { contract_address: badges_address };

    // Deploy marketplace contract
    let marketplace_class = declare("UniversalMarketplace");
    let mut marketplace_constructor = ArrayTrait::new();
    marketplace_constructor.append(owner.into());
    let marketplace_address = marketplace_class.deploy(@marketplace_constructor).unwrap();
    let marketplace = IUniversalMarketplaceDispatcher { contract_address: marketplace_address };

    // Authorize marketplace as minter for badges (for trading rewards)
    start_prank(CheatTarget::One(badges_address), owner);
    let badges_owner = super::AchievementBadges::OwnerDispatcher { contract_address: badges_address };
    badges_owner.authorize_minter(marketplace_address);
    badges_owner.authorize_minter(owner); // Keep owner as minter too
    stop_prank(CheatTarget::One(badges_address));

    (marketplace, badges, owner, seller, buyer)
}

#[test]
fn test_trading_achievement_badges() {
    let (marketplace, badges, owner, seller, buyer) = setup_integration();

    // Step 1: Mint achievement badge to seller
    start_prank(CheatTarget::One(badges.contract_address), owner);
    let badge_id = badges.mint_achievement_badge(
        seller,
        'game1',
        'rare_item_found',
        3, // Epic rarity
        'rare_item_metadata'
    );
    stop_prank(CheatTarget::One(badges.contract_address));

    // Step 2: Seller approves marketplace to transfer their badge
    let badges_erc721 = IERC721Dispatcher { contract_address: badges.contract_address };
    start_prank(CheatTarget::One(badges.contract_address), seller);
    badges_erc721.approve(marketplace.contract_address, badge_id);
    stop_prank(CheatTarget::One(badges.contract_address));

    // Step 3: Seller creates listing for their achievement badge
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id = marketplace.create_listing(
        badges.contract_address,
        badge_id,
        5000000, // 0.05 BTC in satoshis
        500000000000000000, // 0.5 ETH in wei
    );
    stop_prank(CheatTarget::One(marketplace.contract_address));

    // Step 4: Verify listing was created correctly
    let listing = marketplace.get_listing(listing_id);
    assert(listing.seller == seller, 'Invalid seller');
    assert(listing.asset_contract == badges.contract_address, 'Invalid asset contract');
    assert(listing.token_id == badge_id, 'Invalid token ID');
    assert(listing.active == true, 'Listing should be active');

    // Step 5: Buyer initiates purchase
    start_prank(CheatTarget::One(marketplace.contract_address), buyer);
    let tx_id = marketplace.purchase_with_btc(listing_id);
    stop_prank(CheatTarget::One(marketplace.contract_address));

    // Step 6: Verify transaction was created
    let transaction = marketplace.get_transaction(tx_id);
    assert(transaction.buyer == buyer, 'Invalid buyer');
    assert(transaction.seller == seller, 'Invalid seller');
    assert(transaction.asset_contract == badges.contract_address, 'Invalid asset contract');
    assert(transaction.token_id == badge_id, 'Invalid token ID');
    assert(transaction.payment_type == 'BTC', 'Invalid payment type');
    assert(!transaction.completed, 'Transaction should not be completed yet');

    // Step 7: Owner completes the transaction (simulating successful payment)
    start_prank(CheatTarget::One(marketplace.contract_address), owner);
    marketplace.complete_transaction(tx_id);
    stop_prank(CheatTarget::One(marketplace.contract_address));

    // Step 8: Verify badge ownership transferred
    assert(badges_erc721.owner_of(badge_id) == buyer, 'Badge should belong to buyer');
    assert(badges_erc721.balance_of(seller) == 0, 'Seller should have 0 badges');
    assert(badges_erc721.balance_of(buyer) == 1, 'Buyer should have 1 badge');

    // Step 9: Verify transaction is marked as completed
    let completed_transaction = marketplace.get_transaction(tx_id);
    assert(completed_transaction.completed, 'Transaction should be completed');

    // Step 10: Verify listing is deactivated
    assert(!marketplace.is_listing_active(listing_id), 'Listing should be inactive');
}

#[test]
fn test_marketplace_trading_rewards() {
    let (marketplace, badges, owner, seller, buyer) = setup_integration();

    // Mint initial badge to seller
    start_prank(CheatTarget::One(badges.contract_address), owner);
    let badge_id = badges.mint_achievement_badge(
        seller,
        'game1',
        'legendary_weapon',
        4, // Legendary rarity
        'legendary_metadata'
    );
    stop_prank(CheatTarget::One(badges.contract_address));

    // Complete a successful trade (abbreviated steps)
    let badges_erc721 = IERC721Dispatcher { contract_address: badges.contract_address };
    start_prank(CheatTarget::One(badges.contract_address), seller);
    badges_erc721.approve(marketplace.contract_address, badge_id);
    stop_prank(CheatTarget::One(badges.contract_address));

    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id = marketplace.create_listing(
        badges.contract_address,
        badge_id,
        10000000, // 0.1 BTC
        1000000000000000000, // 1 ETH
    );
    stop_prank(CheatTarget::One(marketplace.contract_address));

    start_prank(CheatTarget::One(marketplace.contract_address), buyer);
    let tx_id = marketplace.purchase_with_starknet(listing_id);
    stop_prank(CheatTarget::One(marketplace.contract_address));

    start_prank(CheatTarget::One(marketplace.contract_address), owner);
    marketplace.complete_transaction(tx_id);
    stop_prank(CheatTarget::One(marketplace.contract_address));

    // Award trading achievement badges
    start_prank(CheatTarget::One(badges.contract_address), marketplace.contract_address);
    
    // Award "First Sale" badge to seller
    let seller_badge_id = badges.mint_achievement_badge(
        seller,
        'marketplace',
        'first_sale',
        2, // Rare
        'first_sale_metadata'
    );

    // Award "First Purchase" badge to buyer  
    let buyer_badge_id = badges.mint_achievement_badge(
        buyer,
        'marketplace',
        'first_purchase',
        2, // Rare
        'first_purchase_metadata'
    );
    
    stop_prank(CheatTarget::One(badges.contract_address));

    // Verify both users received their trading badges
    assert(badges_erc721.owner_of(seller_badge_id) == seller, 'Seller should own trading badge');
    assert(badges_erc721.owner_of(buyer_badge_id) == buyer, 'Buyer should own trading badge');
    
    // Verify achievement tracking
    assert(badges.is_achievement_earned(seller, 'marketplace', 'first_sale'), 'Seller first sale not tracked');
    assert(badges.is_achievement_earned(buyer, 'marketplace', 'first_purchase'), 'Buyer first purchase not tracked');

    // Check badge counts
    assert(badges_erc721.balance_of(seller) == 1, 'Seller should have 1 badge (trading badge)');
    assert(badges_erc721.balance_of(buyer) == 2, 'Buyer should have 2 badges (original + trading badge)');
}

#[test]
fn test_cross_game_badge_trading() {
    let (marketplace, badges, owner, seller, buyer) = setup_integration();

    // Mint badges from different games
    start_prank(CheatTarget::One(badges.contract_address), owner);
    
    let game1_badge = badges.mint_achievement_badge(
        seller,
        'dojo_chess',
        'grandmaster',
        4, // Legendary
        'chess_grandmaster_metadata'
    );
    
    let game2_badge = badges.mint_achievement_badge(
        seller,
        'dojo_racing',
        'speed_demon',
        3, // Epic
        'racing_speed_metadata'
    );
    
    let game3_badge = badges.mint_achievement_badge(
        buyer,
        'dojo_rpg',
        'dragon_slayer',
        4, // Legendary
        'rpg_dragon_metadata'
    );
    
    stop_prank(CheatTarget::One(badges.contract_address));

    // Verify badges are from different games
    let badge1 = badges.get_badge(game1_badge);
    let badge2 = badges.get_badge(game2_badge);
    let badge3 = badges.get_badge(game3_badge);
    
    assert(badge1.game_id == 'dojo_chess', 'Invalid game1 ID');
    assert(badge2.game_id == 'dojo_racing', 'Invalid game2 ID');
    assert(badge3.game_id == 'dojo_rpg', 'Invalid game3 ID');

    // Test that badges can be traded across games
    let badges_erc721 = IERC721Dispatcher { contract_address: badges.contract_address };
    
    // Seller lists chess badge
    start_prank(CheatTarget::One(badges.contract_address), seller);
    badges_erc721.approve(marketplace.contract_address, game1_badge);
    stop_prank(CheatTarget::One(badges.contract_address));

    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id = marketplace.create_listing(
        badges.contract_address,
        game1_badge,
        20000000, // 0.2 BTC for legendary badge
        2000000000000000000, // 2 ETH
    );
    stop_prank(CheatTarget::One(marketplace.contract_address));

    // Buyer (who has RPG badge) purchases chess badge
    start_prank(CheatTarget::One(marketplace.contract_address), buyer);
    let tx_id = marketplace.purchase_with_btc(listing_id);
    stop_prank(CheatTarget::One(marketplace.contract_address));

    start_prank(CheatTarget::One(marketplace.contract_address), owner);
    marketplace.complete_transaction(tx_id);
    stop_prank(CheatTarget::One(marketplace.contract_address));

    // Verify cross-game ownership
    assert(badges_erc721.owner_of(game1_badge) == buyer, 'Buyer should own chess badge');
    assert(badges_erc721.owner_of(game3_badge) == buyer, 'Buyer should still own RPG badge');
    
    // Buyer now has badges from 2 different games
    let buyer_badges = badges.get_player_badges(buyer);
    assert(buyer_badges.len() == 2, 'Buyer should have 2 badges from different games');

    // Verify game-specific badge queries
    let chess_badges = badges.get_game_badges('dojo_chess');
    let rpg_badges = badges.get_game_badges('dojo_rpg');
    
    assert(chess_badges.len() == 1, 'Should have 1 chess badge');
    assert(rpg_badges.len() == 1, 'Should have 1 RPG badge');
}

#[test]
fn test_rarity_based_pricing() {
    let (marketplace, badges, owner, seller, buyer) = setup_integration();

    // Mint badges of different rarities
    start_prank(CheatTarget::One(badges.contract_address), owner);
    
    let common_badge = badges.mint_achievement_badge(
        seller,
        'game1',
        'first_step',
        1, // Common
        'common_metadata'
    );
    
    let legendary_badge = badges.mint_achievement_badge(
        seller,
        'game1',
        'ultimate_champion',
        4, // Legendary
        'legendary_metadata'
    );
    
    stop_prank(CheatTarget::One(badges.contract_address));

    let badges_erc721 = IERC721Dispatcher { contract_address: badges.contract_address };
    
    // Approve both badges for trading
    start_prank(CheatTarget::One(badges.contract_address), seller);
    badges_erc721.approve(marketplace.contract_address, common_badge);
    badges_erc721.approve(marketplace.contract_address, legendary_badge);
    stop_prank(CheatTarget::One(badges.contract_address));

    // List common badge at lower price
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let common_listing = marketplace.create_listing(
        badges.contract_address,
        common_badge,
        100000, // 0.001 BTC
        10000000000000000, // 0.01 ETH
    );

    // List legendary badge at higher price
    let legendary_listing = marketplace.create_listing(
        badges.contract_address,
        legendary_badge,
        50000000, // 0.5 BTC
        5000000000000000000, // 5 ETH
    );
    stop_prank(CheatTarget::One(marketplace.contract_address));

    // Verify pricing reflects rarity
    let common_listing_data = marketplace.get_listing(common_listing);
    let legendary_listing_data = marketplace.get_listing(legendary_listing);
    
    assert(legendary_listing_data.price_btc > common_listing_data.price_btc, 'Legendary should cost more BTC');
    assert(legendary_listing_data.price_starknet > common_listing_data.price_starknet, 'Legendary should cost more STRK');

    // Verify rarity counts
    assert(badges.get_rarity_count(1) == 1, 'Should have 1 common badge');
    assert(badges.get_rarity_count(4) == 1, 'Should have 1 legendary badge');
    
    let legendary_badges = badges.get_badges_by_rarity(4);
    assert(legendary_badges.len() == 1, 'Should find 1 legendary badge');
    assert(*legendary_badges.at(0) == legendary_badge, 'Should find correct legendary badge');
}