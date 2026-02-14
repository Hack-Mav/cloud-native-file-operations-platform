describe('Authentication E2E Tests', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.clearCookies();
    cy.visit('/');
  });

  describe('Login Flow', () => {
    it('should allow user to login successfully', () => {
      // Navigate to login page
      cy.get('[data-testid="login-link"]').click();
      cy.url().should('include', '/login');

      // Fill login form
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('password123');
      cy.get('[data-testid="login-button"]').click();

      // Should redirect to files page
      cy.url().should('include', '/files');
      cy.get('[data-testid="files-page"]').should('be.visible');
      cy.get('[data-testid="user-menu"]').should('contain', 'Test User');
    });

    it('should show error for invalid credentials', () => {
      cy.visit('/login');

      // Fill with invalid credentials
      cy.get('[data-testid="email-input"]').type('invalid@example.com');
      cy.get('[data-testid="password-input"]').type('wrongpassword');
      cy.get('[data-testid="login-button"]').click();

      // Should show error message
      cy.get('[data-testid="error-message"]').should('be.visible');
      cy.get('[data-testid="error-message"]').should('contain', 'Invalid credentials');

      // Should stay on login page
      cy.url().should('include', '/login');
    });

    it('should validate required fields', () => {
      cy.visit('/login');

      // Try to submit empty form
      cy.get('[data-testid="login-button"]').click();

      // Should show validation errors
      cy.get('[data-testid="email-input"]').should('have.attr', 'required');
      cy.get('[data-testid="password-input"]').should('have.attr', 'required');
    });

    it('should allow password visibility toggle', () => {
      cy.visit('/login');

      const passwordInput = cy.get('[data-testid="password-input"]');
      const visibilityToggle = cy.get('[data-testid="password-visibility-toggle"]');

      // Password should be hidden by default
      passwordInput.should('have.attr', 'type', 'password');

      // Click to show password
      visibilityToggle.click();
      passwordInput.should('have.attr', 'type', 'text');

      // Click to hide password
      visibilityToggle.click();
      passwordInput.should('have.attr', 'type', 'password');
    });

    it('should support demo mode', () => {
      cy.visit('/login');

      // Click demo mode button
      cy.get('[data-testid="demo-mode-button"]').click();

      // Should redirect to files page
      cy.url().should('include', '/files');
      cy.get('[data-testid="demo-banner"]').should('be.visible');
    });
  });

  describe('Registration Flow', () => {
    it('should allow user to register successfully', () => {
      cy.visit('/register');

      // Fill registration form
      cy.get('[data-testid="name-input"]').type('New User');
      cy.get('[data-testid="email-input"]').type('newuser@example.com');
      cy.get('[data-testid="password-input"]').type('Password123');
      cy.get('[data-testid="confirm-password-input"]').type('Password123');
      cy.get('[data-testid="register-button"]').click();

      // Should redirect to files page
      cy.url().should('include', '/files');
      cy.get('[data-testid="files-page"]').should('be.visible');
    });

    it('should validate password requirements', () => {
      cy.visit('/register');

      // Try weak password
      cy.get('[data-testid="name-input"]').type('Test User');
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('weak');
      cy.get('[data-testid="confirm-password-input"]').type('weak');
      cy.get('[data-testid="register-button"]').click();

      // Should show password validation error
      cy.get('[data-testid="error-message"]').should('contain', 'Password must be at least 8 characters');
    });

    it('should validate password confirmation', () => {
      cy.visit('/register');

      // Fill with mismatched passwords
      cy.get('[data-testid="name-input"]').type('Test User');
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('Password123');
      cy.get('[data-testid="confirm-password-input"]').type('Different123');
      cy.get('[data-testid="register-button"]').click();

      // Should show password mismatch error
      cy.get('[data-testid="error-message"]').should('contain', 'Passwords do not match');
    });

    it('should show real-time password mismatch validation', () => {
      cy.visit('/register');

      cy.get('[data-testid="password-input"]').type('Password123');
      cy.get('[data-testid="confirm-password-input"]').type('Different123');

      // Should show error immediately
      cy.get('[data-testid="password-mismatch-error"]').should('be.visible');
    });
  });

  describe('Logout Flow', () => {
    beforeEach(() => {
      cy.login();
    });

    it('should allow user to logout', () => {
      // Click user menu
      cy.get('[data-testid="user-menu"]').click();
      
      // Click logout
      cy.get('[data-testid="logout-button"]').click();

      // Should redirect to login page
      cy.url().should('include', '/login');
      cy.get('[data-testid="login-page"]').should('be.visible');

      // Should clear auth data
      cy.window().then((win) => {
        expect(win.localStorage.getItem('authToken')).to.be.null;
      });
    });
  });

  describe('Protected Routes', () => {
    it('should redirect unauthenticated users to login', () => {
      // Try to access protected route
      cy.visit('/files');

      // Should redirect to login
      cy.url().should('include', '/login');
    });

    it('should allow authenticated users to access protected routes', () => {
      cy.login();

      // Should be able to access protected routes
      cy.visit('/files');
      cy.url().should('include', '/files');
      cy.get('[data-testid="files-page"]').should('be.visible');

      cy.visit('/dashboard');
      cy.url().should('include', '/dashboard');
      cy.get('[data-testid="dashboard-page"]').should('be.visible');
    });
  });

  describe('MFA Flow', () => {
    it('should handle MFA verification when required', () => {
      // Mock login response requiring MFA
      cy.mockApi('/api/auth/login', {
        success: true,
        data: {
          mfaRequired: true,
          sessionToken: 'mock-session-token'
        }
      });

      cy.visit('/login');
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('password123');
      cy.get('[data-testid="login-button"]').click();

      // Should redirect to MFA verification
      cy.url().should('include', '/mfa-verify');
      cy.get('[data-testid="mfa-verify-page"]').should('be.visible');

      // Fill MFA code
      cy.get('[data-testid="mfa-code-0"]').type('1');
      cy.get('[data-testid="mfa-code-1"]').type('2');
      cy.get('[data-testid="mfa-code-2"]').type('3');
      cy.get('[data-testid="mfa-code-3"]').type('4');
      cy.get('[data-testid="mfa-code-4"]').type('5');
      cy.get('[data-testid="mfa-code-5"]').type('6');

      // Mock successful MFA verification
      cy.mockApi('/api/auth/mfa/verify', {
        success: true,
        data: {
          user: {
            id: "user-1",
            email: "test@example.com",
            name: "Test User",
            role: "user",
            tenantId: "tenant-1",
            mfaEnabled: true,
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z"
          },
          tokens: {
            accessToken: "mock-access-token",
            refreshToken: "mock-refresh-token",
            expiresIn: 3600
          }
        }
      });

      cy.get('[data-testid="verify-button"]').click();

      // Should redirect to files page
      cy.url().should('include', '/files');
      cy.get('[data-testid="files-page"]').should('be.visible');
    });

    it('should handle MFA verification error', () => {
      // Mock login response requiring MFA
      cy.mockApi('/api/auth/login', {
        success: true,
        data: {
          mfaRequired: true,
          sessionToken: 'mock-session-token'
        }
      });

      cy.visit('/login');
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="password-input"]').type('password123');
      cy.get('[data-testid="login-button"]').click();

      // Fill MFA code
      cy.get('[data-testid="mfa-code-0"]').type('1');
      cy.get('[data-testid="mfa-code-1"]').type('2');
      cy.get('[data-testid="mfa-code-2"]').type('3');
      cy.get('[data-testid="mfa-code-3"]').type('4');
      cy.get('[data-testid="mfa-code-4"]').type('5');
      cy.get('[data-testid="mfa-code-5"]').type('6');

      // Mock failed MFA verification
      cy.mockApi('/api/auth/mfa/verify', {
        success: false,
        error: {
          code: 'INVALID_MFA_CODE',
          message: 'Invalid verification code'
        }
      });

      cy.get('[data-testid="verify-button"]').click();

      // Should show error message
      cy.get('[data-testid="error-message"]').should('contain', 'Invalid verification code');
      cy.url().should('include', '/mfa-verify');
    });
  });
});
