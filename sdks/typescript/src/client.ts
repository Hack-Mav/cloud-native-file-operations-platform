/**
 * Main FileOps Client
 */

import { HttpClient } from './http';
import { AuthClient } from './auth';
import { FilesClient } from './files';
import { ProcessingClient } from './processing';
import { NotificationsClient } from './notifications';
import { FileOpsConfig, AuthTokens, HealthStatus } from './types';

export class FileOpsClient {
  private http: HttpClient;

  public readonly auth: AuthClient;
  public readonly files: FilesClient;
  public readonly processing: ProcessingClient;
  public readonly notifications: NotificationsClient;

  constructor(config: FileOpsConfig) {
    this.http = new HttpClient(config);

    this.auth = new AuthClient(this.http);
    this.files = new FilesClient(this.http);
    this.processing = new ProcessingClient(this.http);
    this.notifications = new NotificationsClient(this.http);
  }

  /**
   * Set authentication tokens (useful for restoring session)
   */
  setTokens(tokens: AuthTokens): void {
    this.http.setTokens(tokens);
  }

  /**
   * Get current tokens
   */
  getTokens(): AuthTokens | undefined {
    return this.http.getTokens();
  }

  /**
   * Clear authentication (logout)
   */
  clearAuth(): void {
    this.http.clearTokens();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const tokens = this.http.getTokens();
    return !!tokens?.accessToken && tokens.expiresAt > new Date();
  }

  /**
   * Get service health status
   */
  async health(): Promise<HealthStatus> {
    return this.http.get<HealthStatus>('/health');
  }

  /**
   * Check if service is ready
   */
  async ready(): Promise<boolean> {
    try {
      await this.http.get('/health/ready');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if service is alive
   */
  async alive(): Promise<boolean> {
    try {
      await this.http.get('/health/live');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a new FileOps client instance
 */
export function createClient(config: FileOpsConfig): FileOpsClient {
  return new FileOpsClient(config);
}
