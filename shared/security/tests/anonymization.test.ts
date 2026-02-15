/**
 * Anonymization Service Tests
 * Tests for data anonymization techniques and privacy protection
 */

import { AnonymizationService } from '../src/anonymization';

describe('AnonymizationService', () => {
  let anonymizer: AnonymizationService;

  beforeEach(() => {
    anonymizer = new AnonymizationService();
  });

  describe('Hash Anonymization', () => {
    it('should hash a value', () => {
      const result = anonymizer.anonymizeValue('john@example.com', 'hash');

      expect(result).not.toBe('john@example.com');
      expect(typeof result).toBe('string');
      expect((result as string).length).toBeGreaterThan(0);
    });

    it('should produce consistent hashes', () => {
      const hash1 = anonymizer.anonymizeValue('test-value', 'hash');
      const hash2 = anonymizer.anonymizeValue('test-value', 'hash');

      expect(hash1).toBe(hash2);
    });

    it('should truncate hash when specified', () => {
      const result = anonymizer.anonymizeValue('test', 'hash', { truncate: 16 });

      expect((result as string).length).toBe(16);
    });
  });

  describe('Mask Anonymization', () => {
    it('should mask a value', () => {
      const result = anonymizer.anonymizeValue('1234567890', 'mask', {
        visibleStart: 2,
        visibleEnd: 2,
      });

      expect(result).toBe('12******90');
    });

    it('should use custom mask character', () => {
      const result = anonymizer.anonymizeValue('secret', 'mask', {
        visibleStart: 1,
        visibleEnd: 1,
        maskChar: 'X',
      });

      expect(result).toBe('sXXXXt');
    });

    it('should handle short values', () => {
      const result = anonymizer.anonymizeValue('ab', 'mask', {
        visibleStart: 3,
        visibleEnd: 3,
      });

      expect(result).toBe('**');
    });
  });

  describe('Redact Anonymization', () => {
    it('should redact a value', () => {
      const result = anonymizer.anonymizeValue('sensitive data', 'redact');

      expect(result).toBe('[REDACTED]');
    });

    it('should use custom replacement', () => {
      const result = anonymizer.anonymizeValue('secret', 'redact', {
        replacement: '***REMOVED***',
      });

      expect(result).toBe('***REMOVED***');
    });
  });

  describe('Generalize Anonymization', () => {
    it('should generalize a number to range', () => {
      const result = anonymizer.anonymizeValue(42, 'generalize', { step: 10 });

      expect(result).toBe('40-49');
    });

    it('should generalize age', () => {
      const result = anonymizer.anonymizeValue('35', 'generalize', { type: 'age' });

      expect(result).toBe('35-44');
    });

    it('should generalize date to month', () => {
      const date = new Date('2024-06-15');
      const result = anonymizer.anonymizeValue(date, 'generalize', { precision: 'month' });

      expect(result).toBe('2024-06');
    });

    it('should generalize date to year', () => {
      const date = new Date('2024-06-15');
      const result = anonymizer.anonymizeValue(date, 'generalize', { precision: 'year' });

      expect(result).toBe('2024');
    });

    it('should generalize date to quarter', () => {
      const date = new Date('2024-06-15');
      const result = anonymizer.anonymizeValue(date, 'generalize', { precision: 'quarter' });

      expect(result).toBe('2024-Q2');
    });
  });

  describe('Pseudonymize', () => {
    it('should pseudonymize a value', () => {
      const result = anonymizer.anonymizeValue('john.doe', 'pseudonymize') as string;

      expect(result).toMatch(/^PSEUDO_[a-f0-9]+$/);
    });

    it('should produce consistent pseudonyms', () => {
      const pseudo1 = anonymizer.anonymizeValue('test-user', 'pseudonymize');
      const pseudo2 = anonymizer.anonymizeValue('test-user', 'pseudonymize');

      expect(pseudo1).toBe(pseudo2);
    });
  });

  describe('Tokenize', () => {
    it('should tokenize a value', () => {
      const result = anonymizer.anonymizeValue('sensitive-id', 'tokenize') as string;

      expect(result).toMatch(/^TOK_\d+$/);
    });

    it('should return same token for same value', () => {
      const token1 = anonymizer.anonymizeValue('my-value', 'tokenize');
      const token2 = anonymizer.anonymizeValue('my-value', 'tokenize');

      expect(token1).toBe(token2);
    });

    it('should return different tokens for different values', () => {
      const token1 = anonymizer.anonymizeValue('value-1', 'tokenize');
      const token2 = anonymizer.anonymizeValue('value-2', 'tokenize');

      expect(token1).not.toBe(token2);
    });
  });

  describe('K-Anonymity', () => {
    it('should generalize numbers for k-anonymity', () => {
      const result = anonymizer.anonymizeValue(12345, 'k-anonymity', { k: 5 });

      expect(result).toBe(12000);
    });

    it('should generalize strings for k-anonymity', () => {
      const result = anonymizer.anonymizeValue('John Smith', 'k-anonymity', { k: 5 });

      expect(result).toMatch(/^Jo\*+$/);
    });
  });

  describe('Differential Privacy', () => {
    it('should add noise to numeric values', () => {
      const original = 100;
      const results: number[] = [];

      for (let i = 0; i < 10; i++) {
        results.push(anonymizer.anonymizeValue(original, 'differential-privacy', {
          epsilon: 0.1,
        }) as number);
      }

      // Results should vary due to noise
      const unique = new Set(results);
      expect(unique.size).toBeGreaterThan(1);
    });

    it('should not modify non-numeric values', () => {
      const result = anonymizer.anonymizeValue('text', 'differential-privacy');

      expect(result).toBe('text');
    });
  });

  describe('Email Anonymization', () => {
    it('should mask email address', () => {
      const result = anonymizer.anonymizeEmail('john.doe@example.com', 'mask');

      expect(result).toMatch(/^jo\*+@example\.com$/);
    });

    it('should hash email local part', () => {
      const result = anonymizer.anonymizeEmail('user@example.com', 'hash');

      expect(result).toMatch(/^[a-f0-9]+@example\.com$/);
    });

    it('should anonymize email to domain only', () => {
      const result = anonymizer.anonymizeEmail('user@example.com', 'domain');

      expect(result).toBe('***@example.com');
    });
  });

  describe('Phone Number Anonymization', () => {
    it('should anonymize phone number keeping last 4 digits', () => {
      const result = anonymizer.anonymizePhone('555-123-4567');

      expect(result).toMatch(/^\*+-\*+-4567$/);
    });

    it('should preserve phone format', () => {
      const result = anonymizer.anonymizePhone('(555) 123-4567');

      expect(result).toContain('4567');
    });
  });

  describe('IP Address Anonymization', () => {
    it('should truncate IPv4 address', () => {
      const result = anonymizer.anonymizeIP('192.168.1.100', 'truncate');

      expect(result).toBe('192.168.0.0');
    });

    it('should convert to subnet', () => {
      const result = anonymizer.anonymizeIP('192.168.1.100', 'subnet');

      expect(result).toBe('192.168.1.0/24');
    });

    it('should hash IP address', () => {
      const result = anonymizer.anonymizeIP('192.168.1.100', 'hash');

      expect(result).toHaveLength(16);
    });
  });

  describe('Credit Card Anonymization', () => {
    it('should mask credit card number', () => {
      const result = anonymizer.anonymizeCreditCard('4111111111111111');

      expect(result).toBe('4111********1111');
    });

    it('should preserve format with dashes', () => {
      const result = anonymizer.anonymizeCreditCard('4111-1111-1111-1111');

      expect(result).toMatch(/^4111-\*+-\*+-1111$/);
    });
  });

  describe('SSN Anonymization', () => {
    it('should mask SSN showing last 4 digits', () => {
      const result = anonymizer.anonymizeSSN('123-45-6789');

      expect(result).toBe('***-**-6789');
    });

    it('should handle SSN without dashes', () => {
      const result = anonymizer.anonymizeSSN('123456789');

      expect(result).toBe('*****6789');
    });
  });

  describe('Name Anonymization', () => {
    it('should convert name to initials', () => {
      const result = anonymizer.anonymizeName('John Doe', 'initials');

      expect(result).toBe('J.D');
    });

    it('should mask name', () => {
      const result = anonymizer.anonymizeName('John Doe', 'mask');

      expect(result).toBe('J*** D**');
    });

    it('should hash name', () => {
      const result = anonymizer.anonymizeName('John Doe', 'hash');

      expect(result).toHaveLength(8);
    });
  });

  describe('Batch Anonymization', () => {
    beforeEach(() => {
      anonymizer.addRule({ field: 'email', technique: 'mask' });
      anonymizer.addRule({ field: 'phone', technique: 'mask', options: { visibleEnd: 4 } });
      anonymizer.addRule({ field: 'ssn', technique: 'redact' });
    });

    it('should anonymize multiple records', () => {
      const records = [
        { name: 'John', email: 'john@example.com', phone: '555-1234', ssn: '123-45-6789' },
        { name: 'Jane', email: 'jane@example.com', phone: '555-5678', ssn: '987-65-4321' },
      ];

      const { results, summary } = anonymizer.anonymizeBatch(records);

      expect(results.length).toBe(2);
      expect(summary.success).toBe(2);
      expect(summary.failed).toBe(0);
    });

    it('should apply rules to object', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        ssn: '123-45-6789',
      };

      const result = anonymizer.anonymize(data);

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('John Doe'); // Not in rules
      expect(result.data!.email).not.toBe('john@example.com');
      expect(result.data!.ssn).toBe('[REDACTED]');
    });
  });

  describe('Token Mappings', () => {
    it('should export token mappings', () => {
      anonymizer.anonymizeValue('value-1', 'tokenize');
      anonymizer.anonymizeValue('value-2', 'tokenize');

      const mappings = anonymizer.exportTokenMappings();

      expect(mappings.length).toBe(2);
      expect(mappings[0]).toHaveProperty('token');
      expect(mappings[0]).toHaveProperty('hash');
    });

    it('should import token mappings', () => {
      const token1 = anonymizer.anonymizeValue('original', 'tokenize') as string;

      const mappings = anonymizer.exportTokenMappings();

      anonymizer.clearTokenMappings();
      anonymizer.importTokenMappings(mappings);

      const token2 = anonymizer.anonymizeValue('original', 'tokenize') as string;

      expect(token1).toBe(token2);
    });

    it('should clear token mappings', () => {
      anonymizer.anonymizeValue('value', 'tokenize');
      anonymizer.clearTokenMappings();

      const mappings = anonymizer.exportTokenMappings();
      expect(mappings.length).toBe(0);
    });
  });

  describe('Rule Management', () => {
    it('should add anonymization rule', () => {
      anonymizer.addRule({ field: 'password', technique: 'redact' });

      const data = { username: 'john', password: 'secret123' };
      const result = anonymizer.anonymize(data);

      expect(result.data!.password).toBe('[REDACTED]');
    });

    it('should remove anonymization rule', () => {
      anonymizer.addRule({ field: 'email', technique: 'mask' });
      anonymizer.removeRule('email');

      const data = { email: 'test@example.com' };
      const result = anonymizer.anonymize(data);

      expect(result.data!.email).toBe('test@example.com');
    });
  });
});
