use starknet::{ContractAddress, contract_address_const, get_block_timestamp};
use snforge_std::{declare, ContractClassTrait, start_prank, stop_prank, CheatTarget};

use super::super::marketplace::UniversalMarketplace;
use super::super::interfaces::IUniversalMarketplace::{
    IUniversalMarketplaceDispatcher, IUniversalMarketplaceDispatcherTrait, Listing, Transaction
};
use super::super::interfaces::IERC721::{IERC721Dispatcher, IERC721DispatcherTrait};

// Mock NFT contract for testing
#[starknet::contract]
mod MockNFT {
    use starknet::{ContractAddress, get_caller_address, contract_address_const};
    use super::super::super::interfaces::IERC721::IERC721;

    #[storage]
    struct Storage {
        owners: LegacyMap<u256, ContractAddress>,
        balances: LegacyMap<ContractAddress, u256>,
        token_approvals: LegacyMap<u256, ContractAddress>,
        operator_approvals: LegacyMap<(ContractAddress, ContractAddress), bool>,
        next_token_id: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.next_token_id.write(1);
    }

    #[abi(embed_v0)]
    impl ERC721Impl of IERC721<ContractState> {
        fn balance_of(self: @ContractState, owner: ContractAddress) -> u256 {
            self.balances.read(owner)
        }

        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            self.owners.read(token_id)
        }

        fn safe_transfer_from(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            token_id: u256,
            data: Span<felt252>
        ) {
            self.transfer_from(from, to, token_id);
        }

        fn transfer_from(
            ref self: ContractState, from: ContractAddress, to: ContractAddress, token_id: u256
        ) {
            self.owners.write(token_id, to);
            self.balances.write(from, self.balances.read(from) - 1);
            self.balances.write(to, self.balances.read(to) + 1);
        }

        fn approve(ref self: ContractState, to: ContractAddress, token_id: u256) {
            self.token_approvals.write(token_id, to);
        }

        fn set_approval_for_all(ref self: ContractState, operator: ContractAddress, approved: bool) {
            let caller = get_caller_address();
            self.operator_approvals.write((caller, operator), approved);
        }

        fn get_approved(self: @ContractState, token_id: u256) -> ContractAddress {
            self.token_approvals.read(token_id)
        }

        fn is_approved_for_all(
            self: @ContractState, owner: ContractAddress, operator: ContractAddress
        ) -> bool {
            self.operator_approvals.read((owner, operator))
        }
    }

    #[abi(embed_v0)]
    impl MockNFTImpl of super::MockNFTTrait<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress) -> u256 {
            let token_id = self.next_token_id.read();
            self.next_token_id.write(token_id + 1);
            self.owners.write(token_id, to);
            self.balances.write(to, self.balances.read(to) + 1);
            token_id
        }
    }

    #[starknet::interface]
    trait MockNFTTrait<TContractState> {
        fn mint(ref self: TContractState, to: ContractAddress) -> u256;
    }
}

fn setup() -> (IUniversalMarketplaceDispatcher, IERC721Dispatcher, ContractAddress, ContractAddress) {
    let owner = contract_address_const::<'owner'>();
    let seller = contract_address_const::<'seller'>();
    let buyer = contract_address_const::<'buyer'>();

    // Deploy mock NFT contract
    let nft_class = declare("MockNFT");
    let nft_address = nft_class.deploy(@ArrayTrait::new()).unwrap();
    let nft_contract = IERC721Dispatcher { contract_address: nft_address };

    // Deploy marketplace contract
    let marketplace_class = declare("UniversalMarketplace");
    let mut constructor_calldata = ArrayTrait::new();
    constructor_calldata.append(owner.into());
    let marketplace_address = marketplace_class.deploy(@constructor_calldata).unwrap();
    let marketplace = IUniversalMarketplaceDispatcher { contract_address: marketplace_address };

    (marketplace, nft_contract, seller, buyer)
}

#[test]
fn test_create_listing_success() {
    let (marketplace, nft_contract, seller, buyer) = setup();
    
    // Mint NFT to seller
    start_prank(CheatTarget::One(nft_contract.contract_address), seller);
    let mock_nft = super::MockNFT::MockNFTDispatcher { contract_address: nft_contract.contract_address };
    let token_id = mock_nft.mint(seller);
    
    // Approve marketplace to transfer NFT
    nft_contract.approve(marketplace.contract_address, token_id);
    
    // Create listing
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id = marketplace.create_listing(
        nft_contract.contract_address,
        token_id,
        1000000, // 0.01 BTC in satoshis
        100000000000000000, // 0.1 ETH in wei
    );
    
    assert(listing_id == 1, 'Invalid listing ID');
    
    let listing = marketplace.get_listing(listing_id);
    assert(listing.seller == seller, 'Invalid seller');
    assert(listing.asset_contract == nft_contract.contract_address, 'Invalid asset contract');
    assert(listing.token_id == token_id, 'Invalid token ID');
    assert(listing.price_btc == 1000000, 'Invalid BTC price');
    assert(listing.active == true, 'Listing should be active');
    
    stop_prank(CheatTarget::One(marketplace.contract_address));
    stop_prank(CheatTarget::One(nft_contract.contract_address));
}

#[test]
#[should_panic(expected: ('Not asset owner',))]
fn test_create_listing_not_owner() {
    let (marketplace, nft_contract, seller, buyer) = setup();
    
    // Mint NFT to seller
    start_prank(CheatTarget::One(nft_contract.contract_address), seller);
    let mock_nft = super::MockNFT::MockNFTDispatcher { contract_address: nft_contract.contract_address };
    let token_id = mock_nft.mint(seller);
    stop_prank(CheatTarget::One(nft_contract.contract_address));
    
    // Try to create listing as buyer (not owner)
    start_prank(CheatTarget::One(marketplace.contract_address), buyer);
    marketplace.create_listing(
        nft_contract.contract_address,
        token_id,
        1000000,
        100000000000000000,
    );
}

#[test]
#[should_panic(expected: ('Unauthorized',))]
fn test_create_listing_not_approved() {
    let (marketplace, nft_contract, seller, buyer) = setup();
    
    // Mint NFT to seller
    start_prank(CheatTarget::One(nft_contract.contract_address), seller);
    let mock_nft = super::MockNFT::MockNFTDispatcher { contract_address: nft_contract.contract_address };
    let token_id = mock_nft.mint(seller);
    stop_prank(CheatTarget::One(nft_contract.contract_address));
    
    // Try to create listing without approving marketplace
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    marketplace.create_listing(
        nft_contract.contract_address,
        token_id,
        1000000,
        100000000000000000,
    );
}

#[test]
fn test_cancel_listing_success() {
    let (marketplace, nft_contract, seller, buyer) = setup();
    
    // Setup listing
    start_prank(CheatTarget::One(nft_contract.contract_address), seller);
    let mock_nft = super::MockNFT::MockNFTDispatcher { contract_address: nft_contract.contract_address };
    let token_id = mock_nft.mint(seller);
    nft_contract.approve(marketplace.contract_address, token_id);
    stop_prank(CheatTarget::One(nft_contract.contract_address));
    
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id = marketplace.create_listing(
        nft_contract.contract_address,
        token_id,
        1000000,
        100000000000000000,
    );
    
    // Cancel listing
    marketplace.cancel_listing(listing_id);
    
    let listing = marketplace.get_listing(listing_id);
    assert(listing.active == false, 'Listing should be inactive');
    assert(!marketplace.is_listing_active(listing_id), 'Listing should not be active');
    
    stop_prank(CheatTarget::One(marketplace.contract_address));
}

#[test]
#[should_panic(expected: ('Unauthorized',))]
fn test_cancel_listing_not_seller() {
    let (marketplace, nft_contract, seller, buyer) = setup();
    
    // Setup listing
    start_prank(CheatTarget::One(nft_contract.contract_address), seller);
    let mock_nft = super::MockNFT::MockNFTDispatcher { contract_address: nft_contract.contract_address };
    let token_id = mock_nft.mint(seller);
    nft_contract.approve(marketplace.contract_address, token_id);
    stop_prank(CheatTarget::One(nft_contract.contract_address));
    
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id = marketplace.create_listing(
        nft_contract.contract_address,
        token_id,
        1000000,
        100000000000000000,
    );
    stop_prank(CheatTarget::One(marketplace.contract_address));
    
    // Try to cancel as buyer
    start_prank(CheatTarget::One(marketplace.contract_address), buyer);
    marketplace.cancel_listing(listing_id);
}

#[test]
fn test_purchase_with_btc_success() {
    let (marketplace, nft_contract, seller, buyer) = setup();
    
    // Setup listing
    start_prank(CheatTarget::One(nft_contract.contract_address), seller);
    let mock_nft = super::MockNFT::MockNFTDispatcher { contract_address: nft_contract.contract_address };
    let token_id = mock_nft.mint(seller);
    nft_contract.approve(marketplace.contract_address, token_id);
    stop_prank(CheatTarget::One(nft_contract.contract_address));
    
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id = marketplace.create_listing(
        nft_contract.contract_address,
        token_id,
        1000000,
        100000000000000000,
    );
    stop_prank(CheatTarget::One(marketplace.contract_address));
    
    // Purchase with BTC
    start_prank(CheatTarget::One(marketplace.contract_address), buyer);
    let tx_id = marketplace.purchase_with_btc(listing_id);
    
    assert(tx_id == 1, 'Invalid transaction ID');
    
    let transaction = marketplace.get_transaction(tx_id);
    assert(transaction.buyer == buyer, 'Invalid buyer');
    assert(transaction.seller == seller, 'Invalid seller');
    assert(transaction.listing_id == listing_id, 'Invalid listing ID');
    assert(transaction.payment_type == 'BTC', 'Invalid payment type');
    assert(transaction.completed == false, 'Transaction should not be completed');
    
    stop_prank(CheatTarget::One(marketplace.contract_address));
}

#[test]
#[should_panic(expected: ('Cannot buy own listing',))]
fn test_purchase_own_listing() {
    let (marketplace, nft_contract, seller, buyer) = setup();
    
    // Setup listing
    start_prank(CheatTarget::One(nft_contract.contract_address), seller);
    let mock_nft = super::MockNFT::MockNFTDispatcher { contract_address: nft_contract.contract_address };
    let token_id = mock_nft.mint(seller);
    nft_contract.approve(marketplace.contract_address, token_id);
    stop_prank(CheatTarget::One(nft_contract.contract_address));
    
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id = marketplace.create_listing(
        nft_contract.contract_address,
        token_id,
        1000000,
        100000000000000000,
    );
    
    // Try to purchase own listing
    marketplace.purchase_with_btc(listing_id);
}

#[test]
fn test_get_active_listings() {
    let (marketplace, nft_contract, seller, buyer) = setup();
    
    // Create multiple listings
    start_prank(CheatTarget::One(nft_contract.contract_address), seller);
    let mock_nft = super::MockNFT::MockNFTDispatcher { contract_address: nft_contract.contract_address };
    let token_id_1 = mock_nft.mint(seller);
    let token_id_2 = mock_nft.mint(seller);
    nft_contract.approve(marketplace.contract_address, token_id_1);
    nft_contract.approve(marketplace.contract_address, token_id_2);
    stop_prank(CheatTarget::One(nft_contract.contract_address));
    
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id_1 = marketplace.create_listing(
        nft_contract.contract_address,
        token_id_1,
        1000000,
        100000000000000000,
    );
    let listing_id_2 = marketplace.create_listing(
        nft_contract.contract_address,
        token_id_2,
        2000000,
        200000000000000000,
    );
    
    let active_listings = marketplace.get_active_listings();
    assert(active_listings.len() == 2, 'Should have 2 active listings');
    assert(*active_listings.at(0) == listing_id_1, 'Invalid first listing');
    assert(*active_listings.at(1) == listing_id_2, 'Invalid second listing');
    
    // Cancel one listing
    marketplace.cancel_listing(listing_id_1);
    
    let active_listings_after = marketplace.get_active_listings();
    assert(active_listings_after.len() == 1, 'Should have 1 active listing');
    assert(*active_listings_after.at(0) == listing_id_2, 'Invalid remaining listing');
    
    stop_prank(CheatTarget::One(marketplace.contract_address));
}

#[test]
fn test_get_user_listings() {
    let (marketplace, nft_contract, seller, buyer) = setup();
    
    // Create listings for seller
    start_prank(CheatTarget::One(nft_contract.contract_address), seller);
    let mock_nft = super::MockNFT::MockNFTDispatcher { contract_address: nft_contract.contract_address };
    let token_id_1 = mock_nft.mint(seller);
    let token_id_2 = mock_nft.mint(seller);
    nft_contract.approve(marketplace.contract_address, token_id_1);
    nft_contract.approve(marketplace.contract_address, token_id_2);
    stop_prank(CheatTarget::One(nft_contract.contract_address));
    
    start_prank(CheatTarget::One(marketplace.contract_address), seller);
    let listing_id_1 = marketplace.create_listing(
        nft_contract.contract_address,
        token_id_1,
        1000000,
        100000000000000000,
    );
    let listing_id_2 = marketplace.create_listing(
        nft_contract.contract_address,
        token_id_2,
        2000000,
        200000000000000000,
    );
    stop_prank(CheatTarget::One(marketplace.contract_address));
    
    let user_listings = marketplace.get_user_listings(seller);
    assert(user_listings.len() == 2, 'Should have 2 user listings');
    assert(*user_listings.at(0) == listing_id_1, 'Invalid first user listing');
    assert(*user_listings.at(1) == listing_id_2, 'Invalid second user listing');
    
    // Check buyer has no listings
    let buyer_listings = marketplace.get_user_listings(buyer);
    assert(buyer_listings.len() == 0, 'Buyer should have no listings');
}