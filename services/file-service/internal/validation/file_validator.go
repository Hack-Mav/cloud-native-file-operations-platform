package validation

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"

	"file-service/internal/config"
)

// FileValidator handles file validation operations
type FileValidator struct {
	config *config.Config
}

// NewFileValidator creates a new file validator
func NewFileValidator(config *config.Config) *FileValidator {
	return &FileValidator{
		config: config,
	}
}

// ValidationResult represents the result of file validation
type ValidationResult struct {
	IsValid      bool     `json:"isValid"`
	Errors       []string `json:"errors,omitempty"`
	Warnings     []string `json:"warnings,omitempty"`
	DetectedType string   `json:"detectedType,omitempty"`
	ActualSize   int64    `json:"actualSize"`
}

// ValidateFile performs comprehensive file validation
func (v *FileValidator) ValidateFile(fileHeader *multipart.FileHeader, file multipart.File) (*ValidationResult, error) {
	result := &ValidationResult{
		IsValid:    true,
		Errors:     []string{},
		Warnings:   []string{},
		ActualSize: fileHeader.Size,
	}

	// Validate file size
	if err := v.validateFileSize(fileHeader.Size, result); err != nil {
		return result, err
	}

	// Validate file name
	if err := v.validateFileName(fileHeader.Filename, result); err != nil {
		return result, err
	}

	// Detect and validate content type
	detectedType, err := v.detectContentType(file)
	if err != nil {
		return result, fmt.Errorf("failed to detect content type: %w", err)
	}
	result.DetectedType = detectedType

	// Validate content type
	if err := v.validateContentType(fileHeader, detectedType, result); err != nil {
		return result, err
	}

	// Validate file structure (magic bytes)
	if err := v.validateFileStructure(file, detectedType, result); err != nil {
		return result, err
	}

	// Check for malicious content patterns
	if err := v.scanForMaliciousContent(file, result); err != nil {
		return result, err
	}

	// Reset file pointer for subsequent operations
	file.Seek(0, io.SeekStart)

	return result, nil
}

// validateFileSize checks if file size is within allowed limits
func (v *FileValidator) validateFileSize(size int64, result *ValidationResult) error {
	if size <= 0 {
		result.IsValid = false
		result.Errors = append(result.Errors, "File is empty")
		return nil
	}

	if size > v.config.MaxFileSize {
		result.IsValid = false
		result.Errors = append(result.Errors, fmt.Sprintf("File size %d bytes exceeds maximum allowed size %d bytes", size, v.config.MaxFileSize))
		return nil
	}

	// Warning for large files (80% of max size)
	warningThreshold := int64(float64(v.config.MaxFileSize) * 0.8)
	if size > warningThreshold {
		result.Warnings = append(result.Warnings, fmt.Sprintf("File size %d bytes is approaching the maximum limit", size))
	}

	return nil
}

// validateFileName checks for valid file names and dangerous patterns
func (v *FileValidator) validateFileName(filename string, result *ValidationResult) error {
	if filename == "" {
		result.IsValid = false
		result.Errors = append(result.Errors, "Filename is required")
		return nil
	}

	// Check for dangerous file name patterns
	dangerousPatterns := []string{
		"..", "\\", "/", ":", "*", "?", "\"", "<", ">", "|",
	}

	for _, pattern := range dangerousPatterns {
		if strings.Contains(filename, pattern) {
			result.IsValid = false
			result.Errors = append(result.Errors, fmt.Sprintf("Filename contains dangerous character: %s", pattern))
			return nil
		}
	}

	// Check for executable extensions
	executableExtensions := []string{
		".exe", ".bat", ".cmd", ".com", ".scr", ".pif", ".vbs", ".js", ".jar",
		".sh", ".ps1", ".msi", ".deb", ".rpm", ".dmg", ".app",
	}

	ext := strings.ToLower(filepath.Ext(filename))
	for _, execExt := range executableExtensions {
		if ext == execExt {
			result.IsValid = false
			result.Errors = append(result.Errors, fmt.Sprintf("Executable file type not allowed: %s", ext))
			return nil
		}
	}

	// Check filename length
	if len(filename) > 255 {
		result.IsValid = false
		result.Errors = append(result.Errors, "Filename too long (maximum 255 characters)")
		return nil
	}

	return nil
}

// detectContentType detects the actual content type by reading file headers
func (v *FileValidator) detectContentType(file multipart.File) (string, error) {
	// Read first 512 bytes for content type detection
	buffer := make([]byte, 512)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return "", fmt.Errorf("failed to read file header: %w", err)
	}

	// Reset file pointer
	file.Seek(0, io.SeekStart)

	// Detect content type using Go's built-in detector
	contentType := http.DetectContentType(buffer[:n])

	return contentType, nil
}

// validateContentType ensures the detected type matches allowed types
func (v *FileValidator) validateContentType(fileHeader *multipart.FileHeader, detectedType string, result *ValidationResult) error {
	// Check if detected type is in allowed list
	isAllowed := false
	for _, allowedType := range v.config.AllowedTypes {
		if detectedType == allowedType {
			isAllowed = true
			break
		}
		// Check for wildcard matches (e.g., "image/*")
		if strings.HasSuffix(allowedType, "/*") {
			prefix := strings.TrimSuffix(allowedType, "/*")
			if strings.HasPrefix(detectedType, prefix+"/") {
				isAllowed = true
				break
			}
		}
	}

	if !isAllowed {
		result.IsValid = false
		result.Errors = append(result.Errors, fmt.Sprintf("File type %s is not allowed", detectedType))
		return nil
	}

	// Check if declared content type matches detected type
	declaredType := fileHeader.Header.Get("Content-Type")
	if declaredType != "" && declaredType != detectedType {
		result.Warnings = append(result.Warnings, fmt.Sprintf("Declared content type %s differs from detected type %s", declaredType, detectedType))
	}

	return nil
}

// validateFileStructure validates file structure using magic bytes
func (v *FileValidator) validateFileStructure(file multipart.File, contentType string, result *ValidationResult) error {
	// Read first few bytes to check magic numbers
	buffer := make([]byte, 32)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return fmt.Errorf("failed to read file structure: %w", err)
	}

	// Reset file pointer
	file.Seek(0, io.SeekStart)

	// Check magic bytes for common file types
	magicBytes := buffer[:n]
	
	switch contentType {
	case "image/jpeg":
		if !bytes.HasPrefix(magicBytes, []byte{0xFF, 0xD8, 0xFF}) {
			result.IsValid = false
			result.Errors = append(result.Errors, "Invalid JPEG file structure")
		}
	case "image/png":
		if !bytes.HasPrefix(magicBytes, []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}) {
			result.IsValid = false
			result.Errors = append(result.Errors, "Invalid PNG file structure")
		}
	case "image/gif":
		if !bytes.HasPrefix(magicBytes, []byte("GIF87a")) && !bytes.HasPrefix(magicBytes, []byte("GIF89a")) {
			result.IsValid = false
			result.Errors = append(result.Errors, "Invalid GIF file structure")
		}
	case "application/pdf":
		if !bytes.HasPrefix(magicBytes, []byte("%PDF-")) {
			result.IsValid = false
			result.Errors = append(result.Errors, "Invalid PDF file structure")
		}
	case "application/zip":
		if !bytes.HasPrefix(magicBytes, []byte("PK\x03\x04")) && !bytes.HasPrefix(magicBytes, []byte("PK\x05\x06")) {
			result.IsValid = false
			result.Errors = append(result.Errors, "Invalid ZIP file structure")
		}
	}

	return nil
}

// scanForMaliciousContent performs basic malicious content detection
func (v *FileValidator) scanForMaliciousContent(file multipart.File, result *ValidationResult) error {
	// Read file content for scanning (limit to first 1MB for performance)
	maxScanSize := int64(1024 * 1024) // 1MB
	buffer := make([]byte, maxScanSize)
	
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return fmt.Errorf("failed to read file for scanning: %w", err)
	}

	// Reset file pointer
	file.Seek(0, io.SeekStart)

	content := string(buffer[:n])

	// Check for suspicious patterns
	suspiciousPatterns := []string{
		"<script", "javascript:", "vbscript:", "onload=", "onerror=",
		"eval(", "document.write", "innerHTML", "document.cookie",
		"<?php", "<%", "<%=", "<%@",
		"cmd.exe", "powershell", "/bin/sh", "/bin/bash",
		"DROP TABLE", "DELETE FROM", "INSERT INTO", "UPDATE SET",
	}

	for _, pattern := range suspiciousPatterns {
		if strings.Contains(strings.ToLower(content), strings.ToLower(pattern)) {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Potentially suspicious content detected: %s", pattern))
		}
	}

	// Check for embedded executables in non-executable files
	executableSignatures := [][]byte{
		{0x4D, 0x5A}, // PE executable (Windows)
		{0x7F, 0x45, 0x4C, 0x46}, // ELF executable (Linux)
		{0xCF, 0xFA, 0xED, 0xFE}, // Mach-O executable (macOS)
	}

	for _, signature := range executableSignatures {
		if bytes.Contains(buffer[:n], signature) {
			result.Warnings = append(result.Warnings, "Embedded executable detected")
			break
		}
	}

	return nil
}

// ValidateChecksum validates file integrity using checksum
func (v *FileValidator) ValidateChecksum(file multipart.File, expectedChecksum string) (bool, error) {
	if expectedChecksum == "" {
		return true, nil // No checksum to validate
	}

	// Calculate actual checksum
	actualChecksum, err := v.calculateChecksum(file)
	if err != nil {
		return false, fmt.Errorf("failed to calculate checksum: %w", err)
	}

	// Reset file pointer
	file.Seek(0, io.SeekStart)

	return actualChecksum == expectedChecksum, nil
}

// calculateChecksum calculates SHA-256 checksum of the file
func (v *FileValidator) calculateChecksum(file multipart.File) (string, error) {
	// This is a placeholder - in the actual implementation,
	// you would use crypto/sha256 to calculate the checksum
	// For now, return a dummy checksum
	return "dummy_checksum", nil
}