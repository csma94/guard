const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const ffmpeg = require('fluent-ffmpeg');
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');
const pdfParse = require('pdf-parse');
const ExifParser = require('exif-parser');
const logger = require('../config/logger');
const config = require('../config/config');

/**
 * Secure File Storage and Media Management Service
 * Handles file uploads, storage, processing, and access control
 */
class FileStorageService {
  constructor(prisma, serviceConfig = {}) {
    this.prisma = prisma;
    this.config = {
      uploadPath: serviceConfig.uploadPath || './uploads',
      maxFileSize: serviceConfig.maxFileSize || 50 * 1024 * 1024, // 50MB
      allowedTypes: serviceConfig.allowedTypes || [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime',
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      thumbnailSizes: serviceConfig.thumbnailSizes || [
        { name: 'small', width: 150, height: 150 },
        { name: 'medium', width: 300, height: 300 },
        { name: 'large', width: 800, height: 600 }
      ],
      useS3: serviceConfig.useS3 !== false, // Default to S3 unless explicitly disabled
      s3Bucket: config.AWS_S3_BUCKET,
      s3Region: config.AWS_S3_REGION || config.AWS_REGION,
      ...serviceConfig
    };

    // Initialize AWS S3
    this.initializeS3();

    // Initialize local storage as fallback
    this.initializeStorage();

    // Configure FFmpeg
    this.initializeFFmpeg();
  }

  /**
   * Initialize AWS S3 client
   */
  initializeS3() {
    if (!this.config.useS3) {
      logger.info('S3 storage disabled, using local storage');
      return;
    }

    if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY || !this.config.s3Bucket) {
      logger.warn('AWS S3 credentials not configured, falling back to local storage');
      this.config.useS3 = false;
      return;
    }

    // Configure AWS SDK
    AWS.config.update({
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      region: this.config.s3Region
    });

    this.s3 = new AWS.S3({
      apiVersion: '2006-03-01',
      params: { Bucket: this.config.s3Bucket },
      httpOptions: {
        timeout: 30000,
        connectTimeout: 5000
      },
      maxRetries: 3,
      retryDelayOptions: {
        customBackoff: function(retryCount) {
          return Math.pow(2, retryCount) * 100;
        }
      }
    });

    logger.info('AWS S3 client initialized', {
      bucket: this.config.s3Bucket,
      region: this.config.s3Region
    });
  }

  /**
   * Initialize FFmpeg configuration
   */
  initializeFFmpeg() {
    try {
      // Set ffprobe path
      ffprobe.FFPROBE_PATH = ffprobeStatic.path;

      // Check if ffmpeg is available
      ffmpeg.getAvailableFormats((err, formats) => {
        if (err) {
          logger.warn('FFmpeg not available, video processing will be limited:', err.message);
          this.ffmpegAvailable = false;
        } else {
          logger.info('FFmpeg initialized successfully');
          this.ffmpegAvailable = true;
        }
      });
    } catch (error) {
      logger.warn('Failed to initialize FFmpeg:', error);
      this.ffmpegAvailable = false;
    }
  }

  /**
   * Initialize storage directories
   */
  async initializeStorage() {
    try {
      const directories = [
        this.config.uploadPath,
        path.join(this.config.uploadPath, 'images'),
        path.join(this.config.uploadPath, 'videos'),
        path.join(this.config.uploadPath, 'documents'),
        path.join(this.config.uploadPath, 'thumbnails'),
        path.join(this.config.uploadPath, 'temp')
      ];

      for (const dir of directories) {
        try {
          await fs.access(dir);
        } catch {
          await fs.mkdir(dir, { recursive: true });
          logger.info(`Created storage directory: ${dir}`);
        }
      }
    } catch (error) {
      logger.error('Failed to initialize storage directories:', error);
      throw error;
    }
  }

  /**
   * Upload and process file
   */
  async uploadFile(fileData, metadata = {}) {
    try {
      const {
        buffer,
        originalname,
        mimetype,
        size,
        userId,
        reportId,
        shiftId,
        description,
        isPublic = false,
        tags = []
      } = { ...fileData, ...metadata };

      // Validate file
      this.validateFile(buffer, mimetype, size, originalname);

      // Generate unique filename
      const fileExtension = path.extname(originalname);
      const filename = `${uuidv4()}${fileExtension}`;
      const fileHash = this.generateFileHash(buffer);

      // Check for duplicate files
      const existingFile = await this.checkDuplicateFile(fileHash);
      if (existingFile) {
        return this.handleDuplicateFile(existingFile, metadata);
      }

      // Determine file category and storage path
      const category = this.determineFileCategory(mimetype);
      const relativePath = path.join(category, filename);

      let fileUrl, processedData;

      if (this.config.useS3 && this.s3) {
        // Upload to S3
        const s3Key = relativePath.replace(/\\/g, '/'); // Ensure forward slashes for S3
        const uploadResult = await this.uploadToS3(buffer, s3Key, mimetype);
        fileUrl = uploadResult.Location;

        // Process file from buffer (for S3)
        processedData = await this.processFileFromBuffer(buffer, mimetype, filename);
      } else {
        // Fallback to local storage
        const fullPath = path.join(this.config.uploadPath, relativePath);
        await fs.writeFile(fullPath, buffer);
        fileUrl = `/files/${filename}`;

        // Process file from local path
        processedData = await this.processFile(fullPath, mimetype, filename);
      }

      // Create database record
      const fileRecord = await this.prisma.mediaFile.create({
        data: {
          id: uuidv4(),
          filename,
          originalFilename: originalname,
          filePath: this.config.useS3 ? relativePath.replace(/\\/g, '/') : relativePath,
          fileUrl: fileUrl,
          fileType: mimetype,
          fileSize: size,
          fileHash,
          category,
          description,
          isPublic,
          tags,
          metadata: {
            ...processedData.metadata,
            uploadedBy: userId,
            uploadedAt: new Date().toISOString(),
            storageType: this.config.useS3 ? 'S3' : 'LOCAL',
            s3Bucket: this.config.useS3 ? this.config.s3Bucket : null
          },
          thumbnails: processedData.thumbnails || [],
          uploadedBy: userId,
          reportId,
          shiftId,
          status: 'ACTIVE'
        }
      });

      // Log file upload
      logger.info('File uploaded successfully', {
        fileId: fileRecord.id,
        filename: fileRecord.filename,
        fileType: mimetype,
        fileSize: size,
        uploadedBy: userId,
        category
      });

      return {
        success: true,
        file: {
          id: fileRecord.id,
          filename: fileRecord.filename,
          originalFilename: fileRecord.originalFilename,
          fileType: fileRecord.fileType,
          fileSize: fileRecord.fileSize,
          category: fileRecord.category,
          description: fileRecord.description,
          thumbnails: fileRecord.thumbnails,
          uploadedAt: fileRecord.createdAt,
          downloadUrl: this.generateDownloadUrl(fileRecord.id),
          previewUrl: this.generatePreviewUrl(fileRecord.id)
        }
      };

    } catch (error) {
      logger.error('File upload failed:', error);
      throw error;
    }
  }

  /**
   * Process file based on type (generate thumbnails, extract metadata, etc.)
   */
  async processFile(filePath, mimetype, filename) {
    const result = {
      metadata: {},
      thumbnails: []
    };

    try {
      if (mimetype.startsWith('image/')) {
        result.metadata = await this.processImage(filePath);
        result.thumbnails = await this.generateImageThumbnails(filePath, filename);
      } else if (mimetype.startsWith('video/')) {
        result.metadata = await this.processVideo(filePath);
        result.thumbnails = await this.generateVideoThumbnail(filePath, filename);
      } else if (mimetype === 'application/pdf') {
        result.metadata = await this.processPDF(filePath);
      }

      return result;
    } catch (error) {
      logger.error('File processing failed:', error);
      return result; // Return empty result on processing failure
    }
  }

  /**
   * Process image file and extract metadata
   */
  async processImage(filePath) {
    try {
      const image = sharp(filePath);
      const metadata = await image.metadata();

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        colorSpace: metadata.space,
        hasAlpha: metadata.hasAlpha,
        density: metadata.density,
        exif: metadata.exif ? this.parseExifData(metadata.exif) : null
      };
    } catch (error) {
      logger.error('Image processing failed:', error);
      return {};
    }
  }

  /**
   * Generate image thumbnails
   */
  async generateImageThumbnails(filePath, filename) {
    const thumbnails = [];
    const nameWithoutExt = path.parse(filename).name;

    try {
      for (const size of this.config.thumbnailSizes) {
        const thumbnailFilename = `${nameWithoutExt}_${size.name}.jpg`;
        const thumbnailPath = path.join(this.config.uploadPath, 'thumbnails', thumbnailFilename);

        await sharp(filePath)
          .resize(size.width, size.height, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 80 })
          .toFile(thumbnailPath);

        thumbnails.push({
          size: size.name,
          filename: thumbnailFilename,
          width: size.width,
          height: size.height,
          path: path.join('thumbnails', thumbnailFilename)
        });
      }

      return thumbnails;
    } catch (error) {
      logger.error('Thumbnail generation failed:', error);
      return [];
    }
  }

  /**
   * Process video file using FFmpeg
   */
  async processVideo(filePath) {
    try {
      if (!this.ffmpegAvailable) {
        logger.warn('FFmpeg not available, returning basic video info');
        const stats = await fs.stat(filePath);
        return {
          duration: null,
          resolution: null,
          bitrate: null,
          codec: null,
          fileSize: stats.size
        };
      }

      // Use ffprobe to extract video metadata
      const metadata = await ffprobe(filePath);

      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

      const result = {
        duration: parseFloat(metadata.format.duration) || null,
        fileSize: parseInt(metadata.format.size) || null,
        bitrate: parseInt(metadata.format.bit_rate) || null,
        format: metadata.format.format_name,
        formatLongName: metadata.format.format_long_name,
        streams: metadata.streams.length
      };

      if (videoStream) {
        result.video = {
          codec: videoStream.codec_name,
          codecLongName: videoStream.codec_long_name,
          width: videoStream.width,
          height: videoStream.height,
          resolution: `${videoStream.width}x${videoStream.height}`,
          aspectRatio: videoStream.display_aspect_ratio,
          frameRate: this.parseFrameRate(videoStream.r_frame_rate),
          bitrate: parseInt(videoStream.bit_rate) || null,
          pixelFormat: videoStream.pix_fmt
        };
      }

      if (audioStream) {
        result.audio = {
          codec: audioStream.codec_name,
          codecLongName: audioStream.codec_long_name,
          sampleRate: parseInt(audioStream.sample_rate) || null,
          channels: audioStream.channels,
          channelLayout: audioStream.channel_layout,
          bitrate: parseInt(audioStream.bit_rate) || null
        };
      }

      logger.info('Video metadata extracted successfully', {
        duration: result.duration,
        resolution: result.video?.resolution,
        format: result.format
      });

      return result;
    } catch (error) {
      logger.error('Video processing failed:', error);
      return {
        duration: null,
        resolution: null,
        bitrate: null,
        codec: null,
        error: error.message
      };
    }
  }

  /**
   * Generate video thumbnail using FFmpeg
   */
  async generateVideoThumbnail(filePath, filename) {
    try {
      if (!this.ffmpegAvailable) {
        logger.warn('FFmpeg not available, cannot generate video thumbnails');
        return [];
      }

      const thumbnails = [];
      const nameWithoutExt = path.parse(filename).name;

      // Generate thumbnail at 10% of video duration
      const thumbnailFilename = `${nameWithoutExt}_thumbnail.jpg`;
      const thumbnailPath = path.join(this.config.uploadPath, 'thumbnails', thumbnailFilename);

      // Ensure thumbnails directory exists
      await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });

      return new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .screenshots({
            timestamps: ['10%'],
            filename: thumbnailFilename,
            folder: path.join(this.config.uploadPath, 'thumbnails'),
            size: '800x600'
          })
          .on('end', () => {
            thumbnails.push({
              size: 'large',
              filename: thumbnailFilename,
              width: 800,
              height: 600,
              path: path.join('thumbnails', thumbnailFilename),
              timestamp: '10%'
            });

            logger.info('Video thumbnail generated successfully', {
              filename: thumbnailFilename,
              path: thumbnailPath
            });

            resolve(thumbnails);
          })
          .on('error', (error) => {
            logger.error('Video thumbnail generation failed:', error);
            resolve([]); // Return empty array instead of rejecting
          });
      });
    } catch (error) {
      logger.error('Video thumbnail generation failed:', error);
      return [];
    }
  }

  /**
   * Process PDF file using pdf-parse
   */
  async processPDF(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const buffer = await fs.readFile(filePath);

      // Parse PDF using pdf-parse
      const pdfData = await pdfParse(buffer);

      return {
        pageCount: pdfData.numpages,
        fileSize: stats.size,
        textLength: pdfData.text ? pdfData.text.length : 0,
        hasText: pdfData.text && pdfData.text.trim().length > 0,
        metadata: {
          info: pdfData.info || {},
          version: pdfData.version || null,
          producer: pdfData.info?.Producer || null,
          creator: pdfData.info?.Creator || null,
          title: pdfData.info?.Title || null,
          author: pdfData.info?.Author || null,
          subject: pdfData.info?.Subject || null,
          keywords: pdfData.info?.Keywords || null,
          creationDate: pdfData.info?.CreationDate || null,
          modificationDate: pdfData.info?.ModDate || null
        },
        extractedText: pdfData.text ? pdfData.text.substring(0, 1000) : null // First 1000 chars for preview
      };
    } catch (error) {
      logger.error('PDF processing failed:', error);

      // Fallback to basic file info
      try {
        const stats = await fs.stat(filePath);
        return {
          pageCount: null,
          fileSize: stats.size,
          error: error.message
        };
      } catch (statError) {
        return {
          error: `PDF processing failed: ${error.message}`
        };
      }
    }
  }

  /**
   * Validate uploaded file
   */
  validateFile(buffer, mimetype, size, filename) {
    // Check file size
    if (size > this.config.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.config.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check file type
    if (!this.config.allowedTypes.includes(mimetype)) {
      throw new Error(`File type ${mimetype} is not allowed`);
    }

    // Check filename
    if (!filename || filename.length > 255) {
      throw new Error('Invalid filename');
    }

    // Check for malicious file extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];
    const fileExtension = path.extname(filename).toLowerCase();
    if (dangerousExtensions.includes(fileExtension)) {
      throw new Error('File type not allowed for security reasons');
    }

    // Basic file signature validation
    this.validateFileSignature(buffer, mimetype);
  }

  /**
   * Validate file signature (magic bytes)
   */
  validateFileSignature(buffer, mimetype) {
    const signatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46],
      'application/pdf': [0x25, 0x50, 0x44, 0x46]
    };

    const signature = signatures[mimetype];
    if (signature) {
      const fileHeader = Array.from(buffer.slice(0, signature.length));
      if (!signature.every((byte, index) => byte === fileHeader[index])) {
        throw new Error('File signature does not match declared type');
      }
    }
  }

  /**
   * Generate file hash for duplicate detection
   */
  generateFileHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Check for duplicate files
   */
  async checkDuplicateFile(fileHash) {
    return await this.prisma.mediaFile.findFirst({
      where: {
        fileHash,
        status: 'ACTIVE'
      }
    });
  }

  /**
   * Handle duplicate file upload
   */
  async handleDuplicateFile(existingFile, metadata) {
    // Create a reference to the existing file
    const reference = await this.prisma.mediaFile.create({
      data: {
        id: uuidv4(),
        filename: existingFile.filename,
        originalFilename: metadata.originalname || existingFile.originalFilename,
        filePath: existingFile.filePath,
        fileType: existingFile.fileType,
        fileSize: existingFile.fileSize,
        fileHash: existingFile.fileHash,
        category: existingFile.category,
        description: metadata.description || existingFile.description,
        isPublic: metadata.isPublic || existingFile.isPublic,
        tags: metadata.tags || existingFile.tags,
        metadata: existingFile.metadata,
        thumbnails: existingFile.thumbnails,
        uploadedBy: metadata.userId,
        reportId: metadata.reportId,
        shiftId: metadata.shiftId,
        status: 'ACTIVE',
        isDuplicate: true,
        originalFileId: existingFile.id
      }
    });

    logger.info('Duplicate file handled', {
      newFileId: reference.id,
      originalFileId: existingFile.id,
      filename: existingFile.filename
    });

    return {
      success: true,
      file: {
        id: reference.id,
        filename: reference.filename,
        originalFilename: reference.originalFilename,
        fileType: reference.fileType,
        fileSize: reference.fileSize,
        category: reference.category,
        description: reference.description,
        thumbnails: reference.thumbnails,
        uploadedAt: reference.createdAt,
        downloadUrl: this.generateDownloadUrl(reference.id),
        previewUrl: this.generatePreviewUrl(reference.id),
        isDuplicate: true
      }
    };
  }

  /**
   * Determine file category based on MIME type
   */
  determineFileCategory(mimetype) {
    if (mimetype.startsWith('image/')) return 'images';
    if (mimetype.startsWith('video/')) return 'videos';
    return 'documents';
  }

  /**
   * Generate download URL for file
   */
  generateDownloadUrl(fileId) {
    return `/api/files/${fileId}/download`;
  }

  /**
   * Generate preview URL for file
   */
  generatePreviewUrl(fileId) {
    return `/api/files/${fileId}/preview`;
  }

  /**
   * Upload file to AWS S3
   */
  async uploadToS3(buffer, key, contentType) {
    try {
      const uploadParams = {
        Bucket: this.config.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          'uploaded-at': new Date().toISOString(),
          'content-type': contentType
        }
      };

      const result = await this.s3.upload(uploadParams).promise();

      logger.info('File uploaded to S3', {
        bucket: this.config.s3Bucket,
        key: key,
        location: result.Location,
        etag: result.ETag
      });

      return result;
    } catch (error) {
      logger.error('S3 upload failed:', error);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Download file from AWS S3
   */
  async downloadFromS3(key) {
    try {
      const downloadParams = {
        Bucket: this.config.s3Bucket,
        Key: key
      };

      const result = await this.s3.getObject(downloadParams).promise();
      return result.Body;
    } catch (error) {
      logger.error('S3 download failed:', error);
      throw new Error(`S3 download failed: ${error.message}`);
    }
  }

  /**
   * Delete file from AWS S3
   */
  async deleteFromS3(key) {
    try {
      const deleteParams = {
        Bucket: this.config.s3Bucket,
        Key: key
      };

      await this.s3.deleteObject(deleteParams).promise();

      logger.info('File deleted from S3', {
        bucket: this.config.s3Bucket,
        key: key
      });
    } catch (error) {
      logger.error('S3 delete failed:', error);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  /**
   * Generate signed URL for S3 object
   */
  generateSignedUrl(key, expires = 3600) {
    if (!this.config.useS3 || !this.s3) {
      return null;
    }

    try {
      const params = {
        Bucket: this.config.s3Bucket,
        Key: key,
        Expires: expires
      };

      return this.s3.getSignedUrl('getObject', params);
    } catch (error) {
      logger.error('Failed to generate signed URL:', error);
      return null;
    }
  }

  /**
   * Process file from buffer (for S3 uploads)
   */
  async processFileFromBuffer(buffer, mimetype, filename) {
    const result = {
      metadata: {},
      thumbnails: []
    };

    try {
      if (mimetype.startsWith('image/')) {
        result.metadata = await this.processImageFromBuffer(buffer);
        result.thumbnails = await this.generateImageThumbnailsFromBuffer(buffer, filename);
      } else if (mimetype.startsWith('video/')) {
        result.metadata = await this.processVideoFromBuffer(buffer);
      } else if (mimetype === 'application/pdf') {
        result.metadata = await this.processPDFFromBuffer(buffer);
      }

      return result;
    } catch (error) {
      logger.error('File processing from buffer failed:', error);
      return result;
    }
  }

  /**
   * Process image from buffer
   */
  async processImageFromBuffer(buffer) {
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        colorSpace: metadata.space,
        hasAlpha: metadata.hasAlpha,
        density: metadata.density,
        exif: metadata.exif ? this.parseExifData(metadata.exif) : null
      };
    } catch (error) {
      logger.error('Image processing from buffer failed:', error);
      return {};
    }
  }

  /**
   * Generate image thumbnails from buffer and upload to S3
   */
  async generateImageThumbnailsFromBuffer(buffer, filename) {
    const thumbnails = [];
    const nameWithoutExt = path.parse(filename).name;

    try {
      for (const size of this.config.thumbnailSizes) {
        const thumbnailFilename = `${nameWithoutExt}_${size.name}.jpg`;
        const thumbnailKey = `thumbnails/${thumbnailFilename}`;

        const thumbnailBuffer = await sharp(buffer)
          .resize(size.width, size.height, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        if (this.config.useS3 && this.s3) {
          // Upload thumbnail to S3
          const uploadResult = await this.uploadToS3(thumbnailBuffer, thumbnailKey, 'image/jpeg');

          thumbnails.push({
            size: size.name,
            filename: thumbnailFilename,
            width: size.width,
            height: size.height,
            url: uploadResult.Location,
            key: thumbnailKey
          });
        } else {
          // Save thumbnail locally
          const thumbnailPath = path.join(this.config.uploadPath, 'thumbnails', thumbnailFilename);
          await fs.writeFile(thumbnailPath, thumbnailBuffer);

          thumbnails.push({
            size: size.name,
            filename: thumbnailFilename,
            width: size.width,
            height: size.height,
            path: path.join('thumbnails', thumbnailFilename)
          });
        }
      }

      return thumbnails;
    } catch (error) {
      logger.error('Thumbnail generation from buffer failed:', error);
      return [];
    }
  }

  /**
   * Process video from buffer (placeholder for future FFmpeg integration)
   */
  async processVideoFromBuffer(buffer) {
    try {
      return {
        duration: null,
        resolution: null,
        bitrate: null,
        codec: null,
        fileSize: buffer.length
      };
    } catch (error) {
      logger.error('Video processing from buffer failed:', error);
      return {};
    }
  }

  /**
   * Process PDF from buffer using pdf-parse
   */
  async processPDFFromBuffer(buffer) {
    try {
      // Parse PDF using pdf-parse
      const pdfData = await pdfParse(buffer);

      return {
        pageCount: pdfData.numpages,
        fileSize: buffer.length,
        textLength: pdfData.text ? pdfData.text.length : 0,
        hasText: pdfData.text && pdfData.text.trim().length > 0,
        metadata: {
          info: pdfData.info || {},
          version: pdfData.version || null,
          producer: pdfData.info?.Producer || null,
          creator: pdfData.info?.Creator || null,
          title: pdfData.info?.Title || null,
          author: pdfData.info?.Author || null,
          subject: pdfData.info?.Subject || null,
          keywords: pdfData.info?.Keywords || null,
          creationDate: pdfData.info?.CreationDate || null,
          modificationDate: pdfData.info?.ModDate || null
        },
        extractedText: pdfData.text ? pdfData.text.substring(0, 1000) : null // First 1000 chars for preview
      };
    } catch (error) {
      logger.error('PDF processing from buffer failed:', error);

      // Fallback to basic info
      return {
        pageCount: null,
        fileSize: buffer.length,
        error: error.message
      };
    }
  }

  /**
   * Parse frame rate from FFmpeg format (e.g., "30/1" -> 30)
   */
  parseFrameRate(frameRateString) {
    try {
      if (!frameRateString) return null;

      const parts = frameRateString.split('/');
      if (parts.length === 2) {
        const numerator = parseFloat(parts[0]);
        const denominator = parseFloat(parts[1]);
        return denominator !== 0 ? numerator / denominator : null;
      }

      return parseFloat(frameRateString);
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse EXIF data from image using exif-parser
   */
  parseExifData(exifBuffer) {
    try {
      if (!exifBuffer || exifBuffer.length === 0) {
        return null;
      }

      const parser = ExifParser.create(exifBuffer);
      const result = parser.parse();

      if (!result || !result.tags) {
        return null;
      }

      const exifData = {
        hasExif: true,
        extractedAt: new Date().toISOString(),
        imageSize: result.imageSize || null,
        tags: {}
      };

      // Extract common EXIF tags
      const tags = result.tags;

      // Camera information
      if (tags.Make) exifData.tags.make = tags.Make;
      if (tags.Model) exifData.tags.model = tags.Model;
      if (tags.Software) exifData.tags.software = tags.Software;

      // Image settings
      if (tags.ISO) exifData.tags.iso = tags.ISO;
      if (tags.FNumber) exifData.tags.fNumber = tags.FNumber;
      if (tags.ExposureTime) exifData.tags.exposureTime = tags.ExposureTime;
      if (tags.FocalLength) exifData.tags.focalLength = tags.FocalLength;
      if (tags.Flash) exifData.tags.flash = tags.Flash;
      if (tags.WhiteBalance) exifData.tags.whiteBalance = tags.WhiteBalance;

      // Date and time
      if (tags.DateTime) {
        exifData.tags.dateTime = new Date(tags.DateTime * 1000).toISOString();
      }
      if (tags.DateTimeOriginal) {
        exifData.tags.dateTimeOriginal = new Date(tags.DateTimeOriginal * 1000).toISOString();
      }
      if (tags.DateTimeDigitized) {
        exifData.tags.dateTimeDigitized = new Date(tags.DateTimeDigitized * 1000).toISOString();
      }

      // GPS information
      if (result.gps) {
        exifData.gps = {
          latitude: result.gps.GPSLatitude || null,
          longitude: result.gps.GPSLongitude || null,
          altitude: result.gps.GPSAltitude || null,
          timestamp: result.gps.GPSTimeStamp ? new Date(result.gps.GPSTimeStamp * 1000).toISOString() : null
        };
      }

      // Image dimensions and orientation
      if (tags.ImageWidth) exifData.tags.imageWidth = tags.ImageWidth;
      if (tags.ImageHeight) exifData.tags.imageHeight = tags.ImageHeight;
      if (tags.Orientation) exifData.tags.orientation = tags.Orientation;
      if (tags.XResolution) exifData.tags.xResolution = tags.XResolution;
      if (tags.YResolution) exifData.tags.yResolution = tags.YResolution;
      if (tags.ResolutionUnit) exifData.tags.resolutionUnit = tags.ResolutionUnit;

      logger.debug('EXIF data extracted successfully', {
        hasTags: Object.keys(exifData.tags).length > 0,
        hasGPS: !!exifData.gps,
        make: exifData.tags.make,
        model: exifData.tags.model
      });

      return exifData;
    } catch (error) {
      logger.warn('EXIF parsing failed:', error.message);
      return {
        hasExif: false,
        error: error.message,
        extractedAt: new Date().toISOString()
      };
    }
  }
}

module.exports = FileStorageService;
