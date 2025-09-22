#[starknet::contract]
mod AchievementBadges {
    use starknet::{
        ContractAddress, get_caller_address, get_block_timestamp, contract_address_const
    };
    use super::super::interfaces::IERC721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use super::super::interfaces::IAchievementBadges::{Badge, BadgeMetadata};

    #[storage]
    struct Storage {
        // ERC721 standard storage
        name: felt252,
        symbol: felt252,
        owners: LegacyMap<u256, ContractAddress>,
        balances: LegacyMap<ContractAddress, u256>,
        token_approvals: LegacyMap<u256, ContractAddress>,
        operator_approvals: LegacyMap<(ContractAddress, ContractAddress), bool>,
        
        // Achievement-specific storage
        owner: ContractAddress,
        authorized_minters: LegacyMap<ContractAddress, bool>,
        badge_counter: u256,
        badges: LegacyMap<u256, Badge>,
        badge_metadata: LegacyMap<u256, BadgeMetadata>,
        
        // Player tracking
        player_badges: LegacyMap<(ContractAddress, u256), u256>,
        player_badge_count: LegacyMap<ContractAddress, u256>,
        
        // Game tracking
        game_badges: LegacyMap<(felt252, u256), u256>,
        game_badge_count: LegacyMap<felt252, u256>,
        
        // Rarity tracking
        rarity_badges: LegacyMap<(u8, u256), u256>,
        rarity_count: LegacyMap<u8, u256>,
        
        // Achievement tracking (prevent duplicates)
        achievement_earned: LegacyMap<(ContractAddress, felt252, felt252), bool>,
        
        // Token URI base
        base_uri: felt252,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Transfer: Transfer,
        Approval: Approval,
        ApprovalForAll: ApprovalForAll,
        BadgeMinted: BadgeMinted,
        BatchBadgesMinted: BatchBadgesMinted,
        MinterAuthorized: MinterAuthorized,
        MinterRevoked: MinterRevoked,
        MetadataUpdated: MetadataUpdated,
    }

    #[derive(Drop, starknet::Event)]
    struct Transfer {
        #[key]
        from: ContractAddress,
        #[key]
        to: ContractAddress,
        #[key]
        token_id: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Approval {
        #[key]
        owner: ContractAddress,
        #[key]
        approved: ContractAddress,
        #[key]
        token_id: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct ApprovalForAll {
        #[key]
        owner: ContractAddress,
        #[key]
        operator: ContractAddress,
        approved: bool,
    }

    #[derive(Drop, starknet::Event)]
    struct BadgeMinted {
        #[key]
        badge_id: u256,
        #[key]
        player: ContractAddress,
        #[key]
        game_id: felt252,
        achievement_type: felt252,
        rarity: u8,
    }

    #[derive(Drop, starknet::Event)]
    struct BatchBadgesMinted {
        #[key]
        game_id: felt252,
        achievement_type: felt252,
        rarity: u8,
        count: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct MinterAuthorized {
        #[key]
        minter: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct MinterRevoked {
        #[key]
        minter: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct MetadataUpdated {
        #[key]
        badge_id: u256,
    }

    mod Errors {
        const UNAUTHORIZED: felt252 = 'Unauthorized';
        const INVALID_TOKEN_ID: felt252 = 'Invalid token ID';
        const INVALID_RARITY: felt252 = 'Invalid rarity';
        const ACHIEVEMENT_ALREADY_EARNED: felt252 = 'Achievement already earned';
        const NOT_OWNER: felt252 = 'Not token owner';
        const NOT_APPROVED: felt252 = 'Not approved';
        const INVALID_RECIPIENT: felt252 = 'Invalid recipient';
        const SELF_APPROVAL: felt252 = 'Self approval';
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: felt252,
        symbol: felt252,
        owner: ContractAddress,
        base_uri: felt252
    ) {
        self.name.write(name);
        self.symbol.write(symbol);
        self.owner.write(owner);
        self.base_uri.write(base_uri);
        self.badge_counter.write(0);
        
        // Owner is automatically an authorized minter
        self.authorized_minters.write(owner, true);
    }

    #[abi(embed_v0)]
    impl ERC721Impl of super::super::interfaces::IERC721::IERC721<ContractState> {
        fn balance_of(self: @ContractState, owner: ContractAddress) -> u256 {
            assert(!owner.is_zero(), Errors::INVALID_RECIPIENT);
            self.balances.read(owner)
        }

        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            let owner = self.owners.read(token_id);
            assert(!owner.is_zero(), Errors::INVALID_TOKEN_ID);
            owner
        }

        fn get_approved(self: @ContractState, token_id: u256) -> ContractAddress {
            assert(self._exists(token_id), Errors::INVALID_TOKEN_ID);
            self.token_approvals.read(token_id)
        }

        fn is_approved_for_all(
            self: @ContractState, owner: ContractAddress, operator: ContractAddress
        ) -> bool {
            self.operator_approvals.read((owner, operator))
        }

        fn approve(ref self: ContractState, to: ContractAddress, token_id: u256) {
            let owner = self.owner_of(token_id);
            assert(to != owner, Errors::SELF_APPROVAL);

            let caller = get_caller_address();
            assert(
                caller == owner || self.is_approved_for_all(owner, caller),
                Errors::UNAUTHORIZED
            );

            self.token_approvals.write(token_id, to);
            self.emit(Approval { owner, approved: to, token_id });
        }

        fn set_approval_for_all(ref self: ContractState, operator: ContractAddress, approved: bool) {
            let caller = get_caller_address();
            assert(caller != operator, Errors::SELF_APPROVAL);
            self.operator_approvals.write((caller, operator), approved);
            self.emit(ApprovalForAll { owner: caller, operator, approved });
        }

        fn transfer_from(
            ref self: ContractState, from: ContractAddress, to: ContractAddress, token_id: u256
        ) {
            assert(self._is_approved_or_owner(get_caller_address(), token_id), Errors::UNAUTHORIZED);
            self._transfer(from, to, token_id);
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
    }

    #[abi(embed_v0)]
    impl AchievementBadgesImpl of super::super::interfaces::IAchievementBadges::IAchievementBadges<ContractState> {
        fn mint_achievement_badge(
            ref self: ContractState,
            player: ContractAddress,
            game_id: felt252,
            achievement_type: felt252,
            rarity: u8,
            metadata_uri: felt252
        ) -> u256 {
            let caller = get_caller_address();
            assert(self.authorized_minters.read(caller), Errors::UNAUTHORIZED);
            assert(rarity >= 1 && rarity <= 4, Errors::INVALID_RARITY);
            assert(!player.is_zero(), Errors::INVALID_RECIPIENT);
            
            // Check if achievement already earned
            assert(
                !self.achievement_earned.read((player, game_id, achievement_type)),
                Errors::ACHIEVEMENT_ALREADY_EARNED
            );
            
            // Mint the badge
            let badge_id = self.badge_counter.read() + 1;
            self.badge_counter.write(badge_id);
            
            let badge = Badge {
                badge_id,
                player,
                game_id,
                achievement_type,
                rarity,
                minted_at: get_block_timestamp(),
                metadata_uri,
            };
            
            self.badges.write(badge_id, badge);
            self.achievement_earned.write((player, game_id, achievement_type), true);
            
            // Update tracking maps
            self._update_player_badges(player, badge_id);
            self._update_game_badges(game_id, badge_id);
            self._update_rarity_badges(rarity, badge_id);
            
            // Mint the NFT
            self._mint(player, badge_id);
            
            self.emit(BadgeMinted {
                badge_id,
                player,
                game_id,
                achievement_type,
                rarity,
            });
            
            badge_id
        }

        fn batch_mint_badges(
            ref self: ContractState,
            players: Span<ContractAddress>,
            game_id: felt252,
            achievement_type: felt252,
            rarity: u8,
            metadata_uri: felt252
        ) -> Span<u256> {
            let caller = get_caller_address();
            assert(self.authorized_minters.read(caller), Errors::UNAUTHORIZED);
            assert(rarity >= 1 && rarity <= 4, Errors::INVALID_RARITY);
            
            let mut badge_ids = ArrayTrait::new();
            let mut i = 0;
            
            loop {
                if i >= players.len() {
                    break;
                }
                
                let player = *players.at(i);
                
                // Skip if achievement already earned
                if !self.achievement_earned.read((player, game_id, achievement_type)) {
                    let badge_id = self.badge_counter.read() + 1;
                    self.badge_counter.write(badge_id);
                    
                    let badge = Badge {
                        badge_id,
                        player,
                        game_id,
                        achievement_type,
                        rarity,
                        minted_at: get_block_timestamp(),
                        metadata_uri,
                    };
                    
                    self.badges.write(badge_id, badge);
                    self.achievement_earned.write((player, game_id, achievement_type), true);
                    
                    // Update tracking maps
                    self._update_player_badges(player, badge_id);
                    self._update_game_badges(game_id, badge_id);
                    self._update_rarity_badges(rarity, badge_id);
                    
                    // Mint the NFT
                    self._mint(player, badge_id);
                    
                    badge_ids.append(badge_id);
                }
                
                i += 1;
            };
            
            self.emit(BatchBadgesMinted {
                game_id,
                achievement_type,
                rarity,
                count: badge_ids.len().into(),
            });
            
            badge_ids.span()
        }

        fn get_badge(self: @ContractState, badge_id: u256) -> Badge {
            self.badges.read(badge_id)
        }

        fn get_player_badges(self: @ContractState, player: ContractAddress) -> Array<u256> {
            let mut badges = ArrayTrait::new();
            let count = self.player_badge_count.read(player);
            
            let mut i = 0;
            loop {
                if i >= count {
                    break;
                }
                
                let badge_id = self.player_badges.read((player, i));
                badges.append(badge_id);
                
                i += 1;
            };
            
            badges
        }

        fn get_game_badges(self: @ContractState, game_id: felt252) -> Array<u256> {
            let mut badges = ArrayTrait::new();
            let count = self.game_badge_count.read(game_id);
            
            let mut i = 0;
            loop {
                if i >= count {
                    break;
                }
                
                let badge_id = self.game_badges.read((game_id, i));
                badges.append(badge_id);
                
                i += 1;
            };
            
            badges
        }

        fn get_badges_by_rarity(self: @ContractState, rarity: u8) -> Array<u256> {
            let mut badges = ArrayTrait::new();
            let count = self.rarity_count.read(rarity);
            
            let mut i = 0;
            loop {
                if i >= count {
                    break;
                }
                
                let badge_id = self.rarity_badges.read((rarity, i));
                badges.append(badge_id);
                
                i += 1;
            };
            
            badges
        }

        fn set_badge_metadata(ref self: ContractState, badge_id: u256, metadata: BadgeMetadata) {
            let caller = get_caller_address();
            assert(self.authorized_minters.read(caller), Errors::UNAUTHORIZED);
            assert(self._exists(badge_id), Errors::INVALID_TOKEN_ID);
            
            self.badge_metadata.write(badge_id, metadata);
            self.emit(MetadataUpdated { badge_id });
        }

        fn get_badge_metadata(self: @ContractState, badge_id: u256) -> BadgeMetadata {
            self.badge_metadata.read(badge_id)
        }

        fn is_achievement_earned(
            self: @ContractState,
            player: ContractAddress,
            game_id: felt252,
            achievement_type: felt252
        ) -> bool {
            self.achievement_earned.read((player, game_id, achievement_type))
        }

        fn get_total_supply(self: @ContractState) -> u256 {
            self.badge_counter.read()
        }

        fn get_rarity_count(self: @ContractState, rarity: u8) -> u256 {
            self.rarity_count.read(rarity)
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _exists(self: @ContractState, token_id: u256) -> bool {
            !self.owners.read(token_id).is_zero()
        }

        fn _is_approved_or_owner(self: @ContractState, spender: ContractAddress, token_id: u256) -> bool {
            let owner = self.owner_of(token_id);
            spender == owner
                || self.get_approved(token_id) == spender
                || self.is_approved_for_all(owner, spender)
        }

        fn _mint(ref self: ContractState, to: ContractAddress, token_id: u256) {
            assert(!to.is_zero(), Errors::INVALID_RECIPIENT);
            assert(!self._exists(token_id), 'Token already minted');

            self.balances.write(to, self.balances.read(to) + 1);
            self.owners.write(token_id, to);

            self.emit(Transfer {
                from: contract_address_const::<0>(),
                to,
                token_id
            });
        }

        fn _transfer(ref self: ContractState, from: ContractAddress, to: ContractAddress, token_id: u256) {
            assert(self.owner_of(token_id) == from, Errors::NOT_OWNER);
            assert(!to.is_zero(), Errors::INVALID_RECIPIENT);

            // Clear approvals
            self.token_approvals.write(token_id, contract_address_const::<0>());

            // Update balances
            self.balances.write(from, self.balances.read(from) - 1);
            self.balances.write(to, self.balances.read(to) + 1);

            // Update owner
            self.owners.write(token_id, to);

            self.emit(Transfer { from, to, token_id });
        }

        fn _update_player_badges(ref self: ContractState, player: ContractAddress, badge_id: u256) {
            let count = self.player_badge_count.read(player);
            self.player_badges.write((player, count), badge_id);
            self.player_badge_count.write(player, count + 1);
        }

        fn _update_game_badges(ref self: ContractState, game_id: felt252, badge_id: u256) {
            let count = self.game_badge_count.read(game_id);
            self.game_badges.write((game_id, count), badge_id);
            self.game_badge_count.write(game_id, count + 1);
        }

        fn _update_rarity_badges(ref self: ContractState, rarity: u8, badge_id: u256) {
            let count = self.rarity_count.read(rarity);
            self.rarity_badges.write((rarity, count), badge_id);
            self.rarity_count.write(rarity, count + 1);
        }
    }

    // Owner-only functions
    #[abi(embed_v0)]
    impl OwnerImpl of super::OwnerTrait<ContractState> {
        fn authorize_minter(ref self: ContractState, minter: ContractAddress) {
            let caller = get_caller_address();
            let owner = self.owner.read();
            assert(caller == owner, Errors::UNAUTHORIZED);
            
            self.authorized_minters.write(minter, true);
            self.emit(MinterAuthorized { minter });
        }

        fn revoke_minter(ref self: ContractState, minter: ContractAddress) {
            let caller = get_caller_address();
            let owner = self.owner.read();
            assert(caller == owner, Errors::UNAUTHORIZED);
            
            self.authorized_minters.write(minter, false);
            self.emit(MinterRevoked { minter });
        }

        fn is_authorized_minter(self: @ContractState, minter: ContractAddress) -> bool {
            self.authorized_minters.read(minter)
        }

        fn set_base_uri(ref self: ContractState, base_uri: felt252) {
            let caller = get_caller_address();
            let owner = self.owner.read();
            assert(caller == owner, Errors::UNAUTHORIZED);
            
            self.base_uri.write(base_uri);
        }

        fn get_base_uri(self: @ContractState) -> felt252 {
            self.base_uri.read()
        }

        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }
    }

    #[starknet::interface]
    trait OwnerTrait<TContractState> {
        fn authorize_minter(ref self: TContractState, minter: ContractAddress);
        fn revoke_minter(ref self: TContractState, minter: ContractAddress);
        fn is_authorized_minter(self: @TContractState, minter: ContractAddress) -> bool;
        fn set_base_uri(ref self: TContractState, base_uri: felt252);
        fn get_base_uri(self: @TContractState) -> felt252;
        fn get_owner(self: @TContractState) -> ContractAddress;
    }
}