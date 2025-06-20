const express = require('express');
const multer = require('multer');
const { body, query, param, validationResult } = require('express-validator');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const FileStorageService = require('../services/fileStorage');
const logger = require('../config/logger');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10 // Maximum 10 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }
  }
});

/**
 * @swagger
 * /files/upload:
 *   post:
 *     summary: Upload file
 *     description: Upload a file with metadata
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *               reportId:
 *                 type: string
 *                 format: uuid
 *               shiftId:
 *                 type: string
 *                 format: uuid
 *               isPublic:
 *                 type: boolean
 *                 default: false
 *               tags:
 *                 type: string
 *                 description: Comma-separated tags
 *     responses:
 *       200:
 *         description: File uploaded successfully
 */
router.post('/upload',
  authenticate,
  upload.single('file'),
  [
    body('description').optional().isString().isLength({ max: 500 }),
    body('reportId').optional().isUUID(),
    body('shiftId').optional().isUUID(),
    body('isPublic').optional().isBoolean(),
    body('tags').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    if (!req.file) {
      throw new ApiError(400, 'No file provided');
    }

    const { description, reportId, shiftId, isPublic, tags } = req.body;
    const prisma = req.app.locals.prisma;

    // Parse tags
    const parsedTags = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

    const fileStorageService = new FileStorageService(prisma);

    try {
      const result = await fileStorageService.uploadFile({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      }, {
        userId: req.user.id,
        description,
        reportId,
        shiftId,
        isPublic: isPublic === 'true',
        tags: parsedTags
      });

      res.json({
        success: true,
        message: 'File uploaded successfully',
        ...result
      });

    } catch (error) {
      throw new ApiError(400, error.message);
    }
  })
);

/**
 * @swagger
 * /files/upload/multiple:
 *   post:
 *     summary: Upload multiple files
 *     description: Upload multiple files at once
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - files
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               description:
 *                 type: string
 *               reportId:
 *                 type: string
 *                 format: uuid
 *               shiftId:
 *                 type: string
 *                 format: uuid
 *               isPublic:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 */
router.post('/upload/multiple',
  authenticate,
  upload.array('files', 10),
  [
    body('description').optional().isString().isLength({ max: 500 }),
    body('reportId').optional().isUUID(),
    body('shiftId').optional().isUUID(),
    body('isPublic').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    if (!req.files || req.files.length === 0) {
      throw new ApiError(400, 'No files provided');
    }

    const { description, reportId, shiftId, isPublic } = req.body;
    const prisma = req.app.locals.prisma;

    const fileStorageService = new FileStorageService(prisma);
    const results = [];
    const uploadErrors = [];

    // Process each file
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      try {
        const result = await fileStorageService.uploadFile({
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        }, {
          userId: req.user.id,
          description,
          reportId,
          shiftId,
          isPublic: isPublic === 'true'
        });

        results.push(result.file);
      } catch (error) {
        uploadErrors.push({
          filename: file.originalname,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `${results.length} files uploaded successfully`,
      files: results,
      errors: uploadErrors.length > 0 ? uploadErrors : undefined,
      summary: {
        total: req.files.length,
        successful: results.length,
        failed: uploadErrors.length
      }
    });
  })
);

/**
 * @swagger
 * /files/{id}/download:
 *   get:
 *     summary: Download file
 *     description: Download a file by ID
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/download',
  authenticate,
  [
    param('id').isUUID().withMessage('Valid file ID is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    // Get file record
    const file = await prisma.mediaFile.findUnique({
      where: { id },
      include: {
        report: {
          include: {
            shift: {
              include: {
                site: {
                  include: { client: true }
                }
              }
            }
          }
        }
      }
    });

    if (!file) {
      throw new ApiError(404, 'File not found');
    }

    // Check access permissions
    await checkFileAccess(file, req.user);

    const fileStorageService = new FileStorageService(prisma);

    try {
      // Check if file is stored in S3 or locally
      if (file.fileUrl && file.metadata?.storageType === 'S3') {
        // Generate signed URL for S3 file
        const signedUrl = fileStorageService.generateSignedUrl(file.filePath, 3600); // 1 hour expiry

        if (signedUrl) {
          // Log file download
          logger.info('File download via S3 signed URL', {
            fileId: file.id,
            filename: file.filename,
            downloadedBy: req.user.id,
            userAgent: req.get('User-Agent'),
            ip: req.ip
          });

          // Redirect to signed URL
          return res.redirect(signedUrl);
        } else {
          // Fallback: download from S3 and stream
          const fileBuffer = await fileStorageService.downloadFromS3(file.filePath);

          res.setHeader('Content-Disposition', `attachment; filename="${file.originalFilename}"`);
          res.setHeader('Content-Type', file.mimeType);
          res.setHeader('Content-Length', fileBuffer.length);

          return res.send(fileBuffer);
        }
      } else {
        // Local file storage
        const filePath = path.join('./uploads', file.filePath);

        try {
          await fs.access(filePath);
        } catch {
          throw new ApiError(404, 'File not found on disk');
        }

        // Set appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalFilename}"`);
        res.setHeader('Content-Type', file.mimeType);

        // Send file
        res.sendFile(path.resolve(filePath));
      }

      // Log file download
      logger.info('File downloaded', {
        fileId: file.id,
        filename: file.filename,
        downloadedBy: req.user.id,
        storageType: file.metadata?.storageType || 'LOCAL',
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

    } catch (error) {
      logger.error('File download failed:', error);
      throw new ApiError(500, 'File download failed');
    }
  })
);

/**
 * @swagger
 * /files/{id}/preview:
 *   get:
 *     summary: Preview file
 *     description: Get file preview (for images, returns thumbnail)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: size
 *         schema:
 *           type: string
 *           enum: [small, medium, large]
 *           default: medium
 *     responses:
 *       200:
 *         description: File preview
 */
router.get('/:id/preview',
  authenticate,
  [
    param('id').isUUID().withMessage('Valid file ID is required'),
    query('size').optional().isIn(['small', 'medium', 'large']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { id } = req.params;
    const { size = 'medium' } = req.query;
    const prisma = req.app.locals.prisma;

    // Get file record
    const file = await prisma.mediaFile.findUnique({
      where: { id },
      include: {
        report: {
          include: {
            shift: {
              include: {
                site: {
                  include: { client: true }
                }
              }
            }
          }
        }
      }
    });

    if (!file) {
      throw new ApiError(404, 'File not found');
    }

    // Check access permissions
    await checkFileAccess(file, req.user);

    const fileStorageService = new FileStorageService(prisma);

    try {
      // Check if file is stored in S3 or locally
      if (file.fileUrl && file.metadata?.storageType === 'S3') {
        let s3Key;

        // For images, try to serve thumbnail
        if (file.mimeType.startsWith('image/') && file.thumbnails && file.thumbnails.length > 0) {
          const thumbnail = file.thumbnails.find(t => t.size === size) || file.thumbnails[0];
          s3Key = thumbnail.key || thumbnail.path;
        } else {
          // For other files, serve original
          s3Key = file.filePath;
        }

        // Generate signed URL for S3 file
        const signedUrl = fileStorageService.generateSignedUrl(s3Key, 3600); // 1 hour expiry

        if (signedUrl) {
          // Redirect to signed URL
          return res.redirect(signedUrl);
        } else {
          // Fallback: download from S3 and stream
          const fileBuffer = await fileStorageService.downloadFromS3(s3Key);

          res.setHeader('Content-Type', file.mimeType.startsWith('image/') ? 'image/jpeg' : file.mimeType);
          res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
          res.setHeader('Content-Length', fileBuffer.length);

          return res.send(fileBuffer);
        }
      } else {
        // Local file storage
        let previewPath;

        // For images, try to serve thumbnail
        if (file.mimeType.startsWith('image/') && file.thumbnails && file.thumbnails.length > 0) {
          const thumbnail = file.thumbnails.find(t => t.size === size) || file.thumbnails[0];
          previewPath = path.join('./uploads', thumbnail.path);
        } else {
          // For other files, serve original
          previewPath = path.join('./uploads', file.filePath);
        }

        try {
          await fs.access(previewPath);
        } catch {
          throw new ApiError(404, 'Preview not available');
        }

        // Set appropriate headers
        res.setHeader('Content-Type', file.mimeType.startsWith('image/') ? 'image/jpeg' : file.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

        // Send preview
        res.sendFile(path.resolve(previewPath));
      }
    } catch (error) {
      logger.error('File preview failed:', error);
      throw new ApiError(500, 'File preview failed');
    }
  })
);

/**
 * Check file access permissions
 */
async function checkFileAccess(file, user) {
  // Public files can be accessed by anyone
  if (file.isPublic) {
    return true;
  }

  // File owner can always access
  if (file.uploadedBy === user.id) {
    return true;
  }

  // Admins can access all files
  if (user.role === 'ADMIN') {
    return true;
  }

  // Supervisors can access files from their managed sites
  if (user.role === 'SUPERVISOR' && file.report?.shift?.site) {
    // Check if supervisor manages this site (simplified check)
    return true;
  }

  // Clients can access files from their sites
  if (user.role === 'CLIENT' && user.client && file.report?.shift?.site?.clientId === user.client.id) {
    return true;
  }

  throw new ApiError(403, 'Access denied to this file');
}

module.exports = router;
