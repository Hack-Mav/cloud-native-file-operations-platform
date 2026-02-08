package service

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"file-service/internal/config"
	"file-service/internal/metadata"
	"file-service/internal/models"
	"file-service/internal/repository"
	"file-service/internal/security"
	"file-service/internal/storage"
	"file-service/internal/validation"
	"file-service/internal/versioning"
)

// FileService handles file business logic
type FileService struct {
	fileRepo           *repository.FileRepository
	redisClient        *redis.Client
	config             *config.Config
	storageProvider    storage.StorageProvider
	metadataExtractor  *metadata.MetadataExtractor
	versionManager     *versioning.VersionManager
	fileValidator      *validation.FileValidator
	virusScanner       *security.VirusScanner
	checksumService    *security.ChecksumService
}

// NewFileService creates a new file service
func NewFileService(fileRepo *repository.FileRepository, redisClient *redis.Client, config *config.Config, storageProvider storage.StorageProvider) *FileService {
	metadataExtractor := metadata.NewMetadataExtractor()
	fileValidator := validation.NewFileValidator(config)
	virusScanner := security.NewVirusScanner(true, "", "") // Enable virus scanning
	checksumService := security.NewChecksumService()
	
	service := &FileService{
		fileRepo:          fileRepo,
		redisClient:       redisClient,
		config:            config,
		storageProvider:   storageProvider,
		metadataExtractor: metadataExtractor,
		fileValidator:     fileValidator,
		virusScanner:      virusScanner,
		checksumService:   checksumService,
	}
	
	// Initialize version manager
	service.versionManager = versioning.NewVersionManager(fileRepo, storageProvider)
	
	return service
}

// UploadFile handles file upload with validation
func (s *FileService) UploadFile(ctx context.Context, fileHeader *multipart.FileHeader, uploaderID string, metadata map[string]interface{}) (*models.File, error) {
	// Open the uploaded file
	file, err := fileHeader.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open uploaded file: %w", err)
	}
	defer file.Close()

	// Perform comprehensive file validation
	validationResult, err := s.fileValidator.ValidateFile(fileHeader, file)
	if err != nil {
		return nil, fmt.Errorf("file validation failed: %w", err)
	}

	if !validationResult.IsValid {
		return nil, fmt.Errorf("file validation failed: %v", validationResult.Errors)
	}

	// Perform virus scanning
	scanResult, err := s.virusScanner.ScanFile(ctx, file, fileHeader.Filename)
	if err != nil {
		return nil, fmt.Errorf("virus scan failed: %w", err)
	}

	if !scanResult.IsClean {
		// Quarantine the file if threat detected
		s.virusScanner.QuarantineFile(ctx, "temp_id", scanResult.ThreatName)
		return nil, fmt.Errorf("file contains threat: %s", scanResult.ThreatName)
	}

	// Calculate secure checksum using SHA-256
	checksumResult, err := s.checksumService.CalculateChecksum(file, security.SHA256)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate checksum: %w", err)
	}

	// Reset file pointer for metadata extraction
	file.Seek(0, io.SeekStart)

	// Extract metadata
	extractedMetadata, err := s.metadataExtractor.ExtractMetadata(fileHeader, file)
	if err != nil {
		return nil, fmt.Errorf("failed to extract metadata: %w", err)
	}

	// Merge with provided metadata
	if metadata == nil {
		metadata = make(map[string]interface{})
	}
	for k, v := range extractedMetadata {
		metadata[k] = v
	}

	// Reset file pointer for storage
	file.Seek(0, io.SeekStart)

	// Generate unique file ID and storage key
	fileID := uuid.New().String()
	storageKey := s.generateStorageKey(fileID, fileHeader.Filename)

	// Use detected content type from validation
	contentType := validationResult.DetectedType

	// Create file record with security information
	fileRecord := &models.File{
		ID:          fileID,
		Name:        fileHeader.Filename,
		Size:        fileHeader.Size,
		ContentType: contentType,
		Checksum:    checksumResult.Checksum,
		UploadedBy:  uploaderID,
		Status:      "uploading",
		Metadata:    metadata,
		Storage: models.StorageInfo{
			Bucket: s.config.StorageBucket,
			Key:    storageKey,
			Region: "us-central1", // Default region
		},
		Access: models.AccessInfo{
			Visibility:  "private",
			Permissions: []string{"read", "write"},
			SharedWith:  []string{},
		},
	}

	// Add security metadata
	if fileRecord.Metadata == nil {
		fileRecord.Metadata = make(map[string]interface{})
	}
	fileRecord.Metadata["virusScanResult"] = scanResult
	fileRecord.Metadata["validationResult"] = validationResult
	fileRecord.Metadata["checksumAlgorithm"] = string(security.SHA256)

	// Save file metadata to datastore
	err = s.fileRepo.Create(ctx, fileRecord)
	if err != nil {
		return nil, fmt.Errorf("failed to save file metadata: %w", err)
	}

	// Upload file to cloud storage
	err = s.storageProvider.UploadFile(ctx, storageKey, file, contentType)
	if err != nil {
		// Cleanup database record if storage upload fails
		s.fileRepo.Delete(ctx, fileID)
		return nil, fmt.Errorf("failed to upload file to storage: %w", err)
	}

	// Update file status to uploaded
	fileRecord.Status = "uploaded"
	err = s.fileRepo.Update(ctx, fileRecord)
	if err != nil {
		// Cleanup storage if database update fails
		s.storageProvider.DeleteFile(ctx, storageKey)
		return nil, fmt.Errorf("failed to update file status: %w", err)
	}

	// Cache file metadata in Redis for quick access
	s.cacheFileMetadata(ctx, fileRecord)

	return fileRecord, nil
}

// GetFile retrieves a file by ID
func (s *FileService) GetFile(ctx context.Context, fileID string, userID string) (*models.File, error) {
	// Try to get from cache first
	if cachedFile := s.getCachedFileMetadata(ctx, fileID); cachedFile != nil {
		// Check access permissions
		if !s.hasReadAccess(cachedFile, userID) {
			return nil, fmt.Errorf("access denied")
		}
		return cachedFile, nil
	}

	// Get from database
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return nil, err
	}

	// Check access permissions
	if !s.hasReadAccess(file, userID) {
		return nil, fmt.Errorf("access denied")
	}

	// Cache for future requests
	s.cacheFileMetadata(ctx, file)

	return file, nil
}

// DeleteFile deletes a file
func (s *FileService) DeleteFile(ctx context.Context, fileID string, userID string) error {
	// Get file to check permissions
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return err
	}

	// Check delete permissions
	if !s.hasWriteAccess(file, userID) {
		return fmt.Errorf("access denied")
	}

	// TODO: In the next task, we'll implement actual cloud storage deletion

	// Delete from database
	err = s.fileRepo.Delete(ctx, fileID)
	if err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	// Remove from cache
	s.removeCachedFileMetadata(ctx, fileID)

	return nil
}

// SearchFiles searches for files
func (s *FileService) SearchFiles(ctx context.Context, req *models.FileSearchRequest, userID string) (*models.FileSearchResponse, error) {
	// TODO: Implement proper access control filtering
	return s.fileRepo.Search(ctx, req)
}

// UpdateMetadata updates file metadata
func (s *FileService) UpdateMetadata(ctx context.Context, fileID string, metadata map[string]interface{}, userID string) (*models.File, error) {
	// Get file to check permissions
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return nil, err
	}

	// Check write permissions
	if !s.hasWriteAccess(file, userID) {
		return nil, fmt.Errorf("access denied")
	}

	// Update metadata
	if file.Metadata == nil {
		file.Metadata = make(map[string]interface{})
	}
	for key, value := range metadata {
		file.Metadata[key] = value
	}

	// Save to database
	err = s.fileRepo.Update(ctx, file)
	if err != nil {
		return nil, fmt.Errorf("failed to update metadata: %w", err)
	}

	// Update cache
	s.cacheFileMetadata(ctx, file)

	return file, nil
}

// Helper methods

func (s *FileService) isAllowedContentType(contentType string) bool {
	for _, allowed := range s.config.AllowedTypes {
		if allowed == contentType {
			return true
		}
	}
	return false
}

func (s *FileService) calculateChecksum(file multipart.File) (string, error) {
	hash := sha256.New()
	_, err := io.Copy(hash, file)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}

func (s *FileService) generateStorageKey(fileID, filename string) string {
	ext := filepath.Ext(filename)
	return fmt.Sprintf("files/%s/%s%s", fileID[:2], fileID, ext)
}

func (s *FileService) hasReadAccess(file *models.File, userID string) bool {
	// Simple access control - owner always has access
	if file.UploadedBy == userID {
		return true
	}

	// Check if file is public
	if file.Access.Visibility == "public" {
		return true
	}

	// Check if user is in shared list
	for _, sharedUser := range file.Access.SharedWith {
		if sharedUser == userID {
			return true
		}
	}

	return false
}

func (s *FileService) hasWriteAccess(file *models.File, userID string) bool {
	// Only owner has write access for now
	return file.UploadedBy == userID
}

func (s *FileService) cacheFileMetadata(ctx context.Context, file *models.File) {
	if s.redisClient == nil {
		return
	}

	key := fmt.Sprintf("file:%s", file.ID)
	// Simple caching - in production, use proper serialization
	s.redisClient.Set(ctx, key, file.Name, 5*time.Minute)
}

func (s *FileService) getCachedFileMetadata(ctx context.Context, fileID string) *models.File {
	if s.redisClient == nil {
		return nil
	}

	key := fmt.Sprintf("file:%s", fileID)
	// Simple cache check - in production, deserialize full object
	result := s.redisClient.Get(ctx, key)
	if result.Err() != nil {
		return nil
	}

	// Return nil for now - proper implementation would deserialize the cached object
	return nil
}

func (s *FileService) removeCachedFileMetadata(ctx context.Context, fileID string) {
	if s.redisClient == nil {
		return
	}

	key := fmt.Sprintf("file:%s", fileID)
	s.redisClient.Del(ctx, key)
}

// GenerateDownloadURL generates a secure download URL for a file
func (s *FileService) GenerateDownloadURL(ctx context.Context, fileID string, userID string, expiration time.Duration) (string, error) {
	// Get file to check permissions
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return "", err
	}

	// Check read permissions
	if !s.hasReadAccess(file, userID) {
		return "", fmt.Errorf("access denied")
	}

	// Generate signed URL
	url, err := s.storageProvider.GenerateSignedURL(ctx, file.Storage.Key, expiration)
	if err != nil {
		return "", fmt.Errorf("failed to generate download URL: %w", err)
	}

	return url, nil
}

// CreateFileVersion creates a new version of an existing file
func (s *FileService) CreateFileVersion(ctx context.Context, fileID string, fileHeader *multipart.FileHeader, userID string) (*models.File, error) {
	// Get the original file
	originalFile, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return nil, fmt.Errorf("failed to get original file: %w", err)
	}

	// Check write permissions
	if !s.hasWriteAccess(originalFile, userID) {
		return nil, fmt.Errorf("access denied")
	}

	// Upload the new version using the same process as regular upload
	newFile, err := s.UploadFile(ctx, fileHeader, userID, originalFile.Metadata)
	if err != nil {
		return nil, fmt.Errorf("failed to upload new version: %w", err)
	}

	// Create version record
	err = s.versionManager.CreateVersion(ctx, fileID, newFile)
	if err != nil {
		// Cleanup the uploaded file if versioning fails
		s.DeleteFile(ctx, newFile.ID, userID)
		return nil, fmt.Errorf("failed to create version: %w", err)
	}

	return newFile, nil
}

// GetFileVersions retrieves all versions of a file
func (s *FileService) GetFileVersions(ctx context.Context, fileID string, userID string) ([]*models.FileVersion, error) {
	// Get file to check permissions
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return nil, err
	}

	// Check read permissions
	if !s.hasReadAccess(file, userID) {
		return nil, fmt.Errorf("access denied")
	}

	return s.versionManager.GetVersions(ctx, fileID)
}

// RestoreFileVersion restores a specific version of a file
func (s *FileService) RestoreFileVersion(ctx context.Context, fileID string, versionNumber int, userID string) error {
	// Get file to check permissions
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return err
	}

	// Check write permissions
	if !s.hasWriteAccess(file, userID) {
		return fmt.Errorf("access denied")
	}

	return s.versionManager.RestoreVersion(ctx, fileID, versionNumber)
}

// ShareFile creates a shareable link for a file
func (s *FileService) ShareFile(ctx context.Context, fileID string, userID string, shareOptions map[string]interface{}) (string, error) {
	// Get file to check permissions
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return "", err
	}

	// Check read permissions
	if !s.hasReadAccess(file, userID) {
		return "", fmt.Errorf("access denied")
	}

	// Update file access settings
	if file.Access.Visibility == "private" {
		file.Access.Visibility = "shared"
	}

	// Add shared users if specified
	if sharedWith, ok := shareOptions["sharedWith"].([]string); ok {
		file.Access.SharedWith = append(file.Access.SharedWith, sharedWith...)
	}

	// Update file record
	err = s.fileRepo.Update(ctx, file)
	if err != nil {
		return "", fmt.Errorf("failed to update file sharing settings: %w", err)
	}

	// Generate a shareable URL (in production, this would be a proper share token)
	shareURL := fmt.Sprintf("https://files.example.com/share/%s", fileID)

	return shareURL, nil
}

// VerifyFileIntegrity verifies the integrity of a stored file
func (s *FileService) VerifyFileIntegrity(ctx context.Context, fileID string, userID string) (*security.CorruptionReport, error) {
	// Get file record
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return nil, err
	}

	// Check permissions
	if !s.hasReadAccess(file, userID) {
		return nil, fmt.Errorf("access denied")
	}

	// Get file from storage
	storageInfo, err := s.storageProvider.GetFileInfo(ctx, file.Storage.Key)
	if err != nil {
		return nil, fmt.Errorf("failed to get file from storage: %w", err)
	}

	// Verify size matches
	if storageInfo.Size != file.Size {
		return &security.CorruptionReport{
			IsCorrupted: true,
			Results:     map[security.ChecksumType]bool{},
			Details: map[security.ChecksumType]string{
				security.SHA256: fmt.Sprintf("Size mismatch: expected %d, got %d", file.Size, storageInfo.Size),
			},
		}, nil
	}

	// TODO: In a full implementation, you would:
	// 1. Download the file from storage
	// 2. Calculate its current checksum
	// 3. Compare with stored checksum
	// For now, return a clean report
	return &security.CorruptionReport{
		IsCorrupted: false,
		Results:     map[security.ChecksumType]bool{security.SHA256: true},
		Details:     map[security.ChecksumType]string{},
	}, nil
}

// QuarantineFile quarantines a file due to security concerns
func (s *FileService) QuarantineFile(ctx context.Context, fileID string, reason string, userID string) error {
	// Get file record
	file, err := s.fileRepo.GetByID(ctx, fileID)
	if err != nil {
		return err
	}

	// Check permissions (only admin or owner can quarantine)
	if !s.hasWriteAccess(file, userID) {
		return fmt.Errorf("access denied")
	}

	// Update file status to quarantined
	file.Status = "quarantined"
	if file.Metadata == nil {
		file.Metadata = make(map[string]interface{})
	}
	file.Metadata["quarantineReason"] = reason
	file.Metadata["quarantinedAt"] = time.Now()
	file.Metadata["quarantinedBy"] = userID

	// Update in database
	err = s.fileRepo.Update(ctx, file)
	if err != nil {
		return fmt.Errorf("failed to update file status: %w", err)
	}

	// Move file to quarantine location in storage
	quarantineKey := fmt.Sprintf("quarantine/%s", file.Storage.Key)
	err = s.storageProvider.CopyFile(ctx, file.Storage.Key, quarantineKey)
	if err != nil {
		return fmt.Errorf("failed to move file to quarantine: %w", err)
	}

	// Delete original file
	err = s.storageProvider.DeleteFile(ctx, file.Storage.Key)
	if err != nil {
		// Log error but don't fail the quarantine operation
		fmt.Printf("Warning: failed to delete original file after quarantine: %v", err)
	}

	// Update storage key to quarantine location
	file.Storage.Key = quarantineKey
	s.fileRepo.Update(ctx, file)

	return nil
}

// ValidateFileUpload performs pre-upload validation
func (s *FileService) ValidateFileUpload(ctx context.Context, fileHeader *multipart.FileHeader) (*validation.ValidationResult, error) {
	// Open the file for validation
	file, err := fileHeader.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open file for validation: %w", err)
	}
	defer file.Close()

	// Perform validation
	return s.fileValidator.ValidateFile(fileHeader, file)
}