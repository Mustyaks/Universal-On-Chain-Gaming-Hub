import { GraphQLScalarType, Kind } from 'graphql';
import { playerResolvers } from './playerResolvers';
import { marketplaceResolvers } from './marketplaceResolvers';
import { socialResolvers } from './socialResolvers';
import { questResolvers } from './questResolvers';
import { notificationResolvers } from './notificationResolvers';
import { gameResolvers } from './gameResolvers';

// Custom scalar resolvers
const timestampScalar = new GraphQLScalarType({
  name: 'Timestamp',
  description: 'Unix timestamp in milliseconds',
  serialize(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseInt(value, 10);
    if (value instanceof Date) return value.getTime();
    throw new Error('Value must be a number, string, or Date');
  },
  parseValue(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseInt(value, 10);
    throw new Error('Value must be a number or string');
  },
  parseLiteral(ast): number {
    if (ast.kind === Kind.INT) return parseInt(ast.value, 10);
    if (ast.kind === Kind.STRING) return parseInt(ast.value, 10);
    throw new Error('Value must be a number or string');
  },
});

const addressScalar = new GraphQLScalarType({
  name: 'Address',
  description: 'Blockchain address string',
  serialize(value: any): string {
    if (typeof value === 'string') return value;
    throw new Error('Address must be a string');
  },
  parseValue(value: any): string {
    if (typeof value === 'string') return value;
    throw new Error('Address must be a string');
  },
  parseLiteral(ast): string {
    if (ast.kind === Kind.STRING) return ast.value;
    throw new Error('Address must be a string');
  },
});

const jsonScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON object',
  serialize(value: any): any {
    return value;
  },
  parseValue(value: any): any {
    return value;
  },
  parseLiteral(ast): any {
    switch (ast.kind) {
      case Kind.STRING:
        try {
          return JSON.parse(ast.value);
        } catch {
          return ast.value;
        }
      case Kind.OBJECT:
        return ast;
      default:
        return null;
    }
  },
});

export const resolvers = {
  // Custom scalars
  Timestamp: timestampScalar,
  Address: addressScalar,
  JSON: jsonScalar,

  // Query resolvers
  Query: {
    ...playerResolvers.Query,
    ...marketplaceResolvers.Query,
    ...socialResolvers.Query,
    ...questResolvers.Query,
    ...notificationResolvers.Query,
    ...gameResolvers.Query,
  },

  // Mutation resolvers
  Mutation: {
    ...playerResolvers.Mutation,
    ...marketplaceResolvers.Mutation,
    ...socialResolvers.Mutation,
    ...questResolvers.Mutation,
    ...notificationResolvers.Mutation,
    ...gameResolvers.Mutation,
  },

  // Subscription resolvers
  Subscription: {
    ...playerResolvers.Subscription,
    ...marketplaceResolvers.Subscription,
    ...socialResolvers.Subscription,
    ...questResolvers.Subscription,
    ...notificationResolvers.Subscription,
    ...gameResolvers.Subscription,
  },

  // Type resolvers for nested fields
  Player: playerResolvers.Player,
  UnifiedProfile: playerResolvers.UnifiedProfile,
  MarketplaceListing: marketplaceResolvers.MarketplaceListing,
  CommunityQuest: questResolvers.CommunityQuest,
  SocialConnection: socialResolvers.SocialConnection,
  Transaction: marketplaceResolvers.Transaction,
};