/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable<Subject = any> {
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
    }
  }
}

export {};
