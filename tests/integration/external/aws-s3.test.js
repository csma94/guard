const AWS = require('aws-sdk');
const config = require('../../../src/config/config');
const crypto = require('crypto');

describe('AWS S3 Integration Tests', () => {
  let s3Client;
  const testBucket = config.AWS_S3_BUCKET || process.env.TEST_S3_BUCKET;

  beforeAll(() => {
    // Skip tests if AWS credentials are not configured
    if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY || !testBucket) {
      console.log('Skipping AWS S3 tests - credentials or bucket not configured');
      return;
    }

    s3Client = new AWS.S3({
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      region: config.AWS_REGION || 'us-east-1',
    });
  });

  describe('Credentials and Bucket Validation', () => {
    it('should validate AWS credentials', async () => {
      if (!s3Client) {
        pending('AWS S3 not configured');
        return;
      }

      try {
        // Test credentials by listing buckets
        const result = await s3Client.listBuckets().promise();
        
        expect(result).toBeDefined();
        expect(result.Buckets).toBeDefined();
        expect(Array.isArray(result.Buckets)).toBe(true);
      } catch (error) {
        fail(`AWS credentials validation failed: ${error.message}`);
      }
    }, 10000);

    it('should validate bucket access', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      try {
        // Test bucket access by checking if it exists
        await s3Client.headBucket({ Bucket: testBucket }).promise();
      } catch (error) {
        if (error.statusCode === 404) {
          fail(`Test bucket '${testBucket}' does not exist`);
        } else if (error.statusCode === 403) {
          fail(`Access denied to bucket '${testBucket}'`);
        } else {
          fail(`Bucket validation failed: ${error.message}`);
        }
      }
    }, 10000);

    it('should validate bucket permissions', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      try {
        // Test read permission
        await s3Client.listObjectsV2({ 
          Bucket: testBucket, 
          MaxKeys: 1 
        }).promise();
        
        // Test write permission with a small test object
        const testKey = `test-permissions-${Date.now()}.txt`;
        await s3Client.putObject({
          Bucket: testBucket,
          Key: testKey,
          Body: 'Permission test',
          ContentType: 'text/plain',
        }).promise();
        
        // Clean up test object
        await s3Client.deleteObject({
          Bucket: testBucket,
          Key: testKey,
        }).promise();
      } catch (error) {
        fail(`Bucket permissions validation failed: ${error.message}`);
      }
    }, 15000);
  });

  describe('File Upload Functionality', () => {
    const testFiles = [];

    afterEach(async () => {
      // Clean up test files
      if (s3Client && testBucket) {
        for (const key of testFiles) {
          try {
            await s3Client.deleteObject({
              Bucket: testBucket,
              Key: key,
            }).promise();
          } catch (error) {
            console.warn(`Failed to clean up test file ${key}:`, error.message);
          }
        }
        testFiles.length = 0;
      }
    });

    it('should upload text file', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      const testKey = `test-upload-${Date.now()}.txt`;
      const testContent = 'This is a test file for S3 integration testing.';
      
      testFiles.push(testKey);

      try {
        const result = await s3Client.putObject({
          Bucket: testBucket,
          Key: testKey,
          Body: testContent,
          ContentType: 'text/plain',
          Metadata: {
            'test-type': 'integration-test',
            'uploaded-by': 'jest',
          },
        }).promise();

        expect(result).toBeDefined();
        expect(result.ETag).toBeDefined();
        expect(result.ETag.length).toBeGreaterThan(0);
      } catch (error) {
        fail(`File upload failed: ${error.message}`);
      }
    }, 15000);

    it('should upload binary file', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      const testKey = `test-binary-${Date.now()}.bin`;
      const testBuffer = crypto.randomBytes(1024); // 1KB random data
      
      testFiles.push(testKey);

      try {
        const result = await s3Client.putObject({
          Bucket: testBucket,
          Key: testKey,
          Body: testBuffer,
          ContentType: 'application/octet-stream',
        }).promise();

        expect(result).toBeDefined();
        expect(result.ETag).toBeDefined();
      } catch (error) {
        fail(`Binary file upload failed: ${error.message}`);
      }
    }, 15000);

    it('should upload large file', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      const testKey = `test-large-${Date.now()}.dat`;
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024, 'A'); // 5MB file
      
      testFiles.push(testKey);

      try {
        const result = await s3Client.upload({
          Bucket: testBucket,
          Key: testKey,
          Body: largeBuffer,
          ContentType: 'application/octet-stream',
        }).promise();

        expect(result).toBeDefined();
        expect(result.ETag).toBeDefined();
        expect(result.Location).toBeDefined();
      } catch (error) {
        fail(`Large file upload failed: ${error.message}`);
      }
    }, 30000);
  });

  describe('File Download Functionality', () => {
    let testKey;
    const testContent = 'Download test content';

    beforeAll(async () => {
      if (!s3Client || !testBucket) {
        return;
      }

      // Upload a test file for download tests
      testKey = `test-download-${Date.now()}.txt`;
      
      try {
        await s3Client.putObject({
          Bucket: testBucket,
          Key: testKey,
          Body: testContent,
          ContentType: 'text/plain',
        }).promise();
      } catch (error) {
        console.warn('Failed to setup download test file:', error.message);
      }
    });

    afterAll(async () => {
      if (s3Client && testBucket && testKey) {
        try {
          await s3Client.deleteObject({
            Bucket: testBucket,
            Key: testKey,
          }).promise();
        } catch (error) {
          console.warn('Failed to clean up download test file:', error.message);
        }
      }
    });

    it('should download file', async () => {
      if (!s3Client || !testBucket || !testKey) {
        pending('AWS S3 not configured or test file not available');
        return;
      }

      try {
        const result = await s3Client.getObject({
          Bucket: testBucket,
          Key: testKey,
        }).promise();

        expect(result).toBeDefined();
        expect(result.Body).toBeDefined();
        expect(result.Body.toString()).toBe(testContent);
        expect(result.ContentType).toBe('text/plain');
      } catch (error) {
        fail(`File download failed: ${error.message}`);
      }
    }, 10000);

    it('should handle non-existent file gracefully', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      try {
        await s3Client.getObject({
          Bucket: testBucket,
          Key: 'non-existent-file.txt',
        }).promise();
        
        fail('Should have thrown an error for non-existent file');
      } catch (error) {
        expect(error.statusCode).toBe(404);
        expect(error.code).toBe('NoSuchKey');
      }
    }, 10000);
  });

  describe('File Management Operations', () => {
    let testKey;

    beforeEach(async () => {
      if (!s3Client || !testBucket) {
        return;
      }

      // Upload a test file for management tests
      testKey = `test-management-${Date.now()}.txt`;
      
      try {
        await s3Client.putObject({
          Bucket: testBucket,
          Key: testKey,
          Body: 'Management test content',
          ContentType: 'text/plain',
        }).promise();
      } catch (error) {
        console.warn('Failed to setup management test file:', error.message);
      }
    });

    afterEach(async () => {
      if (s3Client && testBucket && testKey) {
        try {
          await s3Client.deleteObject({
            Bucket: testBucket,
            Key: testKey,
          }).promise();
        } catch (error) {
          // File might already be deleted in test
        }
      }
    });

    it('should list objects', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      try {
        const result = await s3Client.listObjectsV2({
          Bucket: testBucket,
          MaxKeys: 10,
        }).promise();

        expect(result).toBeDefined();
        expect(result.Contents).toBeDefined();
        expect(Array.isArray(result.Contents)).toBe(true);
      } catch (error) {
        fail(`List objects failed: ${error.message}`);
      }
    }, 10000);

    it('should get object metadata', async () => {
      if (!s3Client || !testBucket || !testKey) {
        pending('AWS S3 not configured or test file not available');
        return;
      }

      try {
        const result = await s3Client.headObject({
          Bucket: testBucket,
          Key: testKey,
        }).promise();

        expect(result).toBeDefined();
        expect(result.ContentLength).toBeDefined();
        expect(result.LastModified).toBeDefined();
        expect(result.ETag).toBeDefined();
      } catch (error) {
        fail(`Get object metadata failed: ${error.message}`);
      }
    }, 10000);

    it('should delete object', async () => {
      if (!s3Client || !testBucket || !testKey) {
        pending('AWS S3 not configured or test file not available');
        return;
      }

      try {
        const result = await s3Client.deleteObject({
          Bucket: testBucket,
          Key: testKey,
        }).promise();

        expect(result).toBeDefined();
        
        // Verify file is deleted
        try {
          await s3Client.headObject({
            Bucket: testBucket,
            Key: testKey,
          }).promise();
          
          fail('File should have been deleted');
        } catch (error) {
          expect(error.statusCode).toBe(404);
        }
        
        // Clear testKey so afterEach doesn't try to delete again
        testKey = null;
      } catch (error) {
        fail(`Delete object failed: ${error.message}`);
      }
    }, 10000);
  });

  describe('Signed URL Generation', () => {
    it('should generate signed URL for upload', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      try {
        const testKey = `test-signed-upload-${Date.now()}.txt`;
        
        const signedUrl = s3Client.getSignedUrl('putObject', {
          Bucket: testBucket,
          Key: testKey,
          ContentType: 'text/plain',
          Expires: 3600, // 1 hour
        });

        expect(signedUrl).toBeDefined();
        expect(typeof signedUrl).toBe('string');
        expect(signedUrl).toContain(testBucket);
        expect(signedUrl).toContain(testKey);
        expect(signedUrl).toContain('Signature=');
      } catch (error) {
        fail(`Signed URL generation failed: ${error.message}`);
      }
    });

    it('should generate signed URL for download', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      try {
        const testKey = `test-signed-download-${Date.now()}.txt`;
        
        const signedUrl = s3Client.getSignedUrl('getObject', {
          Bucket: testBucket,
          Key: testKey,
          Expires: 3600, // 1 hour
        });

        expect(signedUrl).toBeDefined();
        expect(typeof signedUrl).toBe('string');
        expect(signedUrl).toContain(testBucket);
        expect(signedUrl).toContain(testKey);
      } catch (error) {
        fail(`Signed URL generation failed: ${error.message}`);
      }
    });
  });

  describe('Service Health Check', () => {
    it('should check S3 service availability', async () => {
      if (!s3Client) {
        pending('AWS S3 not configured');
        return;
      }

      try {
        const result = await s3Client.listBuckets().promise();
        
        expect(result).toBeDefined();
        expect(result.Buckets).toBeDefined();
        expect(Array.isArray(result.Buckets)).toBe(true);
      } catch (error) {
        fail(`S3 service health check failed: ${error.message}`);
      }
    }, 10000);

    it('should validate API response times', async () => {
      if (!s3Client || !testBucket) {
        pending('AWS S3 not configured');
        return;
      }

      const startTime = Date.now();
      
      try {
        await s3Client.headBucket({ Bucket: testBucket }).promise();
        
        const responseTime = Date.now() - startTime;
        
        // API should respond within 5 seconds
        expect(responseTime).toBeLessThan(5000);
      } catch (error) {
        fail(`API response time test failed: ${error.message}`);
      }
    }, 10000);
  });

  describe('Configuration Validation', () => {
    it('should validate environment configuration', () => {
      const requiredVars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_S3_BUCKET',
        'AWS_REGION',
      ];

      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.warn(`Missing AWS configuration: ${missingVars.join(', ')}`);
      }

      // Validate format of configured values
      if (config.AWS_ACCESS_KEY_ID) {
        expect(config.AWS_ACCESS_KEY_ID.length).toBeGreaterThan(10);
      }

      if (config.AWS_SECRET_ACCESS_KEY) {
        expect(config.AWS_SECRET_ACCESS_KEY.length).toBeGreaterThan(20);
      }
    });

    it('should validate S3 client initialization', () => {
      if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
        pending('AWS credentials not configured');
        return;
      }

      const client = new AWS.S3({
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        region: config.AWS_REGION || 'us-east-1',
      });
      
      expect(client).toBeDefined();
      expect(typeof client.putObject).toBe('function');
      expect(typeof client.getObject).toBe('function');
      expect(typeof client.deleteObject).toBe('function');
    });
  });
});
