package upload

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"file-service/internal/models"
	"file-service/internal/repository"
	"file-service/internal/storage"
)

// ResumableUploadManager handles resumable file uploads
type ResumableUploadManager struct {
	redisClient     *redis.Client
	fileRepo        *repository.FileRepository
	storageProvider storage.StorageProvider
	chunkSize       int64
}

// NewResumableUploadManager creates a new resumable upload manager
func NewResumableUploadManager(redisClient *redis.Client, fileRepo *repository.FileRepository, storageProvider storage.StorageProvider) *ResumableUploadManager {
	return &ResumableUploadManager{
		redisClient:     redisClient,
		fileRepo:        fileRepo,
		storageProvider: storageProvider,
		chunkSize:       5 * 1024 * 1024, // 5MB chunks
	}
}

// UploadSession represents an active upload session
type UploadSession struct {
	ID            string    `json:"id"`
	FileID        string    `json:"fileId"`
	FileName      string    `json:"fileName"`
	FileSize      int64     `json:"fileSize"`
	ContentType   string    `json:"contentType"`
	ChunkSize     int64     `json:"chunkSize"`
	TotalChunks   int       `json:"totalChunks"`
	UploadedBytes int64     `json:"uploadedBytes"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	ExpiresAt     time.Time `json:"expiresAt"`
	UploaderID    string    `json:"uploaderId"`
	Metadata      map[string]interface{} `json:"metadata"`
}

// ChunkInfo represents information about an uploaded chunk
type ChunkInfo struct {
	ChunkNumber int    `json:"chunkNumber"`
	Size        int64  `json:"size"`
	Checksum    string `json:"checksum"`
	StorageKey  string `json:"storageKey"`
	UploadedAt  time.Time `json:"uploadedAt"`
}

// UploadProgress represents the current upload progress
type UploadProgress struct {
	SessionID       string  `json:"sessionId"`
	FileID          string  `json:"fileId"`
	FileName        string  `json:"fileName"`
	TotalSize       int64   `json:"totalSize"`
	UploadedBytes   int64   `json:"uploadedBytes"`
	PercentComplete float64 `json:"percentComplete"`
	ChunksUploaded  int     `json:"chunksUploaded"`
	TotalChunks     int     `json:"totalChunks"`
	Status          string  `json:"status"`
	EstimatedTimeRemaining time.Duration `json:"estimatedTimeRemaining"`
}

// InitiateUpload starts a new resumable upload session
func (rum *ResumableUploadManager) InitiateUpload(ctx context.Context, fileName string, fileSize int64, contentType string, uploaderID string, metadata map[string]interface{}) (*UploadSession, error) {
	// Generate unique session ID and file ID
	sessionID := uuid.New().String()
	fileID := uuid.New().String()

	// Calculate total chunks needed
	totalChunks := int((fileSize + rum.chunkSize - 1) / rum.chunkSize)

	// Create upload session
	session := &UploadSession{
		ID:            sessionID,
		FileID:        fileID,
		FileName:      fileName,
		FileSize:      fileSize,
		ContentType:   contentType,
		ChunkSize:     rum.chunkSize,
		TotalChunks:   totalChunks,
		UploadedBytes: 0,
		Status:        "initiated",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		ExpiresAt:     time.Now().Add(24 * time.Hour), // 24 hour expiration
		UploaderID:    uploaderID,
		Metadata:      metadata,
	}

	// Store session in Redis
	err := rum.storeSession(ctx, session)
	if err != nil {
		return nil, fmt.Errorf("failed to store upload session: %w", err)
	}

	return session, nil
}

// UploadChunk uploads a single chunk of the file
func (rum *ResumableUploadManager) UploadChunk(ctx context.Context, sessionID string, chunkNumber int, chunkData io.Reader, chunkSize int64) (*ChunkInfo, error) {
	// Get upload session
	session, err := rum.getSession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get upload session: %w", err)
	}

	// Validate chunk number
	if chunkNumber < 0 || chunkNumber >= session.TotalChunks {
		return nil, fmt.Errorf("invalid chunk number: %d", chunkNumber)
	}

	// Check if chunk already uploaded
	chunkKey := fmt.Sprintf("chunk:%s:%d", sessionID, chunkNumber)
	exists, err := rum.redisClient.Exists(ctx, chunkKey).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to check chunk existence: %w", err)
	}

	if exists > 0 {
		// Chunk already uploaded, return existing info
		return rum.getChunkInfo(ctx, sessionID, chunkNumber)
	}

	// Generate storage key for chunk
	storageKey := fmt.Sprintf("uploads/%s/chunks/%d", session.FileID, chunkNumber)

	// Read chunk data into buffer for checksum calculation and storage
	chunkBuffer := make([]byte, chunkSize)
	n, err := io.ReadFull(chunkData, chunkBuffer)
	if err != nil && err != io.ErrUnexpectedEOF {
		return nil, fmt.Errorf("failed to read chunk data: %w", err)
	}
	chunkBuffer = chunkBuffer[:n] // Trim to actual size read

	// Calculate chunk checksum
	checksum := rum.calculateChunkChecksumFromBytes(chunkBuffer)

	// Upload chunk to storage
	chunkReader := &bytesReader{data: chunkBuffer}
	err = rum.uploadChunkToStorage(ctx, storageKey, chunkReader, session.ContentType)
	if err != nil {
		return nil, fmt.Errorf("failed to upload chunk to storage: %w", err)
	}

	// Create chunk info
	chunkInfo := &ChunkInfo{
		ChunkNumber: chunkNumber,
		Size:        int64(len(chunkBuffer)),
		Checksum:    checksum,
		StorageKey:  storageKey,
		UploadedAt:  time.Now(),
	}

	// Store chunk info
	err = rum.storeChunkInfo(ctx, sessionID, chunkInfo)
	if err != nil {
		return nil, fmt.Errorf("failed to store chunk info: %w", err)
	}

	// Update session progress
	err = rum.updateSessionProgress(ctx, sessionID, int64(len(chunkBuffer)))
	if err != nil {
		return nil, fmt.Errorf("failed to update session progress: %w", err)
	}

	return chunkInfo, nil
}

// CompleteUpload finalizes the upload by combining all chunks
func (rum *ResumableUploadManager) CompleteUpload(ctx context.Context, sessionID string) (*models.File, error) {
	// Get upload session
	session, err := rum.getSession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get upload session: %w", err)
	}

	// Verify all chunks are uploaded
	uploadedChunks, err := rum.getUploadedChunks(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to get uploaded chunks: %w", err)
	}

	if len(uploadedChunks) != session.TotalChunks {
		return nil, fmt.Errorf("not all chunks uploaded: %d/%d", len(uploadedChunks), session.TotalChunks)
	}

	// Combine chunks into final file
	finalStorageKey := fmt.Sprintf("files/%s/%s", session.FileID[:2], session.FileID)
	err = rum.combineChunks(ctx, session, uploadedChunks, finalStorageKey)
	if err != nil {
		return nil, fmt.Errorf("failed to combine chunks: %w", err)
	}

	// Create file record in database
	file := &models.File{
		ID:          session.FileID,
		Name:        session.FileName,
		Size:        session.FileSize,
		ContentType: session.ContentType,
		UploadedBy:  session.UploaderID,
		Status:      "uploaded",
		Metadata:    session.Metadata,
		Storage: models.StorageInfo{
			Key:    finalStorageKey,
			Bucket: "file-ops-platform-storage", // TODO: Get from config
			Region: "us-central1",
		},
		Access: models.AccessInfo{
			Visibility:  "private",
			Permissions: []string{"read", "write"},
			SharedWith:  []string{},
		},
	}

	err = rum.fileRepo.Create(ctx, file)
	if err != nil {
		return nil, fmt.Errorf("failed to create file record: %w", err)
	}

	// Update session status
	session.Status = "completed"
	session.UpdatedAt = time.Now()
	err = rum.storeSession(ctx, session)
	if err != nil {
		return nil, fmt.Errorf("failed to update session status: %w", err)
	}

	// Cleanup chunks
	go rum.cleanupChunks(context.Background(), sessionID, uploadedChunks)

	return file, nil
}

// GetUploadProgress returns the current upload progress
func (rum *ResumableUploadManager) GetUploadProgress(ctx context.Context, sessionID string) (*UploadProgress, error) {
	session, err := rum.getSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	uploadedChunks, err := rum.getUploadedChunks(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	percentComplete := float64(session.UploadedBytes) / float64(session.FileSize) * 100

	progress := &UploadProgress{
		SessionID:       session.ID,
		FileID:          session.FileID,
		FileName:        session.FileName,
		TotalSize:       session.FileSize,
		UploadedBytes:   session.UploadedBytes,
		PercentComplete: percentComplete,
		ChunksUploaded:  len(uploadedChunks),
		TotalChunks:     session.TotalChunks,
		Status:          session.Status,
	}

	// Calculate estimated time remaining
	if session.UploadedBytes > 0 {
		elapsed := time.Since(session.CreatedAt)
		bytesPerSecond := float64(session.UploadedBytes) / elapsed.Seconds()
		remainingBytes := session.FileSize - session.UploadedBytes
		if bytesPerSecond > 0 {
			progress.EstimatedTimeRemaining = time.Duration(float64(remainingBytes)/bytesPerSecond) * time.Second
		}
	}

	return progress, nil
}

// ResumeUpload resumes an interrupted upload
func (rum *ResumableUploadManager) ResumeUpload(ctx context.Context, sessionID string) (*UploadSession, error) {
	session, err := rum.getSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	// Check if session has expired
	if time.Now().After(session.ExpiresAt) {
		return nil, fmt.Errorf("upload session has expired")
	}

	// Update session status to active
	session.Status = "active"
	session.UpdatedAt = time.Now()
	err = rum.storeSession(ctx, session)
	if err != nil {
		return nil, fmt.Errorf("failed to update session: %w", err)
	}

	return session, nil
}

// CancelUpload cancels an upload and cleans up resources
func (rum *ResumableUploadManager) CancelUpload(ctx context.Context, sessionID string) error {
	session, err := rum.getSession(ctx, sessionID)
	if err != nil {
		return err
	}

	// Get uploaded chunks for cleanup
	uploadedChunks, err := rum.getUploadedChunks(ctx, sessionID)
	if err != nil {
		return err
	}

	// Update session status
	session.Status = "cancelled"
	session.UpdatedAt = time.Now()
	err = rum.storeSession(ctx, session)
	if err != nil {
		return fmt.Errorf("failed to update session status: %w", err)
	}

	// Cleanup chunks
	go rum.cleanupChunks(context.Background(), sessionID, uploadedChunks)

	return nil
}

// Helper methods

func (rum *ResumableUploadManager) storeSession(ctx context.Context, session *UploadSession) error {
	key := fmt.Sprintf("upload_session:%s", session.ID)
	
	// Serialize session to JSON
	sessionData, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("failed to serialize session: %w", err)
	}
	
	// Store in Redis with expiration
	return rum.redisClient.Set(ctx, key, sessionData, 24*time.Hour).Err()
}

func (rum *ResumableUploadManager) getSession(ctx context.Context, sessionID string) (*UploadSession, error) {
	key := fmt.Sprintf("upload_session:%s", sessionID)
	
	// Get session data from Redis
	sessionData, err := rum.redisClient.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, fmt.Errorf("upload session not found")
		}
		return nil, fmt.Errorf("failed to get session: %w", err)
	}
	
	// Deserialize session from JSON
	var session UploadSession
	err = json.Unmarshal([]byte(sessionData), &session)
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize session: %w", err)
	}
	
	return &session, nil
}

func (rum *ResumableUploadManager) calculateChunkChecksumFromBytes(data []byte) string {
	hash := sha256.New()
	hash.Write(data)
	return fmt.Sprintf("%x", hash.Sum(nil))
}

// bytesReader wraps a byte slice to implement multipart.File interface
type bytesReader struct {
	data   []byte
	offset int64
}

func (br *bytesReader) Read(p []byte) (n int, err error) {
	if br.offset >= int64(len(br.data)) {
		return 0, io.EOF
	}
	
	n = copy(p, br.data[br.offset:])
	br.offset += int64(n)
	return n, nil
}

func (br *bytesReader) Close() error {
	return nil
}

func (br *bytesReader) Seek(offset int64, whence int) (int64, error) {
	switch whence {
	case io.SeekStart:
		br.offset = offset
	case io.SeekCurrent:
		br.offset += offset
	case io.SeekEnd:
		br.offset = int64(len(br.data)) + offset
	}
	
	if br.offset < 0 {
		br.offset = 0
	}
	if br.offset > int64(len(br.data)) {
		br.offset = int64(len(br.data))
	}
	
	return br.offset, nil
}

func (br *bytesReader) ReadAt(p []byte, off int64) (n int, err error) {
	if off < 0 || off >= int64(len(br.data)) {
		return 0, io.EOF
	}
	
	n = copy(p, br.data[off:])
	if off+int64(n) >= int64(len(br.data)) {
		err = io.EOF
	}
	
	return n, err
}

func (rum *ResumableUploadManager) uploadChunkToStorage(ctx context.Context, storageKey string, chunkData io.Reader, contentType string) error {
	// Convert io.Reader to multipart.File interface for storage provider
	// In a real implementation, you might need a different approach
	// For now, we'll use a simple wrapper
	chunkFile := &readerWrapper{Reader: chunkData}
	
	return rum.storageProvider.UploadFile(ctx, storageKey, chunkFile, contentType)
}

// readerWrapper wraps an io.Reader to implement multipart.File interface
type readerWrapper struct {
	io.Reader
}

func (rw *readerWrapper) Close() error {
	if closer, ok := rw.Reader.(io.Closer); ok {
		return closer.Close()
	}
	return nil
}

func (rw *readerWrapper) Seek(offset int64, whence int) (int64, error) {
	if seeker, ok := rw.Reader.(io.Seeker); ok {
		return seeker.Seek(offset, whence)
	}
	return 0, fmt.Errorf("seek not supported")
}

func (rw *readerWrapper) ReadAt(p []byte, off int64) (n int, err error) {
	if readerAt, ok := rw.Reader.(io.ReaderAt); ok {
		return readerAt.ReadAt(p, off)
	}
	return 0, fmt.Errorf("ReadAt not supported")
}

func (rum *ResumableUploadManager) storeChunkInfo(ctx context.Context, sessionID string, chunkInfo *ChunkInfo) error {
	key := fmt.Sprintf("chunk:%s:%d", sessionID, chunkInfo.ChunkNumber)
	
	// Serialize chunk info to JSON
	chunkData, err := json.Marshal(chunkInfo)
	if err != nil {
		return fmt.Errorf("failed to serialize chunk info: %w", err)
	}
	
	return rum.redisClient.Set(ctx, key, chunkData, 24*time.Hour).Err()
}

func (rum *ResumableUploadManager) getChunkInfo(ctx context.Context, sessionID string, chunkNumber int) (*ChunkInfo, error) {
	key := fmt.Sprintf("chunk:%s:%d", sessionID, chunkNumber)
	
	// Get chunk data from Redis
	chunkData, err := rum.redisClient.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, fmt.Errorf("chunk not found")
		}
		return nil, fmt.Errorf("failed to get chunk info: %w", err)
	}
	
	// Deserialize chunk info from JSON
	var chunkInfo ChunkInfo
	err = json.Unmarshal([]byte(chunkData), &chunkInfo)
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize chunk info: %w", err)
	}
	
	return &chunkInfo, nil
}

func (rum *ResumableUploadManager) updateSessionProgress(ctx context.Context, sessionID string, chunkSize int64) error {
	// Get current session
	session, err := rum.getSession(ctx, sessionID)
	if err != nil {
		return err
	}
	
	// Update uploaded bytes
	session.UploadedBytes += chunkSize
	session.UpdatedAt = time.Now()
	
	// Update status based on progress
	if session.UploadedBytes >= session.FileSize {
		session.Status = "ready_for_completion"
	} else {
		session.Status = "uploading"
	}
	
	// Store updated session
	return rum.storeSession(ctx, session)
}

func (rum *ResumableUploadManager) getUploadedChunks(ctx context.Context, sessionID string) ([]*ChunkInfo, error) {
	// Get session to know total chunks
	session, err := rum.getSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	
	var chunks []*ChunkInfo
	
	// Check each chunk
	for i := 0; i < session.TotalChunks; i++ {
		chunkInfo, err := rum.getChunkInfo(ctx, sessionID, i)
		if err != nil {
			// Chunk not uploaded yet, skip
			continue
		}
		chunks = append(chunks, chunkInfo)
	}
	
	// Sort chunks by chunk number
	sort.Slice(chunks, func(i, j int) bool {
		return chunks[i].ChunkNumber < chunks[j].ChunkNumber
	})
	
	return chunks, nil
}

func (rum *ResumableUploadManager) combineChunks(ctx context.Context, session *UploadSession, chunks []*ChunkInfo, finalStorageKey string) error {
	// For Google Cloud Storage, we can use the compose operation
	// However, for simplicity, we'll implement a basic approach
	
	// Create a temporary file to combine chunks
	combinedFile := &combinedChunkReader{
		ctx:             ctx,
		storageProvider: rum.storageProvider,
		chunks:          chunks,
		currentChunk:    0,
	}
	
	// Upload the combined file
	err := rum.storageProvider.UploadFile(ctx, finalStorageKey, combinedFile, session.ContentType)
	if err != nil {
		return fmt.Errorf("failed to upload combined file: %w", err)
	}
	
	return nil
}

// combinedChunkReader implements multipart.File to read from multiple chunks sequentially
type combinedChunkReader struct {
	ctx             context.Context
	storageProvider storage.StorageProvider
	chunks          []*ChunkInfo
	currentChunk    int
	currentReader   io.ReadCloser
}

func (ccr *combinedChunkReader) Read(p []byte) (n int, err error) {
	if ccr.currentChunk >= len(ccr.chunks) {
		return 0, io.EOF
	}
	
	// If no current reader, open the next chunk
	if ccr.currentReader == nil {
		// For this implementation, we'll need to add a method to get file content
		// This is a simplified approach - in production, you'd implement proper chunk reading
		ccr.currentChunk++
		if ccr.currentChunk >= len(ccr.chunks) {
			return 0, io.EOF
		}
		return ccr.Read(p)
	}
	
	n, err = ccr.currentReader.Read(p)
	if err == io.EOF {
		ccr.currentReader.Close()
		ccr.currentReader = nil
		ccr.currentChunk++
		if ccr.currentChunk < len(ccr.chunks) {
			return ccr.Read(p)
		}
	}
	
	return n, err
}

func (ccr *combinedChunkReader) Close() error {
	if ccr.currentReader != nil {
		return ccr.currentReader.Close()
	}
	return nil
}

func (ccr *combinedChunkReader) Seek(offset int64, whence int) (int64, error) {
	return 0, fmt.Errorf("seek not supported on combined chunk reader")
}

func (ccr *combinedChunkReader) ReadAt(p []byte, off int64) (n int, err error) {
	return 0, fmt.Errorf("ReadAt not supported on combined chunk reader")
}

func (rum *ResumableUploadManager) cleanupChunks(ctx context.Context, sessionID string, chunks []*ChunkInfo) {
	// Delete chunk files from storage
	for _, chunk := range chunks {
		err := rum.storageProvider.DeleteFile(ctx, chunk.StorageKey)
		if err != nil {
			// Log error but continue cleanup
			fmt.Printf("Warning: failed to delete chunk %s: %v\n", chunk.StorageKey, err)
		}
	}
	
	// Delete chunk metadata from Redis
	for _, chunk := range chunks {
		key := fmt.Sprintf("chunk:%s:%d", sessionID, chunk.ChunkNumber)
		err := rum.redisClient.Del(ctx, key).Err()
		if err != nil {
			fmt.Printf("Warning: failed to delete chunk metadata %s: %v\n", key, err)
		}
	}
	
	// Delete session from Redis
	sessionKey := fmt.Sprintf("upload_session:%s", sessionID)
	err := rum.redisClient.Del(ctx, sessionKey).Err()
	if err != nil {
		fmt.Printf("Warning: failed to delete session %s: %v\n", sessionKey, err)
	}
}