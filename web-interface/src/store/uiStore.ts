import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from '@/theme';

interface UiState {
  themeMode: ThemeMode;
  sidebarOpen: boolean;
  sidebarWidth: number;

  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeMode: 'light',
      sidebarOpen: true,
      sidebarWidth: 280,

      setThemeMode: (mode) => set({ themeMode: mode }),

      toggleTheme: () =>
        set((state) => ({
          themeMode: state.themeMode === 'light' ? 'dark' : 'light',
        })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarWidth: (width) => set({ sidebarWidth: width }),
    }),
    {
      name: 'ui-settings',
      partialize: (state) => ({
        themeMode: state.themeMode,
        sidebarWidth: state.sidebarWidth,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
