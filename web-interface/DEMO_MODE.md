# Demo Mode Feature

This document describes the demo mode functionality that allows users to access the application without authentication.

## Overview

Demo mode provides a way to explore the application's features without requiring a backend server or authentication. It uses mock data and simulates API responses to provide a realistic user experience.

## Features

### Authentication
- **Demo Login**: A "Try Demo Mode" button appears on the login page when demo mode is enabled
- **Mock User**: Creates a demo user with admin privileges
- **No Backend Required**: All API calls are intercepted and return mock data

### Visual Indicators
- **Header Badge**: A "DEMO" badge appears in the application header when in demo mode
- **User Menu**: Shows "Demo Mode" indicator in the user profile menu
- **Clear Distinction**: Visual cues help users understand they're in demo mode

### Mock Data
- **Sample Files**: Pre-populated with various file types (PDF, Excel, Images, Presentations)
- **Folder Structure**: Organized folder hierarchy with Documents and Images folders
- **File Operations**: Full CRUD operations work with mock data
- **Upload Simulation**: File uploads are simulated with progress indicators
- **Search & Filter**: Search and filtering work on mock data

## Configuration

### Environment Variables

Create a `.env` file in the web-interface directory:

```bash
# Enable demo mode
VITE_ENABLE_DEMO_MODE=true

# API Configuration (not used in demo mode but required)
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3002
```

### Disabling Demo Mode

To disable demo mode, set `VITE_ENABLE_DEMO_MODE=false` or remove the variable entirely.

## Implementation Details

### Store Integration
- `isDemoMode` flag in auth store tracks demo state
- `enableDemoMode()` function initializes demo user and tokens
- Demo state persists across page refreshes

### API Interception
- Request interceptor checks demo mode before making API calls
- Demo API provides mock responses for all endpoints
- Real API calls are cancelled when in demo mode

### Mock Data Structure
- Sample files with realistic metadata
- Folder hierarchy for navigation
- Processing jobs and notifications
- User permissions and sharing settings

## Usage

1. **Enable Demo Mode**: Set `VITE_ENABLE_DEMO_MODE=true` in environment
2. **Start Application**: Run the development server
3. **Access Demo**: Click "Try Demo Mode" on the login page
4. **Explore Features**: Use all application features with mock data

## Limitations

- **No Persistence**: Changes are not saved between sessions
- **No Real Uploads**: File uploads are simulated
- **No Network Operations**: All operations work locally
- **Mock Processing**: Background jobs are simulated

## Security Considerations

- Demo mode should be disabled in production
- Environment variable control prevents accidental enablement
- Clear visual indicators prevent confusion
- Demo tokens are clearly marked and invalid for real APIs

## Development

When adding new features:

1. **Update Demo API**: Add mock responses in `src/api/demoApi.ts`
2. **Add Demo Data**: Include sample data in `src/api/demoData.ts`
3. **Test Demo Mode**: Ensure features work in both normal and demo modes
4. **Visual Indicators**: Maintain clear demo mode indicators

## File Structure

```
src/
├── api/
│   ├── demoApi.ts      # Mock API implementations
│   ├── demoData.ts     # Sample data
│   ├── files.ts        # Real API with demo mode integration
│   └── client.ts       # HTTP client with demo mode interception
├── store/
│   └── authStore.ts    # Auth state with demo mode support
├── pages/auth/
│   └── LoginPage.tsx   # Login page with demo mode button
├── components/layout/
│   └── Header.tsx      # Header with demo mode indicators
└── config/
    └── index.ts        # Configuration with demo mode settings
```

## Testing

To test demo mode functionality:

1. Set `VITE_ENABLE_DEMO_MODE=true`
2. Start the development server
3. Navigate to the login page
4. Click "Try Demo Mode"
5. Verify the demo badge appears
6. Test various features (file operations, search, etc.)
7. Confirm no real API calls are made

## Future Enhancements

- **Configurable Data**: Allow customization of demo data
- **Demo Scenarios**: Pre-defined workflows for demonstration
- **Export/Import**: Save and load demo configurations
- **Tutorial Mode**: Guided tour in demo mode
