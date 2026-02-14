import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Box, Button, TextField, Typography, Alert } from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import { getErrorMessage } from '@/api/client';

export default function MfaVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mfaRequired, mfaSessionToken, login, setMfaRequired } = useAuthStore();

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const from = (location.state as { from?: string })?.from || '/files';

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  if (!mfaRequired || !mfaSessionToken) {
    return <Navigate to="/login" replace />;
  }

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newCode = [...code];
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newCode[index + i] = digit;
        }
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
    } else {
      const newCode = [...code];
      newCode[index] = value.replace(/\D/g, '');
      setCode(newCode);

      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const mfaCode = code.join('');
    if (mfaCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);

    try {
      const response = await authApi.verifyMfa(mfaSessionToken, mfaCode);

      if (response.success && response.data) {
        login(response.data.user, response.data.tokens);
        setMfaRequired(false);
        navigate(from, { replace: true });
      } else {
        setError(response.error?.message || 'Verification failed');
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setMfaRequired(false);
    navigate('/login', { replace: true });
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Typography variant="h5" fontWeight={600} mb={1}>
        Two-Factor Authentication
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Enter the 6-digit code from your authenticator app
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: 'flex',
          gap: 1,
          justifyContent: 'center',
          mb: 3,
        }}
      >
        {code.map((digit, index) => (
          <TextField
            key={index}
            inputRef={(el) => (inputRefs.current[index] = el)}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            inputProps={{
              maxLength: 6,
              style: {
                textAlign: 'center',
                fontSize: '1.5rem',
                padding: '12px',
                width: '40px',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                '& fieldset': {
                  borderWidth: 2,
                },
              },
            }}
          />
        ))}
      </Box>

      <Button
        type="submit"
        fullWidth
        variant="contained"
        size="large"
        disabled={loading || code.some((d) => !d)}
        sx={{ mb: 2 }}
      >
        {loading ? 'Verifying...' : 'Verify'}
      </Button>

      <Button
        fullWidth
        variant="text"
        onClick={handleCancel}
        disabled={loading}
      >
        Cancel
      </Button>
    </Box>
  );
}
