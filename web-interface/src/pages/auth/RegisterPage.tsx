import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Link,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import { getErrorMessage } from '@/api/client';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    try {
      const response = await authApi.register({ email, password, name });

      if (response.success && response.data) {
        login(response.data.user, response.data.tokens);
        navigate('/files', { replace: true });
      } else {
        setError(response.error?.message || 'Registration failed');
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
        Create your account
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <TextField
        fullWidth
        label="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoComplete="name"
        autoFocus
        sx={{ mb: 2 }}
      />

      <TextField
        fullWidth
        label="Email address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        sx={{ mb: 2 }}
      />

      <TextField
        fullWidth
        label="Password"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
        helperText="At least 8 characters with uppercase, lowercase, and number"
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
        sx={{ mb: 2 }}
      />

      <TextField
        fullWidth
        label="Confirm password"
        type={showPassword ? 'text' : 'password'}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        autoComplete="new-password"
        error={confirmPassword.length > 0 && password !== confirmPassword}
        helperText={
          confirmPassword.length > 0 && password !== confirmPassword
            ? 'Passwords do not match'
            : ''
        }
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
        {loading ? 'Creating account...' : 'Create account'}
      </Button>

      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">
            Sign in
          </Link>
        </Typography>
      </Box>
    </Box>
  );
}
