import { Outlet } from 'react-router-dom';
import { Box, Container, Paper, Typography } from '@mui/material';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';

export default function AuthLayout() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mb: 4,
          }}
        >
          <CloudQueueIcon
            sx={{ fontSize: 64, color: 'primary.main', mb: 2 }}
          />
          <Typography variant="h4" component="h1" fontWeight={600}>
            File Operations Platform
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>
            Secure cloud-native file management
          </Typography>
        </Box>
        <Paper
          elevation={0}
          sx={{
            p: 4,
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Outlet />
        </Paper>
      </Container>
    </Box>
  );
}
