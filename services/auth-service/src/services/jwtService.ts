import * as jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { User } from '../models/User';

export interface JWTPayload {
  userId: string;
  email: string;
  roles: string[];
  type: 'access' | 'refresh';
  exp?: number;
  iat?: number;
  iss?: string;
  aud?: string;
}

export class JWTService {
  private static instance: JWTService;

  private constructor() {}

  public static getInstance(): JWTService {
    if (!JWTService.instance) {
      JWTService.instance = new JWTService();
    }
    return JWTService.instance;
  }

  /**
   * Generate access token
   */
  generateAccessToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id!,
      email: user.email,
      roles: user.roles,
      type: 'access'
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
      issuer: 'auth-service',
      audience: 'file-ops-platform'
    } as any);
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id!,
      email: user.email,
      roles: user.roles,
      type: 'refresh'
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: 'auth-service',
      audience: 'file-ops-platform'
    } as any);
  }

  /**
   * Generate both access and refresh tokens
   */
  generateTokens(user: User): { accessToken: string; refreshToken: string; expiresIn: number } {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    
    // Calculate expiration time in seconds
    const expiresIn = this.getTokenExpirationTime(config.jwt.expiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn
    };
  }

  /**
   * Verify and decode token
   */
  verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer: 'auth-service',
        audience: 'file-ops-platform'
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded) return true;

      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp ? decoded.exp < currentTime : true;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiration time in seconds
   */
  private getTokenExpirationTime(expiresIn: string): number {
    // Parse expiration string (e.g., '24h', '7d', '60s')
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default to 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 3600;
    }
  }
}

export const jwtService = JWTService.getInstance();