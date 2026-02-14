import crypto from 'crypto';
import { config } from '../config/config';
import { Notification } from '../models/notification';
import { WebhookRegistration } from '../models/preferences';
import { webhookRepository, deliveryRepository, auditRepository } from '../database/datastore';
import { NotificationType } from '../config/config';

interface WebhookPayload {
  id: string;
  type: NotificationType;
  timestamp: string;
  data: {
    notificationId: string;
    title: string;
    message: string;
    priority: string;
    payload?: Record<string, unknown>;
  };
}

interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  duration?: number;
}

export class WebhookService {
  private static instance: WebhookService;

  private constructor() {}

  static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  createPayload(notification: Notification): WebhookPayload {
    return {
      id: crypto.randomUUID(),
      type: notification.type,
      timestamp: new Date().toISOString(),
      data: {
        notificationId: notification.id,
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        payload: notification.data
      }
    };
  }

  async deliverWebhook(
    webhook: WebhookRegistration,
    notification: Notification
  ): Promise<WebhookDeliveryResult> {
    const payload = this.createPayload(notification);
    const payloadString = JSON.stringify(payload);
    const signature = this.generateSignature(payloadString, webhook.secret);

    // Create delivery record
    const delivery = await deliveryRepository.create({
      notificationId: notification.id,
      channel: 'webhook',
      status: 'pending',
      recipientAddress: webhook.url,
      attempts: 0,
      metadata: { webhookId: webhook.id }
    });

    let lastError: string | undefined;
    let result: WebhookDeliveryResult = { success: false };

    for (let attempt = 1; attempt <= config.webhook.retryAttempts; attempt++) {
      const startTime = Date.now();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.webhook.timeoutMs);

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Id': webhook.id,
            'X-Delivery-Id': delivery.id,
            'X-Event-Type': notification.type,
            'User-Agent': 'FileOps-Webhook/1.0',
            ...webhook.headers
          },
          body: payloadString,
          signal: controller.signal
        });

        clearTimeout(timeout);
        const duration = Date.now() - startTime;

        const responseBody = await response.text().catch(() => '');

        if (response.ok) {
          result = {
            success: true,
            statusCode: response.status,
            responseBody: responseBody.substring(0, 1000), // Limit response body storage
            duration
          };

          // Update delivery status
          await deliveryRepository.update(delivery.id, {
            status: 'delivered',
            deliveredAt: new Date(),
            attempts: attempt,
            lastAttemptAt: new Date(),
            metadata: {
              webhookId: webhook.id,
              statusCode: response.status,
              duration
            }
          });

          // Update webhook last delivery
          await webhookRepository.update(webhook.id, {
            lastDeliveryAt: new Date(),
            lastDeliveryStatus: 'success',
            failureCount: 0
          });

          // Log audit
          await auditRepository.log({
            notificationId: notification.id,
            action: 'delivered',
            channel: 'webhook',
            userId: notification.userId,
            tenantId: notification.tenantId,
            details: {
              webhookId: webhook.id,
              url: webhook.url,
              statusCode: response.status,
              duration
            }
          });

          return result;
        }

        // Non-2xx response
        lastError = `HTTP ${response.status}: ${responseBody.substring(0, 200)}`;
        result = {
          success: false,
          statusCode: response.status,
          responseBody: responseBody.substring(0, 1000),
          error: lastError,
          duration
        };
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = `Request timeout after ${config.webhook.timeoutMs}ms`;
        } else {
          lastError = error instanceof Error ? error.message : 'Unknown error';
        }

        result = {
          success: false,
          error: lastError,
          duration
        };
      }

      // Update delivery with attempt info
      await deliveryRepository.update(delivery.id, {
        attempts: attempt,
        lastAttemptAt: new Date(),
        errorMessage: lastError
      });

      // Exponential backoff before retry
      if (attempt < config.webhook.retryAttempts) {
        const delay = config.webhook.retryDelayMs * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    await deliveryRepository.update(delivery.id, {
      status: 'failed',
      failedAt: new Date(),
      errorMessage: lastError
    });

    // Update webhook failure count
    await webhookRepository.update(webhook.id, {
      lastDeliveryAt: new Date(),
      lastDeliveryStatus: 'failure',
      failureCount: webhook.failureCount + 1
    });

    // Disable webhook if too many failures
    if (webhook.failureCount + 1 >= 10) {
      await webhookRepository.update(webhook.id, { active: false });
      console.warn(`Webhook ${webhook.id} disabled due to repeated failures`);
    }

    await auditRepository.log({
      notificationId: notification.id,
      action: 'failed',
      channel: 'webhook',
      userId: notification.userId,
      tenantId: notification.tenantId,
      details: {
        webhookId: webhook.id,
        url: webhook.url,
        error: lastError,
        attempts: config.webhook.retryAttempts
      }
    });

    return result;
  }

  async deliverToAllWebhooks(notification: Notification): Promise<Map<string, WebhookDeliveryResult>> {
    const results = new Map<string, WebhookDeliveryResult>();

    // Find all active webhooks subscribed to this event type
    const webhooks = await webhookRepository.findActiveByEvent(notification.type);

    // Filter by user if notification is user-specific
    const relevantWebhooks = webhooks.filter(
      (w) => w.userId === notification.userId || w.tenantId === notification.tenantId
    );

    // Deliver to all webhooks in parallel
    const promises = relevantWebhooks.map(async (webhook) => {
      const result = await this.deliverWebhook(webhook, notification);
      results.set(webhook.id, result);
    });

    await Promise.all(promises);

    return results;
  }

  async testWebhook(webhook: WebhookRegistration): Promise<WebhookDeliveryResult> {
    const testPayload: WebhookPayload = {
      id: crypto.randomUUID(),
      type: 'custom',
      timestamp: new Date().toISOString(),
      data: {
        notificationId: 'test-notification',
        title: 'Webhook Test',
        message: 'This is a test notification to verify your webhook endpoint.',
        priority: 'low',
        payload: { test: true }
      }
    };

    const payloadString = JSON.stringify(testPayload);
    const signature = this.generateSignature(payloadString, webhook.secret);

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.webhook.timeoutMs);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Id': webhook.id,
          'X-Event-Type': 'test',
          'User-Agent': 'FileOps-Webhook/1.0',
          ...webhook.headers
        },
        body: payloadString,
        signal: controller.signal
      });

      clearTimeout(timeout);
      const duration = Date.now() - startTime;
      const responseBody = await response.text().catch(() => '');

      return {
        success: response.ok,
        statusCode: response.status,
        responseBody: responseBody.substring(0, 1000),
        duration,
        error: response.ok ? undefined : `HTTP ${response.status}`
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus(): { enabled: boolean } {
    return {
      enabled: config.webhook.enabled
    };
  }
}

export const webhookService = WebhookService.getInstance();

export default webhookService;
