import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { filesApi } from '@/api/files';
import type { FileItem } from '@/types';

interface FilePreviewProps {
  file: FileItem | null;
  files: FileItem[];
  open: boolean;
  onClose: () => void;
  onNavigate: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
}

export default function FilePreview({
  file,
  files,
  open,
  onClose,
  onNavigate,
  onDownload,
}: FilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIndex = files.findIndex((f) => f.id === file?.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;

  useEffect(() => {
    if (!file || !open) {
      setPreviewUrl(null);
      return;
    }

    const loadPreview = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await filesApi.getPreviewUrl(file.id);
        if (response.success && response.data) {
          setPreviewUrl(response.data.url);
        } else {
          setError('Failed to load preview');
        }
      } catch {
        setError('Failed to load preview');
      } finally {
        setLoading(false);
      }
    };

    // Only load preview for previewable types
    if (isPreviewable(file.mimeType)) {
      loadPreview();
    }
  }, [file, open]);

  const isPreviewable = (mimeType: string): boolean => {
    return (
      mimeType.startsWith('image/') ||
      mimeType.startsWith('video/') ||
      mimeType.startsWith('audio/') ||
      mimeType === 'application/pdf' ||
      mimeType.startsWith('text/')
    );
  };

  const handlePrev = () => {
    if (hasPrev) {
      onNavigate(files[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onNavigate(files[currentIndex + 1]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Escape') onClose();
  };

  const renderPreview = () => {
    if (!file) return null;

    if (loading) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60vh',
          }}
        >
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60vh',
          }}
        >
          <InsertDriveFileIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography color="text.secondary">{error}</Typography>
        </Box>
      );
    }

    if (!isPreviewable(file.mimeType)) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60vh',
          }}
        >
          <InsertDriveFileIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography color="text.secondary">
            Preview not available for this file type
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {file.mimeType}
          </Typography>
        </Box>
      );
    }

    if (file.mimeType.startsWith('image/')) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60vh',
          }}
        >
          <img
            src={previewUrl || ''}
            alt={file.name}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />
        </Box>
      );
    }

    if (file.mimeType.startsWith('video/')) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60vh',
          }}
        >
          <video
            src={previewUrl || ''}
            controls
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          />
        </Box>
      );
    }

    if (file.mimeType.startsWith('audio/')) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60vh',
          }}
        >
          <InsertDriveFileIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" sx={{ mb: 2 }}>
            {file.name}
          </Typography>
          <audio src={previewUrl || ''} controls />
        </Box>
      );
    }

    if (file.mimeType === 'application/pdf') {
      return (
        <iframe
          src={previewUrl || ''}
          title={file.name}
          style={{
            width: '100%',
            height: '70vh',
            border: 'none',
          }}
        />
      );
    }

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '60vh',
        }}
      >
        <Typography color="text.secondary">
          Preview not available
        </Typography>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      onKeyDown={handleKeyDown}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
          {file?.name}
        </Typography>
        <Box>
          {file && (
            <IconButton onClick={() => onDownload(file)}>
              <DownloadIcon />
            </IconButton>
          )}
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ position: 'relative' }}>
        {renderPreview()}

        {/* Navigation buttons */}
        {hasPrev && (
          <IconButton
            onClick={handlePrev}
            sx={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'background.paper',
              boxShadow: 1,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <NavigateBeforeIcon />
          </IconButton>
        )}
        {hasNext && (
          <IconButton
            onClick={handleNext}
            sx={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              bgcolor: 'background.paper',
              boxShadow: 1,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <NavigateNextIcon />
          </IconButton>
        )}
      </DialogContent>
    </Dialog>
  );
}
