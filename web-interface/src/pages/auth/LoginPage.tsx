import { useState } from 'react';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Link,
  Alert,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import { getErrorMessage } from '@/api/client';
import { config } from '@/config';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, setMfaRequired, enableDemoMode } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: Location })?.from?.pathname || '/files';

  const handleDemoLogin = () => {
    enableDemoMode();
    navigate(from, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.login({ email, password });

      if (response.success && response.data) {
        if ('mfaRequired' in response.data && response.data.mfaRequired) {
          setMfaRequired(true, response.data.sessionToken);
          navigate('/mfa-verify', { state: { from } });
        } else if ('user' in response.data) {
          login(response.data.user, response.data.tokens);
          navigate(from, { replace: true });
        }
      } else {
        setError(response.error?.message || 'Login failed');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Typography variant="h5" fontWeight={600} mb={3}>
        Sign in to your account
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <TextField
        fullWidth
        label="Email address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        autoFocus
        sx={{ mb: 2 }}
      />

      <TextField
        fullWidth
        label="Password"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => setShowPassword(!showPassword)}
                edge="end"
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ mb: 3 }}
      />

      <Button
        type="submit"
        fullWidth
        variant="contained"
        size="large"
        disabled={loading}
        sx={{ mb: 2 }}
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </Button>

      {config.demo.enabled && (
        <>
          <Divider sx={{ my: 2 }} />

          <Button
            fullWidth
            variant="outlined"
            size="large"
            onClick={handleDemoLogin}
            sx={{ mb: 2 }}
          >
            Try Demo Mode
          </Button>
        </>
      )}

      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Don't have an account?{' '}
          <Link component={RouterLink} to="/register">
            Sign up
          </Link>
        </Typography>
      </Box>
    </Box>
  );
}
