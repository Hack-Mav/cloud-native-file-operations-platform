describe('File Management E2E Tests', () => {
  beforeEach(() => {
    cy.login();
    cy.visit('/files');
  });

  describe('File Upload', () => {
    it('should upload a single file', () => {
      // Click upload button
      cy.get('[data-testid="upload-button"]').click();

      // Select file
      cy.get('[data-testid="file-input"]').attachFile('test-file.txt');

      // Wait for upload to complete
      cy.get('[data-testid="upload-progress"]').should('not.exist');
      cy.get('[data-testid="upload-success"]').should('be.visible');

      // Verify file appears in list
      cy.get('[data-testid="file-test-file.txt"]').should('be.visible');
    });

    it('should upload multiple files', () => {
      cy.get('[data-testid="upload-button"]').click();

      // Select multiple files
      cy.get('[data-testid="file-input"]').attachFile([
        { filePath: 'file1.txt', mimeType: 'text/plain' },
        { filePath: 'file2.txt', mimeType: 'text/plain' },
        { filePath: 'file3.txt', mimeType: 'text/plain' },
      ]);

      // Wait for all uploads to complete
      cy.get('[data-testid="upload-progress"]').should('not.exist');
      cy.get('[data-testid="upload-success"]').should('be.visible');

      // Verify all files appear
      cy.get('[data-testid="file-file1.txt"]').should('be.visible');
      cy.get('[data-testid="file-file2.txt"]').should('be.visible');
      cy.get('[data-testid="file-file3.txt"]').should('be.visible');
    });

    it('should handle upload errors gracefully', () => {
      // Mock upload error
      cy.mockApi('/api/files/upload', {
        statusCode: 500,
        body: { error: 'Upload failed' }
      });

      cy.get('[data-testid="upload-button"]').click();
      cy.get('[data-testid="file-input"]').attachFile('test-file.txt');

      // Should show error message
      cy.get('[data-testid="upload-error"]').should('be.visible');
      cy.get('[data-testid="upload-error"]').should('contain', 'Upload failed');
    });
  });

  describe('File Operations', () => {
    beforeEach(() => {
      // Create test files for operations
      cy.createFolder('Test Folder');
      cy.uploadFile('test-document.pdf');
    });

    it('should select and deselect files', () => {
      // Select a file
      cy.get('[data-testid="file-test-document.pdf"]').within(() => {
        cy.get('[data-testid="select-checkbox"]').check();
      });

      // Should show selection count
      cy.get('[data-testid="selection-count"]').should('contain', '1 selected');

      // Deselect the file
      cy.get('[data-testid="file-test-document.pdf"]').within(() => {
        cy.get('[data-testid="select-checkbox"]').uncheck();
      });

      // Should hide selection count
      cy.get('[data-testid="selection-count"]').should('not.exist');
    });

    it('should select multiple files', () => {
      cy.selectItems(['test-document.pdf', 'Test Folder']);

      // Should show correct selection count
      cy.get('[data-testid="selection-count"]').should('contain', '2 selected');
    });

    it('should rename a file', () => {
      // Right-click on file and select rename
      cy.get('[data-testid="file-test-document.pdf"]').rightclick();
      cy.get('[data-testid="context-menu"]').should('be.visible');
      cy.get('[data-testid="rename-option"]').click();

      // Enter new name
      cy.get('[data-testid="rename-input"]').clear().type('renamed-document.pdf');
      cy.get('[data-testid="rename-confirm"]').click();

      // Verify file was renamed
      cy.get('[data-testid="file-renamed-document.pdf"]').should('be.visible');
      cy.get('[data-testid="file-test-document.pdf"]').should('not.exist');
    });

    it('should delete a file', () => {
      // Select file for deletion
      cy.get('[data-testid="file-test-document.pdf"]').within(() => {
        cy.get('[data-testid="select-checkbox"]').check();
      });

      // Click delete button
      cy.get('[data-testid="delete-button"]').click();

      // Confirm deletion
      cy.get('[data-testid="delete-confirm-dialog"]').should('be.visible');
      cy.get('[data-testid="delete-confirm-button"]').click();

      // Verify file was deleted
      cy.get('[data-testid="file-test-document.pdf"]').should('not.exist');
    });

    it('should delete multiple files', () => {
      // Upload additional file
      cy.uploadFile('another-file.txt');

      // Select multiple files
      cy.selectItems(['test-document.pdf', 'another-file.txt']);

      // Click delete button
      cy.get('[data-testid="delete-button"]').click();

      // Confirm deletion
      cy.get('[data-testid="delete-confirm-dialog"]').should('be.visible');
      cy.get('[data-testid="delete-confirm-button"]').click();

      // Verify files were deleted
      cy.get('[data-testid="file-test-document.pdf"]').should('not.exist');
      cy.get('[data-testid="file-another-file.txt"]').should('not.exist');
    });
  });

  describe('Folder Operations', () => {
    it('should create a new folder', () => {
      cy.get('[data-testid="new-folder-button"]').click();

      // Enter folder name
      cy.get('[data-testid="folder-name-input"]').type('New Test Folder');
      cy.get('[data-testid="create-folder-button"]').click();

      // Verify folder was created
      cy.get('[data-testid="folder-New Test Folder"]').should('be.visible');
    });

    it('should navigate into folder', () => {
      cy.createFolder('Navigation Test Folder');

      // Click on folder to navigate
      cy.get('[data-testid="folder-Navigation Test Folder"]').click();

      // Should navigate to folder contents
      cy.url().should('include', '/files/');
      cy.get('[data-testid="breadcrumb-Navigation Test Folder"]').should('be.visible');
    });

    it('should navigate back to parent folder', () => {
      cy.createFolder('Parent Test Folder');

      // Navigate into folder
      cy.get('[data-testid="folder-Parent Test Folder"]').click();

      // Click back button or parent breadcrumb
      cy.get('[data-testid="breadcrumb-root"]').click();

      // Should return to parent folder
      cy.url().should('not.include', '/files/');
      cy.get('[data-testid="folder-Parent Test Folder"]').should('be.visible');
    });
  });

  describe('File Preview', () => {
    it('should preview a text file', () => {
      cy.uploadFile('preview-test.txt');

      // Click on file to preview
      cy.get('[data-testid="file-preview-test.txt"]').click();

      // Should open preview dialog
      cy.get('[data-testid="file-preview-dialog"]').should('be.visible');
      cy.get('[data-testid="preview-content"]').should('contain', 'test content');

      // Close preview
      cy.get('[data-testid="preview-close"]').click();
      cy.get('[data-testid="file-preview-dialog"]').should('not.exist');
    });

    it('should preview an image file', () => {
      cy.uploadFile('test-image.jpg');

      // Click on image to preview
      cy.get('[data-testid="file-test-image.jpg"]').click();

      // Should show image preview
      cy.get('[data-testid="file-preview-dialog"]').should('be.visible');
      cy.get('[data-testid="preview-image"]').should('be.visible');
    });

    it('should navigate between files in preview', () => {
      cy.uploadFile('file1.txt');
      cy.uploadFile('file2.txt');

      // Open first file preview
      cy.get('[data-testid="file-file1.txt"]').click();

      // Navigate to next file
      cy.get('[data-testid="preview-next"]').click();

      // Should show second file
      cy.get('[data-testid="preview-content"]').should('contain', 'file2');
    });
  });

  describe('File Sharing', () => {
    it('should share a file with link', () => {
      cy.uploadFile('share-test.txt');

      // Right-click and select share
      cy.get('[data-testid="file-share-test.txt"]').rightclick();
      cy.get('[data-testid="context-menu"]').should('be.visible');
      cy.get('[data-testid="share-option"]').click();

      // Should open share dialog
      cy.get('[data-testid="share-dialog"]').should('be.visible');

      // Generate share link
      cy.get('[data-testid="generate-link-button"]').click();

      // Should show share link
      cy.get('[data-testid="share-link"]').should('be.visible');
      cy.get('[data-testid="share-link"]').should('contain', 'http');

      // Copy share link
      cy.get('[data-testid="copy-link-button"]').click();

      // Should show copied message
      cy.get('[data-testid="copy-success"]').should('be.visible');
    });

    it('should share with specific users', () => {
      cy.uploadFile('collaboration-test.txt');

      // Open share dialog
      cy.get('[data-testid="file-collaboration-test.txt"]').rightclick();
      cy.get('[data-testid="share-option"]').click();

      // Add user to share
      cy.get('[data-testid="share-user-input"]').type('collaborator@example.com');
      cy.get('[data-testid="add-user-button"]').click();

      // Set permission
      cy.get('[data-testid="permission-select"]').select('edit');

      // Save sharing settings
      cy.get('[data-testid="save-sharing-button"]').click();

      // Should show success message
      cy.get('[data-testid="share-success"]').should('be.visible');
    });
  });

  describe('Search and Filter', () => {
    beforeEach(() => {
      // Create test files for search
      cy.uploadFile('search-test-1.txt');
      cy.uploadFile('search-test-2.txt');
      cy.uploadFile('different-file.txt');
      cy.createFolder('Search Folder');
    });

    it('should search for files by name', () => {
      // Enter search term
      cy.get('[data-testid="search-input"]').type('search-test');

      // Should show matching files
      cy.get('[data-testid="file-search-test-1.txt"]').should('be.visible');
      cy.get('[data-testid="file-search-test-2.txt"]').should('be.visible');
      cy.get('[data-testid="file-different-file.txt"]').should('not.exist');
    });

    it('should filter by file type', () => {
      // Filter by text files
      cy.get('[data-testid="filter-dropdown"]').click();
      cy.get('[data-testid="filter-text-files"]').click();

      // Should show only text files
      cy.get('[data-testid="file-search-test-1.txt"]').should('be.visible');
      cy.get('[data-testid="folder-Search Folder"]').should('not.exist');
    });

    it('should sort files by name', () => {
      // Sort by name
      cy.get('[data-testid="sort-dropdown"]').click();
      cy.get('[data-testid="sort-by-name"]').click();

      // Verify sorting order
      cy.get('[data-testid="file-list"]').children().first().should('contain', 'different-file');
    });

    it('should sort files by date modified', () => {
      // Sort by date
      cy.get('[data-testid="sort-dropdown"]').click();
      cy.get('[data-testid="sort-by-date"]').click();

      // Verify sorting (newest first)
      cy.get('[data-testid="file-list"]').children().first().should('contain', 'Search Folder');
    });
  });

  describe('View Modes', () => {
    it('should switch between grid and list views', () => {
      // Should default to grid view
      cy.get('[data-testid="file-grid"]').should('be.visible');
      cy.get('[data-testid="file-list"]').should('not.exist');

      // Switch to list view
      cy.get('[data-testid="list-view-button"]').click();

      // Should show list view
      cy.get('[data-testid="file-list"]').should('be.visible');
      cy.get('[data-testid="file-grid"]').should('not.exist');

      // Switch back to grid view
      cy.get('[data-testid="grid-view-button"]').click();

      // Should show grid view again
      cy.get('[data-testid="file-grid"]').should('be.visible');
      cy.get('[data-testid="file-list"]').should('not.exist');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', () => {
      // Mock network error
      cy.mockApi('/api/files', { forceNetworkError: true });

      // Reload page
      cy.reload();

      // Should show error message
      cy.get('[data-testid="error-message"]').should('be.visible');
      cy.get('[data-testid="error-message"]').should('contain', 'Failed to load files');

      // Should provide retry option
      cy.get('[data-testid="retry-button"]').should('be.visible');
    });

    it('should handle file not found error', () => {
      // Navigate to non-existent file
      cy.visit('/files/non-existent-file');

      // Should show 404 error
      cy.get('[data-testid="not-found-page"]').should('be.visible');
      cy.get('[data-testid="not-found-message"]').should('contain', 'File not found');
    });
  });
});
