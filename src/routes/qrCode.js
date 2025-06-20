const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const QRCodeService = require('../services/qrCode');
const logger = require('../config/logger');

const router = express.Router();

/**
 * Generate QR code for a site
 * POST /api/sites/:siteId/qr-code
 */
router.post('/sites/:siteId/qr-code',
  auth,
  [
    param('siteId').isUUID().withMessage('Invalid site ID'),
    body('expiresIn').optional().isInt({ min: 3600000 }).withMessage('Expires in must be at least 1 hour'),
    body('includeLocation').optional().isBoolean(),
    body('customData').optional().isObject()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { siteId } = req.params;
      const { expiresIn, includeLocation, customData } = req.body;

      // Check if user has permission to generate QR codes for this site
      const site = await req.app.locals.prisma.site.findUnique({
        where: { id: siteId },
        include: { client: true }
      });

      if (!site) {
        return res.status(404).json({
          error: 'Site not found'
        });
      }

      // Check permissions
      if (req.user.role === 'CLIENT' && site.client.userId !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }

      const qrCodeService = new QRCodeService(req.app.locals.prisma);
      
      const result = await qrCodeService.generateSiteQRCode(siteId, {
        expiresIn,
        includeLocation,
        customData
      });

      // Log QR code generation
      await req.app.locals.auditService.logSystemEvent(
        'QR_CODE_GENERATED',
        'CREATE',
        req.user.id,
        {
          siteId,
          qrCodeId: result.qrCodeId,
          expiresAt: result.expiresAt,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.status(201).json({
        success: true,
        qrCode: {
          id: result.qrCodeId,
          image: result.qrCodeImage,
          expiresAt: result.expiresAt,
          downloadUrl: result.downloadUrl
        },
        site: {
          id: site.id,
          name: site.name
        }
      });

    } catch (error) {
      logger.error('QR code generation failed:', error);
      res.status(500).json({
        error: 'Failed to generate QR code',
        message: error.message
      });
    }
  }
);

/**
 * Verify QR code scan
 * POST /api/qr-code/verify
 */
router.post('/qr-code/verify',
  auth,
  [
    body('qrData').notEmpty().withMessage('QR data is required'),
    body('location').optional().isObject(),
    body('location.latitude').optional().isFloat({ min: -90, max: 90 }),
    body('location.longitude').optional().isFloat({ min: -180, max: 180 }),
    body('location.accuracy').optional().isFloat({ min: 0 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { qrData, location } = req.body;
      const agentId = req.user.agent?.id;

      if (!agentId) {
        return res.status(403).json({
          error: 'Only agents can scan QR codes'
        });
      }

      const qrCodeService = new QRCodeService(req.app.locals.prisma);
      
      const result = await qrCodeService.verifyQRCode(qrData, location, agentId);

      // Log QR code scan
      await req.app.locals.auditService.logSystemEvent(
        'QR_CODE_SCANNED',
        'VERIFY',
        req.user.id,
        {
          agentId,
          siteId: result.siteId,
          locationValid: result.locationValid,
          distanceFromSite: result.distanceFromSite,
          scanLocation: location,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      if (result.valid) {
        res.json({
          success: true,
          verification: {
            valid: true,
            siteId: result.siteId,
            siteName: result.siteName,
            clientId: result.clientId,
            clientName: result.clientName,
            scanTime: result.scanTime,
            locationValid: result.locationValid,
            distanceFromSite: result.distanceFromSite
          }
        });
      } else {
        res.status(400).json({
          success: false,
          verification: {
            valid: false,
            error: result.error,
            siteId: result.siteId,
            siteName: result.siteName,
            distanceFromSite: result.distanceFromSite
          }
        });
      }

    } catch (error) {
      logger.error('QR code verification failed:', error);
      res.status(500).json({
        error: 'Failed to verify QR code',
        message: error.message
      });
    }
  }
);

/**
 * Download QR code image
 * GET /api/sites/:siteId/qr-code/:qrCodeId/download
 */
router.get('/sites/:siteId/qr-code/:qrCodeId/download',
  auth,
  [
    param('siteId').isUUID().withMessage('Invalid site ID'),
    param('qrCodeId').isUUID().withMessage('Invalid QR code ID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { siteId, qrCodeId } = req.params;

      const qrCodeService = new QRCodeService(req.app.locals.prisma);
      
      const result = await qrCodeService.getQRCodeForDownload(siteId, qrCodeId);

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(result.qrCodeImage.split(',')[1], 'base64');

      res.set({
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': imageBuffer.length
      });

      res.send(imageBuffer);

    } catch (error) {
      logger.error('QR code download failed:', error);
      res.status(500).json({
        error: 'Failed to download QR code',
        message: error.message
      });
    }
  }
);

/**
 * Get QR codes for a site
 * GET /api/sites/:siteId/qr-codes
 */
router.get('/sites/:siteId/qr-codes',
  auth,
  [
    param('siteId').isUUID().withMessage('Invalid site ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('active').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { siteId } = req.params;
      const { page = 1, limit = 20, active } = req.query;

      // Check site access
      const site = await req.app.locals.prisma.site.findUnique({
        where: { id: siteId },
        include: { client: true }
      });

      if (!site) {
        return res.status(404).json({
          error: 'Site not found'
        });
      }

      // Check permissions
      if (req.user.role === 'CLIENT' && site.client.userId !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }

      const where = {
        siteId,
        ...(active !== undefined && { isActive: active === 'true' })
      };

      const [qrCodes, totalCount] = await Promise.all([
        req.app.locals.prisma.qRCode.findMany({
          where,
          select: {
            id: true,
            code: true,
            expiresAt: true,
            isActive: true,
            createdAt: true,
            deactivatedAt: true
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: parseInt(limit)
        }),
        req.app.locals.prisma.qRCode.count({ where })
      ]);

      res.json({
        success: true,
        qrCodes,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        },
        site: {
          id: site.id,
          name: site.name
        }
      });

    } catch (error) {
      logger.error('Failed to get QR codes:', error);
      res.status(500).json({
        error: 'Failed to get QR codes',
        message: error.message
      });
    }
  }
);

/**
 * Deactivate QR code
 * DELETE /api/qr-code/:qrCodeId
 */
router.delete('/qr-code/:qrCodeId',
  auth,
  [
    param('qrCodeId').isUUID().withMessage('Invalid QR code ID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { qrCodeId } = req.params;

      // Check if QR code exists and user has permission
      const qrCode = await req.app.locals.prisma.qRCode.findUnique({
        where: { id: qrCodeId },
        include: {
          site: {
            include: { client: true }
          }
        }
      });

      if (!qrCode) {
        return res.status(404).json({
          error: 'QR code not found'
        });
      }

      // Check permissions
      if (req.user.role === 'CLIENT' && qrCode.site.client.userId !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }

      const qrCodeService = new QRCodeService(req.app.locals.prisma);
      
      await qrCodeService.deactivateQRCode(qrCodeId);

      // Log QR code deactivation
      await req.app.locals.auditService.logSystemEvent(
        'QR_CODE_DEACTIVATED',
        'DELETE',
        req.user.id,
        {
          qrCodeId,
          siteId: qrCode.siteId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.json({
        success: true,
        message: 'QR code deactivated successfully'
      });

    } catch (error) {
      logger.error('QR code deactivation failed:', error);
      res.status(500).json({
        error: 'Failed to deactivate QR code',
        message: error.message
      });
    }
  }
);

module.exports = router;
