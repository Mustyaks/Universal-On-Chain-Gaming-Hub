# Universal Gaming Hub

A unified platform that aggregates on-chain player data, identities, and assets from Dojo-powered games into a single hub with Bitcoin-powered marketplace integration.

## 🏗️ Project Structure

```
src/
├── contracts/          # Cairo smart contracts
│   ├── marketplace/    # UniversalMarketplace contract
│   ├── achievements/   # AchievementBadges NFT contract
│   └── interfaces/     # Shared contract interfaces
├── services/           # Core business logic services
│   ├── aggregation/    # Game data aggregation engine
│   ├── profile/        # Unified player profile management
│   ├── marketplace/    # Asset trading and Bitcoin integration
│   ├── social/         # Social features and community management
│   └── auth/           # Authentication and authorization
├── frontend/           # Frontend application
│   ├── components/     # Reusable UI components
│   ├── pages/          # Application pages and routes
│   ├── hooks/          # Custom React hooks
│   └── utils/          # Utility functions and helpers
└── types/              # TypeScript type definitions
    ├── core.ts         # Core data models
    └── services.ts     # Service interfaces
```

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd universal-gaming-hub
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the development environment**
   ```bash
   npm run dev
   ```

   This will start:
   - Starknet local node (Katana) on port 5050
   - Bitcoin regtest node on port 18443
   - PostgreSQL database on port 5432
   - Redis cache on port 6379
   - API Gateway on port 4000
   - Frontend development server on port 3000

4. **View logs**
   ```bash
   npm run dev:logs
   ```

5. **Stop the development environment**
   ```bash
   npm run dev:down
   ```

## 🔧 Development Commands

```bash
# Build TypeScript
npm run build

# Run tests
npm test
npm run test:watch

# Lint code
npm run lint
npm run lint:fix

# Type checking
npm run typecheck
```

## 🌐 Services

### Local Development URLs

- **Frontend**: http://localhost:3000
- **GraphQL API**: http://localhost:4000/graphql
- **Starknet RPC**: http://localhost:5050
- **Bitcoin RPC**: http://localhost:18443
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Service Architecture

The platform follows a microservices architecture with:

- **API Gateway**: GraphQL endpoint with authentication
- **Aggregation Engine**: Normalizes data from multiple Dojo games
- **Profile Service**: Manages unified player identities
- **Marketplace Service**: Handles Bitcoin-integrated asset trading
- **Social Service**: Community features and friend management
- **Auth Service**: Cartridge Controller integration

## 🔗 Blockchain Integration

### Starknet
- **Network**: Local Katana node for development
- **Contracts**: Cairo smart contracts for marketplace and achievements
- **Wallet**: Cartridge Controller for unified identity

### Bitcoin
- **Network**: Local regtest node for development
- **Wallet**: Xverse wallet integration
- **Cross-chain**: Atomiq SDK for BTC to Starknet swaps

## 📊 Database Schema

The application uses PostgreSQL with the following main entities:

- **Players**: Unified player profiles with Cartridge integration
- **Game Assets**: Cross-game NFTs, currencies, and items
- **Achievements**: Player achievements with optional NFT badges
- **Marketplace Listings**: Asset listings with Bitcoin pricing
- **Transactions**: Trading history and swap records
- **Social Connections**: Friend relationships and community features

## 🧪 Testing

The project includes comprehensive testing:

- **Unit Tests**: Individual component and service testing
- **Integration Tests**: Cross-service workflow testing
- **Contract Tests**: Cairo smart contract testing
- **E2E Tests**: Complete user journey testing

## 📝 Requirements Coverage

This implementation addresses the following requirements:

- **Requirement 6.1**: Asset data verification through on-chain validation
- **Requirement 7.1**: Performance optimization with caching and efficient data structures

## 🤝 Contributing

1. Follow the established project structure
2. Write tests for new functionality
3. Use TypeScript for type safety
4. Follow the existing code style and linting rules
5. Update documentation for new features

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.