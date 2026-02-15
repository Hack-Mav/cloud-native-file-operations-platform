/**
 * Data Anonymization Module
 * Provides various anonymization techniques for protecting sensitive data
 * while preserving data utility for analytics
 */

import * as crypto from 'crypto';
import {
  AnonymizationTechnique,
  AnonymizationRule,
  AnonymizationConfig,
  AnonymizationResult,
} from './types';

interface TokenMapping {
  originalHash: string;
  token: string;
  createdAt: Date;
}

export class AnonymizationService {
  private config: AnonymizationConfig;
  private tokenMappings: Map<string, TokenMapping>;
  private salt: string;
  private tokenCounter: number;

  constructor(config: Partial<AnonymizationConfig> = {}) {
    this.config = {
      rules: config.rules || [],
      preserveFormat: config.preserveFormat ?? true,
      salt: config.salt || crypto.randomBytes(32).toString('hex'),
      tokenPrefix: config.tokenPrefix || 'TOK_',
    };
    this.salt = this.config.salt!;
    this.tokenMappings = new Map();
    this.tokenCounter = 0;
  }

  /**
   * Add anonymization rule
   */
  addRule(rule: AnonymizationRule): void {
    this.config.rules.push(rule);
  }

  /**
   * Remove anonymization rule by field
   */
  removeRule(field: string): void {
    this.config.rules = this.config.rules.filter(r => r.field !== field);
  }

  /**
   * Anonymize data according to configured rules
   */
  anonymize(data: Record<string, unknown>): AnonymizationResult {
    try {
      const result: Record<string, unknown> = { ...data };
      const mappings: Record<string, string> = {};

      for (const rule of this.config.rules) {
        if (rule.field in result && result[rule.field] !== null && result[rule.field] !== undefined) {
          const { value, mapping } = this.applyTechnique(
            result[rule.field],
            rule.technique,
            rule.options
          );
          result[rule.field] = value;
          if (mapping) {
            mappings[rule.field] = mapping;
          }
        }
      }

      return {
        success: true,
        data: result,
        mappings: Object.keys(mappings).length > 0 ? mappings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `Anonymization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Anonymize a single value
   */
  anonymizeValue(
    value: unknown,
    technique: AnonymizationTechnique,
    options?: Record<string, unknown>
  ): unknown {
    return this.applyTechnique(value, technique, options).value;
  }

  /**
   * Apply anonymization technique
   */
  private applyTechnique(
    value: unknown,
    technique: AnonymizationTechnique,
    options?: Record<string, unknown>
  ): { value: unknown; mapping?: string } {
    const strValue = String(value);

    switch (technique) {
      case 'hash':
        return { value: this.hash(strValue, options) };

      case 'mask':
        return { value: this.mask(strValue, options) };

      case 'redact':
        return { value: this.redact(strValue, options) };

      case 'generalize':
        return { value: this.generalize(value, options) };

      case 'pseudonymize':
        return this.pseudonymize(strValue, options);

      case 'tokenize':
        return this.tokenize(strValue, options);

      case 'k-anonymity':
        return { value: this.kAnonymity(value, options) };

      case 'differential-privacy':
        return { value: this.differentialPrivacy(value, options) };

      default:
        return { value };
    }
  }

  /**
   * Hash anonymization (one-way)
   */
  hash(value: string, options?: Record<string, unknown>): string {
    const algorithm = (options?.algorithm as string) || 'sha256';
    const useSalt = options?.useSalt !== false;
    const truncate = options?.truncate as number;

    const dataToHash = useSalt ? `${value}:${this.salt}` : value;
    let hash = crypto.createHash(algorithm).update(dataToHash).digest('hex');

    if (truncate && truncate > 0) {
      hash = hash.substring(0, truncate);
    }

    return hash;
  }

  /**
   * Mask anonymization (partial hiding)
   */
  mask(value: string, options?: Record<string, unknown>): string {
    const maskChar = (options?.maskChar as string) || '*';
    const visibleStart = (options?.visibleStart as number) || 0;
    const visibleEnd = (options?.visibleEnd as number) || 0;
    const preserveLength = options?.preserveLength !== false;

    if (value.length <= visibleStart + visibleEnd) {
      return maskChar.repeat(value.length);
    }

    const start = value.substring(0, visibleStart);
    const end = value.substring(value.length - visibleEnd);
    const maskLength = preserveLength
      ? value.length - visibleStart - visibleEnd
      : 3;

    return `${start}${maskChar.repeat(maskLength)}${end}`;
  }

  /**
   * Redact anonymization (complete removal)
   */
  redact(value: string, options?: Record<string, unknown>): string {
    const replacement = (options?.replacement as string) || '[REDACTED]';
    return replacement;
  }

  /**
   * Generalize anonymization (reduce precision)
   */
  generalize(value: unknown, options?: Record<string, unknown>): unknown {
    const type = (options?.type as string) || 'auto';

    if (typeof value === 'number') {
      return this.generalizeNumber(value, options);
    }

    if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
      return this.generalizeDate(new Date(value as string), options);
    }

    if (typeof value === 'string') {
      if (type === 'age' || /^\d+$/.test(value)) {
        return this.generalizeAge(parseInt(value, 10), options);
      }
      if (type === 'location' || value.includes(',')) {
        return this.generalizeLocation(value, options);
      }
    }

    return value;
  }

  /**
   * Generalize a number (round to range)
   */
  private generalizeNumber(value: number, options?: Record<string, unknown>): string {
    const step = (options?.step as number) || 10;
    const lower = Math.floor(value / step) * step;
    const upper = lower + step - 1;
    return `${lower}-${upper}`;
  }

  /**
   * Generalize age to range
   */
  private generalizeAge(age: number, options?: Record<string, unknown>): string {
    const ranges = (options?.ranges as number[]) || [0, 18, 25, 35, 45, 55, 65, 75];

    for (let i = 0; i < ranges.length - 1; i++) {
      if (age >= ranges[i] && age < ranges[i + 1]) {
        return `${ranges[i]}-${ranges[i + 1] - 1}`;
      }
    }

    return `${ranges[ranges.length - 1]}+`;
  }

  /**
   * Generalize date (reduce precision)
   */
  private generalizeDate(date: Date, options?: Record<string, unknown>): string {
    const precision = (options?.precision as string) || 'month';

    switch (precision) {
      case 'year':
        return date.getFullYear().toString();
      case 'quarter':
        const quarter = Math.ceil((date.getMonth() + 1) / 3);
        return `${date.getFullYear()}-Q${quarter}`;
      case 'month':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      case 'week':
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const week = Math.ceil(
          ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
        );
        return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
      default:
        return date.toISOString().substring(0, 10);
    }
  }

  /**
   * Generalize location (reduce precision)
   */
  private generalizeLocation(value: string, options?: Record<string, unknown>): string {
    const precision = (options?.precision as string) || 'city';
    const parts = value.split(',').map(p => p.trim());

    switch (precision) {
      case 'country':
        return parts[parts.length - 1] || value;
      case 'state':
        return parts.slice(-2).join(', ');
      case 'city':
        return parts.slice(-3).join(', ');
      default:
        return value;
    }
  }

  /**
   * Pseudonymize (reversible with key)
   */
  pseudonymize(
    value: string,
    options?: Record<string, unknown>
  ): { value: string; mapping: string } {
    const prefix = (options?.prefix as string) || 'PSEUDO_';

    // Create a deterministic pseudonym based on hashed value
    const hash = crypto
      .createHmac('sha256', this.salt)
      .update(value)
      .digest('hex')
      .substring(0, 12);

    const pseudonym = `${prefix}${hash}`;

    return {
      value: pseudonym,
      mapping: hash,
    };
  }

  /**
   * Tokenize (create random replacement, store mapping)
   */
  tokenize(
    value: string,
    options?: Record<string, unknown>
  ): { value: string; mapping: string } {
    const prefix = (options?.prefix as string) || this.config.tokenPrefix;

    // Check if we already have a token for this value
    const valueHash = crypto.createHash('sha256').update(value).digest('hex');

    for (const [, mapping] of this.tokenMappings) {
      if (mapping.originalHash === valueHash) {
        return {
          value: mapping.token,
          mapping: mapping.token,
        };
      }
    }

    // Create new token
    this.tokenCounter++;
    const token = `${prefix}${this.tokenCounter.toString().padStart(8, '0')}`;

    // Store mapping
    this.tokenMappings.set(token, {
      originalHash: valueHash,
      token,
      createdAt: new Date(),
    });

    return {
      value: token,
      mapping: token,
    };
  }

  /**
   * Detokenize (retrieve original value hash for lookup)
   */
  getTokenMapping(token: string): TokenMapping | undefined {
    return this.tokenMappings.get(token);
  }

  /**
   * K-Anonymity (ensure k similar records)
   */
  kAnonymity(value: unknown, options?: Record<string, unknown>): unknown {
    const k = (options?.k as number) || 5;

    // This is a simplified implementation
    // Full k-anonymity requires analyzing the entire dataset
    if (typeof value === 'number') {
      const divisor = Math.pow(10, Math.floor(Math.log10(Math.max(1, Math.abs(value)))) - 1);
      return Math.floor(value / divisor) * divisor;
    }

    if (typeof value === 'string') {
      // Generalize strings by keeping only first few characters
      const keepChars = Math.max(1, Math.floor(value.length / k));
      return value.substring(0, keepChars) + '*'.repeat(value.length - keepChars);
    }

    return value;
  }

  /**
   * Differential Privacy (add noise)
   */
  differentialPrivacy(value: unknown, options?: Record<string, unknown>): unknown {
    const epsilon = (options?.epsilon as number) || 1.0;
    const sensitivity = (options?.sensitivity as number) || 1.0;

    if (typeof value !== 'number') {
      return value;
    }

    // Add Laplace noise
    const noise = this.laplaceSample(sensitivity / epsilon);
    return value + noise;
  }

  /**
   * Sample from Laplace distribution
   */
  private laplaceSample(scale: number): number {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Anonymize email addresses
   */
  anonymizeEmail(email: string, technique: 'hash' | 'mask' | 'domain' = 'mask'): string {
    const parts = email.split('@');
    if (parts.length !== 2) {
      return this.redact(email, {});
    }

    switch (technique) {
      case 'hash':
        return `${this.hash(parts[0], { truncate: 8 })}@${parts[1]}`;
      case 'mask':
        const maskedLocal = this.mask(parts[0], { visibleStart: 2, visibleEnd: 0 });
        return `${maskedLocal}@${parts[1]}`;
      case 'domain':
        return `***@${parts[1]}`;
      default:
        return email;
    }
  }

  /**
   * Anonymize phone numbers
   */
  anonymizePhone(phone: string, keepLast: number = 4): string {
    const digits = phone.replace(/\D/g, '');
    const masked = '*'.repeat(Math.max(0, digits.length - keepLast)) +
      digits.substring(digits.length - keepLast);

    // Try to preserve original format
    if (this.config.preserveFormat) {
      let result = '';
      let digitIndex = 0;
      for (const char of phone) {
        if (/\d/.test(char)) {
          result += masked[digitIndex] || '*';
          digitIndex++;
        } else {
          result += char;
        }
      }
      return result;
    }

    return masked;
  }

  /**
   * Anonymize IP address
   */
  anonymizeIP(ip: string, technique: 'truncate' | 'hash' | 'subnet' = 'truncate'): string {
    const isIPv6 = ip.includes(':');

    switch (technique) {
      case 'truncate':
        if (isIPv6) {
          const parts = ip.split(':');
          return parts.slice(0, 4).join(':') + '::';
        }
        const octets = ip.split('.');
        return octets.slice(0, 2).join('.') + '.0.0';

      case 'subnet':
        if (isIPv6) {
          return ip.split(':').slice(0, 4).join(':') + '::/64';
        }
        return ip.split('.').slice(0, 3).join('.') + '.0/24';

      case 'hash':
        return this.hash(ip, { truncate: 16 });

      default:
        return ip;
    }
  }

  /**
   * Anonymize credit card number
   */
  anonymizeCreditCard(cardNumber: string): string {
    const digits = cardNumber.replace(/\D/g, '');

    if (digits.length < 13) {
      return '*'.repeat(digits.length);
    }

    // Keep first 4 and last 4 digits (standard PCI DSS masking)
    const masked = digits.substring(0, 4) +
      '*'.repeat(digits.length - 8) +
      digits.substring(digits.length - 4);

    // Preserve format with dashes/spaces
    if (this.config.preserveFormat) {
      let result = '';
      let digitIndex = 0;
      for (const char of cardNumber) {
        if (/\d/.test(char)) {
          result += masked[digitIndex] || '*';
          digitIndex++;
        } else {
          result += char;
        }
      }
      return result;
    }

    return masked;
  }

  /**
   * Anonymize SSN
   */
  anonymizeSSN(ssn: string): string {
    const digits = ssn.replace(/\D/g, '');

    if (digits.length !== 9) {
      return '*'.repeat(ssn.length);
    }

    // Show only last 4 digits
    const masked = '*'.repeat(5) + digits.substring(5);

    if (this.config.preserveFormat && ssn.includes('-')) {
      return `***-**-${digits.substring(5)}`;
    }

    return masked;
  }

  /**
   * Anonymize name
   */
  anonymizeName(name: string, technique: 'initials' | 'mask' | 'hash' = 'initials'): string {
    switch (technique) {
      case 'initials':
        return name
          .split(' ')
          .map(part => part[0]?.toUpperCase() || '')
          .join('.');
      case 'mask':
        return name
          .split(' ')
          .map(part => part[0] + '*'.repeat(Math.max(0, part.length - 1)))
          .join(' ');
      case 'hash':
        return this.hash(name, { truncate: 8 });
      default:
        return name;
    }
  }

  /**
   * Batch anonymize multiple records
   */
  anonymizeBatch(
    records: Record<string, unknown>[]
  ): { results: AnonymizationResult[]; summary: { success: number; failed: number } } {
    const results: AnonymizationResult[] = [];
    let success = 0;
    let failed = 0;

    for (const record of records) {
      const result = this.anonymize(record);
      results.push(result);
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    return {
      results,
      summary: { success, failed },
    };
  }

  /**
   * Clear token mappings
   */
  clearTokenMappings(): void {
    this.tokenMappings.clear();
    this.tokenCounter = 0;
  }

  /**
   * Export token mappings (for secure storage)
   */
  exportTokenMappings(): Array<{ token: string; hash: string; createdAt: string }> {
    return Array.from(this.tokenMappings.values()).map(m => ({
      token: m.token,
      hash: m.originalHash,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  /**
   * Import token mappings
   */
  importTokenMappings(mappings: Array<{ token: string; hash: string; createdAt: string }>): void {
    for (const m of mappings) {
      this.tokenMappings.set(m.token, {
        token: m.token,
        originalHash: m.hash,
        createdAt: new Date(m.createdAt),
      });

      // Update counter to avoid collisions
      const tokenNumber = parseInt(m.token.replace(/\D/g, ''), 10);
      if (tokenNumber > this.tokenCounter) {
        this.tokenCounter = tokenNumber;
      }
    }
  }
}

// Factory function
export function createAnonymizationService(
  config?: Partial<AnonymizationConfig>
): AnonymizationService {
  return new AnonymizationService(config);
}

export default AnonymizationService;
