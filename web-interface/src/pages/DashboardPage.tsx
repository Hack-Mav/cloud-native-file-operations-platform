import {
  Box,
  Typography,
  Paper,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Card,
  CardContent,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import StorageIcon from '@mui/icons-material/Storage';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useAuthStore } from '@/store/authStore';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function DashboardPage() {
  const { user } = useAuthStore();

  // Mock data - in real app, fetch from API
  const stats = {
    totalFiles: 142,
    totalFolders: 23,
    storageUsed: 2.3 * 1024 * 1024 * 1024, // 2.3 GB
    storageLimit: 10 * 1024 * 1024 * 1024, // 10 GB
    uploadsToday: 5,
    downloadsToday: 12,
  };

  const recentFiles = [
    { name: 'Project Report.pdf', type: 'file', date: '2 hours ago' },
    { name: 'Marketing Assets', type: 'folder', date: '5 hours ago' },
    { name: 'Budget 2024.xlsx', type: 'file', date: 'Yesterday' },
    { name: 'Team Photos', type: 'folder', date: 'Yesterday' },
    { name: 'Presentation.pptx', type: 'file', date: '2 days ago' },
  ];

  const storagePercentage = (stats.storageUsed / stats.storageLimit) * 100;

  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>
        Welcome back, {user?.name?.split(' ')[0] || 'User'}
      </Typography>

      <Grid container spacing={3}>
        {/* Stats cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <InsertDriveFileIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Total Files
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.totalFiles}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <FolderIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Total Folders
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.totalFolders}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CloudUploadIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Uploads Today
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.uploadsToday}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CloudDownloadIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">
                  Downloads Today
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={600}>
                {stats.downloadsToday}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Storage usage */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <StorageIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="h6">Storage Usage</Typography>
            </Box>
            <Box sx={{ mb: 1 }}>
              <LinearProgress
                variant="determinate"
                value={storagePercentage}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {formatBytes(stats.storageUsed)} used
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatBytes(stats.storageLimit)} total
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Recent activity */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <TrendingUpIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="h6">Recent Activity</Typography>
            </Box>
            <List dense>
              {recentFiles.map((item, index) => (
                <ListItem key={index}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {item.type === 'folder' ? (
                      <FolderIcon color="primary" />
                    ) : (
                      <InsertDriveFileIcon />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.name}
                    secondary={item.date}
                    primaryTypographyProps={{ noWrap: true }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
