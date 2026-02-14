import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { notificationService } from '../services/notificationService';
import { preferencesService } from '../services/preferencesService';
import { trackingService } from '../services/trackingService';
import { ValidationError, NotFoundError, ForbiddenError } from '../middleware/errors';
import { NotificationType, NotificationPriority, NotificationChannel } from '../config/config';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ===== Notifications =====

// Get notifications for current user
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const {
      type,
      priority,
      read,
      limit = '50',
      offset = '0'
    } = req.query;

    const notifications = await notificationService.getNotifications(userId, {
      type: type as NotificationType,
      priority: priority as NotificationPriority,
      read: read === undefined ? undefined : read === 'true',
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({
      notifications,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: notifications.length === parseInt(limit as string)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get unread count
router.get('/unread/count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const count = await notificationService.getUnreadCount(userId);

    res.json({ count });
  } catch (error) {
    next(error);
  }
});

// Send a notification (admin only)
router.post('/', authorize('admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      userId,
      tenantId,
      type,
      title,
      message,
      data,
      priority,
      channels
    } = req.body;

    if (!userId || !type || !title || !message) {
      throw new ValidationError('userId, type, title, and message are required');
    }

    const result = await notificationService.send({
      userId,
      tenantId: tenantId || req.user!.tenantId,
      type,
      title,
      message,
      data,
      priority,
      channels
    });

    // Convert Map to object for JSON response
    const deliveryResults: Record<string, { success: boolean; error?: string }> = {};
    result.deliveryResults.forEach((value, key) => {
      deliveryResults[key] = value;
    });

    res.status(201).json({
      notification: result.notification,
      delivery: deliveryResults
    });
  } catch (error) {
    next(error);
  }
});

// Send bulk notifications (admin only)
router.post('/bulk', authorize('admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      userIds,
      tenantId,
      type,
      title,
      message,
      data,
      priority,
      channels
    } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new ValidationError('userIds array is required');
    }

    if (!type || !title || !message) {
      throw new ValidationError('type, title, and message are required');
    }

    const results = await notificationService.sendBulk({
      userIds,
      tenantId: tenantId || req.user!.tenantId,
      type,
      title,
      message,
      data,
      priority,
      channels
    });

    res.status(201).json({
      sent: results.size,
      results: Object.fromEntries(
        Array.from(results.entries()).map(([userId, result]) => [
          userId,
          { notificationId: result.notification.id }
        ])
      )
    });
  } catch (error) {
    next(error);
  }
});

// Get specific notification
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const notification = await notificationService.getNotification(id, userId);

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    res.json({ notification });
  } catch (error) {
    next(error);
  }
});

// Mark notification as read
router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const notification = await notificationService.markAsRead(id, userId);

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    res.json({ notification });
  } catch (error) {
    next(error);
  }
});

// Mark all notifications as read
router.post('/read/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const count = await notificationService.markAllAsRead(userId);

    res.json({ markedAsRead: count });
  } catch (error) {
    next(error);
  }
});

// Delete notification
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const deleted = await notificationService.deleteNotification(id, userId);

    if (!deleted) {
      throw new NotFoundError('Notification not found');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Get delivery status for a notification
router.get('/:id/delivery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    // Verify ownership
    const notification = await notificationService.getNotification(id, userId);
    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    const deliveries = await trackingService.getDeliveryStatus(id);

    res.json({ deliveries });
  } catch (error) {
    next(error);
  }
});

// Get audit trail for a notification
router.get('/:id/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    // Verify ownership
    const notification = await notificationService.getNotification(id, userId);
    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    const audit = await trackingService.getAuditTrail(id);

    res.json({ audit });
  } catch (error) {
    next(error);
  }
});

// ===== Preferences =====

// Get user preferences
router.get('/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const preferences = await preferencesService.getPreferences(userId);

    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

// Update user preferences
router.put('/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const updates = req.body;

    const preferences = await preferencesService.updatePreferences(userId, updates);

    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

// Reset preferences to defaults
router.post('/preferences/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const preferences = await preferencesService.resetPreferences(userId);

    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

// Get available channels
router.get('/preferences/channels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channels = preferencesService.getAvailableChannels();
    res.json({ channels });
  } catch (error) {
    next(error);
  }
});

// Get notification types
router.get('/preferences/types', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const types = preferencesService.getNotificationTypes();
    res.json({ types });
  } catch (error) {
    next(error);
  }
});

// Enable/disable a channel
router.put('/preferences/channels/:channel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { channel } = req.params;
    const { enabled, address } = req.body;

    let preferences;
    if (enabled) {
      preferences = await preferencesService.enableChannel(userId, channel as NotificationChannel, address);
    } else {
      preferences = await preferencesService.disableChannel(userId, channel as NotificationChannel);
    }

    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

// Set quiet hours
router.put('/preferences/quiet-hours', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const quietHours = req.body;

    const preferences = await preferencesService.setQuietHours(userId, quietHours);

    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

// Set digest preferences
router.put('/preferences/digest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const digest = req.body;

    const preferences = await preferencesService.setDigestPreferences(userId, digest);

    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

// ===== Webhooks =====

// Get user webhooks
router.get('/webhooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const webhooks = await preferencesService.getWebhooks(userId);

    // Don't expose secrets in list
    const sanitized = webhooks.map(({ secret, ...rest }) => rest);

    res.json({ webhooks: sanitized });
  } catch (error) {
    next(error);
  }
});

// Create webhook
router.post('/webhooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { url, events, headers } = req.body;

    if (!url || !events || !Array.isArray(events)) {
      throw new ValidationError('url and events array are required');
    }

    const webhook = await preferencesService.createWebhook(
      userId,
      { url, events, headers },
      req.user!.tenantId
    );

    res.status(201).json({ webhook });
  } catch (error) {
    next(error);
  }
});

// Update webhook
router.put('/webhooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const updates = req.body;

    const webhook = await preferencesService.updateWebhook(userId, id, updates);

    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    res.json({ webhook });
  } catch (error) {
    next(error);
  }
});

// Test webhook
router.post('/webhooks/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const result = await preferencesService.testWebhook(userId, id);

    res.json({ result });
  } catch (error) {
    next(error);
  }
});

// Regenerate webhook secret
router.post('/webhooks/:id/regenerate-secret', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const webhook = await preferencesService.regenerateWebhookSecret(userId, id);

    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    res.json({ webhook });
  } catch (error) {
    next(error);
  }
});

// Delete webhook
router.delete('/webhooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const deleted = await preferencesService.deleteWebhook(userId, id);

    if (!deleted) {
      throw new NotFoundError('Webhook not found');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ===== Tracking & Reports =====

// Get delivery stats
router.get('/stats/delivery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { from, to } = req.query;

    const fromDate = from ? new Date(from as string) : undefined;
    const toDate = to ? new Date(to as string) : undefined;

    const stats = await trackingService.getDeliveryStats(userId, fromDate, toDate);

    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

// Get notification history with delivery info
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const {
      limit = '50',
      offset = '0',
      includeDelivery = 'false'
    } = req.query;

    const history = await trackingService.getNotificationHistory(userId, {
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      includeDelivery: includeDelivery === 'true'
    });

    res.json({
      notifications: history,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get audit history
router.get('/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { limit = '100' } = req.query;

    const audit = await trackingService.getUserAuditHistory(userId, parseInt(limit as string));

    res.json({ audit });
  } catch (error) {
    next(error);
  }
});

// Generate delivery report
router.get('/reports/delivery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { from, to } = req.query;

    if (!from || !to) {
      throw new ValidationError('from and to dates are required');
    }

    const report = await trackingService.generateDeliveryReport(
      userId,
      new Date(from as string),
      new Date(to as string)
    );

    res.json({ report });
  } catch (error) {
    next(error);
  }
});

// Retry failed deliveries
router.post('/retry-failed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const count = await trackingService.retryAllFailed(userId);

    res.json({ retriedCount: count });
  } catch (error) {
    next(error);
  }
});

export { router as notificationRoutes };

export default router;
