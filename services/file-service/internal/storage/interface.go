package storage

import (
	"context"
	"mime/multipart"
	"time"
)

// StorageProvider defines the interface for cloud storage operations
type StorageProvider interface {
	UploadFile(ctx context.Context, key string, file multipart.File, contentType string) error
	GenerateSignedURL(ctx context.Context, key string, expiration time.Duration) (string, error)
	DeleteFile(ctx context.Context, key string) error
	GetFileInfo(ctx context.Context, key string) (*FileInfo, error)
	CopyFile(ctx context.Context, srcKey, destKey string) error
	ListFiles(ctx context.Context, prefix string, delimiter string) ([]*FileInfo, error)
	Close() error
}