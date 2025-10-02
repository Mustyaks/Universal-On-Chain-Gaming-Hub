# Universal Gaming Hub - Frontend

A comprehensive React-based frontend for the Universal Gaming Hub, providing unified dashboard, marketplace, and social features for cross-game interactions.

## Features

### 🎮 Player Dashboard
- **Unified Profile View**: Cross-game progress and achievements
- **Real-time Updates**: Live achievement notifications via GraphQL subscriptions
- **Interactive Charts**: Progress visualization using Recharts
- **Game Statistics**: Detailed stats across all connected games
- **Asset Portfolio**: Overview of cross-game assets and their values

### 🛒 Marketplace
- **Asset Browser**: Search and filter gaming assets across games
- **Bitcoin Integration**: Xverse wallet integration for BTC payments
- **Transaction History**: Complete transaction tracking with blockchain links
- **Advanced Filtering**: Filter by game, asset type, rarity, and price range
- **Real-time Updates**: Live marketplace data updates

### 👥 Social Features
- **Friend Management**: Add, manage, and interact with gaming friends
- **Player Discovery**: AI-powered player suggestions based on gaming patterns
- **Community Quests**: Participate in cross-game community challenges
- **Privacy Controls**: Comprehensive privacy and visibility settings
- **Real-time Status**: Live friend status updates

## Technology Stack

- **React 18** with TypeScript
- **Apollo Client** for GraphQL integration
- **React Router** for navigation
- **Tailwind CSS** for styling
- **Recharts** for data visualization
- **Lucide React** for icons
- **Vite** for development and building
- **Jest & Testing Library** for testing

## Project Structure

```
src/frontend/
├── components/
│   ├── common/           # Shared components
│   ├── dashboard/        # Dashboard-specific components
│   ├── marketplace/      # Marketplace components
│   └── social/          # Social features components
├── hooks/               # Custom React hooks
├── types/               # TypeScript type definitions
├── graphql/             # GraphQL queries and client setup
├── styles/              # Global styles and Tailwind config
└── __tests__/           # Component tests
```

## Key Components

### Dashboard Components
- `PlayerDashboard`: Main dashboard container
- `OverviewTab`: Dashboard overview with stats and charts
- `ProgressChart`: Interactive progress visualization
- `RecentAchievements`: Achievement display with real-time updates
- `GameProgress`: Detailed game progress tracking

### Marketplace Components
- `Marketplace`: Main marketplace container
- `AssetBrowser`: Asset search and browsing interface
- `AssetCard`: Individual asset display component
- `PurchaseModal`: Bitcoin payment flow with Xverse integration
- `TransactionHistory`: Transaction tracking and history

### Social Components
- `SocialHub`: Main social features container
- `FriendsList`: Friend management interface
- `PlayerDiscovery`: Player suggestions and friend requests
- `CommunityQuests`: Community quest participation
- `ProfileSettings`: Privacy and social settings

## GraphQL Integration

The frontend uses Apollo Client for GraphQL integration with:
- **Queries**: Data fetching for dashboard, marketplace, and social features
- **Mutations**: User actions like purchases, friend requests, quest participation
- **Subscriptions**: Real-time updates for achievements, friend status, marketplace changes

## State Management

- **Apollo Client Cache**: Centralized GraphQL data caching
- **React Hooks**: Local component state management
- **Custom Hooks**: Reusable business logic (useDashboardData, useMarketplace, useSocial)

## Styling

- **Tailwind CSS**: Utility-first CSS framework
- **Responsive Design**: Mobile-first responsive layouts
- **Component Variants**: Consistent design system
- **Dark Mode Ready**: Prepared for dark mode implementation

## Testing

Comprehensive test suite using Jest and React Testing Library:
- **Component Tests**: Unit tests for all major components
- **Integration Tests**: GraphQL integration testing with mocks
- **User Interaction Tests**: Testing user flows and interactions

## Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev:frontend

# Run tests
npm test

# Build for production
npm run build:frontend
```

### Environment Variables
```env
REACT_APP_GRAPHQL_HTTP_URL=http://localhost:4000/graphql
REACT_APP_GRAPHQL_WS_URL=ws://localhost:4000/graphql
```

## Features Implementation Status

### ✅ Completed Features
- [x] Unified player dashboard with cross-game progress
- [x] Real-time achievement updates via subscriptions
- [x] Interactive progress charts and visualizations
- [x] Asset marketplace with search and filtering
- [x] Bitcoin payment integration (Xverse wallet)
- [x] Transaction history and tracking
- [x] Friend management system
- [x] Player discovery and suggestions
- [x] Community quest participation
- [x] Social profile customization
- [x] Privacy and visibility controls
- [x] Responsive design for all screen sizes
- [x] Comprehensive test coverage

### 🔄 Future Enhancements
- [ ] Dark mode implementation
- [ ] Advanced analytics dashboard
- [ ] In-app messaging system
- [ ] Push notifications
- [ ] Mobile app (React Native)
- [ ] Advanced marketplace features (auctions, offers)
- [ ] Guild/clan management
- [ ] Tournament system integration

## Performance Optimizations

- **Code Splitting**: Route-based code splitting with React.lazy
- **Image Optimization**: Lazy loading and error handling for images
- **GraphQL Optimization**: Query batching and caching strategies
- **Bundle Optimization**: Tree shaking and minification with Vite

## Accessibility

- **WCAG 2.1 Compliance**: Following accessibility guidelines
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Reader Support**: Proper ARIA labels and semantic HTML
- **Color Contrast**: Meeting contrast ratio requirements

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Contributing

1. Follow the existing code style and patterns
2. Write tests for new components and features
3. Update documentation for significant changes
4. Use TypeScript for type safety
5. Follow the component structure conventions

## License

MIT License - see LICENSE file for details