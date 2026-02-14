import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useUiStore } from '@/store/uiStore';

const DRAWER_WIDTH = 280;

export default function AppLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setSidebarOpen(!sidebarOpen);
    }
  };

  const handleMobileClose = () => {
    setMobileOpen(false);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Header
        onMenuClick={handleDrawerToggle}
        drawerWidth={DRAWER_WIDTH}
        sidebarOpen={!isMobile && sidebarOpen}
      />
      <Sidebar
        open={isMobile ? mobileOpen : sidebarOpen}
        onClose={handleMobileClose}
        variant={isMobile ? 'temporary' : 'persistent'}
        width={DRAWER_WIDTH}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          pt: 3,
          pr: 3,
          pb: 3,
          pl: 3,
          mt: 8,
          bgcolor: 'background.default',
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
