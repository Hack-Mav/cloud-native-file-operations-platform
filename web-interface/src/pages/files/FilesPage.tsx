import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Paper,
  Divider,
  Typography,
} from '@mui/material';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useFileStore } from '@/store/fileStore';
import { filesApi } from '@/api/files';
import { getErrorMessage } from '@/api/client';
import Breadcrumbs from '@/components/files/Breadcrumbs';
import FileGrid from '@/components/files/FileGrid';
import FileList from '@/components/files/FileList';
import FileUploader from '@/components/files/FileUploader';
import FilePreview from '@/components/files/FilePreview';
import ShareDialog from '@/components/files/ShareDialog';
import CreateFolderDialog from '@/components/files/CreateFolderDialog';
import RenameDialog from '@/components/files/RenameDialog';
import DeleteConfirmDialog from '@/components/files/DeleteConfirmDialog';
import type { FileItem, Folder } from '@/types';

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export default function FilesPage() {
  const { folderId } = useParams<{ folderId?: string }>();
  const navigate = useNavigate();
  const {
    files,
    folders,
    selectedItems,
    viewMode,
    sortBy,
    sortOrder,
    isLoading,
    setFiles,
    setFolders,
    setCurrentPath,
    toggleItemSelection,
    selectAllItems,
    clearSelection,
    setLoading,
    setViewMode,
    setSort,
  } = useFileStore();

  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [shareItem, setShareItem] = useState<FileItem | Folder | null>(null);
  const [renameItem, setRenameItem] = useState<FileItem | Folder | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [deleteItemIds, setDeleteItemIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const currentFolderId = folderId || null;

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await filesApi.listFiles({
        folderId: currentFolderId,
        sortBy,
        sortOrder,
      });

      if (response.success && response.data) {
        const allItems = response.data.items;
        setFolders(allItems.filter((item): item is Folder => item.isFolder) as Folder[]);
        setFiles(allItems.filter((item) => !item.isFolder));
      } else {
        setError(response.error?.message || 'Failed to load files');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, sortBy, sortOrder, setFiles, setFolders, setLoading]);

  useEffect(() => {
    loadFiles();
    setCurrentPath(currentFolderId ? `/files/${currentFolderId}` : '/', currentFolderId);

    // Build breadcrumbs (simplified - in real app, fetch from API)
    if (currentFolderId) {
      // For now, just show a placeholder
      setBreadcrumbs([{ id: currentFolderId, name: 'Current Folder' }]);
    } else {
      setBreadcrumbs([]);
    }
  }, [currentFolderId, loadFiles, setCurrentPath]);

  const handleNavigateFolder = (folderId: string | null) => {
    clearSelection();
    if (folderId) {
      navigate(`/files/${folderId}`);
    } else {
      navigate('/files');
    }
  };

  const handleItemClick = (item: FileItem | Folder) => {
    if (item.isFolder) {
      handleNavigateFolder(item.id);
    } else {
      setPreviewFile(item as FileItem);
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const response = await filesApi.getDownloadUrl(file.id);
      if (response.success && response.data) {
        window.open(response.data.url, '_blank');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleSort = (column: string) => {
    const newOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
    setSort(column as typeof sortBy, newOrder);
  };

  const handleDelete = (itemIds: string[]) => {
    setDeleteItemIds(itemIds);
  };

  const handleMove = (itemIds: string[]) => {
    // TODO: Implement move dialog
    console.log('Move items:', itemIds);
  };

  const handleCopy = (itemIds: string[]) => {
    // TODO: Implement copy dialog
    console.log('Copy items:', itemIds);
  };

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Typography variant="h5" fontWeight={600}>
          My Files
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={() => setShowUploader(!showUploader)}
          >
            Upload
          </Button>
          <Button
            variant="outlined"
            startIcon={<CreateNewFolderIcon />}
            onClick={() => setShowCreateFolder(true)}
          >
            New Folder
          </Button>
        </Box>
      </Box>

      {/* Uploader */}
      {showUploader && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <FileUploader
            folderId={currentFolderId}
            onUploadComplete={loadFiles}
          />
        </Paper>
      )}

      {/* Breadcrumbs and toolbar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Breadcrumbs items={breadcrumbs} onNavigate={handleNavigateFolder} />

        <Divider sx={{ my: 2 }} />

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {selectedItems.length > 0 && (
              <>
                <Typography variant="body2" color="text.secondary">
                  {selectedItems.length} selected
                </Typography>
                <Tooltip title="Delete selected">
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(selectedItems)}
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Refresh">
              <IconButton onClick={loadFiles} disabled={isLoading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, value) => value && setViewMode(value)}
              size="small"
            >
              <ToggleButton value="grid">
                <ViewModuleIcon />
              </ToggleButton>
              <ToggleButton value="list">
                <ViewListIcon />
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Paper>

      {/* Error message */}
      {error && (
        <Paper sx={{ p: 2, mb: 2, bgcolor: 'error.light' }}>
          <Typography color="error">{error}</Typography>
        </Paper>
      )}

      {/* File browser */}
      <Paper sx={{ p: 2 }}>
        {viewMode === 'grid' ? (
          <FileGrid
            files={files}
            folders={folders}
            selectedItems={selectedItems}
            onItemClick={handleItemClick}
            onItemSelect={toggleItemSelection}
            onDownload={handleDownload}
            onShare={setShareItem}
            onRename={setRenameItem}
            onDelete={handleDelete}
            onMove={handleMove}
            onCopy={handleCopy}
          />
        ) : (
          <FileList
            files={files}
            folders={folders}
            selectedItems={selectedItems}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            onItemClick={handleItemClick}
            onItemSelect={toggleItemSelection}
            onSelectAll={selectAllItems}
            onDownload={handleDownload}
            onShare={setShareItem}
            onRename={setRenameItem}
            onDelete={handleDelete}
            onMove={handleMove}
            onCopy={handleCopy}
          />
        )}
      </Paper>

      {/* Dialogs */}
      <FilePreview
        file={previewFile}
        files={files}
        open={previewFile !== null}
        onClose={() => setPreviewFile(null)}
        onNavigate={setPreviewFile}
        onDownload={handleDownload}
      />

      <ShareDialog
        item={shareItem}
        open={shareItem !== null}
        onClose={() => setShareItem(null)}
      />

      <CreateFolderDialog
        open={showCreateFolder}
        parentId={currentFolderId}
        onClose={() => setShowCreateFolder(false)}
        onCreated={loadFiles}
      />

      <RenameDialog
        item={renameItem}
        open={renameItem !== null}
        onClose={() => setRenameItem(null)}
        onRenamed={loadFiles}
      />

      <DeleteConfirmDialog
        itemIds={deleteItemIds}
        open={deleteItemIds.length > 0}
        onClose={() => setDeleteItemIds([])}
        onDeleted={() => {
          loadFiles();
          clearSelection();
        }}
      />
    </Box>
  );
}
