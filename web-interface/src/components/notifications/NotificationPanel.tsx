import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Typography,
  Button,
  Divider,
  ListItemIcon,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import ShareIcon from '@mui/icons-material/Share';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloseIcon from '@mui/icons-material/Close';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { useNotificationStore } from '@/store/notificationStore';
import type { NotificationType } from '@/types';

interface NotificationPanelProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'file_uploaded':
      return <CloudUploadIcon color="success" />;
    case 'file_processed':
      return <CheckCircleIcon color="success" />;
    case 'file_shared':
      return <ShareIcon color="primary" />;
    case 'processing_failed':
      return <ErrorIcon color="error" />;
    case 'system_alert':
      return <InfoIcon color="warning" />;
    default:
      return <InfoIcon />;
  }
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

export default function NotificationPanel({
  anchorEl,
  onClose,
}: NotificationPanelProps) {
  const { notifications, markAsRead, markAllAsRead, removeNotification } =
    useNotificationStore();

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  const handleNotificationClick = (notificationId: string) => {
    markAsRead(notificationId);
  };

  const handleRemove = (
    e: React.MouseEvent,
    notificationId: string
  ) => {
    e.stopPropagation();
    removeNotification(notificationId);
  };

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'right',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      PaperProps={{
        sx: { width: 380, maxHeight: 480 },
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="h6">Notifications</Typography>
        {notifications.length > 0 && (
          <Button
            size="small"
            startIcon={<DoneAllIcon />}
            onClick={handleMarkAllRead}
          >
            Mark all read
          </Button>
        )}
      </Box>
      <Divider />

      {notifications.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No notifications</Typography>
        </Box>
      ) : (
        <List sx={{ p: 0, maxHeight: 380, overflow: 'auto' }}>
          {notifications.map((notification) => (
            <ListItem
              key={notification.id}
              onClick={() => handleNotificationClick(notification.id)}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  onClick={(e) => handleRemove(e, notification.id)}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
              sx={{
                cursor: 'pointer',
                bgcolor: notification.read ? 'transparent' : 'action.hover',
                '&:hover': {
                  bgcolor: 'action.selected',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {getNotificationIcon(notification.type)}
              </ListItemIcon>
              <ListItemText
                primary={notification.title}
                secondary={
                  <Box component="span">
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.secondary"
                      sx={{ display: 'block' }}
                    >
                      {notification.message}
                    </Typography>
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.disabled"
                    >
                      {formatTime(notification.createdAt)}
                    </Typography>
                  </Box>
                }
                primaryTypographyProps={{
                  fontWeight: notification.read ? 400 : 500,
                  noWrap: true,
                }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Popover>
  );
}
