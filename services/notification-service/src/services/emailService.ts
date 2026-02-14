import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config/config';
import { Notification } from '../models/notification';
import { templateEngine } from '../templates/templateEngine';
import { deliveryRepository, auditRepository } from '../database/datastore';
import { DeliveryStatus } from '../config/config';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private static instance: EmailService;
  private transporter: Transporter | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!config.email.enabled) {
      console.log('Email service is disabled');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.secure,
        auth: {
          user: config.email.smtp.auth.user,
          pass: config.email.smtp.auth.pass
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100
      });

      // Verify connection
      await this.transporter.verify();
      this.initialized = true;
      console.log('Email service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize email service:', error);
      throw error;
    }
  }

  async sendEmail(options: EmailOptions): Promise<SendResult> {
    if (!config.email.enabled || !this.transporter) {
      return { success: false, error: 'Email service is not enabled or initialized' };
    }

    try {
      const result = await this.transporter.sendMail({
        from: `"${config.email.from.name}" <${config.email.from.address}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        attachments: options.attachments
      });

      return {
        success: true,
        messageId: result.messageId
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async sendNotificationEmail(
    notification: Notification,
    recipientEmail: string
  ): Promise<SendResult> {
    // Create delivery record
    const delivery = await deliveryRepository.create({
      notificationId: notification.id,
      channel: 'email',
      status: 'pending',
      recipientAddress: recipientEmail,
      attempts: 0
    });

    let lastError: string | undefined;
    let result: SendResult = { success: false };

    for (let attempt = 1; attempt <= config.email.retryAttempts; attempt++) {
      try {
        // Get template and render
        const template = templateEngine.getTemplate(notification.type);
        const rendered = template
          ? templateEngine.render(template, notification.data as Record<string, string | number | boolean>)
          : { subject: notification.title, body: notification.message };

        result = await this.sendEmail({
          to: recipientEmail,
          subject: rendered.subject,
          text: rendered.body,
          html: rendered.htmlBody
        });

        if (result.success) {
          // Update delivery status
          await deliveryRepository.update(delivery.id, {
            status: 'delivered',
            deliveredAt: new Date(),
            attempts: attempt,
            lastAttemptAt: new Date(),
            metadata: { messageId: result.messageId }
          });

          // Log audit
          await auditRepository.log({
            notificationId: notification.id,
            action: 'delivered',
            channel: 'email',
            userId: notification.userId,
            tenantId: notification.tenantId,
            details: { recipientEmail, messageId: result.messageId }
          });

          return result;
        }

        lastError = result.error;

        // Update delivery with attempt info
        await deliveryRepository.update(delivery.id, {
          attempts: attempt,
          lastAttemptAt: new Date(),
          errorMessage: lastError
        });

        // Exponential backoff before retry
        if (attempt < config.email.retryAttempts) {
          const delay = config.email.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';

        await deliveryRepository.update(delivery.id, {
          attempts: attempt,
          lastAttemptAt: new Date(),
          errorMessage: lastError
        });
      }
    }

    // All retries exhausted
    await deliveryRepository.update(delivery.id, {
      status: 'failed',
      failedAt: new Date(),
      errorMessage: lastError
    });

    await auditRepository.log({
      notificationId: notification.id,
      action: 'failed',
      channel: 'email',
      userId: notification.userId,
      tenantId: notification.tenantId,
      details: { recipientEmail, error: lastError, attempts: config.email.retryAttempts }
    });

    return { success: false, error: lastError };
  }

  async sendBulkEmails(
    notifications: Array<{ notification: Notification; recipientEmail: string }>
  ): Promise<Map<string, SendResult>> {
    const results = new Map<string, SendResult>();

    // Process in batches to avoid overwhelming the SMTP server
    const batchSize = 10;
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const promises = batch.map(async ({ notification, recipientEmail }) => {
        const result = await this.sendNotificationEmail(notification, recipientEmail);
        results.set(notification.id, result);
      });

      await Promise.all(promises);

      // Small delay between batches
      if (i + batchSize < notifications.length) {
        await this.sleep(100);
      }
    }

    return results;
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  getStatus(): { enabled: boolean; initialized: boolean; connected: boolean } {
    return {
      enabled: config.email.enabled,
      initialized: this.initialized,
      connected: this.initialized && this.transporter !== null
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.initialized = false;
    }
  }
}

export const emailService = EmailService.getInstance();

export default emailService;
