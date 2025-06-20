const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const config = require('../config/config');
const logger = require('../config/logger');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (config.ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'File type not allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_FILE_SIZE,
  },
});

/**
 * @swagger
 * /media/upload:
 *   post:
 *     summary: Upload media file
 *     description: Upload a media file (image, video, document)
 *     tags: [Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               reportId:
 *                 type: string
 *                 format: uuid
 *               description:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *       400:
 *         description: Invalid file or request data
 *       401:
 *         description: Authentication required
 */
router.post('/upload',
  authenticate,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, 'No file uploaded');
    }

    const { reportId, description, location } = req.body;
    const prisma = req.app.locals.prisma;

    // Validate report if provided
    if (reportId) {
      const report = await prisma.report.findFirst({
        where: {
          id: reportId,
          agentId: req.user.agent?.id,
          deletedAt: null,
        },
      });

      if (!report) {
        throw new ApiError(404, 'Report not found or access denied');
      }
    }

    // Determine file type
    let fileType = 'DOCUMENT';
    if (req.file.mimetype.startsWith('image/')) {
      fileType = 'IMAGE';
    } else if (req.file.mimetype.startsWith('video/')) {
      fileType = 'VIDEO';
    } else if (req.file.mimetype.startsWith('audio/')) {
      fileType = 'AUDIO';
    }

    // Parse location if provided
    let locationPoint = null;
    if (location) {
      const locationData = typeof location === 'string' ? JSON.parse(location) : location;
      if (locationData.latitude && locationData.longitude) {
        locationPoint = `POINT(${locationData.longitude} ${locationData.latitude})`;
      }
    }

    const mediaFile = await prisma.mediaFile.create({
      data: {
        id: uuidv4(),
        reportId: reportId || null,
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath: req.file.path,
        fileSize: BigInt(req.file.size),
        mimeType: req.file.mimetype,
        fileType,
        description,
        location: locationPoint,
        timestamp: new Date(),
        uploadedBy: req.user.id,
      },
    });

    logger.audit('media_uploaded', {
      uploadedBy: req.user.id,
      mediaFileId: mediaFile.id,
      filename: req.file.originalname,
      fileType,
      fileSize: req.file.size,
      reportId,
    });

    res.status(201).json({
      message: 'File uploaded successfully',
      mediaFile: {
        id: mediaFile.id,
        filename: mediaFile.filename,
        originalFilename: mediaFile.originalFilename,
        fileType: mediaFile.fileType,
        fileSize: mediaFile.fileSize.toString(),
        mimeType: mediaFile.mimeType,
        description: mediaFile.description,
        timestamp: mediaFile.timestamp,
      },
    });
  })
);

/**
 * @swagger
 * /media/{id}:
 *   get:
 *     summary: Get media file
 *     description: Retrieve a media file by ID
 *     tags: [Media]
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
 *         description: Media file details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Media file not found
 */
router.get('/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id, deletedAt: null },
      include: {
        report: {
          select: {
            id: true,
            agentId: true,
            title: true,
          },
        },
        uploader: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
      },
    });

    if (!mediaFile) {
      throw new ApiError(404, 'Media file not found');
    }

    // Check access permissions
    const hasAccess = 
      req.user.role === 'ADMIN' ||
      req.user.role === 'SUPERVISOR' ||
      mediaFile.uploadedBy === req.user.id ||
      (mediaFile.report && mediaFile.report.agentId === req.user.agent?.id);

    if (!hasAccess) {
      throw new ApiError(403, 'Access denied');
    }

    res.json({
      mediaFile: {
        id: mediaFile.id,
        filename: mediaFile.filename,
        originalFilename: mediaFile.originalFilename,
        fileType: mediaFile.fileType,
        fileSize: mediaFile.fileSize.toString(),
        mimeType: mediaFile.mimeType,
        description: mediaFile.description,
        timestamp: mediaFile.timestamp,
        uploader: mediaFile.uploader,
        report: mediaFile.report,
      },
    });
  })
);

/**
 * @swagger
 * /media/{id}/download:
 *   get:
 *     summary: Download media file
 *     description: Download the actual media file
 *     tags: [Media]
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
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       404:
 *         description: Media file not found
 */
router.get('/:id/download',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const prisma = req.app.locals.prisma;

    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id, deletedAt: null },
      include: {
        report: {
          select: {
            id: true,
            agentId: true,
          },
        },
      },
    });

    if (!mediaFile) {
      throw new ApiError(404, 'Media file not found');
    }

    // Check access permissions
    const hasAccess = 
      req.user.role === 'ADMIN' ||
      req.user.role === 'SUPERVISOR' ||
      mediaFile.uploadedBy === req.user.id ||
      (mediaFile.report && mediaFile.report.agentId === req.user.agent?.id);

    if (!hasAccess) {
      throw new ApiError(403, 'Access denied');
    }

    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(mediaFile.filePath)) {
      throw new ApiError(404, 'File not found on disk');
    }

    logger.audit('media_downloaded', {
      downloadedBy: req.user.id,
      mediaFileId: mediaFile.id,
      filename: mediaFile.originalFilename,
    });

    res.setHeader('Content-Disposition', `attachment; filename="${mediaFile.originalFilename}"`);
    res.setHeader('Content-Type', mediaFile.mimeType);
    res.sendFile(path.resolve(mediaFile.filePath));
  })
);

module.exports = router;
