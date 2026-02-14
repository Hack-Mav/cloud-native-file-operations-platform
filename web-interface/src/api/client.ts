import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { config } from '@/config';
import { useAuthStore } from '@/store';
import type { ApiResponse, ApiError } from '@/types';

const apiClient: AxiosInstance = axios.create({
  baseURL: config.apiUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (requestConfig: InternalAxiosRequestConfig) => {
    const { tokens, isDemoMode } = useAuthStore.getState();
    
    // Skip API calls in demo mode
    if (isDemoMode) {
      throw new axios.Cancel('Demo mode: API calls are disabled');
    }
    
    if (tokens?.accessToken) {
      requestConfig.headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    return requestConfig;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config;

    // Handle 401 - attempt token refresh
    if (error.response?.status === 401 && originalRequest) {
      const { tokens, logout } = useAuthStore.getState();

      if (tokens?.refreshToken) {
        try {
          const response = await axios.post<ApiResponse<{ accessToken: string; expiresIn: number }>>(
            `${config.apiUrl}/auth/refresh`,
            { refreshToken: tokens.refreshToken }
          );

          if (response.data.success && response.data.data) {
            const newTokens = {
              ...tokens,
              accessToken: response.data.data.accessToken,
              expiresIn: response.data.data.expiresIn,
            };
            useAuthStore.getState().setTokens(newTokens);

            originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
            return apiClient(originalRequest);
          }
        } catch {
          logout();
          window.location.href = '/login';
        }
      } else {
        logout();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export { apiClient };

// Helper function to extract error message
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as ApiError | undefined;
    return apiError?.message || error.message || 'An unexpected error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
