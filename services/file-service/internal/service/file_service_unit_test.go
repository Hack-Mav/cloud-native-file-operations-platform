package service

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"file-service/internal/config"
	"file-service/internal/models"
)

// TestFileService_HasReadAccess tests the access control logic
func TestFileService_HasReadAccess(t *testing.T) {
	service := &FileService{}

	tests := []struct {
		name     string
		file     *models.File
		userID   string
		expected bool
	}{
		{
			name: "Owner has read access",
			file: &models.File{
				UploadedBy: "user123",
				Access:     models.AccessInfo{Visibility: "private"},
			},
			userID:   "user123",
			expected: true,
		},
		{
			name: "Public file allows read access",
			file: &models.File{
				UploadedBy: "user123",
				Access:     models.AccessInfo{Visibility: "public"},
			},
			userID:   "user456",
			expected: true,
		},
		{
			name: "Shared user has read access",
			file: &models.File{
				UploadedBy: "user123",
				Access: models.AccessInfo{
					Visibility: "private",
					SharedWith: []string{"user456", "user789"},
				},
			},
			userID:   "user456",
			expected: true,
		},
		{
			name: "Non-shared user denied access",
			file: &models.File{
				UploadedBy: "user123",
				Access: models.AccessInfo{
					Visibility: "private",
					SharedWith: []string{"user789"},
				},
			},
			userID:   "user456",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.hasReadAccess(tt.file, tt.userID)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestFileService_HasWriteAccess tests the write access control logic
func TestFileService_HasWriteAccess(t *testing.T) {
	service := &FileService{}

	tests := []struct {
		name     string
		file     *models.File
		userID   string
		expected bool
	}{
		{
			name: "Owner has write access",
			file: &models.File{
				UploadedBy: "user123",
			},
			userID:   "user123",
			expected: true,
		},
		{
			name: "Non-owner denied write access",
			file: &models.File{
				UploadedBy: "user123",
			},
			userID:   "user456",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.hasWriteAccess(tt.file, tt.userID)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestFileService_GenerateStorageKey tests the storage key generation logic
func TestFileService_GenerateStorageKey(t *testing.T) {
	service := &FileService{}

	tests := []struct {
		name     string
		fileID   string
		filename string
		expected string
	}{
		{
			name:     "Text file",
			fileID:   "abc123def456",
			filename: "document.txt",
			expected: "files/ab/abc123def456.txt",
		},
		{
			name:     "Image file",
			fileID:   "xyz789uvw012",
			filename: "photo.jpg",
			expected: "files/xy/xyz789uvw012.jpg",
		},
		{
			name:     "File without extension",
			fileID:   "123456789012",
			filename: "README",
			expected: "files/12/123456789012",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.generateStorageKey(tt.fileID, tt.filename)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestFileService_IsAllowedContentType tests content type validation
func TestFileService_IsAllowedContentType(t *testing.T) {
	service := &FileService{
		config: &config.Config{
			AllowedTypes: []string{"text/plain", "image/jpeg", "application/pdf"},
		},
	}

	tests := []struct {
		name        string
		contentType string
		expected    bool
	}{
		{
			name:        "Allowed text file",
			contentType: "text/plain",
			expected:    true,
		},
		{
			name:        "Allowed image file",
			contentType: "image/jpeg",
			expected:    true,
		},
		{
			name:        "Allowed PDF file",
			contentType: "application/pdf",
			expected:    true,
		},
		{
			name:        "Disallowed executable",
			contentType: "application/x-executable",
			expected:    false,
		},
		{
			name:        "Empty content type",
			contentType: "",
			expected:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := service.isAllowedContentType(tt.contentType)
			assert.Equal(t, tt.expected, result)
		})
	}
}