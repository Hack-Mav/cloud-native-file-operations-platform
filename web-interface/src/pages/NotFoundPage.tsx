import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

export default function NotFoundPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        p: 4,
      }}
    >
      <ErrorOutlineIcon
        sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }}
      />
      <Typography variant="h3" fontWeight={600} mb={1}>
        404
      </Typography>
      <Typography variant="h5" color="text.secondary" mb={3}>
        Page not found
      </Typography>
      <Typography variant="body1" color="text.disabled" mb={4}>
        The page you're looking for doesn't exist or has been moved.
      </Typography>
      <Button
        component={RouterLink}
        to="/files"
        variant="contained"
        size="large"
      >
        Go to Files
      </Button>
    </Box>
  );
}
