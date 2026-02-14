import { PubSub, Message, Subscription } from '@google-cloud/pubsub';
import { config } from '../config/config';
import { NotificationType, NotificationPriority, NotificationChannel } from '../config/config';
import { notificationService } from './notificationService';

interface NotificationMessage {
  type: NotificationType;
  userId: string;
  tenantId?: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
}

interface ProcessingEventMessage {
  eventType: 'job_started' | 'job_completed' | 'job_failed' | 'batch_completed';
  jobId: string;
  userId: string;
  tenantId?: string;
  data: Record<string, unknown>;
}

export class PubSubService {
  private static instance: PubSubService;
  private pubsub: PubSub;
  private subscriptions: Map<string, Subscription> = new Map();
  private initialized = false;

  private constructor() {
    this.pubsub = new PubSub({
      projectId: config.pubsub.projectId
    });
  }

  static getInstance(): PubSubService {
    if (!PubSubService.instance) {
      PubSubService.instance = new PubSubService();
    }
    return PubSubService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Subscribe to notification events
      await this.subscribeToNotifications();

      // Subscribe to processing events
      await this.subscribeToProcessingEvents();

      this.initialized = true;
      console.log('Pub/Sub service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Pub/Sub service:', error);
      throw error;
    }
  }

  private async subscribeToNotifications(): Promise<void> {
    const subscriptionName = config.pubsub.subscriptions.notifications;

    try {
      const subscription = this.pubsub.subscription(subscriptionName);

      // Check if subscription exists
      const [exists] = await subscription.exists();
      if (!exists) {
        console.warn(`Subscription ${subscriptionName} does not exist. Creating...`);
        const topic = this.pubsub.topic(config.pubsub.topics.notifications);
        await topic.createSubscription(subscriptionName);
      }

      subscription.on('message', (message: Message) => {
        this.handleNotificationMessage(message);
      });

      subscription.on('error', (error) => {
        console.error('Notification subscription error:', error);
      });

      this.subscriptions.set('notifications', subscription);
      console.log(`Subscribed to ${subscriptionName}`);
    } catch (error) {
      console.error(`Failed to subscribe to ${subscriptionName}:`, error);
    }
  }

  private async subscribeToProcessingEvents(): Promise<void> {
    const subscriptionName = config.pubsub.subscriptions.processingEvents;

    try {
      const subscription = this.pubsub.subscription(subscriptionName);

      // Check if subscription exists
      const [exists] = await subscription.exists();
      if (!exists) {
        console.warn(`Subscription ${subscriptionName} does not exist. Skipping...`);
        return;
      }

      subscription.on('message', (message: Message) => {
        this.handleProcessingEventMessage(message);
      });

      subscription.on('error', (error) => {
        console.error('Processing events subscription error:', error);
      });

      this.subscriptions.set('processingEvents', subscription);
      console.log(`Subscribed to ${subscriptionName}`);
    } catch (error) {
      console.error(`Failed to subscribe to ${subscriptionName}:`, error);
    }
  }

  private async handleNotificationMessage(message: Message): Promise<void> {
    try {
      const data = JSON.parse(message.data.toString()) as NotificationMessage;

      console.log('Received notification message:', data.type);

      await notificationService.send({
        userId: data.userId,
        tenantId: data.tenantId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data,
        priority: data.priority,
        channels: data.channels
      });

      message.ack();
    } catch (error) {
      console.error('Failed to process notification message:', error);

      // Nack to retry or move to dead letter queue
      message.nack();
    }
  }

  private async handleProcessingEventMessage(message: Message): Promise<void> {
    try {
      const event = JSON.parse(message.data.toString()) as ProcessingEventMessage;

      console.log('Received processing event:', event.eventType);

      // Map processing events to notifications
      const notificationData = this.mapProcessingEventToNotification(event);

      if (notificationData) {
        await notificationService.send(notificationData);
      }

      message.ack();
    } catch (error) {
      console.error('Failed to process processing event message:', error);
      message.nack();
    }
  }

  private mapProcessingEventToNotification(event: ProcessingEventMessage): {
    userId: string;
    tenantId?: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    priority?: NotificationPriority;
  } | null {
    const { eventType, jobId, userId, tenantId, data } = event;

    switch (eventType) {
      case 'job_started':
        return {
          userId,
          tenantId,
          type: 'processing_started',
          title: 'Processing Started',
          message: `Processing has started for job ${jobId}`,
          data: { jobId, ...data },
          priority: 'low'
        };

      case 'job_completed':
        return {
          userId,
          tenantId,
          type: 'processing_completed',
          title: 'Processing Completed',
          message: `Processing has completed for job ${jobId}`,
          data: { jobId, ...data },
          priority: 'medium'
        };

      case 'job_failed':
        return {
          userId,
          tenantId,
          type: 'processing_failed',
          title: 'Processing Failed',
          message: `Processing has failed for job ${jobId}`,
          data: { jobId, ...data },
          priority: 'high'
        };

      case 'batch_completed':
        return {
          userId,
          tenantId,
          type: 'batch_completed',
          title: 'Batch Processing Completed',
          message: `Batch processing has completed`,
          data: { ...data },
          priority: 'medium'
        };

      default:
        console.warn(`Unknown processing event type: ${eventType}`);
        return null;
    }
  }

  async publishNotification(notification: NotificationMessage): Promise<string> {
    const topic = this.pubsub.topic(config.pubsub.topics.notifications);
    const data = Buffer.from(JSON.stringify(notification));

    const messageId = await topic.publishMessage({ data });
    return messageId;
  }

  async publishToDeadLetter(message: unknown, error: string): Promise<string> {
    const topic = this.pubsub.topic(config.pubsub.topics.deadLetter);
    const data = Buffer.from(
      JSON.stringify({
        originalMessage: message,
        error,
        timestamp: new Date().toISOString()
      })
    );

    const messageId = await topic.publishMessage({ data });
    return messageId;
  }

  getStatus(): {
    initialized: boolean;
    subscriptions: string[];
  } {
    return {
      initialized: this.initialized,
      subscriptions: Array.from(this.subscriptions.keys())
    };
  }

  async close(): Promise<void> {
    for (const [name, subscription] of this.subscriptions) {
      try {
        await subscription.close();
        console.log(`Closed subscription: ${name}`);
      } catch (error) {
        console.error(`Error closing subscription ${name}:`, error);
      }
    }
    this.subscriptions.clear();
    this.initialized = false;
  }
}

export const pubsubService = PubSubService.getInstance();

export default pubsubService;
