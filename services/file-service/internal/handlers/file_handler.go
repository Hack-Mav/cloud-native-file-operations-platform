package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"file-service/internal/models"
	"file-service/internal/service"
	"file-service/internal/upload"
)

// FileHandler handles HTTP requests for file operations
type FileHandler struct {
	fileService           *service.FileService
	resumableUploadManager *upload.ResumableUploadManager
}

// NewFileHandler creates a new file handler
func NewFileHandler(fileService *service.FileService, resumableUploadManager *upload.ResumableUploadManager) *FileHandler {
	return &FileHandler{
		fileService:           fileService,
		resumableUploadManager: resumableUploadManager,
	}
}

// UploadFile handles file upload requests
func (h *FileHandler) UploadFile(c *gin.Context) {
	// Get the uploaded file
	fileHeader, err := c.FormFile("file")
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE", "No file provided or invalid file", err)
		return
	}

	// Get uploader ID (in production, extract from JWT token)
	uploaderID := c.GetHeader("X-User-ID")
	if uploaderID == "" {
		uploaderID = "anonymous" // Default for demo
	}

	// Parse metadata from form data
	metadata := make(map[string]interface{})
	if tags := c.PostForm("tags"); tags != "" {
		metadata["tags"] = tags
	}
	if description := c.PostForm("description"); description != "" {
		metadata["description"] = description
	}

	// Upload the file
	file, err := h.fileService.UploadFile(c.Request.Context(), fileHeader, uploaderID, metadata)
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "UPLOAD_FAILED", "Failed to upload file", err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    file,
		"message": "File uploaded successfully",
	})
}

// GetFile handles file retrieval requests
func (h *FileHandler) GetFile(c *gin.Context) {
	fileID := c.Param("fileId")
	if fileID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE_ID", "File ID is required", nil)
		return
	}

	// Get user ID (in production, extract from JWT token)
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "anonymous"
	}

	file, err := h.fileService.GetFile(c.Request.Context(), fileID, userID)
	if err != nil {
		if err.Error() == "access denied" {
			h.errorResponse(c, http.StatusForbidden, "ACCESS_DENIED", "Access denied", err)
			return
		}
		h.errorResponse(c, http.StatusNotFound, "FILE_NOT_FOUND", "File not found", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    file,
	})
}

// DeleteFile handles file deletion requests
func (h *FileHandler) DeleteFile(c *gin.Context) {
	fileID := c.Param("fileId")
	if fileID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE_ID", "File ID is required", nil)
		return
	}

	// Get user ID (in production, extract from JWT token)
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		h.errorResponse(c, http.StatusUnauthorized, "UNAUTHORIZED", "User authentication required", nil)
		return
	}

	err := h.fileService.DeleteFile(c.Request.Context(), fileID, userID)
	if err != nil {
		if err.Error() == "access denied" {
			h.errorResponse(c, http.StatusForbidden, "ACCESS_DENIED", "Access denied", err)
			return
		}
		h.errorResponse(c, http.StatusInternalServerError, "DELETE_FAILED", "Failed to delete file", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "File deleted successfully",
	})
}

// DownloadFile handles file download requests
func (h *FileHandler) DownloadFile(c *gin.Context) {
	fileID := c.Param("fileId")
	if fileID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE_ID", "File ID is required", nil)
		return
	}

	// Get user ID (in production, extract from JWT token)
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "anonymous"
	}

	file, err := h.fileService.GetFile(c.Request.Context(), fileID, userID)
	if err != nil {
		if err.Error() == "access denied" {
			h.errorResponse(c, http.StatusForbidden, "ACCESS_DENIED", "Access denied", err)
			return
		}
		h.errorResponse(c, http.StatusNotFound, "FILE_NOT_FOUND", "File not found", err)
		return
	}

	// Generate secure download URL
	downloadURL, err := h.fileService.GenerateDownloadURL(c.Request.Context(), fileID, userID, 1*time.Hour)
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "DOWNLOAD_URL_FAILED", "Failed to generate download URL", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"downloadUrl": downloadURL,
			"file":        file,
		},
	})
}

// ShareFile handles file sharing requests
func (h *FileHandler) ShareFile(c *gin.Context) {
	fileID := c.Param("fileId")
	if fileID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE_ID", "File ID is required", nil)
		return
	}

	// Get user ID (in production, extract from JWT token)
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		h.errorResponse(c, http.StatusUnauthorized, "UNAUTHORIZED", "User authentication required", nil)
		return
	}

	// Parse share options from request body
	var shareOptions map[string]interface{}
	if err := c.ShouldBindJSON(&shareOptions); err != nil {
		// If no body provided, use empty options
		shareOptions = make(map[string]interface{})
	}

	// Share the file
	shareURL, err := h.fileService.ShareFile(c.Request.Context(), fileID, userID, shareOptions)
	if err != nil {
		if err.Error() == "access denied" {
			h.errorResponse(c, http.StatusForbidden, "ACCESS_DENIED", "Access denied", err)
			return
		}
		h.errorResponse(c, http.StatusInternalServerError, "SHARE_FAILED", "Failed to share file", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"fileId":   fileID,
			"shareUrl": shareURL,
		},
		"message": "File shared successfully",
	})
}

// SearchFiles handles file search requests
func (h *FileHandler) SearchFiles(c *gin.Context) {
	var req models.FileSearchRequest

	// Bind query parameters
	if err := c.ShouldBindQuery(&req); err != nil {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_QUERY", "Invalid search parameters", err)
		return
	}

	// Set defaults
	if req.Limit <= 0 {
		req.Limit = 20
	}

	// Get user ID (in production, extract from JWT token)
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "anonymous"
	}

	response, err := h.fileService.SearchFiles(c.Request.Context(), &req, userID)
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "SEARCH_FAILED", "Failed to search files", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    response,
	})
}

// UpdateMetadata handles file metadata update requests
func (h *FileHandler) UpdateMetadata(c *gin.Context) {
	fileID := c.Param("fileId")
	if fileID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE_ID", "File ID is required", nil)
		return
	}

	// Get user ID (in production, extract from JWT token)
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		h.errorResponse(c, http.StatusUnauthorized, "UNAUTHORIZED", "User authentication required", nil)
		return
	}

	// Parse metadata from request body
	var metadata map[string]interface{}
	if err := c.ShouldBindJSON(&metadata); err != nil {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_METADATA", "Invalid metadata format", err)
		return
	}

	file, err := h.fileService.UpdateMetadata(c.Request.Context(), fileID, metadata, userID)
	if err != nil {
		if err.Error() == "access denied" {
			h.errorResponse(c, http.StatusForbidden, "ACCESS_DENIED", "Access denied", err)
			return
		}
		h.errorResponse(c, http.StatusInternalServerError, "UPDATE_FAILED", "Failed to update metadata", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    file,
		"message": "Metadata updated successfully",
	})
}

// Helper method for error responses
func (h *FileHandler) errorResponse(c *gin.Context, statusCode int, code, message string, err error) {
	requestID, _ := c.Get("RequestID")

	errorDetail := models.ErrorDetail{
		Code:      code,
		Message:   message,
		Timestamp: time.Now(),
		RequestID: requestID.(string),
	}

	if err != nil {
		errorDetail.Details = err.Error()
	}

	c.JSON(statusCode, models.ErrorResponse{
		Error: errorDetail,
	})
}

// CreateFileVersion handles file version creation requests
func (h *FileHandler) CreateFileVersion(c *gin.Context) {
	fileID := c.Param("fileId")
	if fileID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE_ID", "File ID is required", nil)
		return
	}

	// Get the uploaded file
	fileHeader, err := c.FormFile("file")
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE", "No file provided or invalid file", err)
		return
	}

	// Get user ID
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		h.errorResponse(c, http.StatusUnauthorized, "UNAUTHORIZED", "User authentication required", nil)
		return
	}

	// Create new version
	newVersion, err := h.fileService.CreateFileVersion(c.Request.Context(), fileID, fileHeader, userID)
	if err != nil {
		if err.Error() == "access denied" {
			h.errorResponse(c, http.StatusForbidden, "ACCESS_DENIED", "Access denied", err)
			return
		}
		h.errorResponse(c, http.StatusInternalServerError, "VERSION_CREATION_FAILED", "Failed to create file version", err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    newVersion,
		"message": "File version created successfully",
	})
}

// GetFileVersions handles file version listing requests
func (h *FileHandler) GetFileVersions(c *gin.Context) {
	fileID := c.Param("fileId")
	if fileID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE_ID", "File ID is required", nil)
		return
	}

	// Get user ID
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "anonymous"
	}

	versions, err := h.fileService.GetFileVersions(c.Request.Context(), fileID, userID)
	if err != nil {
		if err.Error() == "access denied" {
			h.errorResponse(c, http.StatusForbidden, "ACCESS_DENIED", "Access denied", err)
			return
		}
		h.errorResponse(c, http.StatusInternalServerError, "VERSIONS_RETRIEVAL_FAILED", "Failed to retrieve file versions", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    versions,
	})
}

// ValidateFile handles file validation requests
func (h *FileHandler) ValidateFile(c *gin.Context) {
	// Get the uploaded file
	fileHeader, err := c.FormFile("file")
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE", "No file provided or invalid file", err)
		return
	}

	// Validate the file
	validationResult, err := h.fileService.ValidateFileUpload(c.Request.Context(), fileHeader)
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "VALIDATION_FAILED", "Failed to validate file", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    validationResult,
	})
}

// VerifyFileIntegrity handles file integrity verification requests
func (h *FileHandler) VerifyFileIntegrity(c *gin.Context) {
	fileID := c.Param("fileId")
	if fileID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE_ID", "File ID is required", nil)
		return
	}

	// Get user ID
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		userID = "anonymous"
	}

	// Verify integrity
	report, err := h.fileService.VerifyFileIntegrity(c.Request.Context(), fileID, userID)
	if err != nil {
		if err.Error() == "access denied" {
			h.errorResponse(c, http.StatusForbidden, "ACCESS_DENIED", "Access denied", err)
			return
		}
		h.errorResponse(c, http.StatusInternalServerError, "INTEGRITY_CHECK_FAILED", "Failed to verify file integrity", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    report,
	})
}

// QuarantineFile handles file quarantine requests
func (h *FileHandler) QuarantineFile(c *gin.Context) {
	fileID := c.Param("fileId")
	if fileID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_FILE_ID", "File ID is required", nil)
		return
	}

	// Get user ID
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		h.errorResponse(c, http.StatusUnauthorized, "UNAUTHORIZED", "User authentication required", nil)
		return
	}

	// Parse quarantine reason from request body
	var requestBody struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&requestBody); err != nil {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", "Invalid request body", err)
		return
	}

	if requestBody.Reason == "" {
		requestBody.Reason = "Manual quarantine"
	}

	// Quarantine the file
	err := h.fileService.QuarantineFile(c.Request.Context(), fileID, requestBody.Reason, userID)
	if err != nil {
		if err.Error() == "access denied" {
			h.errorResponse(c, http.StatusForbidden, "ACCESS_DENIED", "Access denied", err)
			return
		}
		h.errorResponse(c, http.StatusInternalServerError, "QUARANTINE_FAILED", "Failed to quarantine file", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "File quarantined successfully",
		"data": gin.H{
			"fileId": fileID,
			"reason": requestBody.Reason,
		},
	})
}

// InitiateResumableUpload initiates a new resumable upload session
func (h *FileHandler) InitiateResumableUpload(c *gin.Context) {
	var req struct {
		FileName    string                 `json:"fileName" binding:"required"`
		FileSize    int64                  `json:"fileSize" binding:"required"`
		ContentType string                 `json:"contentType" binding:"required"`
		Metadata    map[string]interface{} `json:"metadata"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_REQUEST", "Invalid request body", err)
		return
	}

	// Get uploader ID
	uploaderID := c.GetHeader("X-User-ID")
	if uploaderID == "" {
		uploaderID = "anonymous"
	}

	// Initiate upload session
	session, err := h.resumableUploadManager.InitiateUpload(
		c.Request.Context(),
		req.FileName,
		req.FileSize,
		req.ContentType,
		uploaderID,
		req.Metadata,
	)
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "INITIATE_UPLOAD_FAILED", "Failed to initiate upload", err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data":    session,
		"message": "Upload session initiated successfully",
	})
}

// UploadChunk uploads a single chunk of a resumable upload
func (h *FileHandler) UploadChunk(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_SESSION_ID", "Session ID is required", nil)
		return
	}

	// Get chunk number from header or form
	chunkNumberStr := c.GetHeader("X-Chunk-Number")
	if chunkNumberStr == "" {
		chunkNumberStr = c.PostForm("chunkNumber")
	}
	if chunkNumberStr == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_CHUNK_NUMBER", "Chunk number is required", nil)
		return
	}

	chunkNumber, err := strconv.Atoi(chunkNumberStr)
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_CHUNK_NUMBER", "Invalid chunk number format", err)
		return
	}

	// Get chunk data from request body
	chunkData := c.Request.Body
	defer chunkData.Close()

	// Get content length
	contentLength := c.Request.ContentLength
	if contentLength <= 0 {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_CHUNK_SIZE", "Chunk size must be greater than 0", nil)
		return
	}

	// Upload chunk
	chunkInfo, err := h.resumableUploadManager.UploadChunk(
		c.Request.Context(),
		sessionID,
		chunkNumber,
		chunkData,
		contentLength,
	)
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "CHUNK_UPLOAD_FAILED", "Failed to upload chunk", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    chunkInfo,
		"message": "Chunk uploaded successfully",
	})
}

// GetUploadProgress returns the current upload progress
func (h *FileHandler) GetUploadProgress(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_SESSION_ID", "Session ID is required", nil)
		return
	}

	progress, err := h.resumableUploadManager.GetUploadProgress(c.Request.Context(), sessionID)
	if err != nil {
		h.errorResponse(c, http.StatusNotFound, "PROGRESS_NOT_FOUND", "Upload progress not found", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    progress,
	})
}

// CompleteResumableUpload completes a resumable upload
func (h *FileHandler) CompleteResumableUpload(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_SESSION_ID", "Session ID is required", nil)
		return
	}

	// Complete the upload
	file, err := h.resumableUploadManager.CompleteUpload(c.Request.Context(), sessionID)
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "COMPLETE_UPLOAD_FAILED", "Failed to complete upload", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    file,
		"message": "Upload completed successfully",
	})
}

// ResumeUpload resumes an interrupted upload
func (h *FileHandler) ResumeUpload(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_SESSION_ID", "Session ID is required", nil)
		return
	}

	session, err := h.resumableUploadManager.ResumeUpload(c.Request.Context(), sessionID)
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "RESUME_UPLOAD_FAILED", "Failed to resume upload", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    session,
		"message": "Upload resumed successfully",
	})
}

// CancelResumableUpload cancels a resumable upload
func (h *FileHandler) CancelResumableUpload(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		h.errorResponse(c, http.StatusBadRequest, "INVALID_SESSION_ID", "Session ID is required", nil)
		return
	}

	err := h.resumableUploadManager.CancelUpload(c.Request.Context(), sessionID)
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "CANCEL_UPLOAD_FAILED", "Failed to cancel upload", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Upload cancelled successfully",
	})
}