import { describe, it, expect, beforeEach } from 'vitest';
import { useFileStore } from './fileStore';
import type { FileItem, Folder, FileUploadProgress } from '@/types';

describe('fileStore', () => {
  const mockFile: FileItem = {
    id: 'file-1',
    name: 'test.txt',
    path: '/test.txt',
    size: 1024,
    mimeType: 'text/plain',
    isFolder: false,
    parentId: null,
    ownerId: 'user-1',
    tenantId: 'tenant-1',
    tags: [],
    metadata: {},
    version: 1,
    checksum: 'abc123',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockFolder: Folder = {
    id: 'folder-1',
    name: 'Documents',
    path: '/Documents',
    size: 0,
    mimeType: 'application/x-directory',
    isFolder: true,
    parentId: null,
    ownerId: 'user-1',
    tenantId: 'tenant-1',
    tags: [],
    metadata: {},
    version: 1,
    checksum: '',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    childCount: 5,
  };

  beforeEach(() => {
    useFileStore.setState({
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
    });
  });

  describe('setFiles', () => {
    it('should set files', () => {
      const { setFiles } = useFileStore.getState();

      setFiles([mockFile]);

      expect(useFileStore.getState().files).toEqual([mockFile]);
    });

    it('should filter out folders', () => {
      const { setFiles } = useFileStore.getState();

      setFiles([mockFile, mockFolder as unknown as FileItem]);

      expect(useFileStore.getState().files).toEqual([mockFile]);
    });
  });

  describe('setFolders', () => {
    it('should set folders', () => {
      const { setFolders } = useFileStore.getState();

      setFolders([mockFolder]);

      expect(useFileStore.getState().folders).toEqual([mockFolder]);
    });
  });

  describe('addFile', () => {
    it('should add file to files list', () => {
      const { addFile } = useFileStore.getState();

      addFile(mockFile);

      expect(useFileStore.getState().files).toContainEqual(mockFile);
    });

    it('should add folder to folders list', () => {
      const { addFile } = useFileStore.getState();

      addFile(mockFolder);

      expect(useFileStore.getState().folders).toContainEqual(mockFolder);
    });
  });

  describe('updateFile', () => {
    it('should update file', () => {
      useFileStore.setState({ files: [mockFile] });

      const { updateFile } = useFileStore.getState();
      updateFile('file-1', { name: 'updated.txt' });

      const file = useFileStore.getState().files[0];
      expect(file.name).toBe('updated.txt');
    });
  });

  describe('removeFile', () => {
    it('should remove file', () => {
      useFileStore.setState({ files: [mockFile] });

      const { removeFile } = useFileStore.getState();
      removeFile('file-1');

      expect(useFileStore.getState().files).toHaveLength(0);
    });

    it('should remove from selected items', () => {
      useFileStore.setState({
        files: [mockFile],
        selectedItems: ['file-1'],
      });

      const { removeFile } = useFileStore.getState();
      removeFile('file-1');

      expect(useFileStore.getState().selectedItems).not.toContain('file-1');
    });
  });

  describe('selection', () => {
    beforeEach(() => {
      useFileStore.setState({ files: [mockFile], folders: [mockFolder] });
    });

    it('should select item', () => {
      const { selectItem } = useFileStore.getState();

      selectItem('file-1');

      expect(useFileStore.getState().selectedItems).toContain('file-1');
    });

    it('should deselect item', () => {
      useFileStore.setState({ selectedItems: ['file-1'] });

      const { deselectItem } = useFileStore.getState();
      deselectItem('file-1');

      expect(useFileStore.getState().selectedItems).not.toContain('file-1');
    });

    it('should toggle selection', () => {
      const { toggleItemSelection } = useFileStore.getState();

      toggleItemSelection('file-1');
      expect(useFileStore.getState().selectedItems).toContain('file-1');

      toggleItemSelection('file-1');
      expect(useFileStore.getState().selectedItems).not.toContain('file-1');
    });

    it('should select all items', () => {
      const { selectAllItems } = useFileStore.getState();

      selectAllItems();

      const selected = useFileStore.getState().selectedItems;
      expect(selected).toContain('file-1');
      expect(selected).toContain('folder-1');
    });

    it('should clear selection', () => {
      useFileStore.setState({ selectedItems: ['file-1', 'folder-1'] });

      const { clearSelection } = useFileStore.getState();
      clearSelection();

      expect(useFileStore.getState().selectedItems).toHaveLength(0);
    });
  });

  describe('upload queue', () => {
    const mockUpload: FileUploadProgress = {
      fileId: 'upload-1',
      fileName: 'test.txt',
      progress: 0,
      status: 'pending',
    };

    it('should add to upload queue', () => {
      const { addToUploadQueue } = useFileStore.getState();

      addToUploadQueue(mockUpload);

      expect(useFileStore.getState().uploadQueue).toContainEqual(mockUpload);
    });

    it('should update upload progress', () => {
      useFileStore.setState({ uploadQueue: [mockUpload] });

      const { updateUploadProgress } = useFileStore.getState();
      updateUploadProgress('upload-1', { progress: 50, status: 'uploading' });

      const upload = useFileStore.getState().uploadQueue[0];
      expect(upload.progress).toBe(50);
      expect(upload.status).toBe('uploading');
    });

    it('should remove from upload queue', () => {
      useFileStore.setState({ uploadQueue: [mockUpload] });

      const { removeFromUploadQueue } = useFileStore.getState();
      removeFromUploadQueue('upload-1');

      expect(useFileStore.getState().uploadQueue).toHaveLength(0);
    });

    it('should clear upload queue', () => {
      useFileStore.setState({ uploadQueue: [mockUpload] });

      const { clearUploadQueue } = useFileStore.getState();
      clearUploadQueue();

      expect(useFileStore.getState().uploadQueue).toHaveLength(0);
    });
  });

  describe('view mode and sorting', () => {
    it('should set view mode', () => {
      const { setViewMode } = useFileStore.getState();

      setViewMode('list');

      expect(useFileStore.getState().viewMode).toBe('list');
    });

    it('should set sort', () => {
      const { setSort } = useFileStore.getState();

      setSort('size', 'desc');

      const state = useFileStore.getState();
      expect(state.sortBy).toBe('size');
      expect(state.sortOrder).toBe('desc');
    });
  });
});
