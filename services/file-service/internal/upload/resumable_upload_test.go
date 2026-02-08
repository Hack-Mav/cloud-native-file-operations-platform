package upload

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestUploadSession_Structure(t *testing.T) {
	// Test that UploadSession struct has all required fields
	session := &UploadSession{
		ID:            "test-id",
		FileID:        "test-file-id",
		FileName:      "test.txt",
		FileSize:      1024,
		ContentType:   "text/plain",
		ChunkSize:     5 * 1024 * 1024,
		TotalChunks:   1,
		UploadedBytes: 0,
		Status:        "initiated",
		UploaderID:    "test-user",
		Metadata:      map[string]interface{}{"test": "value"},
	}

	assert.Equal(t, "test-id", session.ID)
	assert.Equal(t, "test-file-id", session.FileID)
	assert.Equal(t, "test.txt", session.FileName)
	assert.Equal(t, int64(1024), session.FileSize)
	assert.Equal(t, "text/plain", session.ContentType)
	assert.Equal(t, int64(5*1024*1024), session.ChunkSize)
	assert.Equal(t, 1, session.TotalChunks)
	assert.Equal(t, int64(0), session.UploadedBytes)
	assert.Equal(t, "initiated", session.Status)
	assert.Equal(t, "test-user", session.UploaderID)
	assert.NotNil(t, session.Metadata)
}

func TestChunkInfo_Structure(t *testing.T) {
	// Test that ChunkInfo struct has all required fields
	chunkInfo := &ChunkInfo{
		ChunkNumber: 0,
		Size:        1024,
		Checksum:    "abc123",
		StorageKey:  "uploads/test/chunks/0",
	}

	assert.Equal(t, 0, chunkInfo.ChunkNumber)
	assert.Equal(t, int64(1024), chunkInfo.Size)
	assert.Equal(t, "abc123", chunkInfo.Checksum)
	assert.Equal(t, "uploads/test/chunks/0", chunkInfo.StorageKey)
}

func TestUploadProgress_Structure(t *testing.T) {
	// Test that UploadProgress struct has all required fields
	progress := &UploadProgress{
		SessionID:       "test-session",
		FileID:          "test-file",
		FileName:        "test.txt",
		TotalSize:       1024,
		UploadedBytes:   512,
		PercentComplete: 50.0,
		ChunksUploaded:  1,
		TotalChunks:     2,
		Status:          "uploading",
	}

	assert.Equal(t, "test-session", progress.SessionID)
	assert.Equal(t, "test-file", progress.FileID)
	assert.Equal(t, "test.txt", progress.FileName)
	assert.Equal(t, int64(1024), progress.TotalSize)
	assert.Equal(t, int64(512), progress.UploadedBytes)
	assert.Equal(t, 50.0, progress.PercentComplete)
	assert.Equal(t, 1, progress.ChunksUploaded)
	assert.Equal(t, 2, progress.TotalChunks)
	assert.Equal(t, "uploading", progress.Status)
}

func TestBytesReader_ReadAndSeek(t *testing.T) {
	// Test the bytesReader implementation
	data := []byte("Hello, World!")
	reader := &bytesReader{data: data, offset: 0}

	// Test Read
	buffer := make([]byte, 5)
	n, err := reader.Read(buffer)
	assert.NoError(t, err)
	assert.Equal(t, 5, n)
	assert.Equal(t, "Hello", string(buffer))

	// Test Seek
	offset, err := reader.Seek(7, 0) // Seek to position 7 (start of "World!")
	assert.NoError(t, err)
	assert.Equal(t, int64(7), offset)

	// Read after seek
	buffer = make([]byte, 6)
	n, err = reader.Read(buffer)
	assert.NoError(t, err)
	assert.Equal(t, 6, n)
	assert.Equal(t, "World!", string(buffer))

	// Test ReadAt
	buffer = make([]byte, 5)
	n, err = reader.ReadAt(buffer, 0)
	assert.NoError(t, err)
	assert.Equal(t, 5, n)
	assert.Equal(t, "Hello", string(buffer))
}

func TestResumableUploadManager_ChunkSizeCalculation(t *testing.T) {
	// Test chunk size calculation logic
	chunkSize := int64(5 * 1024 * 1024) // 5MB

	// Test cases for different file sizes
	testCases := []struct {
		fileSize     int64
		expectedChunks int
	}{
		{1024, 1},                    // 1KB -> 1 chunk
		{5 * 1024 * 1024, 1},        // 5MB -> 1 chunk
		{10 * 1024 * 1024, 2},       // 10MB -> 2 chunks
		{15 * 1024 * 1024, 3},       // 15MB -> 3 chunks
		{5*1024*1024 + 1, 2},        // 5MB + 1 byte -> 2 chunks
	}

	for _, tc := range testCases {
		totalChunks := int((tc.fileSize + chunkSize - 1) / chunkSize)
		assert.Equal(t, tc.expectedChunks, totalChunks, 
			"File size %d should result in %d chunks", tc.fileSize, tc.expectedChunks)
	}
}