import { ApolloServer } from 'apollo-server-express';
import { PubSub } from 'graphql-subscriptions';
import { createServer } from 'http';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { execute, subscribe } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import depthLimit from 'graphql-depth-limit';
import costAnalysis from 'graphql-cost-analysis';
import { shield, rule, and, or } from 'graphql-shield';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { createContext, createSubscriptionContext, Context, Services } from './context';
import { CacheService } from '../types/services';

// Security rules
const isAuthenticated = rule({ cache: 'contextual' })(
  async (parent, args, context: Context) => {
    return context.user !== undefined;
  }
);

const isAdmin = rule({ cache: 'contextual' })(
  async (parent, args, context: Context) => {
    return context.user?.isAdmin === true;
  }
);

const isOwner = rule({ cache: 'contextual' })(
  async (parent, args, context: Context) => {
    return context.user?.id === args.playerId;
  }
);

// GraphQL Shield permissions
const permissions = shield({
  Query: {
    me: isAuthenticated,
    playerTransactions: or(isOwner, isAdmin),
    friendRequests: isOwner,
    notifications: isOwner,
    playerGameData: or(isOwner, isAdmin),
  },
  Mutation: {
    updateProfile: isAuthenticated,
    createListing: isAuthenticated,
    cancelListing: isAuthenticated,
    purchaseWithBTC: isAuthenticated,
    sendFriendRequest: isAuthenticated,
    acceptFriendRequest: isAuthenticated,
    declineFriendRequest: isAuthenticated,
    removeFriend: isAuthenticated,
    createCommunityQuest: isAdmin,
    joinQuest: isAuthenticated,
    leaveQuest: isAuthenticated,
    markNotificationAsRead: isAuthenticated,
    markAllNotificationsAsRead: isAuthenticated,
    syncPlayerData: isAuthenticated,
    registerGameAdapter: isAdmin,
  },
  Subscription: {
    profileUpdated: isAuthenticated,
    achievementEarned: isAuthenticated,
    friendRequestReceived: isAuthenticated,
    friendRequestAccepted: isAuthenticated,
    questCompleted: isAuthenticated,
    notificationReceived: isAuthenticated,
  }
}, {
  allowExternalErrors: true,
  fallbackError: 'Access denied'
});

export interface GraphQLServerConfig {
  services: Services;
  cache: CacheService;
  port?: number;
  introspection?: boolean;
  playground?: boolean;
}

export class GraphQLServerManager {
  private server: ApolloServer;
  private httpServer: any;
  private subscriptionServer: SubscriptionServer;
  private pubsub: PubSub;
  private schema: any;

  constructor(private config: GraphQLServerConfig) {
    this.pubsub = new PubSub();
    this.setupSchema();
    this.setupApolloServer();
  }

  private setupSchema() {
    this.schema = makeExecutableSchema({
      typeDefs,
      resolvers: permissions.applyMiddleware(resolvers)
    });
  }

  private setupApolloServer() {
    this.server = new ApolloServer({
      schema: this.schema,
      context: ({ req, res }) => createContext(
        req,
        res,
        this.config.services,
        this.config.cache,
        this.pubsub
      ),
      introspection: this.config.introspection ?? process.env.NODE_ENV !== 'production',
      playground: this.config.playground ?? process.env.NODE_ENV !== 'production',
      
      // Security and performance plugins
      plugins: [
        // Query depth limiting
        {
          requestDidStart() {
            return {
              didResolveOperation({ request, document }) {
                const depthLimitRule = depthLimit(10);
                const errors = depthLimitRule(document);
                if (errors && errors.length > 0) {
                  throw new Error('Query depth limit exceeded');
                }
              }
            };
          }
        },
        
        // Query cost analysis
        {
          requestDidStart() {
            return {
              didResolveOperation({ request, document }) {
                const costAnalysisRule = costAnalysis({
                  maximumCost: 1000,
                  defaultCost: 1,
                  scalarCost: 1,
                  objectCost: 2,
                  listFactor: 10,
                  introspectionCost: 1000,
                  fieldExtensions: {
                    complexity: (args: any, childComplexity: number) => {
                      return childComplexity + 1;
                    }
                  }
                });
                
                const errors = costAnalysisRule(document);
                if (errors && errors.length > 0) {
                  throw new Error('Query cost limit exceeded');
                }
              }
            };
          }
        },

        // Request logging and metrics
        {
          requestDidStart() {
            return {
              didResolveOperation({ request, operationName }) {
                console.log(`GraphQL Operation: ${operationName || 'Anonymous'}`);
              },
              didEncounterErrors({ errors }) {
                errors.forEach(error => {
                  console.error('GraphQL Error:', error);
                });
              }
            };
          }
        }
      ],

      // Error formatting
      formatError: (error) => {
        // Log error for debugging
        console.error('GraphQL Error:', error);

        // Return sanitized error to client
        return {
          message: error.message,
          code: error.extensions?.code || 'INTERNAL_ERROR',
          path: error.path,
          locations: error.locations
        };
      },

      // Response caching
      cacheControl: {
        defaultMaxAge: 60, // 1 minute default cache
        calculateHttpHeaders: true
      }
    });
  }

  async start(app: any, port: number = this.config.port || 4000) {
    // Create HTTP server
    this.httpServer = createServer(app);

    // Setup subscription server
    this.subscriptionServer = SubscriptionServer.create(
      {
        schema: this.schema,
        execute,
        subscribe,
        onConnect: async (connectionParams) => {
          console.log('WebSocket connection established');
          return createSubscriptionContext(
            connectionParams,
            this.config.services,
            this.config.cache,
            this.pubsub
          );
        },
        onDisconnect: () => {
          console.log('WebSocket connection closed');
        }
      },
      {
        server: this.httpServer,
        path: '/graphql'
      }
    );

    // Apply Apollo GraphQL middleware
    this.server.applyMiddleware({ 
      app, 
      path: '/graphql',
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true
      }
    });

    // Start the server
    return new Promise<void>((resolve) => {
      this.httpServer.listen(port, () => {
        console.log(`🚀 GraphQL Server ready at http://localhost:${port}${this.server.graphqlPath}`);
        console.log(`🚀 Subscriptions ready at ws://localhost:${port}${this.server.graphqlPath}`);
        resolve();
      });
    });
  }

  async stop() {
    if (this.subscriptionServer) {
      this.subscriptionServer.close();
    }
    
    if (this.server) {
      await this.server.stop();
    }
    
    if (this.httpServer) {
      this.httpServer.close();
    }

    console.log('GraphQL Server stopped');
  }

  getServer() {
    return this.server;
  }

  getPubSub() {
    return this.pubsub;
  }
}

// Factory function for easy setup
export function createGraphQLServer(config: GraphQLServerConfig): GraphQLServerManager {
  return new GraphQLServerManager(config);
}