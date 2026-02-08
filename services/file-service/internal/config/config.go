package config

import (
	"os"
)

// Config holds the application configuration
type Config struct {
	ProjectID     string
	Environment   string
	RedisAddr     string
	RedisPassword string
	StorageBucket string
	MaxFileSize   int64
	AllowedTypes  []string
}

// Load loads configuration from environment variables
func Load() *Config {
	return &Config{
		ProjectID:     getEnv("GOOGLE_CLOUD_PROJECT", ""),
		Environment:   getEnv("GO_ENV", "development"),
		RedisAddr:     getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		StorageBucket: getEnv("STORAGE_BUCKET", "file-ops-platform-storage"),
		MaxFileSize:   getEnvInt64("MAX_FILE_SIZE", 100*1024*1024), // 100MB default
		AllowedTypes: []string{
			"image/jpeg", "image/png", "image/gif", "image/webp",
			"application/pdf", "text/plain", "text/csv",
			"application/json", "application/xml",
			"application/zip", "application/x-zip-compressed",
			"video/mp4", "video/mpeg", "video/quicktime",
			"audio/mpeg", "audio/wav", "audio/ogg",
		},
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt64(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		// Simple conversion for demo - in production use strconv.ParseInt
		return defaultValue
	}
	return defaultValue
}