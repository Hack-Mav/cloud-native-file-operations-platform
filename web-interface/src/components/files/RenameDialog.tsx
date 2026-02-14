import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
} from '@mui/material';
import { filesApi } from '@/api/files';
import { getErrorMessage } from '@/api/client';
import type { FileItem, Folder } from '@/types';

interface RenameDialogProps {
  item: FileItem | Folder | null;
  open: boolean;
  onClose: () => void;
  onRenamed: () => void;
}

export default function RenameDialog({
  item,
  open,
  onClose,
  onRenamed,
}: RenameDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
    }
  }, [item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!item || !name.trim()) {
      setError('Name is required');
      return;
    }

    if (name.trim() === item.name) {
      onClose();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await filesApi.renameFile(item.id, name.trim());

      if (response.success) {
        onRenamed();
        onClose();
      } else {
        setError(response.error?.message || 'Failed to rename');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Rename</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading || !name.trim()}>
            {loading ? 'Renaming...' : 'Rename'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
