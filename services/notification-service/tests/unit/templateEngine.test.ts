import { TemplateEngine } from '../../src/templates/templateEngine';

describe('TemplateEngine', () => {
  let templateEngine: TemplateEngine;

  beforeEach(() => {
    templateEngine = TemplateEngine.getInstance();
  });

  describe('getTemplate', () => {
    it('should return template for valid notification type', () => {
      const template = templateEngine.getTemplate('file_uploaded');
      expect(template).not.toBeNull();
      expect(template?.type).toBe('file_uploaded');
      expect(template?.name).toBe('File Uploaded');
    });

    it('should return null for invalid template id', () => {
      const template = templateEngine.getTemplate('invalid_type' as any);
      expect(template).toBeNull();
    });

    it('should return all default templates', () => {
      const templates = templateEngine.getAllTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some(t => t.type === 'file_uploaded')).toBe(true);
      expect(templates.some(t => t.type === 'file_processed')).toBe(true);
      expect(templates.some(t => t.type === 'processing_failed')).toBe(true);
    });
  });

  describe('render', () => {
    it('should interpolate variables in template', () => {
      const template = templateEngine.getTemplate('file_uploaded')!;
      const result = templateEngine.render(template, {
        fileName: 'document.pdf',
        fileSize: '2.5 MB',
        uploadedAt: '2024-01-15'
      });

      expect(result.subject).toBe('File uploaded successfully');
      expect(result.body).toContain('document.pdf');
      expect(result.htmlBody).toContain('document.pdf');
    });

    it('should handle missing variables gracefully', () => {
      const template = templateEngine.getTemplate('file_uploaded')!;
      const result = templateEngine.render(template, {});

      expect(result.body).not.toContain('{{');
      expect(result.body).toContain('""');
    });

    it('should escape HTML in variables', () => {
      const template = templateEngine.getTemplate('file_uploaded')!;
      const result = templateEngine.render(template, {
        fileName: '<script>alert("xss")</script>',
        fileSize: '1 MB'
      });

      expect(result.body).not.toContain('<script>');
      expect(result.body).toContain('&lt;script&gt;');
    });
  });

  describe('renderByType', () => {
    it('should render template by notification type', () => {
      const result = templateEngine.renderByType('file_shared', {
        fileName: 'report.xlsx',
        sharedBy: 'John Doe',
        shareLink: 'https://example.com/share/123'
      });

      expect(result).not.toBeNull();
      expect(result?.subject).toContain('John Doe');
      expect(result?.body).toContain('report.xlsx');
    });

    it('should return null for invalid type', () => {
      const result = templateEngine.renderByType('invalid_type' as any, {});
      expect(result).toBeNull();
    });
  });

  describe('validateVariables', () => {
    it('should return empty array when all variables present', () => {
      const template = templateEngine.getTemplate('file_uploaded')!;
      const missing = templateEngine.validateVariables(template, {
        fileName: 'test.pdf',
        fileSize: '1 MB',
        uploadedAt: '2024-01-15'
      });

      expect(missing).toEqual([]);
    });

    it('should return missing variable names', () => {
      const template = templateEngine.getTemplate('file_uploaded')!;
      const missing = templateEngine.validateVariables(template, {
        fileName: 'test.pdf'
      });

      expect(missing).toContain('fileSize');
      expect(missing).toContain('uploadedAt');
    });
  });

  describe('registerTemplate', () => {
    it('should register a custom template', () => {
      templateEngine.registerTemplate({
        id: 'custom_test',
        type: 'custom',
        name: 'Custom Test',
        subject: 'Test Subject: {{testVar}}',
        body: 'Test body with {{testVar}}',
        channels: ['in_app'],
        variables: ['testVar']
      });

      const template = templateEngine.getTemplate('custom_test');
      expect(template).not.toBeNull();
      expect(template?.name).toBe('Custom Test');
    });
  });
});
