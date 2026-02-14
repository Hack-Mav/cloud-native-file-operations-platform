import { LoggingService, loggingService, ChildLogger } from '../src/logging';

describe('LoggingService', () => {
  beforeAll(() => {
    loggingService.initialize('test-service', {
      enabled: true,
      level: 'debug',
      format: 'json'
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = LoggingService.getInstance();
      const instance2 = LoggingService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Logging Methods', () => {
    it('should log error', () => {
      expect(() => {
        loggingService.error('Test error', { correlationId: '123' }, new Error('Test'));
      }).not.toThrow();
    });

    it('should log warn', () => {
      expect(() => {
        loggingService.warn('Test warning', { correlationId: '123' });
      }).not.toThrow();
    });

    it('should log info', () => {
      expect(() => {
        loggingService.info('Test info', { correlationId: '123' });
      }).not.toThrow();
    });

    it('should log http', () => {
      expect(() => {
        loggingService.http('Test http', { correlationId: '123' });
      }).not.toThrow();
    });

    it('should log debug', () => {
      expect(() => {
        loggingService.debug('Test debug', { correlationId: '123' });
      }).not.toThrow();
    });
  });

  describe('Structured Logging', () => {
    it('should log request', () => {
      expect(() => {
        loggingService.logRequest('GET', '/api/test', 200, 50, {
          correlationId: '123',
          userId: 'user-1'
        });
      }).not.toThrow();
    });

    it('should log operation', () => {
      expect(() => {
        loggingService.logOperation('file_upload', 'completed', 100, {
          correlationId: '123'
        });
      }).not.toThrow();
    });

    it('should log operation failure with error', () => {
      expect(() => {
        loggingService.logOperation('file_upload', 'failed', 100, {
          correlationId: '123'
        }, new Error('Upload failed'));
      }).not.toThrow();
    });

    it('should log security event', () => {
      expect(() => {
        loggingService.logSecurity('unauthorized_access', 'high', {
          correlationId: '123',
          userId: 'user-1'
        });
      }).not.toThrow();
    });

    it('should log audit event', () => {
      expect(() => {
        loggingService.logAudit('file_delete', 'file:123', 'success', {
          correlationId: '123',
          userId: 'user-1'
        });
      }).not.toThrow();
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with default context', () => {
      const child = loggingService.child({
        correlationId: 'child-123',
        userId: 'user-1'
      });

      expect(child).toBeInstanceOf(ChildLogger);
    });

    it('should inherit context in child logger', () => {
      const child = loggingService.child({
        correlationId: 'child-123'
      });

      expect(() => {
        child.info('Test from child');
        child.error('Error from child', undefined, new Error('Test'));
      }).not.toThrow();
    });

    it('should merge context in child logger', () => {
      const child = loggingService.child({
        correlationId: 'child-123'
      });

      expect(() => {
        child.info('Test with merged context', { extra: 'data' });
      }).not.toThrow();
    });
  });
});
