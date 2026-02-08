# API Gateway Service

The API Gateway serves as the single entry point for all client requests to the Cloud-native File Operations Platform. It provides routing, load balancing, authentication, rate limiting, and request/response transformation.

## Features

### Core Functionality
- **Request Routing**: Intelligent routing to backend services based on path patterns
- **Load Balancing**: Multiple load balancing strategies (round-robin, least-connections, random, weighted)
- **Service Discovery**: Dynamic service registration and health checking
- **Authentication & Authorization**: JWT token validation and API key management
- **Rate Limiting**: Redis-backed rate limiting with customizable rules per endpoint
- **API Versioning**: Support for multiple API versions with deprecation handling

### Middleware Stack
- **Correlation ID**: Request tracing across services
- **Request Logging**: Comprehensive request/response logging
- **Response Transformation**: Standardized response format
- **Error Handling**: Centralized error handling with proper HTTP status codes
- **Security**: Helmet.js security headers, CORS configuration

### Monitoring & Observability
- Health check endpoints for gateway and downstream services
- Request metrics and performance monitoring
- Distributed tracing support
- Structured logging with correlation IDs

## Architecture

```
Client Requests
      ↓
  API Gateway
      ↓
┌─────────────┐
│ Middleware  │
│ Stack       │
├─────────────┤
│ • CORS      │
│ • Security  │
│ • Auth      │
│ • Rate Limit│
│ • Logging   │
│ • Versioning│
└─────────────┘
      ↓
┌─────────────┐
│ Load        │
│ Balancer    │
└─────────────┘
      ↓
┌─────────────┐
│ Service     │
│ Discovery   │
└─────────────┘
      ↓
Backend Services
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | Server port | `8080` |
| `JWT_SECRET` | JWT signing secret | Required |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `DEFAULT_API_VERSION` | Default API version | `v1` |
| `SUPPORTED_API_VERSIONS` | Comma-separated supported versions | `v1,v2` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:3000` |
| `LOAD_BALANCING_STRATEGY` | Load balancing strategy | `round-robin` |

### Service Configuration

Services are configured in `src/config/routing.ts`:

```typescript
{
  path: '/api/auth',
  service: 'auth-service',
  requireAuth: false,
  customRateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 50
  }
}
```

## API Routes

### Health Endpoints
- `GET /health` - Gateway health check
- `GET /services/health` - Downstream services health

### Service Routes
- `/api/auth/*` → Auth Service
- `/api/files/*` → File Service  
- `/api/processing/*` → Processing Service
- `/api/notifications/*` → Notification Service
- `/ws/*` → WebSocket connections

## Development

### Prerequisites
- Node.js 18+
- Redis server
- TypeScript

### Setup
```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Testing
```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint
```

## Deployment

### Google Cloud App Engine
```bash
# Deploy to App Engine
gcloud app deploy app.yaml

# View logs
gcloud app logs tail -s api-gateway
```

### Docker
```bash
# Build image
docker build -t api-gateway .

# Run container
docker run -p 8080:8080 --env-file .env api-gateway
```

## Monitoring

### Health Checks
- Gateway: `GET /health`
- Services: `GET /services/health`

### Metrics
- Request count and latency
- Error rates by service
- Rate limiting statistics
- Load balancer performance

### Logging
All requests are logged with:
- Correlation ID for tracing
- Request/response details
- Performance metrics
- Error information

## Security

### Authentication
- JWT token validation
- API key support
- Service-to-service authentication

### Rate Limiting
- IP-based rate limiting
- User-based rate limiting
- API key rate limiting
- Custom limits per endpoint

### Security Headers
- Content Security Policy
- HSTS
- X-Frame-Options
- X-Content-Type-Options

## Load Balancing Strategies

### Round Robin (Default)
Distributes requests evenly across healthy instances.

### Least Connections
Routes to the instance with the fewest active connections.

### Random
Randomly selects a healthy instance.

### Weighted
Uses connection count and performance metrics for selection.

## Error Handling

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  },
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "correlation-id",
    "version": "v1",
    "service": "api-gateway"
  }
}
```

### Circuit Breaker
Automatically fails fast when services are unhealthy, with configurable thresholds and recovery timeouts.

## Performance

### Caching
- Response caching for GET requests
- ETag support for conditional requests
- Redis-based rate limit caching

### Optimization
- Request/response compression
- Connection pooling
- Null value removal from responses

## Troubleshooting

### Common Issues

1. **Service Unavailable (503)**
   - Check service health endpoints
   - Verify service discovery configuration
   - Check Redis connectivity

2. **Rate Limit Exceeded (429)**
   - Review rate limiting configuration
   - Check Redis for rate limit data
   - Verify client request patterns

3. **Authentication Errors (401)**
   - Verify JWT secret configuration
   - Check token expiration
   - Validate API key configuration

### Debug Mode
Set `NODE_ENV=development` for detailed error messages and stack traces.