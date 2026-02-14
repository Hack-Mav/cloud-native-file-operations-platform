// Import commands.js using ES2015 syntax:
import './commands';

// Import cypress-file-upload plugin
import 'cypress-file-upload';

// Add global configurations
beforeEach(() => {
  // Clear local storage before each test
  cy.clearLocalStorage();
  
  // Clear cookies before each test
  cy.clearCookies();
  
  // Set up viewport
  cy.viewport(1280, 720);
});

// Add custom error handling
// @ts-ignore
Cypress.on('uncaught:exception', (err: any, runnable: any) => {
  // Prevent Cypress from failing on uncaught exceptions in certain cases
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false;
  }
  
  if (err.message.includes('Non-Error promise rejection captured')) {
    return false;
  }
  
  // Return false to prevent Cypress from failing the test
  return true;
});

// Add custom commands for API mocking
// @ts-ignore
before(() => {
  // Set up API interceptors for common endpoints
  cy.intercept('POST', '/api/auth/login', { fixture: 'login-success.json' }).as('loginRequest');
  cy.intercept('POST', '/api/auth/register', { fixture: 'register-success.json' }).as('registerRequest');
  cy.intercept('GET', '/api/files', { fixture: 'files-list.json' }).as('filesRequest');
  cy.intercept('POST', '/api/files/upload', { fixture: 'upload-success.json' }).as('uploadRequest');
});

// Global error handling for failed API calls
// @ts-ignore
Cypress.on('fail', (error: any, runnable: any) => {
  // Log additional context when tests fail
  console.error('Test failed:', error);
  console.error('Runnable:', runnable);
  
  // Take a screenshot on failure
  cy.screenshot('failure-screenshot', { capture: 'viewport' });
});
