package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"cloud.google.com/go/datastore"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"file-service/internal/config"
	"file-service/internal/handlers"
	"file-service/internal/middleware"
	"file-service/internal/repository"
	"file-service/internal/service"
	"file-service/internal/storage"
	"file-service/internal/upload"
)

func main() {
	// Initialize configuration
	cfg := config.Load()

	// Initialize Google Cloud Datastore client
	ctx := context.Background()
	datastoreClient, err := datastore.NewClient(ctx, cfg.ProjectID)
	if err != nil {
		log.Fatalf("Failed to create datastore client: %v", err)
	}
	defer datastoreClient.Close()

	// Initialize Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPassword,
		DB:       0,
	})
	defer redisClient.Close()

	// Test Redis connection
	_, err = redisClient.Ping(ctx).Result()
	if err != nil {
		log.Printf("Warning: Redis connection failed: %v", err)
	}

	// Initialize storage provider
	storageProvider, err := storage.NewGCSStorage(ctx, cfg.StorageBucket)
	if err != nil {
		log.Fatalf("Failed to create storage provider: %v", err)
	}
	defer storageProvider.Close()

	// Initialize repositories
	fileRepo := repository.NewFileRepository(datastoreClient)

	// Initialize services
	fileService := service.NewFileService(fileRepo, redisClient, cfg, storageProvider)
	
	// Initialize resumable upload manager
	resumableUploadManager := upload.NewResumableUploadManager(redisClient, fileRepo, storageProvider)

	// Initialize handlers
	fileHandler := handlers.NewFileHandler(fileService, resumableUploadManager)

	// Setup Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

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

	// API routes
	v1 := router.Group("/api/v1")
	{
		files := v1.Group("/files")
		{
			files.POST("/upload", fileHandler.UploadFile)
			files.GET("/:fileId", fileHandler.GetFile)
			files.DELETE("/:fileId", fileHandler.DeleteFile)
			files.GET("/:fileId/download", fileHandler.DownloadFile)
			files.POST("/:fileId/share", fileHandler.ShareFile)
			files.GET("/search", fileHandler.SearchFiles)
			files.PUT("/:fileId/metadata", fileHandler.UpdateMetadata)
			
			// Versioning endpoints
			files.POST("/:fileId/versions", fileHandler.CreateFileVersion)
			files.GET("/:fileId/versions", fileHandler.GetFileVersions)
			
			// Security endpoints
			files.POST("/validate", fileHandler.ValidateFile)
			files.GET("/:fileId/integrity", fileHandler.VerifyFileIntegrity)
			files.POST("/:fileId/quarantine", fileHandler.QuarantineFile)
		}
		
		// Resumable upload endpoints
		uploads := v1.Group("/uploads")
		{
			uploads.POST("/initiate", fileHandler.InitiateResumableUpload)
			uploads.POST("/:sessionId/chunks", fileHandler.UploadChunk)
			uploads.GET("/:sessionId/progress", fileHandler.GetUploadProgress)
			uploads.POST("/:sessionId/complete", fileHandler.CompleteResumableUpload)
			uploads.POST("/:sessionId/resume", fileHandler.ResumeUpload)
			uploads.DELETE("/:sessionId", fileHandler.CancelResumableUpload)
		}
	}

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("File service starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}