package main

import (
	"bytes"
	"crypto/rand"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// Performance test configuration
const (
	SmallFileSize  = 1024        // 1KB
	MediumFileSize = 1024 * 1024 // 1MB
	LargeFileSize  = 10 * 1024 * 1024 // 10MB
	
	ConcurrentRequests = 10
	TotalRequests      = 100
)

// generateRandomData creates random data of specified size
func generateRandomData(size int) []byte {
	data := make([]byte, size)
	rand.Read(data)
	return data
}

// createPerformanceFileUploadRequest creates a multipart form request for performance testing
func createPerformanceFileUploadRequest(filename string, data []byte) (*bytes.Buffer, string) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	
	part, _ := writer.CreateFormFile("file", filename)
	part.Write(data)
	
	writer.WriteField("description", "Performance test file")
	writer.WriteField("tags", "performance,test")
	
	writer.Close()
	
	return body, writer.FormDataContentType()
}

// setupPerformanceRouter creates a test router for performance testing
func setupPerformanceRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	
	// Mock upload handler that simulates processing
	router.POST("/api/v1/files/upload", func(c *gin.Context) {
		// Get the uploaded file
		fileHeader, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
			return
		}

		// Simulate processing time based on file size
		processingTime := time.Duration(fileHeader.Size/1024) * time.Microsecond
		if processingTime > 10*time.Millisecond {
			processingTime = 10 * time.Millisecond
		}
		time.Sleep(processingTime)

		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"data": gin.H{
				"id":       fmt.Sprintf("file-%d", time.Now().UnixNano()),
				"name":     fileHeader.Filename,
				"size":     fileHeader.Size,
				"status":   "uploaded",
			},
		})
	})
	
	// Mock file retrieval handler
	router.GET("/api/v1/files/:fileId", func(c *gin.Context) {
		fileID := c.Param("fileId")
		
		// Simulate database lookup time
		time.Sleep(1 * time.Millisecond)
		
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"id":     fileID,
				"name":   "test-file.txt",
				"size":   1024,
				"status": "uploaded",
			},
		})
	})
	
	// Mock search handler
	router.GET("/api/v1/files/search", func(c *gin.Context) {
		query := c.Query("query")
		limit := c.DefaultQuery("limit", "20")
		
		// Simulate search processing time
		time.Sleep(5 * time.Millisecond)
		
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"files":   []gin.H{},
				"total":   0,
				"query":   query,
				"limit":   limit,
				"hasMore": false,
			},
		})
	})
	
	return router
}

// BenchmarkSmallFileUpload benchmarks uploading small files (1KB)
func BenchmarkSmallFileUpload(b *testing.B) {
	router := setupPerformanceRouter()
	userID := "perf-user-123"
	
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		data := generateRandomData(SmallFileSize)
		body, contentType := createPerformanceFileUploadRequest(fmt.Sprintf("small-file-%d.bin", i), data)
		
		req := httptest.NewRequest("POST", "/api/v1/files/upload", body)
		req.Header.Set("Content-Type", contentType)
		req.Header.Set("X-User-ID", userID)
		
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		
		if w.Code != http.StatusCreated {
			b.Fatalf("Expected status 201, got %d", w.Code)
		}
	}
}

// BenchmarkMediumFileUpload benchmarks uploading medium files (1MB)
func BenchmarkMediumFileUpload(b *testing.B) {
	router := setupPerformanceRouter()
	userID := "perf-user-123"
	
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		data := generateRandomData(MediumFileSize)
		body, contentType := createPerformanceFileUploadRequest(fmt.Sprintf("medium-file-%d.bin", i), data)
		
		req := httptest.NewRequest("POST", "/api/v1/files/upload", body)
		req.Header.Set("Content-Type", contentType)
		req.Header.Set("X-User-ID", userID)
		
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		
		if w.Code != http.StatusCreated {
			b.Fatalf("Expected status 201, got %d", w.Code)
		}
	}
}

// BenchmarkFileRetrieval benchmarks file retrieval operations
func BenchmarkFileRetrieval(b *testing.B) {
	router := setupPerformanceRouter()
	userID := "perf-user-123"
	
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		fileID := fmt.Sprintf("file-%d", i%100)
		
		req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/files/%s", fileID), nil)
		req.Header.Set("X-User-ID", userID)
		
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		
		if w.Code != http.StatusOK {
			b.Fatalf("Expected status 200, got %d", w.Code)
		}
	}
}

// BenchmarkFileSearch benchmarks file search operations
func BenchmarkFileSearch(b *testing.B) {
	router := setupPerformanceRouter()
	userID := "perf-user-123"
	
	b.ResetTimer()
	b.ReportAllocs()
	
	for i := 0; i < b.N; i++ {
		req := httptest.NewRequest("GET", "/api/v1/files/search?query=document&limit=20", nil)
		req.Header.Set("X-User-ID", userID)
		
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		
		if w.Code != http.StatusOK {
			b.Fatalf("Expected status 200, got %d", w.Code)
		}
	}
}

// TestConcurrentUploads tests concurrent file uploads
func TestConcurrentUploads(t *testing.T) {
	router := setupPerformanceRouter()
	userID := "concurrent-user-123"
	
	var wg sync.WaitGroup
	results := make(chan bool, ConcurrentRequests)
	errors := make(chan error, ConcurrentRequests)
	
	startTime := time.Now()
	
	// Launch concurrent uploads
	for i := 0; i < ConcurrentRequests; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			
			data := generateRandomData(SmallFileSize)
			body, contentType := createPerformanceFileUploadRequest(fmt.Sprintf("concurrent-file-%d.bin", index), data)
			
			req := httptest.NewRequest("POST", "/api/v1/files/upload", body)
			req.Header.Set("Content-Type", contentType)
			req.Header.Set("X-User-ID", userID)
			
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			
			if w.Code == http.StatusCreated {
				results <- true
			} else {
				errors <- fmt.Errorf("upload %d failed with status %d", index, w.Code)
			}
		}(i)
	}
	
	wg.Wait()
	close(results)
	close(errors)
	
	duration := time.Since(startTime)
	
	// Count successful uploads
	successCount := 0
	for range results {
		successCount++
	}
	
	// Count errors
	errorCount := 0
	for err := range errors {
		t.Logf("Upload error: %v", err)
		errorCount++
	}
	
	t.Logf("Concurrent uploads completed in %v", duration)
	t.Logf("Successful uploads: %d/%d", successCount, ConcurrentRequests)
	t.Logf("Failed uploads: %d", errorCount)
	t.Logf("Average time per upload: %v", duration/time.Duration(ConcurrentRequests))
	
	assert.Equal(t, ConcurrentRequests, successCount, "All uploads should succeed")
	assert.Equal(t, 0, errorCount, "No uploads should fail")
}

// TestHighVolumeRequests tests handling a large number of requests
func TestHighVolumeRequests(t *testing.T) {
	router := setupPerformanceRouter()
	userID := "volume-user-123"
	
	startTime := time.Now()
	successCount := 0
	errorCount := 0
	
	for i := 0; i < TotalRequests; i++ {
		// Alternate between uploads and retrievals
		if i%2 == 0 {
			// Upload request
			data := generateRandomData(SmallFileSize)
			body, contentType := createPerformanceFileUploadRequest(fmt.Sprintf("volume-file-%d.bin", i), data)
			
			req := httptest.NewRequest("POST", "/api/v1/files/upload", body)
			req.Header.Set("Content-Type", contentType)
			req.Header.Set("X-User-ID", userID)
			
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			
			if w.Code == http.StatusCreated {
				successCount++
			} else {
				errorCount++
			}
		} else {
			// Retrieval request
			fileID := fmt.Sprintf("file-%d", i%50)
			
			req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/files/%s", fileID), nil)
			req.Header.Set("X-User-ID", userID)
			
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			
			if w.Code == http.StatusOK {
				successCount++
			} else {
				errorCount++
			}
		}
		
		// Log progress every 20 requests
		if (i+1)%20 == 0 {
			elapsed := time.Since(startTime)
			rate := float64(i+1) / elapsed.Seconds()
			t.Logf("Progress: %d/%d requests completed (%.2f req/sec)", i+1, TotalRequests, rate)
		}
	}
	
	duration := time.Since(startTime)
	
	t.Logf("High volume requests completed in %v", duration)
	t.Logf("Successful requests: %d/%d", successCount, TotalRequests)
	t.Logf("Failed requests: %d", errorCount)
	t.Logf("Average time per request: %v", duration/time.Duration(TotalRequests))
	t.Logf("Request rate: %.2f req/sec", float64(TotalRequests)/duration.Seconds())
	
	assert.Equal(t, TotalRequests, successCount, "All requests should succeed")
	assert.Equal(t, 0, errorCount, "No requests should fail")
}

// TestThroughput measures upload throughput for different file sizes
func TestThroughput(t *testing.T) {
	router := setupPerformanceRouter()
	userID := "throughput-user-123"
	
	fileSizes := []int{SmallFileSize, MediumFileSize}
	fileNames := []string{"small", "medium"}
	
	for i, size := range fileSizes {
		startTime := time.Now()
		
		data := generateRandomData(size)
		body, contentType := createPerformanceFileUploadRequest(fmt.Sprintf("%s-throughput-test.bin", fileNames[i]), data)
		
		req := httptest.NewRequest("POST", "/api/v1/files/upload", body)
		req.Header.Set("Content-Type", contentType)
		req.Header.Set("X-User-ID", userID)
		
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		
		duration := time.Since(startTime)
		
		assert.Equal(t, http.StatusCreated, w.Code, "Upload should succeed")
		
		throughputMBps := float64(size) / (1024 * 1024) / duration.Seconds()
		
		t.Logf("%s file (%d bytes) uploaded in %v (%.2f MB/s)", 
			fileNames[i], size, duration, throughputMBps)
	}
}

// TestConcurrentReads tests concurrent file read operations
func TestConcurrentReads(t *testing.T) {
	router := setupPerformanceRouter()
	userID := "read-user-123"
	
	var wg sync.WaitGroup
	concurrentReads := 20
	results := make(chan time.Duration, concurrentReads)
	
	startTime := time.Now()
	
	// Launch concurrent reads
	for i := 0; i < concurrentReads; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			
			readStart := time.Now()
			
			fileID := fmt.Sprintf("file-%d", index%10)
			req := httptest.NewRequest("GET", fmt.Sprintf("/api/v1/files/%s", fileID), nil)
			req.Header.Set("X-User-ID", userID)
			
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			
			readDuration := time.Since(readStart)
			
			if w.Code == http.StatusOK {
				results <- readDuration
			} else {
				t.Errorf("Read %d failed with status %d", index, w.Code)
			}
		}(i)
	}
	
	wg.Wait()
	close(results)
	
	totalDuration := time.Since(startTime)
	
	// Calculate statistics
	var totalReadTime time.Duration
	readCount := 0
	var minTime, maxTime time.Duration
	
	for readTime := range results {
		if readCount == 0 {
			minTime = readTime
			maxTime = readTime
		} else {
			if readTime < minTime {
				minTime = readTime
			}
			if readTime > maxTime {
				maxTime = readTime
			}
		}
		totalReadTime += readTime
		readCount++
	}
	
	avgReadTime := totalReadTime / time.Duration(readCount)
	
	t.Logf("Concurrent reads completed in %v", totalDuration)
	t.Logf("Successful reads: %d/%d", readCount, concurrentReads)
	t.Logf("Average read time: %v", avgReadTime)
	t.Logf("Min read time: %v", minTime)
	t.Logf("Max read time: %v", maxTime)
	t.Logf("Read rate: %.2f reads/sec", float64(concurrentReads)/totalDuration.Seconds())
	
	assert.Equal(t, concurrentReads, readCount, "All reads should succeed")
}