/**
 * Express.js type extensions
 */

import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    playerId: string;
    cartridgeId?: string;
    sessionToken?: string;
    // Add other user properties as needed
  };
}

// You can also declare module augmentation if you want to extend the global Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        playerId: string;
        cartridgeId?: string;
        sessionToken?: string;
      };
    }
  }
}