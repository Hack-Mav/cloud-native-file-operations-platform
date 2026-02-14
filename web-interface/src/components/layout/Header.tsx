import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  Divider,
  ListItemIcon,
  Chip,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsIcon from '@mui/icons-material/Notifications';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SettingsIcon from '@mui/icons-material/Settings';
import SecurityIcon from '@mui/icons-material/Security';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useNotificationStore } from '@/store/notificationStore';
import NotificationPanel from '@/components/notifications/NotificationPanel';

interface HeaderProps {
  onMenuClick: () => void;
  drawerWidth: number;
  sidebarOpen: boolean;
}

export default function Header({ onMenuClick, drawerWidth, sidebarOpen }: HeaderProps) {
  const navigate = useNavigate();
  const { user, logout, isDemoMode } = useAuthStore();
  const { themeMode, toggleTheme } = useUiStore();
  const { unreadCount } = useNotificationStore();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null);

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchorEl(event.currentTarget);
  };

  const handleNotificationClose = () => {
    setNotificationAnchorEl(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
    navigate('/login');
  };

  const handleNavigate = (path: string) => {
    handleMenuClose();
    navigate(path);
  };

  return (
    <AppBar
      position="fixed"
      sx={{
        width: sidebarOpen ? `calc(100% - ${drawerWidth}px)` : '100%',
        ml: sidebarOpen ? `${drawerWidth}px` : 0,
        transition: (theme) =>
          theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
      }}
    >
      <Toolbar>
        <IconButton
          color="inherit"
          edge="start"
          onClick={onMenuClick}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>

        <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          File Operations
          {isDemoMode && (
            <Chip
              label="DEMO"
              size="small"
              color="warning"
              sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}
            />
          )}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} mode`}>
            <IconButton color="inherit" onClick={toggleTheme}>
              {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Notifications">
            <IconButton color="inherit" onClick={handleNotificationClick}>
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          <Tooltip title="Account">
            <IconButton onClick={handleProfileMenuOpen} sx={{ ml: 1 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          PaperProps={{
            sx: { width: 220, mt: 1 },
          }}
        >
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle1" fontWeight={500}>
              {user?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.email}
            </Typography>
            {isDemoMode && (
              <Chip
                label="Demo Mode"
                size="small"
                color="warning"
                sx={{ mt: 1, fontSize: '0.7rem' }}
              />
            )}
          </Box>
          <Divider sx={{ my: 1 }} />
          <MenuItem onClick={() => handleNavigate('/settings/profile')}>
            <ListItemIcon>
              <AccountCircleIcon fontSize="small" />
            </ListItemIcon>
            Profile
          </MenuItem>
          <MenuItem onClick={() => handleNavigate('/settings/security')}>
            <ListItemIcon>
              <SecurityIcon fontSize="small" />
            </ListItemIcon>
            Security
          </MenuItem>
          <MenuItem onClick={() => handleNavigate('/settings/notifications')}>
            <ListItemIcon>
              <SettingsIcon fontSize="small" />
            </ListItemIcon>
            Settings
          </MenuItem>
          <Divider sx={{ my: 1 }} />
          <MenuItem onClick={handleLogout}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            Logout
          </MenuItem>
        </Menu>

        <NotificationPanel
          anchorEl={notificationAnchorEl}
          onClose={handleNotificationClose}
        />
      </Toolbar>
    </AppBar>
  );
}
