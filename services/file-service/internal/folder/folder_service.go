package folder

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"file-service/internal/models"
	"file-service/internal/repository"
	"file-service/internal/storage"
)

// FolderService handles folder operations and hierarchical file organization
type FolderService struct {
	fileRepo        *repository.FileRepository
	storageProvider storage.StorageProvider
}

// NewFolderService creates a new folder service
func NewFolderService(fileRepo *repository.FileRepository, storageProvider storage.StorageProvider) *FolderService {
	return &FolderService{
		fileRepo:        fileRepo,
		storageProvider: storageProvider,
	}
}

// ListFolderContents lists files and subfolders in a given folder path
func (fs *FolderService) ListFolderContents(ctx context.Context, req *models.FileListRequest, userID string) (*models.FileListResponse, error) {
	// Normalize folder path
	folderPath := fs.normalizePath(req.FolderPath)
	
	// Set defaults
	if req.Limit <= 0 {
		req.Limit = 50
	}
	if req.Limit > 200 {
		req.Limit = 200
	}

	// List files from storage with the folder prefix
	storageFiles, err := fs.storageProvider.ListFiles(ctx, folderPath, "/")
	if err != nil {
		return nil, fmt.Errorf("failed to list storage files: %w", err)
	}

	// Separate files and folders
	var files []*models.File
	var folders []*models.FolderInfo
	
	folderMap := make(map[string]*models.FolderInfo)

	for _, storageFile := range storageFiles {
		relativePath := strings.TrimPrefix(storageFile.Key, folderPath)
		
		// Skip if it's the folder itself
		if relativePath == "" {
			continue
		}

		// Check if it's a direct child or nested
		pathParts := strings.Split(strings.Trim(relativePath, "/"), "/")
		
		if len(pathParts) == 1 {
			// It's a direct file
			file, err := fs.convertStorageFileToFile(ctx, storageFile, userID)
			if err == nil && fs.hasReadAccess(file, userID) {
				files = append(files, file)
			}
		} else {
			// It's in a subfolder
			subfolderName := pathParts[0]
			subfolderPath := filepath.Join(folderPath, subfolderName)
			
			if _, exists := folderMap[subfolderName]; !exists {
				folderMap[subfolderName] = &models.FolderInfo{
					Path:       subfolderPath,
					Name:       subfolderName,
					ParentPath: folderPath,
					CreatedAt:  time.Now(), // TODO: Get actual creation time
					FileCount:  0,
					FolderCount: 0,
				}
			}
			folderMap[subfolderName].FileCount++
		}
	}

	// Convert folder map to slice
	for _, folder := range folderMap {
		folders = append(folders, folder)
	}

	// Apply sorting
	fs.sortFiles(files, req.SortBy, req.SortOrder)
	fs.sortFolders(folders, req.SortBy, req.SortOrder)

	// Apply pagination
	totalFiles := len(files)
	totalFolders := len(folders)
	
	start := req.Offset
	end := req.Offset + req.Limit
	
	if start > totalFiles+totalFolders {
		files = []*models.File{}
		folders = []*models.FolderInfo{}
	} else {
		// Combine and paginate files and folders
		if start < totalFolders {
			folderEnd := end
			if folderEnd > totalFolders {
				folderEnd = totalFolders
			}
			folders = folders[start:folderEnd]
			
			if end > totalFolders {
				fileStart := 0
				fileEnd := end - totalFolders
				if fileEnd > totalFiles {
					fileEnd = totalFiles
				}
				files = files[fileStart:fileEnd]
			} else {
				files = []*models.File{}
			}
		} else {
			folders = []*models.FolderInfo{}
			fileStart := start - totalFolders
			fileEnd := end - totalFolders
			if fileEnd > totalFiles {
				fileEnd = totalFiles
			}
			if fileStart < totalFiles {
				files = files[fileStart:fileEnd]
			} else {
				files = []*models.File{}
			}
		}
	}

	return &models.FileListResponse{
		Files:       files,
		Folders:     folders,
		CurrentPath: folderPath,
		ParentPath:  fs.getParentPath(folderPath),
		Total:       totalFiles + totalFolders,
		Limit:       req.Limit,
		Offset:      req.Offset,
		HasMore:     req.Offset+req.Limit < totalFiles+totalFolders,
	}, nil
}

// CreateFolder creates a new folder (virtual folder in object storage)
func (fs *FolderService) CreateFolder(ctx context.Context, folderPath string, userID string) error {
	// Normalize path
	folderPath = fs.normalizePath(folderPath)
	
	// Create a placeholder object to represent the folder
	// In object storage, folders are virtual and created by having objects with the folder prefix
	placeholderKey := folderPath + ".folder"
	
	// TODO: Create a placeholder file or use metadata to track folder creation
	// For now, we'll just validate the path
	
	if folderPath == "" || folderPath == "/" {
		return fmt.Errorf("invalid folder path")
	}

	return nil
}

// DeleteFolder deletes a folder and all its contents
func (fs *FolderService) DeleteFolder(ctx context.Context, folderPath string, userID string) error {
	// Normalize path
	folderPath = fs.normalizePath(folderPath)
	
	// List all files in the folder
	storageFiles, err := fs.storageProvider.ListFiles(ctx, folderPath, "")
	if err != nil {
		return fmt.Errorf("failed to list folder contents: %w", err)
	}

	// Delete all files in the folder
	for _, storageFile := range storageFiles {
		// Check permissions for each file
		file, err := fs.convertStorageFileToFile(ctx, storageFile, userID)
		if err != nil {
			continue
		}
		
		if !fs.hasWriteAccess(file, userID) {
			return fmt.Errorf("access denied for file: %s", storageFile.Key)
		}

		// Delete from storage
		err = fs.storageProvider.DeleteFile(ctx, storageFile.Key)
		if err != nil {
			return fmt.Errorf("failed to delete file %s: %w", storageFile.Key, err)
		}

		// Delete from database
		err = fs.fileRepo.Delete(ctx, file.ID)
		if err != nil {
			// Log error but continue with other files
			continue
		}
	}

	return nil
}

// MoveFile moves a file to a different folder
func (fs *FolderService) MoveFile(ctx context.Context, fileID string, newFolderPath string, userID string) error {
	// Get the file
	file, err := fs.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return fmt.Errorf("failed to get file: %w", err)
	}

	// Check permissions
	if !fs.hasWriteAccess(file, userID) {
		return fmt.Errorf("access denied")
	}

	// Generate new storage key
	newFolderPath = fs.normalizePath(newFolderPath)
	filename := filepath.Base(file.Storage.Key)
	newStorageKey := filepath.Join(newFolderPath, filename)

	// Copy file to new location
	err = fs.storageProvider.CopyFile(ctx, file.Storage.Key, newStorageKey)
	if err != nil {
		return fmt.Errorf("failed to copy file: %w", err)
	}

	// Delete from old location
	err = fs.storageProvider.DeleteFile(ctx, file.Storage.Key)
	if err != nil {
		// Cleanup new location if old deletion fails
		fs.storageProvider.DeleteFile(ctx, newStorageKey)
		return fmt.Errorf("failed to delete old file: %w", err)
	}

	// Update file record
	file.Storage.Key = newStorageKey
	err = fs.fileRepo.Update(ctx, file)
	if err != nil {
		return fmt.Errorf("failed to update file record: %w", err)
	}

	return nil
}

// Helper methods

func (fs *FolderService) normalizePath(path string) string {
	if path == "" {
		return ""
	}
	
	// Clean the path
	path = filepath.Clean(path)
	
	// Ensure it starts with / but doesn't end with / (unless it's root)
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	
	if path != "/" && strings.HasSuffix(path, "/") {
		path = strings.TrimSuffix(path, "/")
	}
	
	// Remove leading slash for storage (object storage doesn't use leading slash)
	if strings.HasPrefix(path, "/") {
		path = strings.TrimPrefix(path, "/")
	}
	
	// Add trailing slash for folder operations
	if path != "" && !strings.HasSuffix(path, "/") {
		path = path + "/"
	}
	
	return path
}

func (fs *FolderService) getParentPath(path string) string {
	if path == "" || path == "/" {
		return ""
	}
	
	path = strings.TrimSuffix(path, "/")
	parent := filepath.Dir(path)
	
	if parent == "." {
		return ""
	}
	
	return parent + "/"
}

func (fs *FolderService) convertStorageFileToFile(ctx context.Context, storageFile *storage.FileInfo, userID string) (*models.File, error) {
	// This is a simplified conversion - in a real implementation,
	// you'd need to match storage files with database records
	return &models.File{
		ID:          storageFile.Key, // Simplified - use proper ID mapping
		Name:        filepath.Base(storageFile.Key),
		Size:        storageFile.Size,
		ContentType: storageFile.ContentType,
		UploadedAt:  storageFile.Created,
		UploadedBy:  userID, // Simplified - get from actual record
		Status:      "uploaded",
		Storage: models.StorageInfo{
			Key: storageFile.Key,
		},
	}, nil
}

func (fs *FolderService) hasReadAccess(file *models.File, userID string) bool {
	// Simplified access control
	return file.UploadedBy == userID || file.Access.Visibility == "public"
}

func (fs *FolderService) hasWriteAccess(file *models.File, userID string) bool {
	// Simplified access control
	return file.UploadedBy == userID
}

func (fs *FolderService) sortFiles(files []*models.File, sortBy, sortOrder string) {
	// TODO: Implement sorting logic
	// For now, files are returned in the order they were retrieved
}

func (fs *FolderService) sortFolders(folders []*models.FolderInfo, sortBy, sortOrder string) {
	// TODO: Implement sorting logic
	// For now, folders are returned in the order they were retrieved
}