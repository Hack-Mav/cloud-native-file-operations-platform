import { Request, Response, NextFunction } from 'express';

interface VersionConfig {
  defaultVersion: string;
  supportedVersions: string[];
  deprecatedVersions: string[];
  headerName: string;
  queryParamName: string;
}

declare global {
  namespace Express {
    interface Request {
      apiVersion: string;
    }
  }
}

const versionConfig: VersionConfig = {
  defaultVersion: process.env.DEFAULT_API_VERSION || 'v1',
  supportedVersions: (process.env.SUPPORTED_API_VERSIONS || 'v1,v2').split(','),
  deprecatedVersions: (process.env.DEPRECATED_API_VERSIONS || '').split(',').filter(v => v),
  headerName: 'X-API-Version',
  queryParamName: 'version'
};

export function apiVersioning(req: Request, res: Response, next: NextFunction): void {
  // Extract version from various sources (in order of priority)
  let version = extractVersionFromPath(req.path) ||
                req.headers[versionConfig.headerName.toLowerCase()] as string ||
                req.query[versionConfig.queryParamName] as string ||
                versionConfig.defaultVersion;

  // Normalize version format
  version = normalizeVersion(version);

  // Validate version
  if (!versionConfig.supportedVersions.includes(version)) {
    return res.status(400).json({
      error: {
        code: 'UNSUPPORTED_API_VERSION',
        message: `API version '${version}' is not supported`,
        supportedVersions: versionConfig.supportedVersions,
        timestamp: new Date().toISOString(),
        requestId: req.correlationId
      }
    });
  }

  // Check for deprecated versions
  if (versionConfig.deprecatedVersions.includes(version)) {
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecation-Date', getDeprecationDate(version));
    res.setHeader('X-API-Sunset-Date', getSunsetDate(version));
    
    // Add deprecation warning to response
    res.setHeader('Warning', `299 - "API version ${version} is deprecated. Please upgrade to the latest version."`);
  }

  // Set version in request object
  req.apiVersion = version;

  // Add version headers to response
  res.setHeader('X-API-Version', version);
  res.setHeader('X-API-Supported-Versions', versionConfig.supportedVersions.join(', '));

  // Modify the request path to include version for downstream services
  if (!req.path.includes(`/${version}/`)) {
    req.url = req.url.replace(/^\/api\//, `/api/${version}/`);
  }

  next();
}

function extractVersionFromPath(path: string): string | null {
  // Extract version from path like /api/v1/users or /v2/files
  const versionMatch = path.match(/\/v(\d+(?:\.\d+)?)\//);
  return versionMatch ? `v${versionMatch[1]}` : null;
}

function normalizeVersion(version: string): string {
  // Ensure version starts with 'v'
  if (!version.startsWith('v')) {
    version = `v${version}`;
  }
  
  // Handle semantic versioning (e.g., v1.0 -> v1)
  const majorVersion = version.match(/v(\d+)/);
  return majorVersion ? `v${majorVersion[1]}` : version;
}

function getDeprecationDate(version: string): string {
  // In a real implementation, this would come from a configuration or database
  const deprecationDates: Record<string, string> = {
    'v1': '2024-01-01T00:00:00Z'
  };
  
  return deprecationDates[version] || new Date().toISOString();
}

function getSunsetDate(version: string): string {
  // In a real implementation, this would come from a configuration or database
  const sunsetDates: Record<string, string> = {
    'v1': '2024-06-01T00:00:00Z'
  };
  
  return sunsetDates[version] || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
}

// Middleware to handle version-specific routing
export function versionRouter(versionHandlers: Record<string, (req: Request, res: Response, next: NextFunction) => void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const version = req.apiVersion;
    const handler = versionHandlers[version];
    
    if (!handler) {
      return res.status(501).json({
        error: {
          code: 'VERSION_NOT_IMPLEMENTED',
          message: `API version '${version}' is not implemented for this endpoint`,
          timestamp: new Date().toISOString(),
          requestId: req.correlationId
        }
      });
    }
    
    handler(req, res, next);
  };
}

// Middleware to handle version-specific transformations
export function versionTransform(transformers: Record<string, (data: any) => any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const version = req.apiVersion;
    const transformer = transformers[version];
    
    if (transformer) {
      // Override res.json to apply transformation
      const originalJson = res.json;
      res.json = function(data: any) {
        const transformedData = transformer(data);
        return originalJson.call(this, transformedData);
      };
    }
    
    next();
  };
}

// Get version configuration
export function getVersionConfig(): VersionConfig {
  return { ...versionConfig };
}

// Update version configuration (for dynamic updates)
export function updateVersionConfig(updates: Partial<VersionConfig>): void {
  Object.assign(versionConfig, updates);
}