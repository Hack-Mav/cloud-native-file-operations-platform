import { Breadcrumbs as MuiBreadcrumbs, Link, Typography } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import HomeIcon from '@mui/icons-material/Home';

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate: (folderId: string | null) => void;
}

export default function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  return (
    <MuiBreadcrumbs
      separator={<NavigateNextIcon fontSize="small" />}
      sx={{ mb: 2 }}
    >
      <Link
        component="button"
        variant="body1"
        onClick={() => onNavigate(null)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline',
          },
        }}
        color="inherit"
      >
        <HomeIcon fontSize="small" />
        Home
      </Link>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return isLast ? (
          <Typography key={item.id || 'root'} color="text.primary" variant="body1">
            {item.name}
          </Typography>
        ) : (
          <Link
            key={item.id || 'root'}
            component="button"
            variant="body1"
            onClick={() => onNavigate(item.id)}
            sx={{
              cursor: 'pointer',
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
            color="inherit"
          >
            {item.name}
          </Link>
        );
      })}
    </MuiBreadcrumbs>
  );
}
