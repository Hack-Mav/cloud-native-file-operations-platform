import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { authMiddleware } from './middleware/auth';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { serviceDiscovery } from './services/serviceDiscovery';
import { loadBalancer } from './services/loadBalancer';
import { routingConfig } from './config/routing';
import { correlationIdMiddleware } from './middleware/correlationId';
import { responseTransformer } from './middleware/responseTransformer';
import { apiVersioning } from './middleware/apiVersioning';
import { wafMiddleware } from './middleware/waf';
import { ddosProtectionMiddleware } from './middleware/ddosProtection';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Correlation-ID', 'X-API-Version']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Security middleware (order is important)
app.use(ddosProtectionMiddleware);
app.use(wafMiddleware);

// Core middleware
app.use(correlationIdMiddleware);
app.use(requestLogger);
app.use(apiVersioning);

// Rate limiting (applied globally, can be overridden per route)
app.use(rateLimitMiddleware);

// Health check endpoint
app.get('/health', (req: express.Request, res: express.Response) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
    version: process.env.API_VERSION || '1.0.0'
  });
});

// Service discovery health check
app.get('/services/health', async (req: express.Request, res: express.Response) => {
  try {
    const services = await serviceDiscovery.getHealthyServices();
    res.status(200).json({
      status: 'healthy',
      services,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Service discovery unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize service discovery
serviceDiscovery.initialize();

// Setup routing for each service
routingConfig.forEach(route => {
  const { path, service, requireAuth, customRateLimit } = route;
  
  // Create middleware chain
  const middlewares: express.RequestHandler[] = [];
  
  // Custom rate limiting if specified
  if (customRateLimit) {
    middlewares.push(rateLimitMiddleware(customRateLimit));
  }
  
  // Authentication middleware if required
  if (requireAuth) {
    middlewares.push(authMiddleware);
  }
  
  // Response transformation middleware
  middlewares.push(responseTransformer);
  
  // Proxy middleware with load balancing
  const proxyMiddleware = createProxyMiddleware({
    target: `http://localhost:8080`, // Default target, will be overridden by router
    changeOrigin: true,
    pathRewrite: (path, req) => {
      // Remove the service prefix from the path
      return path.replace(new RegExp(`^${route.path}`), '');
    },
    router: async (req) => {
      try {
        // Get healthy service instance using load balancer
        const serviceInstance = await loadBalancer.getServiceInstance(service);
        return `http://${serviceInstance.host}:${serviceInstance.port}`;
      } catch (error) {
        console.error(`Failed to route to service ${service}:`, error);
        throw error;
      }
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err);
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `Service ${service} is currently unavailable`,
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-correlation-id']
        }
      });
    },
    onProxyReq: (proxyReq, req, res) => {
      // Add correlation ID to upstream requests
      proxyReq.setHeader('X-Correlation-ID', req.headers['x-correlation-id'] as string);
      
      // Add service context headers
      proxyReq.setHeader('X-Gateway-Service', service);
      proxyReq.setHeader('X-Gateway-Version', process.env.API_VERSION || '1.0.0');
      
      // Forward user context if authenticated
      if (req.user) {
        proxyReq.setHeader('X-User-ID', req.user.id);
        proxyReq.setHeader('X-User-Roles', JSON.stringify(req.user.roles));
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      // Add gateway headers to response
      proxyRes.headers['X-Gateway-Service'] = service;
      proxyRes.headers['X-Correlation-ID'] = req.headers['x-correlation-id'] as string;
    }
  });
  
  middlewares.push(proxyMiddleware);
  
  // Register the route with all middleware
  app.use(path, ...middlewares);
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req: express.Request, res: express.Response) => {
  res.status(404).json({ 
    error: { 
      code: 'NOT_FOUND', 
      message: 'Endpoint not found',
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-correlation-id']
    } 
  });
});

const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Registered routes:');
  routingConfig.forEach(route => {
    console.log(`  ${route.path} -> ${route.service} (auth: ${route.requireAuth})`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    serviceDiscovery.cleanup();
    process.exit(0);
  });
});

export default app;