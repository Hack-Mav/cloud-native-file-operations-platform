import {
  Box,
  Checkbox,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DownloadIcon from '@mui/icons-material/Download';
import ShareIcon from '@mui/icons-material/Share';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import { useState } from 'react';
import type { FileItem, Folder } from '@/types';

interface FileListProps {
  files: FileItem[];
  folders: Folder[];
  selectedItems: string[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onItemClick: (item: FileItem | Folder) => void;
  onItemSelect: (itemId: string) => void;
  onSelectAll: () => void;
  onDownload: (file: FileItem) => void;
  onShare: (item: FileItem | Folder) => void;
  onRename: (item: FileItem | Folder) => void;
  onDelete: (items: string[]) => void;
  onMove: (items: string[]) => void;
  onCopy: (items: string[]) => void;
}

const getFileIcon = (mimeType: string, isFolder: boolean) => {
  if (isFolder) return <FolderIcon color="primary" />;
  if (mimeType.startsWith('image/')) return <ImageIcon />;
  if (mimeType.startsWith('video/')) return <VideoFileIcon />;
  if (mimeType.startsWith('audio/')) return <AudioFileIcon />;
  if (mimeType === 'application/pdf') return <PictureAsPdfIcon />;
  if (mimeType.includes('document') || mimeType.includes('word'))
    return <DescriptionIcon />;
  return <InsertDriveFileIcon />;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function FileList({
  files,
  folders,
  selectedItems,
  sortBy,
  sortOrder,
  onSort,
  onItemClick,
  onItemSelect,
  onSelectAll,
  onDownload,
  onShare,
  onRename,
  onDelete,
  onMove,
  onCopy,
}: FileListProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [menuItem, setMenuItem] = useState<FileItem | Folder | null>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, item: FileItem | Folder) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuItem(item);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuItem(null);
  };

  const items = [...folders, ...files];
  const allSelected = items.length > 0 && selectedItems.length === items.length;
  const someSelected = selectedItems.length > 0 && selectedItems.length < items.length;

  if (items.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 8,
        }}
      >
        <FolderIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          This folder is empty
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Upload files or create a new folder
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={onSelectAll}
                />
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'name'}
                  direction={sortBy === 'name' ? sortOrder : 'asc'}
                  onClick={() => onSort('name')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'size'}
                  direction={sortBy === 'size' ? sortOrder : 'asc'}
                  onClick={() => onSort('size')}
                >
                  Size
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortBy === 'updatedAt'}
                  direction={sortBy === 'updatedAt' ? sortOrder : 'asc'}
                  onClick={() => onSort('updatedAt')}
                >
                  Modified
                </TableSortLabel>
              </TableCell>
              <TableCell width={48} />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                hover
                selected={selectedItems.includes(item.id)}
                sx={{ cursor: 'pointer' }}
                onClick={() => onItemClick(item)}
              >
                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedItems.includes(item.id)}
                    onChange={() => onItemSelect(item.id)}
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {getFileIcon(item.mimeType, item.isFolder)}
                    <Typography variant="body2" noWrap>
                      {item.name}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  {item.isFolder
                    ? `${(item as Folder).childCount} items`
                    : formatFileSize(item.size)}
                </TableCell>
                <TableCell>{formatDate(item.updatedAt)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, item)}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {menuItem && !menuItem.isFolder && (
          <MenuItem
            onClick={() => {
              onDownload(menuItem as FileItem);
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <DownloadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Download</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            if (menuItem) onShare(menuItem);
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <ShareIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Share</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuItem) onRename(menuItem);
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <DriveFileRenameOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuItem) onMove([menuItem.id]);
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <DriveFileMoveIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Move</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuItem) onCopy([menuItem.id]);
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuItem) onDelete([menuItem.id]);
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
