import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import ShareIcon from '@mui/icons-material/Share';
import DeleteIcon from '@mui/icons-material/Delete';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SettingsIcon from '@mui/icons-material/Settings';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  variant: 'permanent' | 'persistent' | 'temporary';
  width: number;
}

const mainMenuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'My Files', icon: <FolderIcon />, path: '/files' },
  { text: 'Shared', icon: <ShareIcon />, path: '/shared' },
  { text: 'Trash', icon: <DeleteIcon />, path: '/trash' },
];

const settingsMenuItems = [
  { text: 'Settings', icon: <SettingsIcon />, path: '/settings/profile' },
];

export default function Sidebar({ open, onClose, variant, width }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavigation = (path: string) => {
    navigate(path);
    if (variant === 'temporary') {
      onClose();
    }
  };

  const isSelected = (path: string) => {
    if (path === '/files') {
      return location.pathname === '/files' || location.pathname.startsWith('/files/');
    }
    return location.pathname.startsWith(path);
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 2,
          minHeight: 64,
        }}
      >
        <CloudQueueIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography variant="h6" fontWeight={600} color="primary">
          FileOps
        </Typography>
      </Box>

      <Divider />

      {/* Upload button */}
      <Box sx={{ px: 2, py: 2 }}>
        <ListItemButton
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 2,
            '&:hover': {
              bgcolor: 'primary.dark',
            },
          }}
          onClick={() => handleNavigation('/files')}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
            <CloudUploadIcon />
          </ListItemIcon>
          <ListItemText primary="Upload Files" />
        </ListItemButton>
      </Box>

      {/* Main menu */}
      <List sx={{ px: 1 }}>
        {mainMenuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={isSelected(item.path)}
              onClick={() => handleNavigation(item.path)}
              sx={{
                borderRadius: 1,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'inherit',
                  },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Box sx={{ flexGrow: 1 }} />

      <Divider />

      {/* Settings menu */}
      <List sx={{ px: 1, pb: 2 }}>
        {settingsMenuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={isSelected(item.path)}
              onClick={() => handleNavigation(item.path)}
              sx={{
                borderRadius: 1,
                '&.Mui-selected': {
                  bgcolor: 'action.selected',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Drawer
      variant={variant}
      open={open}
      onClose={onClose}
      sx={{
        width: width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: width,
          boxSizing: 'border-box',
          borderRight: 1,
          borderColor: 'divider',
          position: 'relative',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
