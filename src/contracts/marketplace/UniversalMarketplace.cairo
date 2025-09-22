#[starknet::contract]
mod UniversalMarketplace {
    use starknet::{
        ContractAddress, get_caller_address, get_contract_address, get_block_timestamp,
        contract_address_const
    };
    use super::super::interfaces::IERC721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use super::super::interfaces::IUniversalMarketplace::{Listing, Transaction};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        listing_counter: u256,
        transaction_counter: u256,
        listings: LegacyMap<u256, Listing>,
        transactions: LegacyMap<u256, Transaction>,
        active_listings: LegacyMap<u256, bool>,
        user_listings: LegacyMap<(ContractAddress, u256), u256>,
        user_listing_count: LegacyMap<ContractAddress, u256>,
        marketplace_fee: u256, // Fee in basis points (e.g., 250 = 2.5%)
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        ListingCreated: ListingCreated,
        ListingCancelled: ListingCancelled,
        PurchaseInitiated: PurchaseInitiated,
        TransactionCompleted: TransactionCompleted,
        OwnershipTransferred: OwnershipTransferred,
    }

    #[derive(Drop, starknet::Event)]
    struct ListingCreated {
        #[key]
        listing_id: u256,
        #[key]
        seller: ContractAddress,
        asset_contract: ContractAddress,
        token_id: u256,
        price_btc: u256,
        price_starknet: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct ListingCancelled {
        #[key]
        listing_id: u256,
        #[key]
        seller: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct PurchaseInitiated {
        #[key]
        tx_id: u256,
        #[key]
        listing_id: u256,
        #[key]
        buyer: ContractAddress,
        seller: ContractAddress,
        payment_type: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct TransactionCompleted {
        #[key]
        tx_id: u256,
        #[key]
        buyer: ContractAddress,
        seller: ContractAddress,
        asset_contract: ContractAddress,
        token_id: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct OwnershipTransferred {
        #[key]
        previous_owner: ContractAddress,
        #[key]
        new_owner: ContractAddress,
    }

    mod Errors {
        const UNAUTHORIZED: felt252 = 'Unauthorized';
        const INVALID_LISTING: felt252 = 'Invalid listing';
        const LISTING_NOT_ACTIVE: felt252 = 'Listing not active';
        const NOT_ASSET_OWNER: felt252 = 'Not asset owner';
        const INVALID_PRICE: felt252 = 'Invalid price';
        const TRANSACTION_NOT_FOUND: felt252 = 'Transaction not found';
        const ALREADY_COMPLETED: felt252 = 'Already completed';
        const CANNOT_BUY_OWN_LISTING: felt252 = 'Cannot buy own listing';
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
        self.listing_counter.write(0);
        self.transaction_counter.write(0);
        self.marketplace_fee.write(250); // 2.5% default fee
    }

    #[abi(embed_v0)]
    impl UniversalMarketplaceImpl of super::super::interfaces::IUniversalMarketplace::IUniversalMarketplace<ContractState> {
        fn create_listing(
            ref self: ContractState,
            asset_contract: ContractAddress,
            token_id: u256,
            price_btc: u256,
            price_starknet: u256
        ) -> u256 {
            let caller = get_caller_address();
            
            // Validate prices
            assert(price_btc > 0 || price_starknet > 0, Errors::INVALID_PRICE);
            
            // Verify ownership
            let nft_contract = IERC721Dispatcher { contract_address: asset_contract };
            let owner = nft_contract.owner_of(token_id);
            assert(owner == caller, Errors::NOT_ASSET_OWNER);
            
            // Check if marketplace is approved to transfer the NFT
            let marketplace_address = get_contract_address();
            let approved = nft_contract.get_approved(token_id);
            let approved_for_all = nft_contract.is_approved_for_all(owner, marketplace_address);
            assert(approved == marketplace_address || approved_for_all, Errors::UNAUTHORIZED);
            
            // Create listing
            let listing_id = self.listing_counter.read() + 1;
            self.listing_counter.write(listing_id);
            
            let listing = Listing {
                listing_id,
                seller: caller,
                asset_contract,
                token_id,
                price_btc,
                price_starknet,
                active: true,
                created_at: get_block_timestamp(),
            };
            
            self.listings.write(listing_id, listing);
            self.active_listings.write(listing_id, true);
            
            // Update user listings
            let user_count = self.user_listing_count.read(caller);
            self.user_listings.write((caller, user_count), listing_id);
            self.user_listing_count.write(caller, user_count + 1);
            
            self.emit(ListingCreated {
                listing_id,
                seller: caller,
                asset_contract,
                token_id,
                price_btc,
                price_starknet,
            });
            
            listing_id
        }

        fn cancel_listing(ref self: ContractState, listing_id: u256) {
            let caller = get_caller_address();
            let listing = self.listings.read(listing_id);
            
            assert(listing.listing_id != 0, Errors::INVALID_LISTING);
            assert(listing.seller == caller, Errors::UNAUTHORIZED);
            assert(listing.active, Errors::LISTING_NOT_ACTIVE);
            
            // Deactivate listing
            let mut updated_listing = listing;
            updated_listing.active = false;
            self.listings.write(listing_id, updated_listing);
            self.active_listings.write(listing_id, false);
            
            self.emit(ListingCancelled {
                listing_id,
                seller: caller,
            });
        }

        fn purchase_with_btc(ref self: ContractState, listing_id: u256) -> u256 {
            self._initiate_purchase(listing_id, 'BTC')
        }

        fn purchase_with_starknet(ref self: ContractState, listing_id: u256) -> u256 {
            self._initiate_purchase(listing_id, 'STRK')
        }

        fn complete_transaction(ref self: ContractState, tx_id: u256) {
            let caller = get_caller_address();
            let owner = self.owner.read();
            assert(caller == owner, Errors::UNAUTHORIZED);
            
            let transaction = self.transactions.read(tx_id);
            assert(transaction.tx_id != 0, Errors::TRANSACTION_NOT_FOUND);
            assert(!transaction.completed, Errors::ALREADY_COMPLETED);
            
            // Transfer the NFT
            let nft_contract = IERC721Dispatcher { contract_address: transaction.asset_contract };
            nft_contract.transfer_from(transaction.seller, transaction.buyer, transaction.token_id);
            
            // Mark transaction as completed
            let mut updated_transaction = transaction;
            updated_transaction.completed = true;
            self.transactions.write(tx_id, updated_transaction);
            
            // Deactivate the listing
            self.active_listings.write(transaction.listing_id, false);
            let listing = self.listings.read(transaction.listing_id);
            let mut updated_listing = listing;
            updated_listing.active = false;
            self.listings.write(transaction.listing_id, updated_listing);
            
            self.emit(TransactionCompleted {
                tx_id,
                buyer: transaction.buyer,
                seller: transaction.seller,
                asset_contract: transaction.asset_contract,
                token_id: transaction.token_id,
            });
        }

        fn get_listing(self: @ContractState, listing_id: u256) -> Listing {
            self.listings.read(listing_id)
        }

        fn get_transaction(self: @ContractState, tx_id: u256) -> Transaction {
            self.transactions.read(tx_id)
        }

        fn get_active_listings(self: @ContractState) -> Array<u256> {
            let mut active_listings = ArrayTrait::new();
            let total_listings = self.listing_counter.read();
            
            let mut i = 1;
            loop {
                if i > total_listings {
                    break;
                }
                
                if self.active_listings.read(i) {
                    active_listings.append(i);
                }
                
                i += 1;
            };
            
            active_listings
        }

        fn get_user_listings(self: @ContractState, user: ContractAddress) -> Array<u256> {
            let mut user_listings = ArrayTrait::new();
            let user_count = self.user_listing_count.read(user);
            
            let mut i = 0;
            loop {
                if i >= user_count {
                    break;
                }
                
                let listing_id = self.user_listings.read((user, i));
                user_listings.append(listing_id);
                
                i += 1;
            };
            
            user_listings
        }

        fn is_listing_active(self: @ContractState, listing_id: u256) -> bool {
            self.active_listings.read(listing_id)
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _initiate_purchase(ref self: ContractState, listing_id: u256, payment_type: felt252) -> u256 {
            let caller = get_caller_address();
            let listing = self.listings.read(listing_id);
            
            assert(listing.listing_id != 0, Errors::INVALID_LISTING);
            assert(listing.active, Errors::LISTING_NOT_ACTIVE);
            assert(listing.seller != caller, Errors::CANNOT_BUY_OWN_LISTING);
            
            // Validate payment type and price
            let amount_paid = if payment_type == 'BTC' {
                assert(listing.price_btc > 0, Errors::INVALID_PRICE);
                listing.price_btc
            } else {
                assert(listing.price_starknet > 0, Errors::INVALID_PRICE);
                listing.price_starknet
            };
            
            // Create transaction record
            let tx_id = self.transaction_counter.read() + 1;
            self.transaction_counter.write(tx_id);
            
            let transaction = Transaction {
                tx_id,
                listing_id,
                buyer: caller,
                seller: listing.seller,
                asset_contract: listing.asset_contract,
                token_id: listing.token_id,
                amount_paid,
                payment_type,
                completed: false,
                created_at: get_block_timestamp(),
            };
            
            self.transactions.write(tx_id, transaction);
            
            self.emit(PurchaseInitiated {
                tx_id,
                listing_id,
                buyer: caller,
                seller: listing.seller,
                payment_type,
            });
            
            tx_id
        }
    }

    // Owner-only functions
    #[abi(embed_v0)]
    impl OwnerImpl of super::OwnerTrait<ContractState> {
        fn transfer_ownership(ref self: ContractState, new_owner: ContractAddress) {
            let caller = get_caller_address();
            let current_owner = self.owner.read();
            assert(caller == current_owner, Errors::UNAUTHORIZED);
            
            self.owner.write(new_owner);
            
            self.emit(OwnershipTransferred {
                previous_owner: current_owner,
                new_owner,
            });
        }

        fn set_marketplace_fee(ref self: ContractState, fee_basis_points: u256) {
            let caller = get_caller_address();
            let owner = self.owner.read();
            assert(caller == owner, Errors::UNAUTHORIZED);
            assert(fee_basis_points <= 1000, 'Fee too high'); // Max 10%
            
            self.marketplace_fee.write(fee_basis_points);
        }

        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }

        fn get_marketplace_fee(self: @ContractState) -> u256 {
            self.marketplace_fee.read()
        }
    }

    #[starknet::interface]
    trait OwnerTrait<TContractState> {
        fn transfer_ownership(ref self: TContractState, new_owner: ContractAddress);
        fn set_marketplace_fee(ref self: TContractState, fee_basis_points: u256);
        fn get_owner(self: @TContractState) -> ContractAddress;
        fn get_marketplace_fee(self: @TContractState) -> u256;
    }
}