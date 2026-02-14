import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Checkbox,
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import DownloadIcon from '@mui/icons-material/Download';
import ShareIcon from '@mui/icons-material/Share';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import { useState } from 'react';
import type { FileItem, Folder } from '@/types';

interface FileGridProps {
  files: FileItem[];
  folders: Folder[];
  selectedItems: string[];
  onItemClick: (item: FileItem | Folder) => void;
  onItemSelect: (itemId: string) => void;
  onDownload: (file: FileItem) => void;
  onShare: (item: FileItem | Folder) => void;
  onRename: (item: FileItem | Folder) => void;
  onDelete: (items: string[]) => void;
  onMove: (items: string[]) => void;
  onCopy: (items: string[]) => void;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return <ImageIcon sx={{ fontSize: 48 }} />;
  if (mimeType.startsWith('video/')) return <VideoFileIcon sx={{ fontSize: 48 }} />;
  if (mimeType.startsWith('audio/')) return <AudioFileIcon sx={{ fontSize: 48 }} />;
  if (mimeType === 'application/pdf') return <PictureAsPdfIcon sx={{ fontSize: 48 }} />;
  if (mimeType.includes('document') || mimeType.includes('word'))
    return <DescriptionIcon sx={{ fontSize: 48 }} />;
  return <InsertDriveFileIcon sx={{ fontSize: 48 }} />;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};


interface FileItemCardProps {
  item: FileItem | Folder;
  isSelected: boolean;
  onItemClick: () => void;
  onItemSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

function FileItemCard({
  item,
  isSelected,
  onItemClick,
  onItemSelect,
  onContextMenu,
}: FileItemCardProps) {
  return (
    <Card
      sx={{
        position: 'relative',
        border: isSelected ? 2 : 1,
        borderColor: isSelected ? 'primary.main' : 'divider',
        '&:hover': {
          borderColor: 'primary.light',
        },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 4,
          left: 4,
          zIndex: 1,
        }}
      >
        <Checkbox
          checked={isSelected}
          onChange={onItemSelect}
          onClick={(e) => e.stopPropagation()}
          size="small"
        />
      </Box>
      <CardActionArea
        onClick={onItemClick}
        onContextMenu={onContextMenu}
      >
        <CardContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pt: 5,
            pb: 2,
          }}
        >
          <Box sx={{ color: item.isFolder ? 'primary.main' : 'text.secondary' }}>
            {item.isFolder ? (
              <FolderIcon sx={{ fontSize: 48 }} />
            ) : (
              getFileIcon(item.mimeType)
            )}
          </Box>
          <Typography
            variant="body2"
            noWrap
            sx={{ mt: 1, width: '100%', textAlign: 'center' }}
          >
            {item.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {item.isFolder
              ? `${(item as Folder).childCount} items`
              : formatFileSize(item.size)}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function FileGrid({
  files,
  folders,
  selectedItems,
  onItemClick,
  onItemSelect,
  onDownload,
  onShare,
  onRename,
  onDelete,
  onMove,
  onCopy,
}: FileGridProps) {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    item: FileItem | Folder;
  } | null>(null);

  const handleContextMenu = (event: React.MouseEvent, item: FileItem | Folder) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      item,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const items = [...folders, ...files];

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
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 2,
        }}
      >
        {items.map((item) => (
          <FileItemCard
            key={item.id}
            item={item}
            isSelected={selectedItems.includes(item.id)}
            onItemClick={() => onItemClick(item)}
            onItemSelect={() => onItemSelect(item.id)}
            onContextMenu={(e) => handleContextMenu(e, item)}
          />
        ))}
      </Box>

      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {contextMenu && !contextMenu.item.isFolder && (
          <MenuItem
            onClick={() => {
              onDownload(contextMenu.item as FileItem);
              handleCloseContextMenu();
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
            onShare(contextMenu!.item);
            handleCloseContextMenu();
          }}
        >
          <ListItemIcon>
            <ShareIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Share</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onRename(contextMenu!.item);
            handleCloseContextMenu();
          }}
        >
          <ListItemIcon>
            <DriveFileRenameOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onMove([contextMenu!.item.id]);
            handleCloseContextMenu();
          }}
        >
          <ListItemIcon>
            <DriveFileMoveIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Move</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onCopy([contextMenu!.item.id]);
            handleCloseContextMenu();
          }}
        >
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            onDelete([contextMenu!.item.id]);
            handleCloseContextMenu();
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
