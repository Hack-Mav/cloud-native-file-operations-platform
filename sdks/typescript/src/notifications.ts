/**
 * Notifications Client
 */

import { HttpClient } from './http';
import {
  Notification,
  NotificationPreferences,
  PaginationParams,
  PaginatedResponse,
  NotificationType,
} from './types';

export class NotificationsClient {
  constructor(private http: HttpClient) {}

  /**
   * List notifications
   */
  async list(
    params?: PaginationParams & { unreadOnly?: boolean; type?: NotificationType }
  ): Promise<PaginatedResponse<Notification>> {
    const response = await this.http.get<PaginatedResponse<any>>(
      '/notifications',
      { params }
    );

    return {
      ...response,
      data: response.data.map(this.transformNotification),
    };
  }

  /**
   * Get notification by ID
   */
  async get(notificationId: string): Promise<Notification> {
    const response = await this.http.get<any>(`/notifications/${notificationId}`);
    return this.transformNotification(response);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await this.http.post(`/notifications/${notificationId}/read`);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    await this.http.post('/notifications/read-all');
  }

  /**
   * Delete notification
   */
  async delete(notificationId: string): Promise<void> {
    await this.http.delete(`/notifications/${notificationId}`);
  }

  /**
   * Delete all notifications
   */
  async deleteAll(): Promise<void> {
    await this.http.delete('/notifications');
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    const response = await this.http.get<{ count: number }>('/notifications/unread-count');
    return response.count;
  }

  /**
   * Get notification preferences
   */
  async getPreferences(): Promise<NotificationPreferences> {
    return this.http.get<NotificationPreferences>('/notifications/preferences');
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    return this.http.put<NotificationPreferences>(
      '/notifications/preferences',
      preferences
    );
  }

  /**
   * Subscribe to push notifications
   */
  async subscribePush(subscription: PushSubscriptionJSON): Promise<void> {
    await this.http.post('/notifications/push/subscribe', subscription);
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribePush(endpoint: string): Promise<void> {
    await this.http.post('/notifications/push/unsubscribe', { endpoint });
  }

  /**
   * Test notification delivery
   */
  async sendTest(channel: 'email' | 'push' | 'inApp'): Promise<void> {
    await this.http.post('/notifications/test', { channel });
  }

  /**
   * Get notification history
   */
  async getHistory(
    params?: PaginationParams & {
      startDate?: Date;
      endDate?: Date;
      type?: NotificationType;
    }
  ): Promise<PaginatedResponse<Notification>> {
    const response = await this.http.get<PaginatedResponse<any>>(
      '/notifications/history',
      {
        params: {
          ...params,
          startDate: params?.startDate?.toISOString(),
          endDate: params?.endDate?.toISOString(),
        },
      }
    );

    return {
      ...response,
      data: response.data.map(this.transformNotification),
    };
  }

  /**
   * Transform raw notification response
   */
  private transformNotification(raw: any): Notification {
    return {
      ...raw,
      createdAt: new Date(raw.createdAt),
    };
  }
}

// WebSocket connection for real-time notifications
export class NotificationsWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private handlers: Map<string, Set<(notification: Notification) => void>> = new Map();

  constructor(
    private url: string,
    private token: string
  ) {}

  /**
   * Connect to notifications WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.url}?token=${this.token}`);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('Failed to parse notification:', error);
          }
        };

        this.ws.onerror = (error) => {
          reject(error);
        };

        this.ws.onclose = () => {
          this.handleDisconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Subscribe to notification type
   */
  on(type: NotificationType | '*', handler: (notification: Notification) => void): () => void {
    const key = type;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }
    this.handlers.get(key)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(key)?.delete(handler);
    };
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: any): void {
    const notification: Notification = {
      ...data,
      createdAt: new Date(data.createdAt),
    };

    // Call type-specific handlers
    const typeHandlers = this.handlers.get(notification.type);
    if (typeHandlers) {
      typeHandlers.forEach((handler) => handler(notification));
    }

    // Call wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => handler(notification));
    }
  }

  /**
   * Handle disconnection with reconnect
   */
  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }, delay);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
