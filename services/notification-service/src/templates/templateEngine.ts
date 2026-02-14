import { NotificationType, NotificationChannel } from '../config/config';

export interface TemplateVariables {
  [key: string]: string | number | boolean | undefined | null;
}

export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  name: string;
  subject: string;
  body: string;
  htmlBody?: string;
  channels: NotificationChannel[];
  variables: string[];
}

// Default templates for each notification type
const defaultTemplates: Record<NotificationType, NotificationTemplate> = {
  file_uploaded: {
    id: 'file_uploaded',
    type: 'file_uploaded',
    name: 'File Uploaded',
    subject: 'File uploaded successfully',
    body: 'Your file "{{fileName}}" has been uploaded successfully.',
    htmlBody: '<p>Your file <strong>{{fileName}}</strong> has been uploaded successfully.</p><p>Size: {{fileSize}}</p>',
    channels: ['in_app', 'email'],
    variables: ['fileName', 'fileSize', 'uploadedAt']
  },
  file_processed: {
    id: 'file_processed',
    type: 'file_processed',
    name: 'File Processed',
    subject: 'File processing completed',
    body: 'Your file "{{fileName}}" has been processed successfully.',
    htmlBody: '<p>Your file <strong>{{fileName}}</strong> has been processed successfully.</p><p>Processing type: {{processingType}}</p>',
    channels: ['in_app', 'email'],
    variables: ['fileName', 'processingType', 'processedAt']
  },
  file_shared: {
    id: 'file_shared',
    type: 'file_shared',
    name: 'File Shared',
    subject: '{{sharedBy}} shared a file with you',
    body: '{{sharedBy}} has shared the file "{{fileName}}" with you.',
    htmlBody: '<p><strong>{{sharedBy}}</strong> has shared the file <strong>{{fileName}}</strong> with you.</p><p><a href="{{shareLink}}">View File</a></p>',
    channels: ['in_app', 'email'],
    variables: ['fileName', 'sharedBy', 'shareLink', 'sharedAt']
  },
  file_deleted: {
    id: 'file_deleted',
    type: 'file_deleted',
    name: 'File Deleted',
    subject: 'File deleted',
    body: 'The file "{{fileName}}" has been deleted.',
    htmlBody: '<p>The file <strong>{{fileName}}</strong> has been deleted.</p>',
    channels: ['in_app'],
    variables: ['fileName', 'deletedAt', 'deletedBy']
  },
  processing_started: {
    id: 'processing_started',
    type: 'processing_started',
    name: 'Processing Started',
    subject: 'File processing started',
    body: 'Processing has started for your file "{{fileName}}".',
    htmlBody: '<p>Processing has started for your file <strong>{{fileName}}</strong>.</p><p>Job ID: {{jobId}}</p>',
    channels: ['in_app'],
    variables: ['fileName', 'jobId', 'processingType', 'startedAt']
  },
  processing_completed: {
    id: 'processing_completed',
    type: 'processing_completed',
    name: 'Processing Completed',
    subject: 'File processing completed',
    body: 'Processing has completed for your file "{{fileName}}".',
    htmlBody: '<p>Processing has completed for your file <strong>{{fileName}}</strong>.</p><p>Job ID: {{jobId}}</p><p><a href="{{resultLink}}">View Results</a></p>',
    channels: ['in_app', 'email'],
    variables: ['fileName', 'jobId', 'processingType', 'completedAt', 'resultLink']
  },
  processing_failed: {
    id: 'processing_failed',
    type: 'processing_failed',
    name: 'Processing Failed',
    subject: 'File processing failed',
    body: 'Processing has failed for your file "{{fileName}}". Error: {{errorMessage}}',
    htmlBody: '<p>Processing has failed for your file <strong>{{fileName}}</strong>.</p><p>Error: {{errorMessage}}</p><p>Job ID: {{jobId}}</p>',
    channels: ['in_app', 'email'],
    variables: ['fileName', 'jobId', 'errorMessage', 'failedAt']
  },
  batch_completed: {
    id: 'batch_completed',
    type: 'batch_completed',
    name: 'Batch Processing Completed',
    subject: 'Batch processing completed',
    body: 'Batch processing "{{batchName}}" has completed. {{successCount}} files succeeded, {{failureCount}} files failed.',
    htmlBody: '<p>Batch processing <strong>{{batchName}}</strong> has completed.</p><p>Success: {{successCount}} files</p><p>Failed: {{failureCount}} files</p><p><a href="{{resultsLink}}">View Results</a></p>',
    channels: ['in_app', 'email'],
    variables: ['batchName', 'batchId', 'successCount', 'failureCount', 'resultsLink', 'completedAt']
  },
  system_alert: {
    id: 'system_alert',
    type: 'system_alert',
    name: 'System Alert',
    subject: 'System Alert: {{alertTitle}}',
    body: '{{alertMessage}}',
    htmlBody: '<p><strong>{{alertTitle}}</strong></p><p>{{alertMessage}}</p>',
    channels: ['in_app', 'email'],
    variables: ['alertTitle', 'alertMessage', 'alertLevel', 'timestamp']
  },
  security_alert: {
    id: 'security_alert',
    type: 'security_alert',
    name: 'Security Alert',
    subject: 'Security Alert: {{alertTitle}}',
    body: '{{alertMessage}}. Action required: {{actionRequired}}',
    htmlBody: '<p><strong>Security Alert: {{alertTitle}}</strong></p><p>{{alertMessage}}</p><p><strong>Action Required:</strong> {{actionRequired}}</p>',
    channels: ['in_app', 'email'],
    variables: ['alertTitle', 'alertMessage', 'actionRequired', 'ipAddress', 'timestamp']
  },
  custom: {
    id: 'custom',
    type: 'custom',
    name: 'Custom Notification',
    subject: '{{subject}}',
    body: '{{message}}',
    htmlBody: '<p>{{message}}</p>',
    channels: ['in_app'],
    variables: ['subject', 'message']
  }
};

// Template cache
const templateCache = new Map<string, NotificationTemplate>();

export class TemplateEngine {
  private static instance: TemplateEngine;

  private constructor() {
    // Initialize with default templates
    Object.values(defaultTemplates).forEach((template) => {
      templateCache.set(template.id, template);
    });
  }

  static getInstance(): TemplateEngine {
    if (!TemplateEngine.instance) {
      TemplateEngine.instance = new TemplateEngine();
    }
    return TemplateEngine.instance;
  }

  getTemplate(typeOrId: NotificationType | string): NotificationTemplate | null {
    return templateCache.get(typeOrId) || null;
  }

  getAllTemplates(): NotificationTemplate[] {
    return Array.from(templateCache.values());
  }

  registerTemplate(template: NotificationTemplate): void {
    templateCache.set(template.id, template);
  }

  render(template: NotificationTemplate, variables: TemplateVariables): { subject: string; body: string; htmlBody?: string } {
    return {
      subject: this.interpolate(template.subject, variables),
      body: this.interpolate(template.body, variables),
      htmlBody: template.htmlBody ? this.interpolate(template.htmlBody, variables) : undefined
    };
  }

  renderByType(type: NotificationType, variables: TemplateVariables): { subject: string; body: string; htmlBody?: string } | null {
    const template = this.getTemplate(type);
    if (!template) {
      return null;
    }
    return this.render(template, variables);
  }

  private interpolate(text: string, variables: TemplateVariables): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      if (value === undefined || value === null) {
        return '';
      }
      return this.escapeHtml(String(value));
    });
  }

  private escapeHtml(text: string): string {
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
  }

  validateVariables(template: NotificationTemplate, variables: TemplateVariables): string[] {
    const missing: string[] = [];
    for (const required of template.variables) {
      if (variables[required] === undefined || variables[required] === null) {
        missing.push(required);
      }
    }
    return missing;
  }
}

export const templateEngine = TemplateEngine.getInstance();

export default templateEngine;
