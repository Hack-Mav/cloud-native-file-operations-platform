import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Alert,
  Divider,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  InputAdornment,
  IconButton,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import SecurityIcon from '@mui/icons-material/Security';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import { getErrorMessage } from '@/api/client';

export default function SecurityPage() {
  const { user, setUser } = useAuthStore();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // MFA state
  const [mfaDialog, setMfaDialog] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; qrCode: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await authApi.changePassword(currentPassword, newPassword);

      if (response.success) {
        setPasswordSuccess('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(response.error?.message || 'Failed to change password');
      }
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSetupMfa = async () => {
    setMfaLoading(true);
    setMfaError('');

    try {
      const response = await authApi.setupMfa();

      if (response.success && response.data) {
        setMfaSetup(response.data);
        setMfaDialog(true);
      } else {
        setMfaError(response.error?.message || 'Failed to setup MFA');
      }
    } catch (err) {
      setMfaError(getErrorMessage(err));
    } finally {
      setMfaLoading(false);
    }
  };

  const handleEnableMfa = async () => {
    if (!mfaCode || mfaCode.length !== 6) {
      setMfaError('Please enter a valid 6-digit code');
      return;
    }

    setMfaLoading(true);
    setMfaError('');

    try {
      const response = await authApi.enableMfa(mfaCode);

      if (response.success && response.data) {
        setBackupCodes(response.data.backupCodes);
        if (user) {
          setUser({ ...user, mfaEnabled: true });
        }
      } else {
        setMfaError(response.error?.message || 'Failed to enable MFA');
      }
    } catch (err) {
      setMfaError(getErrorMessage(err));
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    const code = prompt('Enter your MFA code to disable:');
    if (!code) return;

    setMfaLoading(true);

    try {
      const response = await authApi.disableMfa(code);

      if (response.success) {
        if (user) {
          setUser({ ...user, mfaEnabled: false });
        }
      } else {
        alert(response.error?.message || 'Failed to disable MFA');
      }
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setMfaLoading(false);
    }
  };

  const handleCloseMfaDialog = () => {
    setMfaDialog(false);
    setMfaSetup(null);
    setMfaCode('');
    setBackupCodes([]);
    setMfaError('');
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>
        Security Settings
      </Typography>

      {/* Change Password */}
      <Paper sx={{ p: 3, maxWidth: 600, mb: 3 }}>
        <Typography variant="h6" mb={2}>
          Change Password
        </Typography>

        {passwordError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {passwordError}
          </Alert>
        )}
        {passwordSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {passwordSuccess}
          </Alert>
        )}

        <form onSubmit={handleChangePassword}>
          <TextField
            fullWidth
            label="Current Password"
            type={showPasswords ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPasswords(!showPasswords)}>
                    {showPasswords ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            fullWidth
            label="New Password"
            type={showPasswords ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            helperText="At least 8 characters"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Confirm New Password"
            type={showPasswords ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            error={confirmPassword.length > 0 && newPassword !== confirmPassword}
            sx={{ mb: 2 }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={passwordLoading || !currentPassword || !newPassword}
          >
            {passwordLoading ? 'Changing...' : 'Change Password'}
          </Button>
        </form>
      </Paper>

      {/* Two-Factor Authentication */}
      <Paper sx={{ p: 3, maxWidth: 600 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <SecurityIcon sx={{ mr: 1 }} />
          <Typography variant="h6">Two-Factor Authentication</Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" mb={2}>
          Add an extra layer of security to your account by enabling two-factor
          authentication.
        </Typography>

        <FormControlLabel
          control={
            <Switch
              checked={user?.mfaEnabled || false}
              onChange={user?.mfaEnabled ? handleDisableMfa : handleSetupMfa}
              disabled={mfaLoading}
            />
          }
          label={user?.mfaEnabled ? 'Enabled' : 'Disabled'}
        />

        {mfaError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {mfaError}
          </Alert>
        )}
      </Paper>

      {/* MFA Setup Dialog */}
      <Dialog open={mfaDialog} onClose={handleCloseMfaDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
        <DialogContent>
          {backupCodes.length > 0 ? (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                MFA enabled successfully! Save these backup codes.
              </Alert>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Store these codes in a safe place. You can use them to access your
                account if you lose your authenticator device.
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.100' }}>
                <List dense>
                  {backupCodes.map((code, index) => (
                    <ListItem key={index}>
                      <ListItemText
                        primary={code}
                        primaryTypographyProps={{ fontFamily: 'monospace' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>
              <Button
                startIcon={<ContentCopyIcon />}
                onClick={copyBackupCodes}
                sx={{ mt: 2 }}
              >
                Copy Codes
              </Button>
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" mb={2}>
                Scan this QR code with your authenticator app:
              </Typography>
              {mfaSetup?.qrCode && (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    mb: 2,
                    p: 2,
                    bgcolor: 'white',
                  }}
                >
                  <img src={mfaSetup.qrCode} alt="QR Code" />
                </Box>
              )}
              <Typography variant="body2" color="text.secondary" mb={2}>
                Or enter this code manually: <strong>{mfaSetup?.secret}</strong>
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" mb={2}>
                Enter the 6-digit code from your authenticator app:
              </Typography>
              {mfaError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {mfaError}
                </Alert>
              )}
              <TextField
                fullWidth
                label="Verification Code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputProps={{ maxLength: 6 }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMfaDialog}>
            {backupCodes.length > 0 ? 'Done' : 'Cancel'}
          </Button>
          {backupCodes.length === 0 && (
            <Button
              variant="contained"
              onClick={handleEnableMfa}
              disabled={mfaLoading || mfaCode.length !== 6}
            >
              {mfaLoading ? 'Verifying...' : 'Enable MFA'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
