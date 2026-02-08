import { Request, Response, NextFunction } from 'express';

interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'uuid';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => boolean | string;
}

interface ValidationSchema {
  body?: ValidationRule[];
  query?: ValidationRule[];
  params?: ValidationRule[];
  headers?: ValidationRule[];
}

interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export class RequestValidator {
  static validate(schema: ValidationSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const errors: ValidationError[] = [];

      // Validate body
      if (schema.body) {
        errors.push(...this.validateObject(req.body || {}, schema.body, 'body'));
      }

      // Validate query parameters
      if (schema.query) {
        errors.push(...this.validateObject(req.query, schema.query, 'query'));
      }

      // Validate path parameters
      if (schema.params) {
        errors.push(...this.validateObject(req.params, schema.params, 'params'));
      }

      // Validate headers
      if (schema.headers) {
        errors.push(...this.validateObject(req.headers, schema.headers, 'headers'));
      }

      if (errors.length > 0) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: errors,
            timestamp: new Date().toISOString(),
            requestId: req.correlationId
          }
        });
      }

      next();
    };
  }

  private static validateObject(
    obj: any,
    rules: ValidationRule[],
    context: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      const value = obj[rule.field];
      const fieldPath = `${context}.${rule.field}`;

      // Check required fields
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: fieldPath,
          message: `${rule.field} is required`,
          value
        });
        continue;
      }

      // Skip validation if field is not required and not present
      if (!rule.required && (value === undefined || value === null)) {
        continue;
      }

      // Type validation
      const typeError = this.validateType(value, rule.type, fieldPath);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      // Length/size validation
      if (rule.min !== undefined || rule.max !== undefined) {
        const sizeError = this.validateSize(value, rule, fieldPath);
        if (sizeError) {
          errors.push(sizeError);
        }
      }

      // Pattern validation
      if (rule.pattern && typeof value === 'string') {
        if (!rule.pattern.test(value)) {
          errors.push({
            field: fieldPath,
            message: `${rule.field} does not match required pattern`,
            value
          });
        }
      }

      // Enum validation
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push({
          field: fieldPath,
          message: `${rule.field} must be one of: ${rule.enum.join(', ')}`,
          value
        });
      }

      // Custom validation
      if (rule.custom) {
        const customResult = rule.custom(value);
        if (customResult !== true) {
          errors.push({
            field: fieldPath,
            message: typeof customResult === 'string' ? customResult : `${rule.field} is invalid`,
            value
          });
        }
      }
    }

    return errors;
  }

  private static validateType(value: any, type: string, fieldPath: string): ValidationError | null {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            field: fieldPath,
            message: `Expected string, got ${typeof value}`,
            value
          };
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            field: fieldPath,
            message: `Expected number, got ${typeof value}`,
            value
          };
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            field: fieldPath,
            message: `Expected boolean, got ${typeof value}`,
            value
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return {
            field: fieldPath,
            message: `Expected array, got ${typeof value}`,
            value
          };
        }
        break;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          return {
            field: fieldPath,
            message: `Expected object, got ${typeof value}`,
            value
          };
        }
        break;

      case 'email':
        if (typeof value !== 'string' || !this.isValidEmail(value)) {
          return {
            field: fieldPath,
            message: 'Invalid email format',
            value
          };
        }
        break;

      case 'uuid':
        if (typeof value !== 'string' || !this.isValidUUID(value)) {
          return {
            field: fieldPath,
            message: 'Invalid UUID format',
            value
          };
        }
        break;
    }

    return null;
  }

  private static validateSize(value: any, rule: ValidationRule, fieldPath: string): ValidationError | null {
    let size: number;

    if (typeof value === 'string' || Array.isArray(value)) {
      size = value.length;
    } else if (typeof value === 'number') {
      size = value;
    } else {
      return null; // Skip size validation for other types
    }

    if (rule.min !== undefined && size < rule.min) {
      return {
        field: fieldPath,
        message: `Minimum ${typeof value === 'number' ? 'value' : 'length'} is ${rule.min}`,
        value
      };
    }

    if (rule.max !== undefined && size > rule.max) {
      return {
        field: fieldPath,
        message: `Maximum ${typeof value === 'number' ? 'value' : 'length'} is ${rule.max}`,
        value
      };
    }

    return null;
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}

// Common validation schemas
export const commonSchemas = {
  pagination: {
    query: [
      { field: 'page', type: 'number' as const, min: 1 },
      { field: 'limit', type: 'number' as const, min: 1, max: 100 },
      { field: 'sort', type: 'string' as const },
      { field: 'order', type: 'string' as const, enum: ['asc', 'desc'] }
    ]
  },

  fileUpload: {
    body: [
      { field: 'name', type: 'string' as const, required: true, min: 1, max: 255 },
      { field: 'description', type: 'string' as const, max: 1000 },
      { field: 'tags', type: 'array' as const },
      { field: 'isPublic', type: 'boolean' as const }
    ]
  },

  userAuth: {
    body: [
      { field: 'email', type: 'email' as const, required: true },
      { field: 'password', type: 'string' as const, required: true, min: 8 }
    ]
  },

  apiKey: {
    body: [
      { field: 'name', type: 'string' as const, required: true, min: 1, max: 100 },
      { field: 'description', type: 'string' as const, max: 500 },
      { field: 'scopes', type: 'array' as const, required: true },
      { field: 'expiresIn', type: 'number' as const, min: 3600000 } // Minimum 1 hour
    ]
  }
};

// Middleware factory for common validations
export const validateRequest = {
  pagination: () => RequestValidator.validate(commonSchemas.pagination),
  fileUpload: () => RequestValidator.validate(commonSchemas.fileUpload),
  userAuth: () => RequestValidator.validate(commonSchemas.userAuth),
  apiKey: () => RequestValidator.validate(commonSchemas.apiKey)
};