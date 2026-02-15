/**
 * @fileops/sdk
 * Official TypeScript/JavaScript SDK for the Cloud-Native File Operations Platform
 */

export { FileOpsClient, createClient } from './client';
export { AuthClient } from './auth';
export { FilesClient } from './files';
export { ProcessingClient } from './processing';
export { NotificationsClient } from './notifications';

// Export types
export * from './types';

// Export errors
export { FileOpsError, AuthenticationError, ValidationError, NotFoundError, RateLimitError } from './errors';
