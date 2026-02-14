import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useParams } from 'react-router-dom';
import { vi } from 'vitest';
import FilesPage from './FilesPage';
import { useFileStore } from '@/store/fileStore';
import { filesApi } from '@/api/files';

// Mock the dependencies
vi.mock('@/store/fileStore');
vi.mock('@/api/files');
vi.mock('@/api/client');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
  };
});

// Mock child components
vi.mock('@/components/files/Breadcrumbs', () => ({
  default: ({ items, onNavigate }: any) => (
    <div data-testid="breadcrumbs">
      {items.map((item: any) => (
        <button key={item.id} onClick={() => onNavigate(item.id)}>
          {item.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/files/FileGrid', () => ({
  default: ({ files, folders, onItemClick, onItemSelect, onDownload, onShare, onRename, onDelete }: any) => (
    <div data-testid="file-grid">
      {files.map((file: any) => (
        <div key={file.id} data-testid={`file-${file.id}`}>
          <span>{file.name}</span>
          <button onClick={() => onItemClick(file)}>Open</button>
          <button onClick={() => onItemSelect(file.id)}>Select</button>
          <button onClick={() => onDownload(file)}>Download</button>
          <button onClick={() => onShare(file)}>Share</button>
          <button onClick={() => onRename(file)}>Rename</button>
          <button onClick={() => onDelete([file.id])}>Delete</button>
        </div>
      ))}
      {folders.map((folder: any) => (
        <div key={folder.id} data-testid={`folder-${folder.id}`}>
          <span>{folder.name}</span>
          <button onClick={() => onItemClick(folder)}>Open</button>
          <button onClick={() => onItemSelect(folder.id)}>Select</button>
          <button onClick={() => onDelete([folder.id])}>Delete</button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/files/FileList', () => ({
  default: ({ files, folders, onItemClick, onItemSelect, onDownload, onShare, onRename, onDelete }: any) => (
    <div data-testid="file-list">
      {files.map((file: any) => (
        <div key={file.id} data-testid={`file-${file.id}`}>
          <span>{file.name}</span>
          <button onClick={() => onItemClick(file)}>Open</button>
          <button onClick={() => onItemSelect(file.id)}>Select</button>
          <button onClick={() => onDownload(file)}>Download</button>
          <button onClick={() => onShare(file)}>Share</button>
          <button onClick={() => onRename(file)}>Rename</button>
          <button onClick={() => onDelete([file.id])}>Delete</button>
        </div>
      ))}
      {folders.map((folder: any) => (
        <div key={folder.id} data-testid={`folder-${folder.id}`}>
          <span>{folder.name}</span>
          <button onClick={() => onItemClick(folder)}>Open</button>
          <button onClick={() => onItemSelect(folder.id)}>Select</button>
          <button onClick={() => onDelete([folder.id])}>Delete</button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/files/FileUploader', () => ({
  default: ({ folderId, onUploadComplete }: any) => (
    <div data-testid="file-uploader">
      <span>Uploader for folder: {folderId || 'root'}</span>
      <button onClick={onUploadComplete}>Complete Upload</button>
    </div>
  ),
}));

vi.mock('@/components/files/FilePreview', () => ({
  default: ({ file, open, onClose }: any) => (
    open && (
      <div data-testid="file-preview">
        <span>Preview: {file?.name}</span>
        <button onClick={onClose}>Close</button>
      </div>
    )
  ),
}));

vi.mock('@/components/files/ShareDialog', () => ({
  default: ({ item, open, onClose }: any) => (
    open && (
      <div data-testid="share-dialog">
        <span>Share: {item?.name}</span>
        <button onClick={onClose}>Close</button>
      </div>
    )
  ),
}));

vi.mock('@/components/files/CreateFolderDialog', () => ({
  default: ({ open, onClose, onCreated }: any) => (
    open && (
      <div data-testid="create-folder-dialog">
        <span>Create Folder</span>
        <button onClick={onClose}>Close</button>
        <button onClick={onCreated}>Create</button>
      </div>
    )
  ),
}));

vi.mock('@/components/files/RenameDialog', () => ({
  default: ({ item, open, onClose, onRenamed }: any) => (
    open && (
      <div data-testid="rename-dialog">
        <span>Rename: {item?.name}</span>
        <button onClick={onClose}>Close</button>
        <button onClick={onRenamed}>Rename</button>
      </div>
    )
  ),
}));

vi.mock('@/components/files/DeleteConfirmDialog', () => ({
  default: ({ itemIds, open, onClose, onDeleted }: any) => (
    open && (
      <div data-testid="delete-dialog">
        <span>Delete items: {itemIds.join(', ')}</span>
        <button onClick={onClose}>Close</button>
        <button onClick={onDeleted}>Delete</button>
      </div>
    )
  ),
}));

const mockUseFileStore = vi.mocked(useFileStore);
const mockFilesApi = vi.mocked(filesApi);
const mockUseParams = vi.mocked(useParams);

describe('FilesPage', () => {
  const mockSetFiles = vi.fn();
  const mockSetFolders = vi.fn();
  const mockSetCurrentPath = vi.fn();
  const mockToggleItemSelection = vi.fn();
  const mockSelectAllItems = vi.fn();
  const mockClearSelection = vi.fn();
  const mockSetLoading = vi.fn();
  const mockSetViewMode = vi.fn();
  const mockSetSort = vi.fn();

  const mockFiles = [
    {
      id: 'file1',
      name: 'document.pdf',
      path: '/document.pdf',
      size: 1024,
      mimeType: 'application/pdf',
      isFolder: false,
      parentId: null,
      ownerId: 'user1',
      tenantId: 'tenant1',
      tags: [],
      metadata: {},
      version: 1,
      checksum: 'abc123',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  const mockFolders = [
    {
      id: 'folder1',
      name: 'Documents',
      path: '/Documents',
      size: 0,
      mimeType: 'folder',
      isFolder: true,
      parentId: null,
      ownerId: 'user1',
      tenantId: 'tenant1',
      tags: [],
      metadata: {},
      version: 1,
      checksum: '',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      childCount: 5,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseParams.mockReturnValue({});
    
    mockUseFileStore.mockReturnValue({
      files: mockFiles,
      folders: mockFolders,
      selectedItems: [],
      viewMode: 'grid',
      sortBy: 'name',
      sortOrder: 'asc',
      isLoading: false,
      setFiles: mockSetFiles,
      setFolders: mockSetFolders,
      setCurrentPath: mockSetCurrentPath,
      toggleItemSelection: mockToggleItemSelection,
      selectAllItems: mockSelectAllItems,
      clearSelection: mockClearSelection,
      setLoading: mockSetLoading,
      setViewMode: mockSetViewMode,
      setSort: mockSetSort,
    } as any);

    mockFilesApi.listFiles.mockResolvedValue({
      success: true,
      data: {
        items: [...mockFolders, ...mockFiles],
        pagination: {
          page: 1,
          pageSize: 50,
          total: 2,
          totalPages: 1,
        },
      },
    });

    mockFilesApi.getDownloadUrl.mockResolvedValue({
      success: true,
      data: { url: 'http://example.com/download' },
    });
  });

  it('renders files page correctly', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    expect(screen.getByText('My Files')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new folder/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    });
  });

  it('loads files on mount', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFilesApi.listFiles).toHaveBeenCalledWith({
        folderId: null,
        sortBy: 'name',
        sortOrder: 'asc',
      });
    });

    expect(mockSetFiles).toHaveBeenCalledWith(mockFiles);
    expect(mockSetFolders).toHaveBeenCalledWith(mockFolders);
  });

  it('handles folder navigation', async () => {
    mockUseParams.mockReturnValue({ folderId: 'folder1' });

    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFilesApi.listFiles).toHaveBeenCalledWith({
        folderId: 'folder1',
        sortBy: 'name',
        sortOrder: 'asc',
      });
    });
  });

  it('toggles file uploader', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    const uploadButton = screen.getByRole('button', { name: /upload/i });
    fireEvent.click(uploadButton);

    expect(screen.getByTestId('file-uploader')).toBeInTheDocument();
  });

  it('shows create folder dialog', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    const createFolderButton = screen.getByRole('button', { name: /new folder/i });
    fireEvent.click(createFolderButton);

    expect(screen.getByTestId('create-folder-dialog')).toBeInTheDocument();
  });

  it('handles file item click for preview', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    });

    const fileOpenButton = screen.getByText('Open');
    fireEvent.click(fileOpenButton);

    expect(screen.getByTestId('file-preview')).toBeInTheDocument();
    expect(screen.getByText('Preview: document.pdf')).toBeInTheDocument();
  });

  it('handles folder item click for navigation', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    });

    const folderOpenButton = screen.getAllByText('Open')[1]; // Second Open button is for folder
    fireEvent.click(folderOpenButton);

    expect(mockClearSelection).toHaveBeenCalled();
  });

  it('handles file selection', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    });

    const selectButton = screen.getByText('Select');
    fireEvent.click(selectButton);

    expect(mockToggleItemSelection).toHaveBeenCalledWith('file1');
  });

  it('shows selected items count', async () => {
    const mockStoreWithSelection = {
      files: mockFiles,
      folders: mockFolders,
      selectedItems: ['file1', 'file2'],
      viewMode: 'grid',
      sortBy: 'name',
      sortOrder: 'asc',
      isLoading: false,
      setFiles: mockSetFiles,
      setFolders: mockSetFolders,
      setCurrentPath: mockSetCurrentPath,
      toggleItemSelection: mockToggleItemSelection,
      selectAllItems: mockSelectAllItems,
      clearSelection: mockClearSelection,
      setLoading: mockSetLoading,
      setViewMode: mockSetViewMode,
      setSort: mockSetSort,
    };

    mockUseFileStore.mockReturnValue(mockStoreWithSelection as any);

    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('handles file download', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    });

    const downloadButton = screen.getByText('Download');
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(mockFilesApi.getDownloadUrl).toHaveBeenCalledWith('file1');
    });
  });

  it('handles file sharing', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    });

    const shareButton = screen.getByText('Share');
    fireEvent.click(shareButton);

    expect(screen.getByTestId('share-dialog')).toBeInTheDocument();
    expect(screen.getByText('Share: document.pdf')).toBeInTheDocument();
  });

  it('handles file rename', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    });

    const renameButton = screen.getByText('Rename');
    fireEvent.click(renameButton);

    expect(screen.getByTestId('rename-dialog')).toBeInTheDocument();
    expect(screen.getByText('Rename: document.pdf')).toBeInTheDocument();
  });

  it('handles file deletion', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('file-grid')).toBeInTheDocument();
    });

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    expect(screen.getByTestId('delete-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete items: file1')).toBeInTheDocument();
  });

  it('toggles view mode', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    const listButton = screen.getByRole('button', { name: /list view/i });
    fireEvent.click(listButton);

    expect(mockSetViewMode).toHaveBeenCalledWith('list');

    await waitFor(() => {
      expect(screen.getByTestId('file-list')).toBeInTheDocument();
    });
  });

  it('handles refresh', async () => {
    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockFilesApi.listFiles).toHaveBeenCalledTimes(2); // Once on mount, once on refresh
    });
  });

  it('handles API error', async () => {
    mockFilesApi.listFiles.mockResolvedValue({
      success: false,
      error: { code: 'ERROR', message: 'Failed to load files' },
    });

    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load files')).toBeInTheDocument();
    });
  });

  it('handles network error', async () => {
    mockFilesApi.listFiles.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
