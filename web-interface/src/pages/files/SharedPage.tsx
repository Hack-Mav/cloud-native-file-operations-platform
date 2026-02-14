import { Box, Typography, Paper } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';

export default function SharedPage() {
  return (
    <Box>
      <Typography variant="h5" fontWeight={600} mb={3}>
        Shared with Me
      </Typography>

      <Paper
        sx={{
          p: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <ShareIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          No shared files yet
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Files shared with you will appear here
        </Typography>
      </Paper>
    </Box>
  );
}
