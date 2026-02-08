import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errors';
import { USER_ROLES } from '../models/User';

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 100 characters',
      'any.required': 'Name is required'
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
  roles: Joi.array()
    .items(Joi.string().valid(...Object.values(USER_ROLES)))
    .optional()
    .messages({
      'array.includes': `Roles must be one of: ${Object.values(USER_ROLES).join(', ')}`
    })
});

const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    }),
  mfaCode: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .optional()
    .messages({
      'string.length': 'MFA code must be 6 digits',
      'string.pattern.base': 'MFA code must contain only numbers'
    })
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required'
    })
});

const updateProfileSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 100 characters'
    }),
  preferences: Joi.object({
    notifications: Joi.object({
      email: Joi.boolean().optional(),
      push: Joi.boolean().optional(),
      sms: Joi.boolean().optional()
    }).optional(),
    ui: Joi.object({
      theme: Joi.string().valid('light', 'dark').optional(),
      language: Joi.string().min(2).max(5).optional()
    }).optional()
  }).optional()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters long',
      'string.max': 'New password cannot exceed 128 characters',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'New password is required'
    })
});

const mfaCodeSchema = Joi.object({
  code: Joi.string()
    .required()
    .messages({
      'any.required': 'MFA code is required'
    })
});

const disableMfaSchema = Joi.object({
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required to disable MFA'
    })
});

const updateUserRolesSchema = Joi.object({
  roles: Joi.array()
    .items(Joi.string().valid(...Object.values(USER_ROLES)))
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one role is required',
      'array.includes': `Roles must be one of: ${Object.values(USER_ROLES).join(', ')}`,
      'any.required': 'Roles are required'
    })
});

const updateUserStatusSchema = Joi.object({
  status: Joi.string()
    .valid('active', 'inactive', 'suspended', 'pending')
    .required()
    .messages({
      'any.only': 'Status must be one of: active, inactive, suspended, pending',
      'any.required': 'Status is required'
    })
});

// Validation middleware factory
const createValidator = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      throw createError(errorMessage, 400, 'VALIDATION_ERROR');
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

// Query parameter validation
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('createdAt', 'name', 'email', 'lastLoginAt').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const searchSchema = Joi.object({
  q: Joi.string().min(1).max(100).required().messages({
    'string.min': 'Search term must be at least 1 character long',
    'string.max': 'Search term cannot exceed 100 characters',
    'any.required': 'Search term (q) is required'
  }),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('createdAt', 'name', 'email', 'lastLoginAt').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const enforceMfaSchema = Joi.object({
  enforced: Joi.boolean().required().messages({
    'any.required': 'Enforced flag is required'
  })
});

const oauthCallbackSchema = Joi.object({
  code: Joi.string().required().messages({
    'any.required': 'Authorization code is required'
  }),
  state: Joi.string().optional()
});

const createQueryValidator = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      throw createError(errorMessage, 400, 'VALIDATION_ERROR');
    }

    req.query = value;
    next();
  };
};

// Export validators
export const validateRegister = createValidator(registerSchema);
export const validateLogin = createValidator(loginSchema);
export const validateRefreshToken = createValidator(refreshTokenSchema);
export const validateUpdateProfile = createValidator(updateProfileSchema);
export const validateChangePassword = createValidator(changePasswordSchema);
export const validateMfaCode = createValidator(mfaCodeSchema);
export const validateDisableMfa = createValidator(disableMfaSchema);
export const validateUpdateUserRoles = createValidator(updateUserRolesSchema);
export const validateUpdateUserStatus = createValidator(updateUserStatusSchema);
export const validatePagination = createQueryValidator(paginationSchema);
export const validateSearch = createQueryValidator(searchSchema);
export const validateEnforceMfa = createValidator(enforceMfaSchema);
export const validateOauthCallback = createQueryValidator(oauthCallbackSchema);

// Password strength checker
export const checkPasswordStrength = (password: string): {
  score: number;
  feedback: string[];
} => {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length >= 8) score += 1;
  else feedback.push('Password should be at least 8 characters long');

  if (password.length >= 12) score += 1;

  // Character variety checks
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Password should contain lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Password should contain uppercase letters');

  if (/\d/.test(password)) score += 1;
  else feedback.push('Password should contain numbers');

  if (/[@$!%*?&]/.test(password)) score += 1;
  else feedback.push('Password should contain special characters');

  // Common patterns check
  if (!/(.)\1{2,}/.test(password)) score += 1;
  else feedback.push('Password should not contain repeated characters');

  return { score, feedback };
};

// Email validation helper
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Role validation helper
export const isValidRole = (role: string): boolean => {
  return Object.values(USER_ROLES).includes(role as any);
};