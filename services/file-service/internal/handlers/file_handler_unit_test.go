package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"

	"file-service/internal/models"
)

// TestFileHandler_ErrorResponse tests the error response helper method
func TestFileHandler_ErrorResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	handler := &FileHandler{}
	
	// Create a test context
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("RequestID", "test-request-123")
	
	// Test error response
	handler.errorResponse(c, http.StatusBadRequest, "TEST_ERROR", "Test error message", nil)
	
	// Check response
	assert.Equal(t, http.StatusBadRequest, w.Code)
	
	var response models.ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	
	assert.Equal(t, "TEST_ERROR", response.Error.Code)
	assert.Equal(t, "Test error message", response.Error.Message)
	assert.Equal(t, "test-request-123", response.Error.RequestID)
	assert.NotZero(t, response.Error.Timestamp)
}

// TestFileHandler_MissingFileID tests handling of missing file ID parameter
func TestFileHandler_MissingFileID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	handler := &FileHandler{}
	
	// Create a test context with no file ID parameter
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("RequestID", "test-request-123")
	
	// Test GetFile with missing file ID
	handler.GetFile(c)
	
	// Check response
	assert.Equal(t, http.StatusBadRequest, w.Code)
	
	var response models.ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	
	assert.Equal(t, "INVALID_FILE_ID", response.Error.Code)
	assert.Equal(t, "File ID is required", response.Error.Message)
}

// TestFileHandler_MissingUserID tests handling of missing user ID header
func TestFileHandler_MissingUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	handler := &FileHandler{}
	
	// Create a test context with file ID but no user ID
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("RequestID", "test-request-123")
	c.Request = httptest.NewRequest("DELETE", "/api/v1/files/test-file-123", nil)
	c.Params = gin.Params{
		{Key: "fileId", Value: "test-file-123"},
	}
	
	// Test DeleteFile with missing user ID
	handler.DeleteFile(c)
	
	// Check response
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	
	var response models.ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	
	assert.Equal(t, "UNAUTHORIZED", response.Error.Code)
	assert.Equal(t, "User authentication required", response.Error.Message)
}

// TestFileHandler_InvalidJSON tests handling of invalid JSON in request body
func TestFileHandler_InvalidJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	handler := &FileHandler{}
	
	// Create a test context with invalid JSON
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("RequestID", "test-request-123")
	c.Request = httptest.NewRequest("PUT", "/api/v1/files/test-file-123/metadata", bytes.NewBufferString("invalid json"))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.Header.Set("X-User-ID", "test-user")
	c.Params = gin.Params{
		{Key: "fileId", Value: "test-file-123"},
	}
	
	// Test UpdateMetadata with invalid JSON
	handler.UpdateMetadata(c)
	
	// Check response
	assert.Equal(t, http.StatusBadRequest, w.Code)
	
	var response models.ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	
	assert.Equal(t, "INVALID_METADATA", response.Error.Code)
	assert.Equal(t, "Invalid metadata format", response.Error.Message)
}

// TestFileHandler_QuarantineInvalidJSON tests quarantine with invalid JSON
func TestFileHandler_QuarantineInvalidJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	handler := &FileHandler{}
	
	// Create a test context with invalid JSON
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("RequestID", "test-request-123")
	c.Request = httptest.NewRequest("POST", "/api/v1/files/test-file-123/quarantine", bytes.NewBufferString("invalid json"))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.Header.Set("X-User-ID", "test-user")
	c.Params = gin.Params{
		{Key: "fileId", Value: "test-file-123"},
	}
	
	// Test QuarantineFile with invalid JSON
	handler.QuarantineFile(c)
	
	// Check response
	assert.Equal(t, http.StatusBadRequest, w.Code)
	
	var response models.ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	
	assert.Equal(t, "INVALID_REQUEST", response.Error.Code)
	assert.Equal(t, "Invalid request body", response.Error.Message)
}

// TestFileHandler_ResumableUploadMissingSessionID tests resumable upload with missing session ID
func TestFileHandler_ResumableUploadMissingSessionID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	handler := &FileHandler{}
	
	// Create a test context with no session ID parameter
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("RequestID", "test-request-123")
	
	// Test GetUploadProgress with missing session ID
	handler.GetUploadProgress(c)
	
	// Check response
	assert.Equal(t, http.StatusBadRequest, w.Code)
	
	var response models.ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	
	assert.Equal(t, "INVALID_SESSION_ID", response.Error.Code)
	assert.Equal(t, "Session ID is required", response.Error.Message)
}

// TestFileHandler_UploadChunkMissingChunkNumber tests chunk upload with missing chunk number
func TestFileHandler_UploadChunkMissingChunkNumber(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	handler := &FileHandler{}
	
	// Create a test context with session ID but no chunk number
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("RequestID", "test-request-123")
	c.Request = httptest.NewRequest("POST", "/api/v1/uploads/session123/chunks", bytes.NewBufferString("chunk data"))
	c.Params = gin.Params{
		{Key: "sessionId", Value: "session123"},
	}
	
	// Test UploadChunk with missing chunk number
	handler.UploadChunk(c)
	
	// Check response
	assert.Equal(t, http.StatusBadRequest, w.Code)
	
	var response models.ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	
	assert.Equal(t, "INVALID_CHUNK_NUMBER", response.Error.Code)
	assert.Equal(t, "Chunk number is required", response.Error.Message)
}

// TestFileHandler_UploadChunkInvalidChunkNumber tests chunk upload with invalid chunk number
func TestFileHandler_UploadChunkInvalidChunkNumber(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	handler := &FileHandler{}
	
	// Create a test context with invalid chunk number
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("RequestID", "test-request-123")
	c.Request = httptest.NewRequest("POST", "/api/v1/uploads/session123/chunks", bytes.NewBufferString("chunk data"))
	c.Request.Header.Set("X-Chunk-Number", "invalid")
	c.Params = gin.Params{
		{Key: "sessionId", Value: "session123"},
	}
	
	// Test UploadChunk with invalid chunk number
	handler.UploadChunk(c)
	
	// Check response
	assert.Equal(t, http.StatusBadRequest, w.Code)
	
	var response models.ErrorResponse
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	
	assert.Equal(t, "INVALID_CHUNK_NUMBER", response.Error.Code)
	assert.Equal(t, "Invalid chunk number format", response.Error.Message)
}