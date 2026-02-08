package models

import (
	"time"

	"cloud.google.com/go/datastore"
)

// File represents a file entity in the system
type File struct {
	ID          string                 `json:"id" datastore:"-"`
	Key         *datastore.Key         `json:"-" datastore:"__key__"`
	Name        string                 `json:"name" datastore:"name"`
	Size        int64                  `json:"size" datastore:"size"`
	ContentType string                 `json:"contentType" datastore:"content_type"`
	Checksum    string                 `json:"checksum" datastore:"checksum"`
	UploadedAt  time.Time              `json:"uploadedAt" datastore:"uploaded_at"`
	UploadedBy  string                 `json:"uploadedBy" datastore:"uploaded_by"`
	Status      string                 `json:"status" datastore:"status"`
	Metadata    map[string]interface{} `json:"metadata" datastore:"metadata"`
	Storage     StorageInfo            `json:"storage" datastore:"storage"`
	Access      AccessInfo             `json:"access" datastore:"access"`
}

// StorageInfo contains storage-related information
type StorageInfo struct {
	Bucket string `json:"bucket" datastore:"bucket"`
	Key    string `json:"key" datastore:"key"`
	Region string `json:"region" datastore:"region"`
}

// AccessInfo contains access control information
type AccessInfo struct {
	Visibility  string   `json:"visibility" datastore:"visibility"`
	Permissions []string `json:"permissions" datastore:"permissions"`
	SharedWith  []string `json:"sharedWith" datastore:"shared_with"`
}

// FileUploadRequest represents a file upload request
type FileUploadRequest struct {
	Name        string                 `json:"name"`
	ContentType string                 `json:"contentType"`
	Size        int64                  `json:"size"`
	Checksum    string                 `json:"checksum,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	Visibility  string                 `json:"visibility,omitempty"`
}

// FileResponse represents a file response
type FileResponse struct {
	*File
	DownloadURL string `json:"downloadUrl,omitempty"`
	ShareURL    string `json:"shareUrl,omitempty"`
}

// FileSearchRequest represents a file search request
type FileSearchRequest struct {
	Query       string `json:"query" form:"query"`
	ContentType string `json:"contentType" form:"contentType"`
	Size        string `json:"size" form:"size"`
	DateRange   string `json:"dateRange" form:"dateRange"`
	Limit       int    `json:"limit" form:"limit"`
	Offset      int    `json:"offset" form:"offset"`
}

// FileSearchResponse represents a file search response
type FileSearchResponse struct {
	Files      []*File `json:"files"`
	Total      int     `json:"total"`
	Limit      int     `json:"limit"`
	Offset     int     `json:"offset"`
	HasMore    bool    `json:"hasMore"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}

// ErrorDetail contains error information
type ErrorDetail struct {
	Code      string      `json:"code"`
	Message   string      `json:"message"`
	Details   interface{} `json:"details,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
	RequestID string      `json:"requestId,omitempty"`
}

// FileVersion represents a version of a file
type FileVersion struct {
	ID             string    `json:"id" datastore:"-"`
	Key            *datastore.Key `json:"-" datastore:"__key__"`
	OriginalFileID string    `json:"originalFileId" datastore:"original_file_id"`
	VersionNumber  int       `json:"versionNumber" datastore:"version_number"`
	StorageKey     string    `json:"storageKey" datastore:"storage_key"`
	CreatedAt      time.Time `json:"createdAt" datastore:"created_at"`
	Size           int64     `json:"size" datastore:"size"`
	Checksum       string    `json:"checksum" datastore:"checksum"`
	ContentType    string    `json:"contentType" datastore:"content_type"`
}

// FolderInfo represents folder structure information
type FolderInfo struct {
	Path        string    `json:"path"`
	Name        string    `json:"name"`
	ParentPath  string    `json:"parentPath"`
	CreatedAt   time.Time `json:"createdAt"`
	FileCount   int       `json:"fileCount"`
	FolderCount int       `json:"folderCount"`
}

// FileListRequest represents a request to list files in a folder
type FileListRequest struct {
	FolderPath string `json:"folderPath" form:"folderPath"`
	Limit      int    `json:"limit" form:"limit"`
	Offset     int    `json:"offset" form:"offset"`
	SortBy     string `json:"sortBy" form:"sortBy"`
	SortOrder  string `json:"sortOrder" form:"sortOrder"`
}

// FileListResponse represents a response containing files and folders
type FileListResponse struct {
	Files       []*File       `json:"files"`
	Folders     []*FolderInfo `json:"folders"`
	CurrentPath string        `json:"currentPath"`
	ParentPath  string        `json:"parentPath"`
	Total       int           `json:"total"`
	Limit       int           `json:"limit"`
	Offset      int           `json:"offset"`
	HasMore     bool          `json:"hasMore"`
}