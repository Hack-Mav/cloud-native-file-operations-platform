import { Box, Typography, Paper, Button } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

export default function TrashPage() {
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
        }}
      >
        <Typography variant="h5" fontWeight={600}>
          Trash
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteForeverIcon />}
          disabled
        >
          Empty Trash
        </Button>
      </Box>

      <Paper
        sx={{
          p: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <DeleteIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" color="text.secondary">
          Trash is empty
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Deleted files will appear here for 30 days
        </Typography>
      </Paper>
    </Box>
  );
}
