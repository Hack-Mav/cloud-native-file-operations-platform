import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  FormGroup,
  Divider,
  Button,
  Alert,
} from '@mui/material';

export default function NotificationsPage() {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    fileUploaded: true,
    fileShared: true,
    processingComplete: true,
    processingFailed: true,
    securityAlerts: true,
    weeklyDigest: false,
    browserNotifications: false,
  });
  const [success, setSuccess] = useState('');

  const handleChange = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    // TODO: Save to API
    setSuccess('Notification preferences saved');
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>
        Notification Settings
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 600 }}>
        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}

        <Typography variant="h6" mb={2}>
          Email Notifications
        </Typography>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={settings.emailNotifications}
                onChange={() => handleChange('emailNotifications')}
              />
            }
            label="Enable email notifications"
          />
        </FormGroup>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle1" fontWeight={500} mb={2}>
          Notify me when:
        </Typography>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={settings.fileUploaded}
                onChange={() => handleChange('fileUploaded')}
                disabled={!settings.emailNotifications}
              />
            }
            label="A file is uploaded"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.fileShared}
                onChange={() => handleChange('fileShared')}
                disabled={!settings.emailNotifications}
              />
            }
            label="A file is shared with me"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.processingComplete}
                onChange={() => handleChange('processingComplete')}
                disabled={!settings.emailNotifications}
              />
            }
            label="File processing completes"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.processingFailed}
                onChange={() => handleChange('processingFailed')}
                disabled={!settings.emailNotifications}
              />
            }
            label="File processing fails"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.securityAlerts}
                onChange={() => handleChange('securityAlerts')}
                disabled={!settings.emailNotifications}
              />
            }
            label="Security alerts"
          />
        </FormGroup>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle1" fontWeight={500} mb={2}>
          Digest
        </Typography>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={settings.weeklyDigest}
                onChange={() => handleChange('weeklyDigest')}
                disabled={!settings.emailNotifications}
              />
            }
            label="Send weekly activity digest"
          />
        </FormGroup>

        <Divider sx={{ my: 3 }} />

        <Typography variant="h6" mb={2}>
          Browser Notifications
        </Typography>
        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={settings.browserNotifications}
                onChange={() => handleChange('browserNotifications')}
              />
            }
            label="Enable browser push notifications"
          />
        </FormGroup>

        <Box sx={{ mt: 4 }}>
          <Button variant="contained" onClick={handleSave}>
            Save Preferences
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
