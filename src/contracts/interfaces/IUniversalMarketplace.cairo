use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store)]
struct Listing {
    listing_id: u256,
    seller: ContractAddress,
    asset_contract: ContractAddress,
    token_id: u256,
    price_btc: u256,
    price_starknet: u256,
    active: bool,
    created_at: u64,
}

#[derive(Drop, Serde, starknet::Store)]
struct Transaction {
    tx_id: u256,
    listing_id: u256,
    buyer: ContractAddress,
    seller: ContractAddress,
    asset_contract: ContractAddress,
    token_id: u256,
    amount_paid: u256,
    payment_type: felt252, // 'BTC' or 'STRK'
    completed: bool,
    created_at: u64,
}

#[starknet::interface]
trait IUniversalMarketplace<TContractState> {
    fn create_listing(
        ref self: TContractState,
        asset_contract: ContractAddress,
        token_id: u256,
        price_btc: u256,
        price_starknet: u256
    ) -> u256;
    
    fn cancel_listing(ref self: TContractState, listing_id: u256);
    
    fn purchase_with_btc(ref self: TContractState, listing_id: u256) -> u256;
    
    fn purchase_with_starknet(ref self: TContractState, listing_id: u256) -> u256;
    
    fn complete_transaction(ref self: TContractState, tx_id: u256);
    
    fn get_listing(self: @TContractState, listing_id: u256) -> Listing;
    
    fn get_transaction(self: @TContractState, tx_id: u256) -> Transaction;
    
    fn get_active_listings(self: @TContractState) -> Array<u256>;
    
    fn get_user_listings(self: @TContractState, user: ContractAddress) -> Array<u256>;
    
    fn is_listing_active(self: @TContractState, listing_id: u256) -> bool;
}