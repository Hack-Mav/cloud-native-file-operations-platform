import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { lightTheme, darkTheme } from '@/theme';

// Layouts
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';

// Pages
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import MfaVerifyPage from '@/pages/auth/MfaVerifyPage';
import FilesPage from '@/pages/files/FilesPage';
import SharedPage from '@/pages/files/SharedPage';
import TrashPage from '@/pages/files/TrashPage';
import ProfilePage from '@/pages/settings/ProfilePage';
import SecurityPage from '@/pages/settings/SecurityPage';
import NotificationsPage from '@/pages/settings/NotificationsPage';
import DashboardPage from '@/pages/DashboardPage';
import NotFoundPage from '@/pages/NotFoundPage';

// Components
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import LoadingScreen from '@/components/common/LoadingScreen';

function App() {
  const { isAuthenticated, isLoading, setLoading } = useAuthStore();
  const { themeMode } = useUiStore();

  const theme = themeMode === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    // Check if user is still authenticated on mount
    const checkAuth = async () => {
      setLoading(false);
    };
    checkAuth();
  }, [setLoading]);

  if (isLoading) {
    return (
      <ThemeProvider theme={theme}>
        <LoadingScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Routes>
        {/* Auth routes */}
        <Route element={<AuthLayout />}>
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/files" replace /> : <LoginPage />
            }
          />
          <Route
            path="/register"
            element={
              isAuthenticated ? <Navigate to="/files" replace /> : <RegisterPage />
            }
          />
          <Route path="/mfa-verify" element={<MfaVerifyPage />} />
        </Route>

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/files" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/files/:folderId" element={<FilesPage />} />
          <Route path="/shared" element={<SharedPage />} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/settings/profile" element={<ProfilePage />} />
          <Route path="/settings/security" element={<SecurityPage />} />
          <Route path="/settings/notifications" element={<NotificationsPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;
