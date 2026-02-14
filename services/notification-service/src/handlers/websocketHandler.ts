import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { Notification } from '../models/notification';
import { notificationRepository, deliveryRepository, auditRepository } from '../database/datastore';
import { JwtPayload } from '../middleware/auth';

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

interface ConnectedUser {
  sockets: Set<string>;
  userId: string;
  tenantId?: string;
}

export class WebSocketHandler {
  private static instance: WebSocketHandler;
  private io: SocketIOServer | null = null;
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private socketToUser: Map<string, string> = new Map();

  private constructor() {}

  static getInstance(): WebSocketHandler {
    if (!WebSocketHandler.instance) {
      WebSocketHandler.instance = new WebSocketHandler();
    }
    return WebSocketHandler.instance;
  }

  initialize(httpServer: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: config.websocket.cors,
      pingInterval: config.websocket.pingInterval,
      pingTimeout: config.websocket.pingTimeout,
      transports: ['websocket', 'polling']
    });

    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
        socket.user = decoded;
        next();
      } catch (error) {
        next(new Error('Invalid authentication token'));
      }
    });

    // Connection handling
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });

    console.log('WebSocket handler initialized');
    return this.io;
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    const user = socket.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    console.log(`User ${user.userId} connected via WebSocket (${socket.id})`);

    // Track connected user
    this.addConnectedUser(user.userId, socket.id, user.tenantId);

    // Join user-specific room
    socket.join(`user:${user.userId}`);
    if (user.tenantId) {
      socket.join(`tenant:${user.tenantId}`);
    }

    // Send initial data
    this.sendInitialData(socket, user.userId);

    // Handle events
    socket.on('mark_read', (notificationId: string) => {
      this.handleMarkRead(socket, user.userId, notificationId);
    });

    socket.on('mark_all_read', () => {
      this.handleMarkAllRead(socket, user.userId);
    });

    socket.on('subscribe', (channel: string) => {
      this.handleSubscribe(socket, user, channel);
    });

    socket.on('unsubscribe', (channel: string) => {
      this.handleUnsubscribe(socket, channel);
    });

    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      this.handleDisconnect(socket, user.userId, reason);
    });

    socket.on('error', (error) => {
      console.error(`WebSocket error for user ${user.userId}:`, error);
    });
  }

  private addConnectedUser(userId: string, socketId: string, tenantId?: string): void {
    let user = this.connectedUsers.get(userId);
    if (!user) {
      user = { sockets: new Set(), userId, tenantId };
      this.connectedUsers.set(userId, user);
    }
    user.sockets.add(socketId);
    this.socketToUser.set(socketId, userId);
  }

  private removeConnectedUser(userId: string, socketId: string): void {
    const user = this.connectedUsers.get(userId);
    if (user) {
      user.sockets.delete(socketId);
      if (user.sockets.size === 0) {
        this.connectedUsers.delete(userId);
      }
    }
    this.socketToUser.delete(socketId);
  }

  private async sendInitialData(socket: AuthenticatedSocket, userId: string): Promise<void> {
    try {
      // Get unread count
      const unreadCount = await notificationRepository.getUnreadCount(userId);

      // Get recent notifications
      const recentNotifications = await notificationRepository.findByUser(userId, { limit: 20 });

      socket.emit('initial_data', {
        unreadCount,
        notifications: recentNotifications
      });
    } catch (error) {
      console.error('Failed to send initial data:', error);
      socket.emit('error', { message: 'Failed to load notifications' });
    }
  }

  private async handleMarkRead(socket: AuthenticatedSocket, userId: string, notificationId: string): Promise<void> {
    try {
      const notification = await notificationRepository.markAsRead(notificationId, userId);

      if (notification) {
        // Emit to all user's sockets
        this.io?.to(`user:${userId}`).emit('notification_read', {
          notificationId,
          readAt: notification.readAt
        });

        // Update unread count
        const unreadCount = await notificationRepository.getUnreadCount(userId);
        this.io?.to(`user:${userId}`).emit('unread_count', { count: unreadCount });

        // Log audit
        await auditRepository.log({
          notificationId,
          action: 'read',
          userId,
          details: { socketId: socket.id }
        });
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      socket.emit('error', { message: 'Failed to mark notification as read' });
    }
  }

  private async handleMarkAllRead(socket: AuthenticatedSocket, userId: string): Promise<void> {
    try {
      const count = await notificationRepository.markAllAsRead(userId);

      this.io?.to(`user:${userId}`).emit('all_notifications_read', { count });
      this.io?.to(`user:${userId}`).emit('unread_count', { count: 0 });
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      socket.emit('error', { message: 'Failed to mark all notifications as read' });
    }
  }

  private handleSubscribe(socket: AuthenticatedSocket, user: JwtPayload, channel: string): void {
    // Validate channel access
    if (channel.startsWith('tenant:') && channel !== `tenant:${user.tenantId}`) {
      socket.emit('error', { message: 'Unauthorized channel subscription' });
      return;
    }

    socket.join(channel);
    socket.emit('subscribed', { channel });
  }

  private handleUnsubscribe(socket: AuthenticatedSocket, channel: string): void {
    socket.leave(channel);
    socket.emit('unsubscribed', { channel });
  }

  private handleDisconnect(socket: AuthenticatedSocket, userId: string, reason: string): void {
    console.log(`User ${userId} disconnected (${socket.id}): ${reason}`);
    this.removeConnectedUser(userId, socket.id);
  }

  // Public methods for sending notifications

  async sendToUser(userId: string, notification: Notification): Promise<boolean> {
    if (!this.io) {
      return false;
    }

    const userConnected = this.connectedUsers.has(userId);

    // Create delivery record
    const delivery = await deliveryRepository.create({
      notificationId: notification.id,
      channel: 'in_app',
      status: userConnected ? 'delivered' : 'pending',
      attempts: 1,
      lastAttemptAt: new Date(),
      deliveredAt: userConnected ? new Date() : undefined
    });

    if (userConnected) {
      this.io.to(`user:${userId}`).emit('notification', notification);

      // Update unread count
      const unreadCount = await notificationRepository.getUnreadCount(userId);
      this.io.to(`user:${userId}`).emit('unread_count', { count: unreadCount });

      // Log audit
      await auditRepository.log({
        notificationId: notification.id,
        action: 'delivered',
        channel: 'in_app',
        userId,
        tenantId: notification.tenantId
      });
    }

    return userConnected;
  }

  async sendToTenant(tenantId: string, notification: Notification): Promise<void> {
    if (!this.io) {
      return;
    }

    this.io.to(`tenant:${tenantId}`).emit('notification', notification);
  }

  async broadcast(notification: Notification): Promise<void> {
    if (!this.io) {
      return;
    }

    this.io.emit('notification', notification);
  }

  async sendToChannel(channel: string, event: string, data: unknown): Promise<void> {
    if (!this.io) {
      return;
    }

    this.io.to(channel).emit(event, data);
  }

  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }

  getConnectionCount(): number {
    let count = 0;
    for (const user of this.connectedUsers.values()) {
      count += user.sockets.size;
    }
    return count;
  }

  getStatus(): {
    initialized: boolean;
    connectedUsers: number;
    totalConnections: number;
  } {
    return {
      initialized: this.io !== null,
      connectedUsers: this.getConnectedUserCount(),
      totalConnections: this.getConnectionCount()
    };
  }

  async close(): Promise<void> {
    if (this.io) {
      await new Promise<void>((resolve) => {
        this.io?.close(() => resolve());
      });
      this.io = null;
      this.connectedUsers.clear();
      this.socketToUser.clear();
    }
  }
}

export const websocketHandler = WebSocketHandler.getInstance();

export default websocketHandler;
