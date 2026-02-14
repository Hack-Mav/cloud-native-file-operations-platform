import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Typography,
  LinearProgress,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Collapse,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useFileStore } from '@/store/fileStore';
import { filesApi } from '@/api/files';
import { config } from '@/config';
import type { FileUploadProgress } from '@/types';

interface FileUploaderProps {
  folderId: string | null;
  onUploadComplete?: () => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function FileUploader({ folderId, onUploadComplete }: FileUploaderProps) {
  const {
    uploadQueue,
    addToUploadQueue,
    updateUploadProgress,
    removeFromUploadQueue,
  } = useFileStore();
  const [expanded, setExpanded] = useState(true);

  const uploadFile = async (file: File) => {
    const fileId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const uploadItem: FileUploadProgress = {
      fileId,
      fileName: file.name,
      progress: 0,
      status: 'pending',
    };

    addToUploadQueue(uploadItem);

    try {
      updateUploadProgress(fileId, { status: 'uploading' });

      const useChunked = file.size > config.upload.chunkSize;

      if (useChunked) {
        await filesApi.uploadChunked(file, folderId, (progress) => {
          updateUploadProgress(fileId, { progress });
        });
      } else {
        await filesApi.uploadFile(file, folderId, (progress) => {
          updateUploadProgress(fileId, { progress });
        });
      }

      updateUploadProgress(fileId, { status: 'completed', progress: 100 });
      onUploadComplete?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      updateUploadProgress(fileId, { status: 'failed', error: errorMessage });
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        if (file.size > config.upload.maxFileSize) {
          const fileId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          addToUploadQueue({
            fileId,
            fileName: file.name,
            progress: 0,
            status: 'failed',
            error: `File exceeds maximum size of ${formatFileSize(config.upload.maxFileSize)}`,
          });
          continue;
        }
        await uploadFile(file);
      }
    },
    [folderId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const activeUploads = uploadQueue.filter(
    (u) => u.status === 'uploading' || u.status === 'pending'
  );
  const hasActiveUploads = activeUploads.length > 0;

  return (
    <Box>
      {/* Dropzone */}
      <Paper
        {...getRootProps()}
        sx={{
          p: 4,
          border: 2,
          borderStyle: 'dashed',
          borderColor: isDragActive ? 'primary.main' : 'divider',
          bgcolor: isDragActive ? 'action.hover' : 'background.paper',
          cursor: 'pointer',
          transition: 'all 0.2s',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'action.hover',
          },
        }}
      >
        <input {...getInputProps()} />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <CloudUploadIcon
            sx={{ fontSize: 48, color: isDragActive ? 'primary.main' : 'text.secondary' }}
          />
          <Typography variant="h6">
            {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            or click to select files (max {formatFileSize(config.upload.maxFileSize)})
          </Typography>
        </Box>
      </Paper>

      {/* Upload queue */}
      {uploadQueue.length > 0 && (
        <Paper sx={{ mt: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1,
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="subtitle2">
              {hasActiveUploads
                ? `Uploading ${activeUploads.length} file(s)...`
                : 'Upload complete'}
            </Typography>
            <IconButton size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          <Collapse in={expanded}>
            <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
              {uploadQueue.map((upload) => (
                <ListItem key={upload.fileId}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {upload.status === 'completed' ? (
                      <CheckCircleIcon color="success" />
                    ) : upload.status === 'failed' ? (
                      <ErrorIcon color="error" />
                    ) : (
                      <InsertDriveFileIcon />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={upload.fileName}
                    secondary={
                      upload.status === 'failed' ? (
                        <Typography variant="caption" color="error">
                          {upload.error}
                        </Typography>
                      ) : upload.status === 'uploading' ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={upload.progress}
                            sx={{ flexGrow: 1 }}
                          />
                          <Typography variant="caption">
                            {upload.progress}%
                          </Typography>
                        </Box>
                      ) : upload.status === 'completed' ? (
                        'Completed'
                      ) : (
                        'Waiting...'
                      )
                    }
                    primaryTypographyProps={{ noWrap: true }}
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      onClick={() => removeFromUploadQueue(upload.fileId)}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </Collapse>
        </Paper>
      )}
    </Box>
  );
}
