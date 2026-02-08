package versioning

import (
	"context"
	"fmt"
	"time"

	"file-service/internal/models"
	"file-service/internal/repository"
	"file-service/internal/storage"
)

// VersionManager handles file versioning operations
type VersionManager struct {
	fileRepo        *repository.FileRepository
	storageProvider storage.StorageProvider
}

// NewVersionManager creates a new version manager
func NewVersionManager(fileRepo *repository.FileRepository, storageProvider storage.StorageProvider) *VersionManager {
	return &VersionManager{
		fileRepo:        fileRepo,
		storageProvider: storageProvider,
	}
}

// CreateVersion creates a new version of an existing file
func (vm *VersionManager) CreateVersion(ctx context.Context, originalFileID string, newFile *models.File) error {
	// Get the original file
	originalFile, err := vm.fileRepo.GetByID(ctx, originalFileID)
	if err != nil {
		return fmt.Errorf("failed to get original file: %w", err)
	}

	// Generate version key
	versionKey := vm.generateVersionKey(originalFile.Storage.Key, time.Now())

	// Copy the original file to create a version
	err = vm.storageProvider.CopyFile(ctx, originalFile.Storage.Key, versionKey)
	if err != nil {
		return fmt.Errorf("failed to create version in storage: %w", err)
	}

	// Create version record in database
	version := &models.FileVersion{
		OriginalFileID: originalFileID,
		VersionNumber:  vm.getNextVersionNumber(ctx, originalFileID),
		StorageKey:     versionKey,
		CreatedAt:      time.Now(),
		Size:           originalFile.Size,
		Checksum:       originalFile.Checksum,
		ContentType:    originalFile.ContentType,
	}

	err = vm.createVersionRecord(ctx, version)
	if err != nil {
		// Cleanup storage if database operation fails
		vm.storageProvider.DeleteFile(ctx, versionKey)
		return fmt.Errorf("failed to create version record: %w", err)
	}

	// Update the original file with new content
	originalFile.Size = newFile.Size
	originalFile.Checksum = newFile.Checksum
	originalFile.ContentType = newFile.ContentType
	originalFile.Storage.Key = newFile.Storage.Key

	err = vm.fileRepo.Update(ctx, originalFile)
	if err != nil {
		return fmt.Errorf("failed to update original file: %w", err)
	}

	return nil
}

// GetVersions retrieves all versions of a file
func (vm *VersionManager) GetVersions(ctx context.Context, fileID string) ([]*models.FileVersion, error) {
	return vm.getVersionsByFileID(ctx, fileID)
}

// RestoreVersion restores a specific version of a file
func (vm *VersionManager) RestoreVersion(ctx context.Context, fileID string, versionNumber int) error {
	// Get the version to restore
	version, err := vm.getVersionByNumber(ctx, fileID, versionNumber)
	if err != nil {
		return fmt.Errorf("failed to get version: %w", err)
	}

	// Get the current file
	currentFile, err := vm.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return fmt.Errorf("failed to get current file: %w", err)
	}

	// Create a new version from the current file before restoring
	err = vm.CreateVersion(ctx, fileID, currentFile)
	if err != nil {
		return fmt.Errorf("failed to create backup version: %w", err)
	}

	// Copy the version content to the current file location
	err = vm.storageProvider.CopyFile(ctx, version.StorageKey, currentFile.Storage.Key)
	if err != nil {
		return fmt.Errorf("failed to restore version in storage: %w", err)
	}

	// Update the current file metadata
	currentFile.Size = version.Size
	currentFile.Checksum = version.Checksum
	currentFile.ContentType = version.ContentType

	err = vm.fileRepo.Update(ctx, currentFile)
	if err != nil {
		return fmt.Errorf("failed to update file after restore: %w", err)
	}

	return nil
}

// DeleteVersion deletes a specific version
func (vm *VersionManager) DeleteVersion(ctx context.Context, fileID string, versionNumber int) error {
	version, err := vm.getVersionByNumber(ctx, fileID, versionNumber)
	if err != nil {
		return fmt.Errorf("failed to get version: %w", err)
	}

	// Delete from storage
	err = vm.storageProvider.DeleteFile(ctx, version.StorageKey)
	if err != nil {
		return fmt.Errorf("failed to delete version from storage: %w", err)
	}

	// Delete version record
	err = vm.deleteVersionRecord(ctx, version.ID)
	if err != nil {
		return fmt.Errorf("failed to delete version record: %w", err)
	}

	return nil
}

// Helper methods

func (vm *VersionManager) generateVersionKey(originalKey string, timestamp time.Time) string {
	return fmt.Sprintf("versions/%s_%d", originalKey, timestamp.Unix())
}

func (vm *VersionManager) getNextVersionNumber(ctx context.Context, fileID string) int {
	versions, err := vm.getVersionsByFileID(ctx, fileID)
	if err != nil || len(versions) == 0 {
		return 1
	}

	maxVersion := 0
	for _, version := range versions {
		if version.VersionNumber > maxVersion {
			maxVersion = version.VersionNumber
		}
	}

	return maxVersion + 1
}

// These methods would interact with a versions table in the database
// For now, they're placeholder implementations

func (vm *VersionManager) createVersionRecord(ctx context.Context, version *models.FileVersion) error {
	// TODO: Implement version record creation in database
	// This would typically use a separate FileVersionRepository
	return nil
}

func (vm *VersionManager) getVersionsByFileID(ctx context.Context, fileID string) ([]*models.FileVersion, error) {
	// TODO: Implement version retrieval from database
	return []*models.FileVersion{}, nil
}

func (vm *VersionManager) getVersionByNumber(ctx context.Context, fileID string, versionNumber int) (*models.FileVersion, error) {
	// TODO: Implement version retrieval by number
	return nil, fmt.Errorf("version not found")
}

func (vm *VersionManager) deleteVersionRecord(ctx context.Context, versionID string) error {
	// TODO: Implement version record deletion
	return nil
}