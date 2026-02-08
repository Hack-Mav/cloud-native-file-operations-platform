package storage

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"time"

	"cloud.google.com/go/storage"
	"google.golang.org/api/option"
)

// GCSStorage implements cloud storage operations using Google Cloud Storage
type GCSStorage struct {
	client *storage.Client
	bucket string
}

// NewGCSStorage creates a new GCS storage client
func NewGCSStorage(ctx context.Context, bucketName string) (*GCSStorage, error) {
	client, err := storage.NewClient(ctx, option.WithScopes(storage.ScopeFullControl))
	if err != nil {
		return nil, fmt.Errorf("failed to create storage client: %w", err)
	}

	return &GCSStorage{
		client: client,
		bucket: bucketName,
	}, nil
}

// UploadFile uploads a file to Google Cloud Storage
func (s *GCSStorage) UploadFile(ctx context.Context, key string, file multipart.File, contentType string) error {
	obj := s.client.Bucket(s.bucket).Object(key)
	
	// Create a writer to the GCS object
	writer := obj.NewWriter(ctx)
	writer.ContentType = contentType
	
	// Set metadata
	writer.Metadata = map[string]string{
		"uploaded_at": time.Now().Format(time.RFC3339),
	}

	// Copy file content to GCS
	_, err := io.Copy(writer, file)
	if err != nil {
		writer.Close()
		return fmt.Errorf("failed to upload file: %w", err)
	}

	// Close the writer to finalize the upload
	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to finalize upload: %w", err)
	}

	return nil
}

// GenerateSignedURL generates a presigned URL for secure file download
func (s *GCSStorage) GenerateSignedURL(ctx context.Context, key string, expiration time.Duration) (string, error) {
	opts := &storage.SignedURLOptions{
		Scheme:  storage.SigningSchemeV4,
		Method:  "GET",
		Expires: time.Now().Add(expiration),
	}

	url, err := s.client.Bucket(s.bucket).SignedURL(key, opts)
	if err != nil {
		return "", fmt.Errorf("failed to generate signed URL: %w", err)
	}

	return url, nil
}

// DeleteFile deletes a file from Google Cloud Storage
func (s *GCSStorage) DeleteFile(ctx context.Context, key string) error {
	obj := s.client.Bucket(s.bucket).Object(key)
	
	if err := obj.Delete(ctx); err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	return nil
}

// GetFileInfo retrieves file information from Google Cloud Storage
func (s *GCSStorage) GetFileInfo(ctx context.Context, key string) (*FileInfo, error) {
	obj := s.client.Bucket(s.bucket).Object(key)
	
	attrs, err := obj.Attrs(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get file info: %w", err)
	}

	return &FileInfo{
		Key:         key,
		Size:        attrs.Size,
		ContentType: attrs.ContentType,
		ETag:        attrs.Etag,
		Created:     attrs.Created,
		Updated:     attrs.Updated,
		Metadata:    attrs.Metadata,
	}, nil
}

// CopyFile copies a file within the storage bucket (for versioning)
func (s *GCSStorage) CopyFile(ctx context.Context, srcKey, destKey string) error {
	src := s.client.Bucket(s.bucket).Object(srcKey)
	dst := s.client.Bucket(s.bucket).Object(destKey)

	_, err := dst.CopierFrom(src).Run(ctx)
	if err != nil {
		return fmt.Errorf("failed to copy file: %w", err)
	}

	return nil
}

// ListFiles lists files with a given prefix (for folder support)
func (s *GCSStorage) ListFiles(ctx context.Context, prefix string, delimiter string) ([]*FileInfo, error) {
	query := &storage.Query{
		Prefix:    prefix,
		Delimiter: delimiter,
	}

	it := s.client.Bucket(s.bucket).Objects(ctx, query)
	
	var files []*FileInfo
	for {
		attrs, err := it.Next()
		if err == storage.ErrObjectNotExist {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to list files: %w", err)
		}

		files = append(files, &FileInfo{
			Key:         attrs.Name,
			Size:        attrs.Size,
			ContentType: attrs.ContentType,
			ETag:        attrs.Etag,
			Created:     attrs.Created,
			Updated:     attrs.Updated,
			Metadata:    attrs.Metadata,
		})
	}

	return files, nil
}

// Close closes the storage client
func (s *GCSStorage) Close() error {
	return s.client.Close()
}

// FileInfo represents file information from cloud storage
type FileInfo struct {
	Key         string            `json:"key"`
	Size        int64             `json:"size"`
	ContentType string            `json:"contentType"`
	ETag        string            `json:"etag"`
	Created     time.Time         `json:"created"`
	Updated     time.Time         `json:"updated"`
	Metadata    map[string]string `json:"metadata"`
}