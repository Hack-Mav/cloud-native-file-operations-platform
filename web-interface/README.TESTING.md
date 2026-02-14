# Frontend Testing Guide

This document provides comprehensive information about the testing setup and practices for the web-interface.

## Testing Stack

### Unit & Integration Tests
- **Framework**: Vitest
- **Testing Library**: React Testing Library
- **Assertions**: Jest DOM matchers
- **Coverage**: Vitest Coverage (v8)

### End-to-End Tests
- **Framework**: Cypress
- **Runner**: Cypress Test Runner
- **Reporting**: JUnit XML (for CI)

## Test Structure

```
src/
├── test/
│   ├── integration/          # Integration tests
│   ├── mocks/              # API mocks and test data
│   ├── utils/              # Test utilities and helpers
│   └── setup.ts           # Global test setup
├── *.test.tsx             # Unit tests (co-located)
├── *.spec.tsx             # Component specifications
cypress/
├── e2e/                  # End-to-end tests
├── support/               # Cypress support files
└── fixtures/              # Test fixtures
```

## Running Tests

### Unit & Integration Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### End-to-End Tests

```bash
# Open Cypress test runner
npm run test:e2e

# Run tests headlessly (CI)
npm run test:e2e:headless

# Run tests with JUnit reporting
npm run test:e2e:ci

# Run all tests (unit + e2e)
npm run test:all
```

## Test Categories

### 1. Unit Tests
- Test individual components in isolation
- Mock external dependencies
- Fast execution
- High coverage

**Examples:**
- Component rendering
- User interactions
- State changes
- Event handlers

### 2. Integration Tests
- Test multiple components working together
- Test user workflows
- Mock APIs at boundary level
- Medium execution time

**Examples:**
- Complete login flow
- File upload workflow
- Navigation between pages
- Form submissions

### 3. End-to-End Tests
- Test complete user journeys
- Real browser environment
- No mocking of application code
- Slow execution, high confidence

**Examples:**
- User registration and login
- File upload and sharing
- Search and filter workflows
- Error scenarios

## Writing Tests

### Unit Test Example

```tsx
import { render, screen, fireEvent } from '@/test/utils';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('handles button click', () => {
    const handleClick = vi.fn();
    render(<MyComponent onClick={handleClick} />);
    
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### Integration Test Example

```tsx
import { render, screen, fireEvent, waitFor } from '@/test/utils';
import App from '@/App';

describe('Login Workflow', () => {
  it('should complete login flow', async () => {
    render(<App />);
    
    // Navigate to login
    fireEvent.click(screen.getByText('Sign In'));
    
    // Fill form
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' }
    });
    
    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    
    // Verify success
    await waitFor(() => {
      expect(screen.getByText('My Files')).toBeInTheDocument();
    });
  });
});
```

### E2E Test Example

```typescript
describe('Authentication E2E', () => {
  it('should allow user to login', () => {
    cy.visit('/login');
    
    cy.get('[data-testid="email-input"]')
      .type('test@example.com');
    cy.get('[data-testid="password-input"]')
      .type('password123');
    cy.get('[data-testid="login-button"]')
      .click();
    
    cy.url().should('include', '/files');
    cy.get('[data-testid="user-menu"]')
      .should('contain', 'Test User');
  });
});
```

## Test Data and Mocks

### Mock Data
Test data is centralized in `src/test/mocks/api-mocks.ts`:

```typescript
import { createMockUser, createMockFile } from '@/test/utils';

const mockUser = createMockUser({
  email: 'test@example.com',
  role: 'admin'
});

const mockFile = createMockFile({
  name: 'test-document.pdf',
  size: 1024 * 1024
});
```

### API Mocking
APIs are mocked at the boundary level:

```typescript
import { mockAuthApi } from '@/test/mocks/api-mocks';

beforeEach(() => {
  mockAuthApi.login.mockResolvedValue({
    success: true,
    data: { user: mockUser, tokens: mockTokens }
  });
});
```

## Best Practices

### 1. Test Organization
- **Co-location**: Keep tests close to the code they test
- **Descriptive names**: Use clear, descriptive test names
- **Arrange-Act-Assert**: Structure tests clearly
- **One assertion per test**: Focus on one behavior at a time

### 2. Selectors
- **Prefer data-testid**: Use test-specific attributes
- **Avoid implementation details**: Don't rely on CSS classes
- **Accessible selectors**: Use getByRole, getByLabelText when possible

```tsx
// Good
screen.getByTestId('submit-button')
screen.getByRole('button', { name: 'Submit' })
screen.getByLabelText('Email address')

// Avoid
screen.querySelector('.btn-primary')
screen.getByClassName('submit-btn')
```

### 3. Mocking Strategy
- **Mock at boundaries**: Mock APIs, not implementation details
- **Use consistent mocks**: Centralize mock data
- **Reset between tests**: Clean up state in beforeEach

### 4. Async Testing
- **Use waitFor**: For async operations
- **Avoid arbitrary delays**: Don't use fixed timeouts
- **Mock timers**: When testing time-dependent code

```tsx
// Good
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});

// Avoid
cy.wait(1000); // Don't do this
```

### 5. Coverage
- **Aim for high coverage**: Target 80%+ coverage
- **Focus on critical paths**: Prioritize important functionality
- **Review coverage reports**: Identify untested code

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
      
      - name: Run E2E tests
        run: npm run test:e2e:ci
```

## Debugging Tests

### Unit Tests
```bash
# Run specific test file
npm test -- MyComponent.test.tsx

# Run tests matching pattern
npm test -- --grep "should render"

# Debug with VS Code
# Add breakpoint in test and use VS Code debugger
```

### E2E Tests
```bash
# Open Cypress with specific spec
npm run test:e2e -- --spec "auth.cy.ts"

# Run in headed mode for debugging
npm run test:e2e -- --headed --browser chrome

# Generate videos for failed tests
# Videos are automatically saved in cypress/videos
```

## Performance Considerations

### Unit Tests
- **Fast execution**: Keep tests under 100ms
- **Minimal setup**: Use lightweight mocks
- **Parallel execution**: Vitest runs tests in parallel

### E2E Tests
- **Selective execution**: Use tags to run relevant tests
- **Page object model**: Reuse element selectors
- **Test data management**: Clean up test data

## Troubleshooting

### Common Issues

1. **Test flakiness**: Use proper waiting strategies
2. **Mock failures**: Verify mock setup and reset
3. **Selector issues**: Use data-testid attributes
4. **Async timing**: Use waitFor instead of fixed delays

### Getting Help

- Check test logs and console output
- Use browser dev tools for E2E debugging
- Review Vitest and Cypress documentation
- Check existing test patterns in the codebase

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [Cypress Documentation](https://docs.cypress.io/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
- [Testing Best Practices](https://kentcdodds.com/blog/common-testing-mistakes)
