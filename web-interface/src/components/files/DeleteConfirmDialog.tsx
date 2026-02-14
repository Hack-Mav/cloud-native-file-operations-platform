import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import { useState } from 'react';
import { filesApi } from '@/api/files';
import { getErrorMessage } from '@/api/client';

interface DeleteConfirmDialogProps {
  itemIds: string[];
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteConfirmDialog({
  itemIds,
  open,
  onClose,
  onDeleted,
}: DeleteConfirmDialogProps) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    setError('');

    try {
      if (itemIds.length === 1) {
        await filesApi.deleteFile(itemIds[0]);
      } else {
        await filesApi.deleteFiles(itemIds);
      }
      onDeleted();
      onClose();
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
      <DialogTitle>Delete {itemIds.length > 1 ? 'Items' : 'Item'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography>
          Are you sure you want to delete {itemIds.length > 1 ? `these ${itemIds.length} items` : 'this item'}?
          This action will move them to the trash.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          variant="contained"
          color="error"
          disabled={loading}
        >
          {loading ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
