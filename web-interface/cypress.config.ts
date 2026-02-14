import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    pageLoadTimeout: 30000,
    env: {
      // Environment variables for testing
      apiUrl: 'http://localhost:8080/api',
      demoMode: 'true',
    },
    setupNodeEvents(on: any, config: any) {
      // Node event listeners can be added here
      on('task', {
        // Custom tasks for test setup
        log(message: any) {
          console.log(message);
          return null;
        },
        clearTestData() {
          // Clear test data between runs
          return null;
        },
      });
    },
  },
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
  },
});
