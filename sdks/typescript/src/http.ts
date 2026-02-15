/**
 * HTTP Client for API communication
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import {
  FileOpsError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  ServerError,
} from './errors';
import { FileOpsConfig, AuthTokens } from './types';

export class HttpClient {
  private axios: AxiosInstance;
  private config: FileOpsConfig;
  private tokens?: AuthTokens;
  private refreshPromise?: Promise<AuthTokens>;

  constructor(config: FileOpsConfig) {
    this.config = config;

    this.axios = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Set authentication tokens
   */
  setTokens(tokens: AuthTokens): void {
    this.tokens = tokens;
  }

  /**
   * Clear authentication tokens
   */
  clearTokens(): void {
    this.tokens = undefined;
  }

  /**
   * Get current tokens
   */
  getTokens(): AuthTokens | undefined {
    return this.tokens;
  }

  /**
   * Setup request/response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor - add auth headers
    this.axios.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.config.apiKey) {
          config.headers['X-API-Key'] = this.config.apiKey;
        }

        if (this.tokens?.accessToken) {
          config.headers.Authorization = `Bearer ${this.tokens.accessToken}`;
        }

        return config;
      },
      (error) => Promise.reject(this.handleError(error))
    );

    // Response interceptor - handle errors and token refresh
    this.axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Handle token refresh
        if (
          error.response?.status === 401 &&
          this.tokens?.refreshToken &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;

          try {
            const newTokens = await this.refreshTokens();
            originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
            return this.axios(originalRequest);
          } catch (refreshError) {
            this.clearTokens();
            throw this.handleError(refreshError);
          }
        }

        throw this.handleError(error);
      }
    );
  }

  /**
   * Refresh access tokens
   */
  private async refreshTokens(): Promise<AuthTokens> {
    // Deduplicate concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefreshTokens();

    try {
      const tokens = await this.refreshPromise;
      return tokens;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async doRefreshTokens(): Promise<AuthTokens> {
    const response = await axios.post(`${this.config.baseUrl}/auth/refresh`, {
      refreshToken: this.tokens?.refreshToken,
    });

    const tokens: AuthTokens = {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      tokenType: response.data.tokenType,
      expiresIn: response.data.expiresIn,
      expiresAt: new Date(Date.now() + response.data.expiresIn * 1000),
    };

    this.tokens = tokens;

    if (this.config.onTokenRefresh) {
      await this.config.onTokenRefresh(tokens);
    }

    return tokens;
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: unknown): FileOpsError {
    if (axios.isAxiosError(error)) {
      const response = error.response;
      const requestId = response?.headers?.['x-request-id'];

      if (!response) {
        if (error.code === 'ECONNABORTED') {
          return new TimeoutError();
        }
        return new NetworkError(error.message, error);
      }

      const errorData = response.data?.error || {};
      const message = errorData.message || error.message;
      const code = errorData.code || 'UNKNOWN_ERROR';
      const details = errorData.details;

      switch (response.status) {
        case 400:
          return new ValidationError(message, details?.field, details);
        case 401:
          return new AuthenticationError(message, details);
        case 403:
          return new AuthorizationError(message, details);
        case 404:
          return new NotFoundError(undefined, undefined, message);
        case 429: {
          const retryAfter = parseInt(response.headers['retry-after'] || '60', 10);
          const limit = parseInt(response.headers['x-ratelimit-limit'] || '0', 10);
          const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '0', 10);
          const reset = response.headers['x-ratelimit-reset']
            ? new Date(parseInt(response.headers['x-ratelimit-reset'], 10) * 1000)
            : undefined;
          return new RateLimitError(retryAfter, limit, remaining, reset);
        }
        case 500:
        case 502:
        case 503:
        case 504:
          return new ServerError(message, details);
        default:
          return new FileOpsError(message, code, response.status, details, requestId);
      }
    }

    if (error instanceof FileOpsError) {
      return error;
    }

    return new FileOpsError(
      error instanceof Error ? error.message : 'Unknown error',
      'UNKNOWN_ERROR'
    );
  }

  /**
   * Make GET request
   */
  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axios.get<T>(path, config);
    return response.data;
  }

  /**
   * Make POST request
   */
  async post<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axios.post<T>(path, data, config);
    return response.data;
  }

  /**
   * Make PUT request
   */
  async put<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axios.put<T>(path, data, config);
    return response.data;
  }

  /**
   * Make PATCH request
   */
  async patch<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axios.patch<T>(path, data, config);
    return response.data;
  }

  /**
   * Make DELETE request
   */
  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axios.delete<T>(path, config);
    return response.data;
  }

  /**
   * Make multipart form request (for file uploads)
   */
  async upload<T>(
    path: string,
    formData: FormData,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axios.post<T>(path, formData, {
      ...config,
      headers: {
        ...config?.headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * Get raw axios response
   */
  async request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axios.request<T>(config);
  }
}
