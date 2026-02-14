import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { config } from './config/config';
import { errorHandler } from './middleware/errors';
import { requestLogger } from './middleware/requestLogger';
import { notificationRoutes } from './routes/notifications';
import { websocketHandler } from './handlers/websocketHandler';
import { emailService } from './services/emailService';
import { pubsubService } from './services/pubsubService';

const app = express();
const httpServer = createServer(app);

// Initialize WebSocket
websocketHandler.initialize(httpServer);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req: express.Request, res: express.Response) => {
  const wsStatus = websocketHandler.getStatus();
  const emailStatus = emailService.getStatus();
  const pubsubStatus = pubsubService.getStatus();

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'notification-service',
    version: '1.0.0',
    components: {
      websocket: {
        status: wsStatus.initialized ? 'up' : 'down',
        connectedUsers: wsStatus.connectedUsers,
        totalConnections: wsStatus.totalConnections
      },
      email: {
        status: emailStatus.enabled ? (emailStatus.connected ? 'up' : 'degraded') : 'disabled'
      },
      pubsub: {
        status: pubsubStatus.initialized ? 'up' : 'down',
        subscriptions: pubsubStatus.subscriptions
      }
    }
  });
});

// Readiness check
app.get('/ready', async (req: express.Request, res: express.Response) => {
  const checks = {
    websocket: websocketHandler.getStatus().initialized,
    pubsub: pubsubService.getStatus().initialized
  };

  const allReady = Object.values(checks).every((v) => v);

  res.status(allReady ? 200 : 503).json({
    ready: allReady,
    checks
  });
});

// API routes
app.use('/api/notifications', notificationRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req: express.Request, res: express.Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// Initialize services and start server
async function startServer(): Promise<void> {
  try {
    // Initialize email service
    if (config.email.enabled) {
      try {
        await emailService.initialize();
        console.log('Email service initialized');
      } catch (error) {
        console.warn('Email service failed to initialize:', error);
        // Continue without email - not critical
      }
    }

    // Initialize Pub/Sub service
    try {
      await pubsubService.initialize();
      console.log('Pub/Sub service initialized');
    } catch (error) {
      console.warn('Pub/Sub service failed to initialize:', error);
      // Continue without Pub/Sub - can work without it
    }

    // Start HTTP server
    httpServer.listen(config.server.port, config.server.host, () => {
      console.log(`Notification service running on ${config.server.host}:${config.server.port}`);
      console.log(`Environment: ${config.server.env}`);
      console.log(`WebSocket: enabled`);
      console.log(`Email: ${config.email.enabled ? 'enabled' : 'disabled'}`);
      console.log(`Webhook: ${config.webhook.enabled ? 'enabled' : 'disabled'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  // Close services
  try {
    await websocketHandler.close();
    console.log('WebSocket connections closed');

    await pubsubService.close();
    console.log('Pub/Sub subscriptions closed');

    await emailService.close();
    console.log('Email service closed');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();

export default app;
