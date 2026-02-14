import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Avatar,
  Grid,
  Alert,
  Divider,
} from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import { getErrorMessage } from '@/api/client';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [email] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await authApi.updateProfile({ name });

      if (response.success && response.data) {
        setUser(response.data);
        setSuccess('Profile updated successfully');
      } else {
        setError(response.error?.message || 'Failed to update profile');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>
        Profile Settings
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 600 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
          <Avatar
            sx={{
              width: 80,
              height: 80,
              bgcolor: 'primary.main',
              fontSize: '2rem',
              mr: 3,
            }}
          >
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </Avatar>
          <Box>
            <Typography variant="h6">{user?.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.role} account
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email Address"
                value={email}
                disabled
                helperText="Email cannot be changed"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Role"
                value={user?.role || ''}
                disabled
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tenant ID"
                value={user?.tenantId || ''}
                disabled
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                disabled={loading || name === user?.name}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  );
}
