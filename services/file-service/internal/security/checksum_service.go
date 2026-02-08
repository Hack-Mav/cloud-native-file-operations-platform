package security

import (
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"fmt"
	"hash"
	"io"
	"mime/multipart"
)

// ChecksumService handles file integrity verification
type ChecksumService struct{}

// NewChecksumService creates a new checksum service
func NewChecksumService() *ChecksumService {
	return &ChecksumService{}
}

// ChecksumType represents different checksum algorithms
type ChecksumType string

const (
	MD5    ChecksumType = "md5"
	SHA1   ChecksumType = "sha1"
	SHA256 ChecksumType = "sha256"
	SHA512 ChecksumType = "sha512"
)

// ChecksumResult represents the result of checksum calculation
type ChecksumResult struct {
	Algorithm ChecksumType `json:"algorithm"`
	Checksum  string       `json:"checksum"`
	FileSize  int64        `json:"fileSize"`
}

// CalculateChecksum calculates checksum for a file using specified algorithm
func (cs *ChecksumService) CalculateChecksum(file multipart.File, algorithm ChecksumType) (*ChecksumResult, error) {
	// Get file size
	fileSize, err := cs.getFileSize(file)
	if err != nil {
		return nil, fmt.Errorf("failed to get file size: %w", err)
	}

	// Reset file pointer to beginning
	_, err = file.Seek(0, io.SeekStart)
	if err != nil {
		return nil, fmt.Errorf("failed to reset file pointer: %w", err)
	}

	// Create appropriate hash function
	var hasher hash.Hash
	switch algorithm {
	case MD5:
		hasher = md5.New()
	case SHA1:
		hasher = sha1.New()
	case SHA256:
		hasher = sha256.New()
	case SHA512:
		hasher = sha512.New()
	default:
		return nil, fmt.Errorf("unsupported checksum algorithm: %s", algorithm)
	}

	// Calculate checksum
	_, err = io.Copy(hasher, file)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate checksum: %w", err)
	}

	// Reset file pointer for subsequent operations
	file.Seek(0, io.SeekStart)

	checksum := fmt.Sprintf("%x", hasher.Sum(nil))

	return &ChecksumResult{
		Algorithm: algorithm,
		Checksum:  checksum,
		FileSize:  fileSize,
	}, nil
}

// VerifyChecksum verifies file integrity against expected checksum
func (cs *ChecksumService) VerifyChecksum(file multipart.File, expectedChecksum string, algorithm ChecksumType) (bool, error) {
	result, err := cs.CalculateChecksum(file, algorithm)
	if err != nil {
		return false, err
	}

	return result.Checksum == expectedChecksum, nil
}

// CalculateMultipleChecksums calculates multiple checksums for a file
func (cs *ChecksumService) CalculateMultipleChecksums(file multipart.File, algorithms []ChecksumType) (map[ChecksumType]*ChecksumResult, error) {
	results := make(map[ChecksumType]*ChecksumResult)

	for _, algorithm := range algorithms {
		result, err := cs.CalculateChecksum(file, algorithm)
		if err != nil {
			return nil, fmt.Errorf("failed to calculate %s checksum: %w", algorithm, err)
		}
		results[algorithm] = result
	}

	return results, nil
}

// DetectFileCorruption compares file checksums to detect corruption
func (cs *ChecksumService) DetectFileCorruption(file multipart.File, storedChecksums map[ChecksumType]string) (*CorruptionReport, error) {
	report := &CorruptionReport{
		IsCorrupted: false,
		Results:     make(map[ChecksumType]bool),
		Details:     make(map[ChecksumType]string),
	}

	for algorithm, expectedChecksum := range storedChecksums {
		isValid, err := cs.VerifyChecksum(file, expectedChecksum, algorithm)
		if err != nil {
			return nil, fmt.Errorf("failed to verify %s checksum: %w", algorithm, err)
		}

		report.Results[algorithm] = isValid
		
		if !isValid {
			report.IsCorrupted = true
			report.Details[algorithm] = fmt.Sprintf("Checksum mismatch for %s", algorithm)
		}
	}

	return report, nil
}

// CorruptionReport represents the result of corruption detection
type CorruptionReport struct {
	IsCorrupted bool                    `json:"isCorrupted"`
	Results     map[ChecksumType]bool   `json:"results"`
	Details     map[ChecksumType]string `json:"details"`
}

// getFileSize gets the size of a multipart file
func (cs *ChecksumService) getFileSize(file multipart.File) (int64, error) {
	// Seek to end to get size
	size, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return 0, err
	}

	// Reset to beginning
	_, err = file.Seek(0, io.SeekStart)
	if err != nil {
		return 0, err
	}

	return size, nil
}

// GenerateFileFingerprint creates a unique fingerprint for a file
func (cs *ChecksumService) GenerateFileFingerprint(file multipart.File) (*FileFingerprint, error) {
	// Calculate multiple checksums
	algorithms := []ChecksumType{SHA256, MD5}
	checksums, err := cs.CalculateMultipleChecksums(file, algorithms)
	if err != nil {
		return nil, err
	}

	// Get file size
	fileSize, err := cs.getFileSize(file)
	if err != nil {
		return nil, err
	}

	fingerprint := &FileFingerprint{
		Size:      fileSize,
		SHA256:    checksums[SHA256].Checksum,
		MD5:       checksums[MD5].Checksum,
		Checksums: checksums,
	}

	return fingerprint, nil
}

// FileFingerprint represents a unique fingerprint of a file
type FileFingerprint struct {
	Size      int64                            `json:"size"`
	SHA256    string                           `json:"sha256"`
	MD5       string                           `json:"md5"`
	Checksums map[ChecksumType]*ChecksumResult `json:"checksums"`
}