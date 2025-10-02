import { Request, Response, NextFunction } from 'express';

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'address';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
  sanitize?: boolean;
}

export interface ValidationSchema {
  body?: ValidationRule[];
  query?: ValidationRule[];
  params?: ValidationRule[];
}

export class ValidationService {
  /**
   * Create validation middleware
   */
  static validate(schema: ValidationSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
      const errors: string[] = [];

      // Validate body
      if (schema.body) {
        const bodyErrors = ValidationService.validateObject(req.body, schema.body);
        errors.push(...bodyErrors);
      }

      // Validate query parameters
      if (schema.query) {
        const queryErrors = ValidationService.validateObject(req.query, schema.query);
        errors.push(...queryErrors);
      }

      // Validate URL parameters
      if (schema.params) {
        const paramErrors = ValidationService.validateObject(req.params, schema.params);
        errors.push(...paramErrors);
      }

      if (errors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors
        });
      }

      next();
    };
  }

  /**
   * Validate an object against rules
   */
  private static validateObject(obj: any, rules: ValidationRule[]): string[] {
    const errors: string[] = [];

    for (const rule of rules) {
      const value = obj[rule.field];
      const fieldErrors = ValidationService.validateField(value, rule);
      
      if (fieldErrors.length > 0) {
        errors.push(...fieldErrors.map(error => `${rule.field}: ${error}`));
      }

      // Sanitize if requested
      if (rule.sanitize && value !== undefined) {
        obj[rule.field] = ValidationService.sanitizeValue(value, rule.type);
      }
    }

    return errors;
  }

  /**
   * Validate a single field
   */
  private static validateField(value: any, rule: ValidationRule): string[] {
    const errors: string[] = [];

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push('is required');
      return errors;
    }

    // Skip further validation if value is not provided and not required
    if (value === undefined || value === null) {
      return errors;
    }

    // Type validation
    if (rule.type) {
      const typeError = ValidationService.validateType(value, rule.type);
      if (typeError) {
        errors.push(typeError);
        return errors; // Don't continue if type is wrong
      }
    }

    // Length validation for strings and arrays
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(`must be at least ${rule.minLength} characters long`);
    }

    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push(`must be no more than ${rule.maxLength} characters long`);
    }

    // Numeric range validation
    if (rule.min !== undefined && value < rule.min) {
      errors.push(`must be at least ${rule.min}`);
    }

    if (rule.max !== undefined && value > rule.max) {
      errors.push(`must be no more than ${rule.max}`);
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push('format is invalid');
    }

    // Custom validation
    if (rule.custom) {
      const customResult = rule.custom(value);
      if (customResult !== true) {
        errors.push(typeof customResult === 'string' ? customResult : 'is invalid');
      }
    }

    return errors;
  }

  /**
   * Validate value type
   */
  private static validateType(value: any, type: string): string | null {
    switch (type) {
      case 'string':
        return typeof value !== 'string' ? 'must be a string' : null;
      
      case 'number':
        return typeof value !== 'number' || isNaN(value) ? 'must be a number' : null;
      
      case 'boolean':
        return typeof value !== 'boolean' ? 'must be a boolean' : null;
      
      case 'array':
        return !Array.isArray(value) ? 'must be an array' : null;
      
      case 'object':
        return typeof value !== 'object' || Array.isArray(value) ? 'must be an object' : null;
      
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return typeof value !== 'string' || !emailRegex.test(value) ? 'must be a valid email' : null;
      
      case 'address':
        // Basic Starknet address validation
        const addressRegex = /^0x[0-9a-fA-F]{1,64}$/;
        return typeof value !== 'string' || !addressRegex.test(value) ? 'must be a valid address' : null;
      
      default:
        return null;
    }
  }

  /**
   * Sanitize value based on type
   */
  private static sanitizeValue(value: any, type?: string): any {
    if (typeof value !== 'string') {
      return value;
    }

    // Basic HTML sanitization
    let sanitized = value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    // Trim whitespace
    sanitized = sanitized.trim();

    // Type-specific sanitization
    if (type === 'email') {
      sanitized = sanitized.toLowerCase();
    }

    return sanitized;
  }

  /**
   * Common validation schemas
   */
  static schemas = {
    // Authentication schemas
    login: {
      body: [
        { field: 'cartridgeId', required: true, type: 'string' as const, minLength: 1, maxLength: 100, sanitize: true }
      ]
    },

    loginWithSignature: {
      body: [
        { field: 'cartridgeId', required: true, type: 'string' as const, minLength: 1, maxLength: 100, sanitize: true },
        { field: 'walletAddress', required: true, type: 'address' as const },
        { field: 'message', required: true, type: 'string' as const, maxLength: 1000, sanitize: true },
        { field: 'timestamp', required: true, type: 'number' as const },
        { field: 'signature', required: true, type: 'object' as const }
      ]
    },

    refreshToken: {
      body: [
        { field: 'refreshToken', required: true, type: 'string' as const, minLength: 1, sanitize: true }
      ]
    },

    // Profile schemas
    updateProfile: {
      body: [
        { field: 'displayName', type: 'string' as const, minLength: 1, maxLength: 50, sanitize: true },
        { field: 'avatar', type: 'string' as const, maxLength: 500, sanitize: true },
        { field: 'socialSettings', type: 'object' as const }
      ]
    },

    // Marketplace schemas
    createListing: {
      body: [
        { field: 'assetId', required: true, type: 'string' as const, minLength: 1, sanitize: true },
        { field: 'priceInBTC', required: true, type: 'number' as const, min: 0.00000001 },
        { field: 'priceInStarknet', type: 'number' as const, min: 0 },
        { field: 'expiresAt', type: 'number' as const }
      ]
    },

    purchaseWithBTC: {
      body: [
        { field: 'buyerWallet', required: true, type: 'address' as const }
      ]
    },

    // Social schemas
    sendFriendRequest: {
      body: [
        { field: 'friendId', required: true, type: 'string' as const, minLength: 1, sanitize: true },
        { field: 'message', type: 'string' as const, maxLength: 500, sanitize: true }
      ]
    },

    // Quest schemas
    createQuest: {
      body: [
        { field: 'title', required: true, type: 'string' as const, minLength: 1, maxLength: 100, sanitize: true },
        { field: 'description', required: true, type: 'string' as const, minLength: 1, maxLength: 1000, sanitize: true },
        { field: 'requirements', required: true, type: 'array' as const },
        { field: 'rewards', required: true, type: 'array' as const },
        { field: 'startDate', required: true, type: 'number' as const },
        { field: 'endDate', required: true, type: 'number' as const }
      ]
    },

    // Pagination schemas
    pagination: {
      query: [
        { field: 'page', type: 'number' as const, min: 1, max: 1000 },
        { field: 'limit', type: 'number' as const, min: 1, max: 100 }
      ]
    },

    // Search schemas
    search: {
      query: [
        { field: 'query', required: true, type: 'string' as const, minLength: 2, maxLength: 100, sanitize: true },
        { field: 'limit', type: 'number' as const, min: 1, max: 50 }
      ]
    }
  };
}