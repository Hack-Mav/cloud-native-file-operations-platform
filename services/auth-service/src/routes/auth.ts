import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticate, requireAdmin, requireOwnershipOrAdmin } from '../middleware/auth';
import { 
  validateRegister, 
  validateLogin, 
  validateRefreshToken,
  validateUpdateProfile,
  validateChangePassword,
  validateMfaCode,
  validateDisableMfa,
  validateUpdateUserRoles,
  validateUpdateUserStatus,
  validatePagination,
  validateSearch,
  validateEnforceMfa,
  validateOauthCallback
} from '../validators/authValidators';

const router = Router();
const authController = new AuthController();

// Public routes
router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/refresh', validateRefreshToken, authController.refreshToken);

// Protected routes - require authentication
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, validateUpdateProfile, authController.updateProfile);
router.post('/logout', authenticate, authController.logout);
router.post('/change-password', authenticate, validateChangePassword, authController.changePassword);

// MFA routes - require authentication
router.post('/mfa/setup', authenticate, authController.setupMFA);
router.post('/mfa/verify', authenticate, validateMfaCode, authController.verifyMFA);
router.post('/mfa/disable', authenticate, validateDisableMfa, authController.disableMFA);
router.get('/mfa/status', authenticate, authController.checkMFAStatus);
router.post('/mfa/recovery-codes', authenticate, authController.generateRecoveryCodes);

// User management routes - require admin privileges
router.get('/users', authenticate, requireAdmin, validatePagination, authController.getAllUsers);
router.get('/users/search', authenticate, requireAdmin, validateSearch, authController.searchUsers);
router.get('/users/stats', authenticate, requireAdmin, authController.getUserStats);
router.get('/users/role/:role', authenticate, requireAdmin, validatePagination, authController.getUsersByRole);
router.get('/users/:userId', authenticate, requireOwnershipOrAdmin(), authController.getUserById);
router.put('/users/:userId/roles', authenticate, requireAdmin, validateUpdateUserRoles, authController.updateUserRoles);
router.put('/users/:userId/status', authenticate, requireAdmin, validateUpdateUserStatus, authController.updateUserStatus);
router.delete('/users/:userId', authenticate, requireAdmin, authController.deleteUser);

// OAuth routes - public
router.get('/oauth/providers', authController.getOAuthProviders);
router.get('/oauth/:provider/auth', authController.getOAuthAuthUrl);
router.post('/oauth/:provider/callback', validateOauthCallback, authController.oauthCallback);

// MFA Policy routes - require admin privileges
router.put('/users/:userId/mfa/enforce', authenticate, requireAdmin, validateEnforceMfa, authController.enforceMFA);

export { router as authRoutes };