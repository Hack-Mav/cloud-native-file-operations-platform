export const config = {
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  datastore: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'file-ops-platform',
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  },
  mfa: {
    issuer: process.env.MFA_ISSUER || 'File Operations Platform',
    window: 2 // Allow 2 time steps before and after current time
  },
  bcrypt: {
    saltRounds: 12
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/auth/oauth/google/callback'
    },
    microsoft: {
      clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET || '',
      redirectUri: process.env.MICROSOFT_OAUTH_REDIRECT_URI || 'http://localhost:3000/auth/oauth/microsoft/callback'
    }
  },
  mfaPolicy: {
    enforceForAdmins: process.env.MFA_ENFORCE_FOR_ADMINS === 'true',
    enforceForAllUsers: process.env.MFA_ENFORCE_FOR_ALL_USERS === 'true',
    gracePeriodDays: parseInt(process.env.MFA_GRACE_PERIOD_DAYS || '30'),
    allowBackupCodes: process.env.MFA_ALLOW_BACKUP_CODES !== 'false'
  }
};

export default config;