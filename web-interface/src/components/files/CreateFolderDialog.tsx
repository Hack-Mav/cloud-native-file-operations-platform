import { useState } from 'react';
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

interface CreateFolderDialogProps {
  open: boolean;
  parentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateFolderDialog({
  open,
  parentId,
  onClose,
  onCreated,
}: CreateFolderDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Folder name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await filesApi.createFolder({
        name: name.trim(),
        parentId,
      });

      if (response.success) {
        setName('');
        onCreated();
        onClose();
      } else {
        setError(response.error?.message || 'Failed to create folder');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label="Folder name"
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
            {loading ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
