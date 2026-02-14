import { Datastore, Entity, Key } from '@google-cloud/datastore';
import { config } from '../config/config';
import {
  Notification,
  NotificationDelivery,
  NotificationAudit,
  NotificationFilter,
  CreateNotificationInput
} from '../models/notification';
import {
  NotificationPreferences,
  WebhookRegistration,
  DEFAULT_PREFERENCES
} from '../models/preferences';
import { v4 as uuidv4 } from 'uuid';

const datastore = new Datastore({
  projectId: config.datastore.projectId,
  keyFilename: config.datastore.keyFilename
});

const KINDS = {
  NOTIFICATION: 'Notification',
  DELIVERY: 'NotificationDelivery',
  AUDIT: 'NotificationAudit',
  PREFERENCES: 'NotificationPreferences',
  WEBHOOK: 'WebhookRegistration'
};

// Helper to convert entity to plain object
function entityToObject<T>(entity: Entity): T {
  const key = entity[datastore.KEY] as Key;
  const result = { ...entity, id: key.name || key.id } as unknown as T;
  return result;
}

// Notification Repository
export const notificationRepository = {
  async create(input: CreateNotificationInput): Promise<Notification> {
    const id = uuidv4();
    const now = new Date();

    const notification: Notification = {
      id,
      userId: input.userId,
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data,
      priority: input.priority || 'medium',
      channels: input.channels || config.notifications.defaultChannels,
      templateId: input.templateId,
      read: false,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now
    };

    const key = datastore.key([KINDS.NOTIFICATION, id]);
    await datastore.save({ key, data: notification });

    return notification;
  },

  async findById(id: string): Promise<Notification | null> {
    const key = datastore.key([KINDS.NOTIFICATION, id]);
    const [entity] = await datastore.get(key);
    return entity ? entityToObject<Notification>(entity) : null;
  },

  async findByUser(userId: string, filter: NotificationFilter = {}): Promise<Notification[]> {
    let query = datastore
      .createQuery(KINDS.NOTIFICATION)
      .filter('userId', '=', userId)
      .order('createdAt', { descending: true });

    if (filter.read !== undefined) {
      query = query.filter('read', '=', filter.read);
    }

    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      query = query.filter('type', 'IN', types);
    }

    if (filter.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      query = query.filter('priority', 'IN', priorities);
    }

    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    if (filter.offset) {
      query = query.offset(filter.offset);
    }

    const [entities] = await datastore.runQuery(query);
    return entities.map((e) => entityToObject<Notification>(e));
  },

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const notification = await this.findById(id);
    if (!notification || notification.userId !== userId) {
      return null;
    }

    const now = new Date();
    const updated = {
      ...notification,
      read: true,
      readAt: now,
      updatedAt: now
    };

    const key = datastore.key([KINDS.NOTIFICATION, id]);
    await datastore.save({ key, data: updated });

    return updated;
  },

  async markAllAsRead(userId: string): Promise<number> {
    const notifications = await this.findByUser(userId, { read: false });
    const now = new Date();

    const entities = notifications.map((n) => ({
      key: datastore.key([KINDS.NOTIFICATION, n.id]),
      data: { ...n, read: true, readAt: now, updatedAt: now }
    }));

    if (entities.length > 0) {
      await datastore.save(entities);
    }

    return entities.length;
  },

  async delete(id: string, userId: string): Promise<boolean> {
    const notification = await this.findById(id);
    if (!notification || notification.userId !== userId) {
      return false;
    }

    const key = datastore.key([KINDS.NOTIFICATION, id]);
    await datastore.delete(key);
    return true;
  },

  async deleteExpired(): Promise<number> {
    const now = new Date();
    const query = datastore
      .createQuery(KINDS.NOTIFICATION)
      .filter('expiresAt', '<', now);

    const [entities] = await datastore.runQuery(query);
    const keys = entities.map((e) => e[datastore.KEY]);

    if (keys.length > 0) {
      await datastore.delete(keys);
    }

    return keys.length;
  },

  async getUnreadCount(userId: string): Promise<number> {
    const query = datastore
      .createQuery(KINDS.NOTIFICATION)
      .filter('userId', '=', userId)
      .filter('read', '=', false)
      .select('__key__');

    const [entities] = await datastore.runQuery(query);
    return entities.length;
  }
};

// Delivery Repository
export const deliveryRepository = {
  async create(delivery: Omit<NotificationDelivery, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationDelivery> {
    const id = uuidv4();
    const now = new Date();

    const record: NotificationDelivery = {
      ...delivery,
      id,
      createdAt: now,
      updatedAt: now
    };

    const key = datastore.key([KINDS.DELIVERY, id]);
    await datastore.save({ key, data: record });

    return record;
  },

  async findById(id: string): Promise<NotificationDelivery | null> {
    const key = datastore.key([KINDS.DELIVERY, id]);
    const [entity] = await datastore.get(key);
    return entity ? entityToObject<NotificationDelivery>(entity) : null;
  },

  async findByNotification(notificationId: string): Promise<NotificationDelivery[]> {
    const query = datastore
      .createQuery(KINDS.DELIVERY)
      .filter('notificationId', '=', notificationId);

    const [entities] = await datastore.runQuery(query);
    return entities.map((e) => entityToObject<NotificationDelivery>(e));
  },

  async update(id: string, updates: Partial<NotificationDelivery>): Promise<NotificationDelivery | null> {
    const delivery = await this.findById(id);
    if (!delivery) {
      return null;
    }

    const updated = {
      ...delivery,
      ...updates,
      updatedAt: new Date()
    };

    const key = datastore.key([KINDS.DELIVERY, id]);
    await datastore.save({ key, data: updated });

    return updated;
  },

  async getPendingDeliveries(limit: number = 100): Promise<NotificationDelivery[]> {
    const query = datastore
      .createQuery(KINDS.DELIVERY)
      .filter('status', '=', 'pending')
      .order('createdAt')
      .limit(limit);

    const [entities] = await datastore.runQuery(query);
    return entities.map((e) => entityToObject<NotificationDelivery>(e));
  },

  async getFailedDeliveries(maxAttempts: number = 3): Promise<NotificationDelivery[]> {
    const query = datastore
      .createQuery(KINDS.DELIVERY)
      .filter('status', '=', 'failed')
      .filter('attempts', '<', maxAttempts);

    const [entities] = await datastore.runQuery(query);
    return entities.map((e) => entityToObject<NotificationDelivery>(e));
  }
};

// Audit Repository
export const auditRepository = {
  async log(audit: Omit<NotificationAudit, 'id' | 'timestamp'>): Promise<NotificationAudit> {
    const id = uuidv4();

    const record: NotificationAudit = {
      ...audit,
      id,
      timestamp: new Date()
    };

    const key = datastore.key([KINDS.AUDIT, id]);
    await datastore.save({ key, data: record });

    return record;
  },

  async findByNotification(notificationId: string): Promise<NotificationAudit[]> {
    const query = datastore
      .createQuery(KINDS.AUDIT)
      .filter('notificationId', '=', notificationId)
      .order('timestamp', { descending: true });

    const [entities] = await datastore.runQuery(query);
    return entities.map((e) => entityToObject<NotificationAudit>(e));
  },

  async findByUser(userId: string, limit: number = 100): Promise<NotificationAudit[]> {
    const query = datastore
      .createQuery(KINDS.AUDIT)
      .filter('userId', '=', userId)
      .order('timestamp', { descending: true })
      .limit(limit);

    const [entities] = await datastore.runQuery(query);
    return entities.map((e) => entityToObject<NotificationAudit>(e));
  }
};

// Preferences Repository
export const preferencesRepository = {
  async get(userId: string): Promise<NotificationPreferences> {
    const key = datastore.key([KINDS.PREFERENCES, userId]);
    const [entity] = await datastore.get(key);

    if (entity) {
      return entityToObject<NotificationPreferences>(entity);
    }

    // Return default preferences if none exist
    const now = new Date();
    return {
      userId,
      ...DEFAULT_PREFERENCES,
      createdAt: now,
      updatedAt: now
    };
  },

  async save(preferences: NotificationPreferences): Promise<NotificationPreferences> {
    const key = datastore.key([KINDS.PREFERENCES, preferences.userId]);
    const updated = { ...preferences, updatedAt: new Date() };
    await datastore.save({ key, data: updated });
    return updated;
  },

  async update(userId: string, updates: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const current = await this.get(userId);
    const updated = {
      ...current,
      ...updates,
      userId, // ensure userId is not overwritten
      updatedAt: new Date()
    };

    const key = datastore.key([KINDS.PREFERENCES, userId]);
    await datastore.save({ key, data: updated });

    return updated;
  }
};

// Webhook Repository
export const webhookRepository = {
  async create(userId: string, input: { url: string; events: string[]; headers?: Record<string, string> }, tenantId?: string): Promise<WebhookRegistration> {
    const id = uuidv4();
    const secret = uuidv4();
    const now = new Date();

    const webhook: WebhookRegistration = {
      id,
      userId,
      tenantId,
      url: input.url,
      secret,
      events: input.events as any[],
      active: true,
      headers: input.headers,
      createdAt: now,
      updatedAt: now,
      failureCount: 0
    };

    const key = datastore.key([KINDS.WEBHOOK, id]);
    await datastore.save({ key, data: webhook });

    return webhook;
  },

  async findById(id: string): Promise<WebhookRegistration | null> {
    const key = datastore.key([KINDS.WEBHOOK, id]);
    const [entity] = await datastore.get(key);
    return entity ? entityToObject<WebhookRegistration>(entity) : null;
  },

  async findByUser(userId: string): Promise<WebhookRegistration[]> {
    const query = datastore
      .createQuery(KINDS.WEBHOOK)
      .filter('userId', '=', userId);

    const [entities] = await datastore.runQuery(query);
    return entities.map((e) => entityToObject<WebhookRegistration>(e));
  },

  async findActiveByEvent(event: string): Promise<WebhookRegistration[]> {
    const query = datastore
      .createQuery(KINDS.WEBHOOK)
      .filter('active', '=', true);

    const [entities] = await datastore.runQuery(query);
    return entities
      .map((e) => entityToObject<WebhookRegistration>(e))
      .filter((w) => w.events.includes(event as any));
  },

  async update(id: string, updates: Partial<WebhookRegistration>): Promise<WebhookRegistration | null> {
    const webhook = await this.findById(id);
    if (!webhook) {
      return null;
    }

    const updated = {
      ...webhook,
      ...updates,
      updatedAt: new Date()
    };

    const key = datastore.key([KINDS.WEBHOOK, id]);
    await datastore.save({ key, data: updated });

    return updated;
  },

  async delete(id: string, userId: string): Promise<boolean> {
    const webhook = await this.findById(id);
    if (!webhook || webhook.userId !== userId) {
      return false;
    }

    const key = datastore.key([KINDS.WEBHOOK, id]);
    await datastore.delete(key);
    return true;
  }
};

export { datastore };
