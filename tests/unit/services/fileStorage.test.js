const FileStorageService = require('../../../src/services/fileStorage');
const fs = require('fs').promises;
const path = require('path');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    stat: jest.fn(),
    access: jest.fn(),
  },
}));

jest.mock('sharp', () => {
  return jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      format: 'jpeg',
      space: 'srgb',
      hasAlpha: false,
      density: 72,
    }),
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumbnail')),
  }));
});

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    upload: jest.fn(() => ({
      promise: jest.fn().mockResolvedValue({
        Location: 'https://s3.amazonaws.com/bucket/file.jpg',
        ETag: '"abc123"',
      }),
    })),
    getObject: jest.fn(() => ({
      promise: jest.fn().mockResolvedValue({
        Body: Buffer.from('file content'),
      }),
    })),
    deleteObject: jest.fn(() => ({
      promise: jest.fn().mockResolvedValue({}),
    })),
    getSignedUrl: jest.fn().mockReturnValue('https://signed-url.com'),
  })),
}));

jest.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = jest.fn(() => ({
    screenshots: jest.fn().mockReturnThis(),
    on: jest.fn((event, callback) => {
      if (event === 'end') {
        setTimeout(callback, 10);
      }
      return mockFfmpeg();
    }),
  }));
  return mockFfmpeg;
});

jest.mock('pdf-parse', () => {
  return jest.fn().mockResolvedValue({
    numpages: 5,
    text: 'Sample PDF content for testing purposes',
    info: {
      Title: 'Test Document',
      Author: 'Test Author',
      Producer: 'Test Producer',
    },
    version: '1.4',
  });
});

// Mock Prisma client
const mockPrisma = {
  mediaFile: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

describe('FileStorageService', () => {
  let fileStorageService;

  beforeEach(() => {
    fileStorageService = new FileStorageService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    const mockFile = {
      originalname: 'test-image.jpg',
      mimetype: 'image/jpeg',
      size: 1024000,
      buffer: Buffer.from('test image data'),
    };

    const mockUser = {
      id: 'user-1',
      username: 'testuser',
    };

    beforeEach(() => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockResolvedValue();
      fs.stat.mockResolvedValue({ size: 1024000 });

      mockPrisma.mediaFile.create.mockResolvedValue({
        id: 'file-1',
        filename: 'test-image.jpg',
        filePath: 'uploads/test-image.jpg',
      });

      fileStorageService.calculateFileHash = jest.fn().mockReturnValue('abc123hash');
      fileStorageService.processImage = jest.fn().mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
      });
      fileStorageService.generateImageThumbnails = jest.fn().mockResolvedValue([
        {
          size: 'small',
          filename: 'test-image_small.jpg',
          width: 300,
          height: 200,
        },
      ]);
    });

    it('should upload file successfully', async () => {
      const result = await fileStorageService.uploadFile(mockFile, mockUser);

      expect(result).toEqual({
        id: 'file-1',
        filename: 'test-image.jpg',
        filePath: 'uploads/test-image.jpg',
        fileSize: 1024000,
        fileType: 'image/jpeg',
        metadata: expect.any(Object),
        thumbnails: expect.any(Array),
      });

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(mockPrisma.mediaFile.create).toHaveBeenCalled();
    });

    it('should handle file size validation', async () => {
      const largeFile = { ...mockFile, size: 50 * 1024 * 1024 }; // 50MB

      await expect(
        fileStorageService.uploadFile(largeFile, mockUser)
      ).rejects.toThrow('File size exceeds maximum allowed size');
    });

    it('should handle invalid file types', async () => {
      const invalidFile = { ...mockFile, mimetype: 'application/exe' };

      await expect(
        fileStorageService.uploadFile(invalidFile, mockUser)
      ).rejects.toThrow('File type not allowed');
    });

    it('should handle duplicate files', async () => {
      mockPrisma.mediaFile.findUnique.mockResolvedValue({
        id: 'existing-file',
        filename: 'existing-file.jpg',
      });

      const result = await fileStorageService.uploadFile(mockFile, mockUser);

      expect(result.isDuplicate).toBe(true);
      expect(result.originalFileId).toBe('existing-file');
    });
  });

  describe('S3 operations', () => {
    beforeEach(() => {
      fileStorageService.config.useS3 = true;
      fileStorageService.s3 = {
        upload: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({
            Location: 'https://s3.amazonaws.com/bucket/file.jpg',
            ETag: '"abc123"',
          }),
        })),
        getObject: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({
            Body: Buffer.from('file content'),
          }),
        })),
        deleteObject: jest.fn(() => ({
          promise: jest.fn().mockResolvedValue({}),
        })),
        getSignedUrl: jest.fn().mockReturnValue('https://signed-url.com'),
      };
    });

    describe('uploadToS3', () => {
      it('should upload file to S3 successfully', async () => {
        const buffer = Buffer.from('test data');
        const key = 'test-file.jpg';
        const contentType = 'image/jpeg';

        const result = await fileStorageService.uploadToS3(buffer, key, contentType);

        expect(result).toEqual({
          Location: 'https://s3.amazonaws.com/bucket/file.jpg',
          ETag: '"abc123"',
        });

        expect(fileStorageService.s3.upload).toHaveBeenCalledWith({
          Bucket: fileStorageService.config.s3Bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ServerSideEncryption: 'AES256',
          Metadata: expect.any(Object),
        });
      });

      it('should handle S3 upload errors', async () => {
        fileStorageService.s3.upload.mockImplementation(() => ({
          promise: jest.fn().mockRejectedValue(new Error('S3 error')),
        }));

        await expect(
          fileStorageService.uploadToS3(Buffer.from('test'), 'key', 'image/jpeg')
        ).rejects.toThrow('S3 upload failed: S3 error');
      });
    });

    describe('downloadFromS3', () => {
      it('should download file from S3 successfully', async () => {
        const key = 'test-file.jpg';

        const result = await fileStorageService.downloadFromS3(key);

        expect(result).toEqual(Buffer.from('file content'));
        expect(fileStorageService.s3.getObject).toHaveBeenCalledWith({
          Bucket: fileStorageService.config.s3Bucket,
          Key: key,
        });
      });
    });

    describe('generateSignedUrl', () => {
      it('should generate signed URL successfully', () => {
        const key = 'test-file.jpg';
        const expires = 3600;

        const result = fileStorageService.generateSignedUrl(key, expires);

        expect(result).toBe('https://signed-url.com');
        expect(fileStorageService.s3.getSignedUrl).toHaveBeenCalledWith('getObject', {
          Bucket: fileStorageService.config.s3Bucket,
          Key: key,
          Expires: expires,
        });
      });

      it('should return null when S3 is not configured', () => {
        fileStorageService.config.useS3 = false;
        fileStorageService.s3 = null;

        const result = fileStorageService.generateSignedUrl('key');

        expect(result).toBeNull();
      });
    });
  });

  describe('file processing', () => {
    describe('processImage', () => {
      it('should process image successfully', async () => {
        const filePath = '/path/to/image.jpg';

        const result = await fileStorageService.processImage(filePath);

        expect(result).toEqual({
          width: 1920,
          height: 1080,
          format: 'jpeg',
          colorSpace: 'srgb',
          hasAlpha: false,
          density: 72,
          exif: null,
        });
      });
    });

    describe('processPDF', () => {
      it('should process PDF successfully', async () => {
        const filePath = '/path/to/document.pdf';
        fs.stat.mockResolvedValue({ size: 2048000 });
        fs.readFile.mockResolvedValue(Buffer.from('PDF content'));

        const result = await fileStorageService.processPDF(filePath);

        expect(result).toEqual({
          pageCount: 5,
          fileSize: 2048000,
          textLength: 42,
          hasText: true,
          metadata: {
            info: {
              Title: 'Test Document',
              Author: 'Test Author',
              Producer: 'Test Producer',
            },
            version: '1.4',
            producer: 'Test Producer',
            creator: undefined,
            title: 'Test Document',
            author: 'Test Author',
            subject: undefined,
            keywords: undefined,
            creationDate: undefined,
            modificationDate: undefined,
          },
          extractedText: 'Sample PDF content for testing purposes',
        });
      });
    });

    describe('generateImageThumbnails', () => {
      it('should generate thumbnails successfully', async () => {
        const filePath = '/path/to/image.jpg';
        const filename = 'test-image.jpg';

        fs.mkdir.mockResolvedValue();
        fs.writeFile.mockResolvedValue();

        const result = await fileStorageService.generateImageThumbnails(filePath, filename);

        expect(result).toHaveLength(3); // small, medium, large
        expect(result[0]).toEqual({
          size: 'small',
          filename: 'test-image_small.jpg',
          width: 300,
          height: 200,
          path: expect.stringContaining('thumbnails/test-image_small.jpg'),
        });
      });
    });
  });

  describe('utility methods', () => {
    describe('calculateFileHash', () => {
      it('should calculate file hash correctly', () => {
        const buffer = Buffer.from('test data');

        const result = fileStorageService.calculateFileHash(buffer);

        expect(result).toBe('916f0027a575074ce72a331777c3478d6513f786a591bd892da1a577bf2335f9');
      });
    });

    describe('validateFileType', () => {
      it('should validate allowed file types', () => {
        expect(fileStorageService.validateFileType('image/jpeg')).toBe(true);
        expect(fileStorageService.validateFileType('application/pdf')).toBe(true);
        expect(fileStorageService.validateFileType('video/mp4')).toBe(true);
      });

      it('should reject disallowed file types', () => {
        expect(fileStorageService.validateFileType('application/exe')).toBe(false);
        expect(fileStorageService.validateFileType('text/html')).toBe(false);
      });
    });

    describe('validateFileSize', () => {
      it('should validate file size within limits', () => {
        expect(fileStorageService.validateFileSize(1024000)).toBe(true); // 1MB
        expect(fileStorageService.validateFileSize(5 * 1024 * 1024)).toBe(true); // 5MB
      });

      it('should reject oversized files', () => {
        expect(fileStorageService.validateFileSize(50 * 1024 * 1024)).toBe(false); // 50MB
      });
    });

    describe('generateUniqueFilename', () => {
      it('should generate unique filename', () => {
        const originalName = 'test-file.jpg';

        const result = fileStorageService.generateUniqueFilename(originalName);

        expect(result).toMatch(/^\d{13}-[a-f0-9]{8}-test-file\.jpg$/);
      });

      it('should handle files without extensions', () => {
        const originalName = 'test-file';

        const result = fileStorageService.generateUniqueFilename(originalName);

        expect(result).toMatch(/^\d{13}-[a-f0-9]{8}-test-file$/);
      });
    });
  });
});
