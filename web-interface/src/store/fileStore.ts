import { create } from 'zustand';
import type { FileItem, FileUploadProgress, Folder } from '@/types';

interface FileState {
  currentPath: string;
  currentFolderId: string | null;
  files: FileItem[];
  folders: Folder[];
  selectedItems: string[];
  uploadQueue: FileUploadProgress[];
  isLoading: boolean;
  viewMode: 'grid' | 'list';
  sortBy: 'name' | 'size' | 'updatedAt' | 'type';
  sortOrder: 'asc' | 'desc';

  // Actions
  setCurrentPath: (path: string, folderId: string | null) => void;
  setFiles: (files: FileItem[]) => void;
  setFolders: (folders: Folder[]) => void;
  addFile: (file: FileItem) => void;
  updateFile: (fileId: string, updates: Partial<FileItem>) => void;
  removeFile: (fileId: string) => void;
  selectItem: (itemId: string) => void;
  deselectItem: (itemId: string) => void;
  toggleItemSelection: (itemId: string) => void;
  selectAllItems: () => void;
  clearSelection: () => void;
  addToUploadQueue: (upload: FileUploadProgress) => void;
  updateUploadProgress: (fileId: string, updates: Partial<FileUploadProgress>) => void;
  removeFromUploadQueue: (fileId: string) => void;
  clearUploadQueue: () => void;
  setLoading: (loading: boolean) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setSort: (sortBy: FileState['sortBy'], sortOrder: FileState['sortOrder']) => void;
}

export const useFileStore = create<FileState>((set) => ({
  currentPath: '/',
  currentFolderId: null,
  files: [],
  folders: [],
  selectedItems: [],
  uploadQueue: [],
  isLoading: false,
  viewMode: 'grid',
  sortBy: 'name',
  sortOrder: 'asc',

  setCurrentPath: (path, folderId) => set({
    currentPath: path,
    currentFolderId: folderId,
    selectedItems: [],
  }),

  setFiles: (files) => set({ files: files.filter(f => !f.isFolder) }),

  setFolders: (folders) => set({ folders }),

  addFile: (file) => set((state) => ({
    files: file.isFolder
      ? state.files
      : [...state.files, file],
    folders: file.isFolder
      ? [...state.folders, file as Folder]
      : state.folders,
  })),

  updateFile: (fileId, updates) => set((state) => ({
    files: state.files.map(f =>
      f.id === fileId ? { ...f, ...updates } : f
    ),
    folders: state.folders.map(f =>
      f.id === fileId ? { ...f, ...updates } as Folder : f
    ),
  })),

  removeFile: (fileId) => set((state) => ({
    files: state.files.filter(f => f.id !== fileId),
    folders: state.folders.filter(f => f.id !== fileId),
    selectedItems: state.selectedItems.filter(id => id !== fileId),
  })),

  selectItem: (itemId) => set((state) => ({
    selectedItems: state.selectedItems.includes(itemId)
      ? state.selectedItems
      : [...state.selectedItems, itemId],
  })),

  deselectItem: (itemId) => set((state) => ({
    selectedItems: state.selectedItems.filter(id => id !== itemId),
  })),

  toggleItemSelection: (itemId) => set((state) => ({
    selectedItems: state.selectedItems.includes(itemId)
      ? state.selectedItems.filter(id => id !== itemId)
      : [...state.selectedItems, itemId],
  })),

  selectAllItems: () => set((state) => ({
    selectedItems: [
      ...state.files.map(f => f.id),
      ...state.folders.map(f => f.id),
    ],
  })),

  clearSelection: () => set({ selectedItems: [] }),

  addToUploadQueue: (upload) => set((state) => ({
    uploadQueue: [...state.uploadQueue, upload],
  })),

  updateUploadProgress: (fileId, updates) => set((state) => ({
    uploadQueue: state.uploadQueue.map(u =>
      u.fileId === fileId ? { ...u, ...updates } : u
    ),
  })),

  removeFromUploadQueue: (fileId) => set((state) => ({
    uploadQueue: state.uploadQueue.filter(u => u.fileId !== fileId),
  })),

  clearUploadQueue: () => set({ uploadQueue: [] }),

  setLoading: (loading) => set({ isLoading: loading }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setSort: (sortBy, sortOrder) => set({ sortBy, sortOrder }),
}));
