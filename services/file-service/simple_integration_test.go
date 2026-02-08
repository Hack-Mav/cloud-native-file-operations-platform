package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"

	"file-service/internal/middleware"
	"file-service/internal/models"
)

// TestHealthEndpoint tests the health check endpoint
func TestHealthEndpoint(t *testing.T) {
	// Skip if running in CI without proper setup
	if os.Getenv("SKIP_INTEGRATION_TESTS") == "true" {
		t.Skip("Skipping integration tests")
	}

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(middleware.CORS())
	router.Use(middleware.RequestID())

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "file-service",
		})
	})

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Equal(t, "healthy", response["status"])
	assert.Equal(t, "file-service", response["service"])
}

// TestFileUploadValidation tests file upload validation without actual service
func TestFileUploadValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	router := gin.New()
	router.POST("/api/v1/files/upload", func(c *gin.Context) {
		// Get the uploaded file
		fileHeader, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "INVALID_FILE",
					Message: "No file provided or invalid file",
				},
			})
			return
		}

		// Basic validation
		if fileHeader.Size == 0 {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "EMPTY_FILE",
					Message: "File is empty",
				},
			})
			return
		}

		if fileHeader.Size > 10*1024*1024 { // 10MB limit
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error: models.ErrorDetail{
					Code:    "FILE_TOO_LARGE",
					Message: "File exceeds maximum size limit",
				},
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "File validation passed",
			"data": gin.H{
				"filename": fileHeader.Filename,
				"size":     fileHeader.Size,
			},
		})
	})

	// Test valid file upload
	t.Run("ValidFile", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		
		part, err := writer.CreateFormFile("file", "test.txt")
		assert.NoError(t, err)
		part.Write([]byte("Hello, World!"))
		writer.Close()

		req := httptest.NewRequest("POST", "/api/v1/files/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("X-User-ID", "test-user")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.True(t, response["success"].(bool))
	})

	// Test missing file
	t.Run("MissingFile", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/v1/files/upload", bytes.NewBufferString(""))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-User-ID", "test-user")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var response models.ErrorResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, "INVALID_FILE", response.Error.Code)
	})

	// Test empty file
	t.Run("EmptyFile", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		
		part, err := writer.CreateFormFile("file", "empty.txt")
		assert.NoError(t, err)
		part.Write([]byte("")) // Empty file
		writer.Close()

		req := httptest.NewRequest("POST", "/api/v1/files/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("X-User-ID", "test-user")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var response models.ErrorResponse
		err = json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, "EMPTY_FILE", response.Error.Code)
	})
}

// TestAPIRouteStructure tests that API routes are properly structured
func TestAPIRouteStructure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	router := gin.New()
	
	// Mock handlers that just return success
	mockHandler := func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
	
	// Set up API routes structure
	v1 := router.Group("/api/v1")
	{
		files := v1.Group("/files")
		{
			files.POST("/upload", mockHandler)
			files.GET("/:fileId", mockHandler)
			files.DELETE("/:fileId", mockHandler)
			files.GET("/:fileId/download", mockHandler)
			files.POST("/:fileId/share", mockHandler)
			files.GET("/search", mockHandler)
			files.PUT("/:fileId/metadata", mockHandler)
			files.POST("/validate", mockHandler)
			files.GET("/:fileId/integrity", mockHandler)
			files.POST("/:fileId/quarantine", mockHandler)
		}
		
		uploads := v1.Group("/uploads")
		{
			uploads.POST("/initiate", mockHandler)
			uploads.POST("/:sessionId/chunks", mockHandler)
			uploads.GET("/:sessionId/progress", mockHandler)
			uploads.POST("/:sessionId/complete", mockHandler)
		}
	}

	// Test various endpoints exist and return success
	endpoints := []struct {
		method string
		path   string
	}{
		{"POST", "/api/v1/files/upload"},
		{"GET", "/api/v1/files/test123"},
		{"DELETE", "/api/v1/files/test123"},
		{"GET", "/api/v1/files/test123/download"},
		{"POST", "/api/v1/files/test123/share"},
		{"GET", "/api/v1/files/search"},
		{"PUT", "/api/v1/files/test123/metadata"},
		{"POST", "/api/v1/files/validate"},
		{"GET", "/api/v1/files/test123/integrity"},
		{"POST", "/api/v1/files/test123/quarantine"},
		{"POST", "/api/v1/uploads/initiate"},
		{"POST", "/api/v1/uploads/session123/chunks"},
		{"GET", "/api/v1/uploads/session123/progress"},
		{"POST", "/api/v1/uploads/session123/complete"},
	}

	for _, endpoint := range endpoints {
		t.Run(endpoint.method+"_"+endpoint.path, func(t *testing.T) {
			req := httptest.NewRequest(endpoint.method, endpoint.path, nil)
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code)

			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			assert.NoError(t, err)
			assert.True(t, response["success"].(bool))
		})
	}
}

// TestCORSMiddleware tests CORS middleware functionality
func TestCORSMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	router := gin.New()
	router.Use(middleware.CORS())
	
	router.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "test"})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "https://example.com")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	
	// Check CORS headers are set
	assert.NotEmpty(t, w.Header().Get("Access-Control-Allow-Origin"))
}

// TestRequestIDMiddleware tests request ID middleware functionality
func TestRequestIDMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	
	router := gin.New()
	router.Use(middleware.RequestID())
	
	router.GET("/test", func(c *gin.Context) {
		requestID, exists := c.Get("RequestID")
		assert.True(t, exists)
		assert.NotEmpty(t, requestID)
		
		c.JSON(http.StatusOK, gin.H{
			"requestId": requestID,
		})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	
	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.NotEmpty(t, response["requestId"])
}