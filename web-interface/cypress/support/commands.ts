// Custom Cypress commands for the application

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Login to the application
       */
      login(email?: string, password?: string): Chainable<Element>;

      /**
       * Logout from the application
       */
      logout(): Chainable<Element>;

      /**
       * Navigate to files page with authentication
       */
      navigateToFiles(): Chainable<Element>;

      /**
       * Upload a test file
       */
      uploadFile(fileName: string, content?: string): Chainable<Element>;

      /**
       * Create a test folder
       */
      createFolder(folderName: string): Chainable<Element>;

      /**
       * Select items in the file browser
       */
      selectItems(itemNames: string[]): Chainable<Element>;

      /**
       * Wait for file upload to complete
       */
      waitForUpload(): Chainable<Element>;

      /**
       * Mock API responses
       */
      mockApi(endpoint: string, response: any): Chainable<Element>;

      /**
       * Attach file to input (from cypress-file-upload plugin)
       */
      attachFile(fileName: string): Chainable<Element>;
      attachFile(fileList: { filePath: string; mimeType?: string }[]): Chainable<Element>;
    }
  }
}

// Login command
// @ts-ignore
Cypress.Commands.add('login', (email = 'test@example.com', password = 'password123') => {
  cy.visit('/login');
  
  cy.get('[data-testid="email-input"]').type(email);
  cy.get('[data-testid="password-input"]').type(password);
  cy.get('[data-testid="login-button"]').click();
  
  // Wait for navigation to files page
  cy.url().should('include', '/files');
  cy.get('[data-testid="files-page"]').should('be.visible');
});

// Logout command
// @ts-ignore
Cypress.Commands.add('logout', () => {
  cy.get('[data-testid="user-menu"]').click();
  cy.get('[data-testid="logout-button"]').click();
  
  // Wait for navigation to login page
  cy.url().should('include', '/login');
  cy.get('[data-testid="login-page"]').should('be.visible');
});

// Navigate to files command
// @ts-ignore
Cypress.Commands.add('navigateToFiles', () => {
  cy.login(); // Ensure we're logged in
  cy.visit('/files');
  cy.get('[data-testid="files-page"]').should('be.visible');
});

// Upload file command
// @ts-ignore
Cypress.Commands.add('uploadFile', (fileName: string, content = 'test content') => {
  cy.get('[data-testid="upload-button"]').click();
  
  // Create a test file
  cy.fixture(fileName).then((fileContent) => {
    if (typeof fileContent === 'string') {
      cy.get('[data-testid="file-input"]').attachFile({
        fileContent: fileContent,
        fileName: fileName,
        mimeType: 'text/plain',
      } as any);
    } else {
      cy.get('[data-testid="file-input"]').attachFile({
        fileContent: content,
        fileName: fileName,
        mimeType: 'text/plain',
      } as any);
    }
  });
  
  cy.waitForUpload();
});

// Create folder command
// @ts-ignore
Cypress.Commands.add('createFolder', (folderName: string) => {
  cy.get('[data-testid="new-folder-button"]').click();
  
  cy.get('[data-testid="folder-name-input"]').type(folderName);
  cy.get('[data-testid="create-folder-button"]').click();
  
  // Wait for folder to appear
  cy.get(`[data-testid="folder-${folderName}"]`).should('be.visible');
});

// Select items command
// @ts-ignore
Cypress.Commands.add('selectItems', (itemNames: string[]) => {
  itemNames.forEach((itemName) => {
    cy.get(`[data-testid="item-${itemName}"]`).within(() => {
      cy.get('[data-testid="select-checkbox"]').check();
    });
  });
});

// Wait for upload command
// @ts-ignore
Cypress.Commands.add('waitForUpload', () => {
  cy.get('[data-testid="upload-progress"]').should('not.exist');
  cy.get('[data-testid="upload-success"]').should('be.visible');
});

// Mock API command
// @ts-ignore
Cypress.Commands.add('mockApi', (endpoint: string, response: any) => {
  cy.intercept(endpoint, response).as(`mock-${endpoint}`);
});

// Helper command for demo mode
// @ts-ignore
Cypress.Commands.add('enableDemoMode', () => {
  cy.window().then((win: any) => {
    win.localStorage.setItem('demoMode', 'true');
  });
});

// Helper command for setting auth token
// @ts-ignore
Cypress.Commands.add('setAuthToken', (token: string) => {
  cy.window().then((win: any) => {
    win.localStorage.setItem('authToken', token);
  });
});

// Helper command for clearing test data
// @ts-ignore
Cypress.Commands.add('clearTestData', () => {
  cy.request('DELETE', '/api/test/clear');
});

export {};
