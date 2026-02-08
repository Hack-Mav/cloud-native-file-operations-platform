package repository

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/datastore"
	"file-service/internal/models"
)

const (
	FileKind = "File"
)

// FileRepository handles file data operations
type FileRepository struct {
	client *datastore.Client
}

// NewFileRepository creates a new file repository
func NewFileRepository(client *datastore.Client) *FileRepository {
	return &FileRepository{
		client: client,
	}
}

// Create creates a new file record
func (r *FileRepository) Create(ctx context.Context, file *models.File) error {
	// Generate a new key if not provided
	if file.Key == nil {
		file.Key = datastore.IncompleteKey(FileKind, nil)
	}

	// Set timestamps
	file.UploadedAt = time.Now()

	// Save to datastore
	key, err := r.client.Put(ctx, file.Key, file)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}

	// Update the file with the generated ID
	file.Key = key
	file.ID = key.Name
	if file.ID == "" {
		file.ID = fmt.Sprintf("%d", key.ID)
	}

	return nil
}

// GetByID retrieves a file by its ID
func (r *FileRepository) GetByID(ctx context.Context, id string) (*models.File, error) {
	key := datastore.NameKey(FileKind, id, nil)
	
	var file models.File
	err := r.client.Get(ctx, key, &file)
	if err != nil {
		if err == datastore.ErrNoSuchEntity {
			return nil, fmt.Errorf("file not found: %s", id)
		}
		return nil, fmt.Errorf("failed to get file: %w", err)
	}

	file.Key = key
	file.ID = id

	return &file, nil
}

// Update updates an existing file record
func (r *FileRepository) Update(ctx context.Context, file *models.File) error {
	if file.Key == nil {
		return fmt.Errorf("file key is required for update")
	}

	_, err := r.client.Put(ctx, file.Key, file)
	if err != nil {
		return fmt.Errorf("failed to update file: %w", err)
	}

	return nil
}

// Delete deletes a file record
func (r *FileRepository) Delete(ctx context.Context, id string) error {
	key := datastore.NameKey(FileKind, id, nil)
	
	err := r.client.Delete(ctx, key)
	if err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	return nil
}

// Search searches for files based on criteria
func (r *FileRepository) Search(ctx context.Context, req *models.FileSearchRequest) (*models.FileSearchResponse, error) {
	query := datastore.NewQuery(FileKind)

	// Apply filters
	if req.Query != "" {
		// Simple name-based search (in production, use full-text search service)
		query = query.Filter("name >=", req.Query).Filter("name <", req.Query+"\ufffd")
	}

	if req.ContentType != "" {
		query = query.Filter("content_type =", req.ContentType)
	}

	// Apply ordering
	query = query.Order("-uploaded_at")

	// Apply pagination
	if req.Limit <= 0 {
		req.Limit = 20
	}
	if req.Limit > 100 {
		req.Limit = 100
	}

	query = query.Limit(req.Limit + 1) // Get one extra to check if there are more
	if req.Offset > 0 {
		query = query.Offset(req.Offset)
	}

	// Execute query
	var files []*models.File
	keys, err := r.client.GetAll(ctx, query, &files)
	if err != nil {
		return nil, fmt.Errorf("failed to search files: %w", err)
	}

	// Set IDs from keys
	for i, key := range keys {
		if i < len(files) {
			files[i].Key = key
			files[i].ID = key.Name
			if files[i].ID == "" {
				files[i].ID = fmt.Sprintf("%d", key.ID)
			}
		}
	}

	// Check if there are more results
	hasMore := len(files) > req.Limit
	if hasMore {
		files = files[:req.Limit]
	}

	return &models.FileSearchResponse{
		Files:   files,
		Total:   len(files), // In production, use a separate count query
		Limit:   req.Limit,
		Offset:  req.Offset,
		HasMore: hasMore,
	}, nil
}

// GetByUploader retrieves files uploaded by a specific user
func (r *FileRepository) GetByUploader(ctx context.Context, uploaderID string, limit, offset int) ([]*models.File, error) {
	query := datastore.NewQuery(FileKind).
		Filter("uploaded_by =", uploaderID).
		Order("-uploaded_at").
		Limit(limit).
		Offset(offset)

	var files []*models.File
	keys, err := r.client.GetAll(ctx, query, &files)
	if err != nil {
		return nil, fmt.Errorf("failed to get files by uploader: %w", err)
	}

	// Set IDs from keys
	for i, key := range keys {
		if i < len(files) {
			files[i].Key = key
			files[i].ID = key.Name
			if files[i].ID == "" {
				files[i].ID = fmt.Sprintf("%d", key.ID)
			}
		}
	}

	return files, nil
}