import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Select,
  MenuItem,
  InputAdornment,
  Divider,
  Alert,
  Chip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import LinkIcon from '@mui/icons-material/Link';
import { filesApi } from '@/api/files';
import { getErrorMessage } from '@/api/client';
import type { FileItem, Folder, ShareSettings, SharedUser } from '@/types';

interface ShareDialogProps {
  item: FileItem | Folder | null;
  open: boolean;
  onClose: () => void;
}

export default function ShareDialog({ item, open, onClose }: ShareDialogProps) {
  const [shareSettings, setShareSettings] = useState<ShareSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPermission, setNewPermission] = useState<'view' | 'edit' | 'admin'>('view');

  useEffect(() => {
    if (item && open) {
      loadShareSettings();
    }
  }, [item, open]);

  const loadShareSettings = async () => {
    if (!item) return;

    setLoading(true);
    setError('');

    try {
      const response = await filesApi.getShareSettings(item.id);
      if (response.success && response.data) {
        setShareSettings(response.data);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePublic = async () => {
    if (!shareSettings || !item) return;

    setSaving(true);
    setError('');

    try {
      const response = await filesApi.updateShareSettings(item.id, {
        isPublic: !shareSettings.isPublic,
      });
      if (response.success && response.data) {
        setShareSettings(response.data);
        setSuccess('Sharing settings updated');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddUser = async () => {
    if (!item || !newEmail.trim()) return;

    setSaving(true);
    setError('');

    try {
      const response = await filesApi.shareWithUser(item.id, newEmail.trim(), newPermission);
      if (response.success && response.data) {
        setShareSettings(response.data);
        setNewEmail('');
        setSuccess('User added');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!item) return;

    setSaving(true);
    setError('');

    try {
      await filesApi.removeUserShare(item.id, userId);
      setShareSettings((prev) =>
        prev
          ? {
              ...prev,
              sharedWith: prev.sharedWith.filter((u) => u.userId !== userId),
            }
          : null
      );
      setSuccess('User removed');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/share/${item?.id}`;
    navigator.clipboard.writeText(shareUrl);
    setSuccess('Link copied to clipboard');
    setTimeout(() => setSuccess(''), 3000);
  };

  const getPermissionLabel = (permission: string) => {
    switch (permission) {
      case 'admin':
        return 'Admin';
      case 'edit':
        return 'Can edit';
      case 'view':
        return 'Can view';
      default:
        return permission;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Share "{item?.name}"</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {/* Public link section */}
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={shareSettings?.isPublic || false}
                onChange={handleTogglePublic}
                disabled={loading || saving}
              />
            }
            label="Anyone with the link can view"
          />

          {shareSettings?.isPublic && (
            <Box sx={{ mt: 2 }}>
              <TextField
                fullWidth
                size="small"
                value={`${window.location.origin}/share/${item?.id}`}
                InputProps={{
                  readOnly: true,
                  startAdornment: (
                    <InputAdornment position="start">
                      <LinkIcon />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={handleCopyLink} size="small">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Add people section */}
        <Typography variant="subtitle2" sx={{ mb: 2 }}>
          Share with people
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            size="small"
            placeholder="Enter email address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            sx={{ flexGrow: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PersonAddIcon />
                </InputAdornment>
              ),
            }}
          />
          <Select
            size="small"
            value={newPermission}
            onChange={(e) => setNewPermission(e.target.value as 'view' | 'edit' | 'admin')}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="view">Can view</MenuItem>
            <MenuItem value="edit">Can edit</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
          </Select>
          <Button
            variant="contained"
            onClick={handleAddUser}
            disabled={!newEmail.trim() || saving}
          >
            Add
          </Button>
        </Box>

        {/* Shared users list */}
        {shareSettings?.sharedWith && shareSettings.sharedWith.length > 0 && (
          <List dense>
            {shareSettings.sharedWith.map((user: SharedUser) => (
              <ListItem key={user.userId}>
                <ListItemText
                  primary={user.email}
                  secondary={
                    <Chip
                      label={getPermissionLabel(user.permission)}
                      size="small"
                      variant="outlined"
                    />
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    onClick={() => handleRemoveUser(user.userId)}
                    disabled={saving}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
