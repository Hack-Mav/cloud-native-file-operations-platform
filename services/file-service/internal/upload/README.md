# Resumable Upload Implementation

This package implements resumable file upload functionality with chunked upload support, progress tracking, and failure recovery capabilities.

## Features

- **Chunked Upload**: Files are split into 5MB chunks for efficient upload
- **Progress Tracking**: Real-time upload progress monitoring
- **Resume Capability**: Interrupted uploads can be resumed from where they left off
- **Failure Recovery**: Automatic retry and recovery mechanisms
- **Session Management**: Upload sessions with expiration and cleanup
- **Integrity Verification**: SHA-256 checksums for each chunk

## API Endpoints

### 1. Initiate Upload
```
POST /api/v1/uploads/initiate
```

Request body:
```json
{
  "fileName": "large-file.zip",
  "fileSize": 104857600,
  "contentType": "application/zip",
  "metadata": {
    "description": "Large file upload",
    "tags": ["backup", "archive"]
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "session-uuid",
    "fileId": "file-uuid",
    "fileName": "large-file.zip",
    "fileSize": 104857600,
    "chunkSize": 5242880,
    "totalChunks": 20,
    "status": "initiated",
    "expiresAt": "2024-01-01T12:00:00Z"
  }
}
```

### 2. Upload Chunk
```
POST /api/v1/uploads/{sessionId}/chunks
```

Headers:
- `X-Chunk-Number: 0` (chunk index starting from 0)
- `Content-Type: application/octet-stream`

Body: Raw chunk data (binary)

Response:
```json
{
  "success": true,
  "data": {
    "chunkNumber": 0,
    "size": 5242880,
    "checksum": "sha256-hash",
    "storageKey": "uploads/file-id/chunks/0",
    "uploadedAt": "2024-01-01T12:00:00Z"
  }
}
```

### 3. Get Upload Progress
```
GET /api/v1/uploads/{sessionId}/progress
```

Response:
```json
{
  "success": true,
  "data": {
    "sessionId": "session-uuid",
    "fileId": "file-uuid",
    "fileName": "large-file.zip",
    "totalSize": 104857600,
    "uploadedBytes": 52428800,
    "percentComplete": 50.0,
    "chunksUploaded": 10,
    "totalChunks": 20,
    "status": "uploading",
    "estimatedTimeRemaining": "00:05:30"
  }
}
```

### 4. Complete Upload
```
POST /api/v1/uploads/{sessionId}/complete
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "file-uuid",
    "name": "large-file.zip",
    "size": 104857600,
    "contentType": "application/zip",
    "status": "uploaded",
    "uploadedAt": "2024-01-01T12:00:00Z",
    "checksum": "final-file-checksum"
  }
}
```

### 5. Resume Upload
```
POST /api/v1/uploads/{sessionId}/resume
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "session-uuid",
    "status": "active",
    "uploadedBytes": 26214400,
    "nextChunkNumber": 5
  }
}
```

### 6. Cancel Upload
```
DELETE /api/v1/uploads/{sessionId}
```

Response:
```json
{
  "success": true,
  "message": "Upload cancelled successfully"
}
```

## Usage Example

### JavaScript Client Example

```javascript
class ResumableUploader {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.chunkSize = 5 * 1024 * 1024; // 5MB
  }

  async uploadFile(file, metadata = {}) {
    // 1. Initiate upload
    const session = await this.initiateUpload(file, metadata);
    
    // 2. Upload chunks
    const totalChunks = Math.ceil(file.size / this.chunkSize);
    
    for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
      const start = chunkNumber * this.chunkSize;
      const end = Math.min(start + this.chunkSize, file.size);
      const chunk = file.slice(start, end);
      
      await this.uploadChunk(session.id, chunkNumber, chunk);
      
      // Update progress
      const progress = await this.getProgress(session.id);
      this.onProgress(progress);
    }
    
    // 3. Complete upload
    const completedFile = await this.completeUpload(session.id);
    return completedFile;
  }

  async initiateUpload(file, metadata) {
    const response = await fetch(`${this.baseUrl}/api/v1/uploads/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        metadata
      })
    });
    
    const result = await response.json();
    return result.data;
  }

  async uploadChunk(sessionId, chunkNumber, chunk) {
    const response = await fetch(`${this.baseUrl}/api/v1/uploads/${sessionId}/chunks`, {
      method: 'POST',
      headers: {
        'X-Chunk-Number': chunkNumber.toString(),
        'Content-Type': 'application/octet-stream'
      },
      body: chunk
    });
    
    const result = await response.json();
    return result.data;
  }

  async getProgress(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/v1/uploads/${sessionId}/progress`);
    const result = await response.json();
    return result.data;
  }

  async completeUpload(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/v1/uploads/${sessionId}/complete`, {
      method: 'POST'
    });
    
    const result = await response.json();
    return result.data;
  }

  async resumeUpload(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/v1/uploads/${sessionId}/resume`, {
      method: 'POST'
    });
    
    const result = await response.json();
    return result.data;
  }

  onProgress(progress) {
    console.log(`Upload progress: ${progress.percentComplete}%`);
  }
}

// Usage
const uploader = new ResumableUploader('https://api.example.com');
const fileInput = document.getElementById('file-input');

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (file) {
    try {
      const uploadedFile = await uploader.uploadFile(file, {
        description: 'User uploaded file',
        category: 'documents'
      });
      console.log('Upload completed:', uploadedFile);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }
});
```

## Implementation Details

### Chunk Management
- Files are split into 5MB chunks by default
- Each chunk is uploaded independently to cloud storage
- Chunk metadata is stored in Redis for quick access
- Chunks are combined into the final file upon completion

### Session Management
- Upload sessions expire after 24 hours
- Session state is stored in Redis with automatic cleanup
- Sessions can be resumed if interrupted

### Error Handling
- Automatic retry with exponential backoff
- Failed chunks can be re-uploaded individually
- Comprehensive error reporting and logging

### Security
- SHA-256 checksums for integrity verification
- Access control based on user permissions
- Secure temporary storage for chunks

### Performance
- Parallel chunk uploads (client-side)
- Efficient memory usage with streaming
- Redis caching for fast metadata access
- CDN integration for chunk storage

## Configuration

The resumable upload manager can be configured with:

```go
manager := upload.NewResumableUploadManager(
    redisClient,     // Redis client for session storage
    fileRepo,        // File repository for metadata
    storageProvider, // Cloud storage provider
)

// Default chunk size is 5MB, can be customized
manager.SetChunkSize(10 * 1024 * 1024) // 10MB chunks
```

## Monitoring and Observability

The implementation includes:
- Detailed logging for all operations
- Metrics for upload success/failure rates
- Progress tracking with time estimates
- Error categorization and reporting