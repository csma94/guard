const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const GDPRService = require('../services/gdpr');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /gdpr/data-access:
 *   post:
 *     summary: Request data access (GDPR Article 15)
 *     description: Process data subject access request to export user data
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: User ID (optional, defaults to current user)
 *     responses:
 *       200:
 *         description: Data access request processed
 *       403:
 *         description: Access denied
 */
router.post('/data-access',
  authenticate,
  [
    body('userId').optional().isUUID().withMessage('Valid user ID required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { userId = req.user.id } = req.body;
    const prisma = req.app.locals.prisma;

    // Check authorization - users can only access their own data unless admin
    if (userId !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ApiError(403, 'Access denied - can only request own data');
    }

    const gdprService = new GDPRService(prisma);
    const result = await gdprService.processDataAccessRequest(userId, req.user.id);

    logger.audit('gdpr_data_access', {
      requestedBy: req.user.id,
      targetUserId: userId,
      success: true,
      ip: req.ip
    });

    res.json({
      message: 'Data access request processed successfully',
      ...result
    });
  })
);

/**
 * @swagger
 * /gdpr/data-deletion:
 *   post:
 *     summary: Request data deletion (GDPR Article 17)
 *     description: Process right to erasure request
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               deletePersonalData:
 *                 type: boolean
 *                 default: true
 *               deleteWorkData:
 *                 type: boolean
 *                 default: false
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Data deletion request processed
 */
router.post('/data-deletion',
  authenticate,
  authorize('ADMIN', 'USER'), // Users can delete own data, admins can delete any
  [
    body('userId').optional().isUUID().withMessage('Valid user ID required'),
    body('deletePersonalData').optional().isBoolean(),
    body('deleteWorkData').optional().isBoolean(),
    body('reason').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { 
      userId = req.user.id,
      deletePersonalData = true,
      deleteWorkData = false,
      reason = 'User request'
    } = req.body;
    const prisma = req.app.locals.prisma;

    // Check authorization
    if (userId !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ApiError(403, 'Access denied - can only delete own data');
    }

    const gdprService = new GDPRService(prisma);
    const result = await gdprService.processDataDeletionRequest(userId, req.user.id, {
      deletePersonalData,
      deleteWorkData,
      reason
    });

    logger.audit('gdpr_data_deletion', {
      requestedBy: req.user.id,
      targetUserId: userId,
      options: { deletePersonalData, deleteWorkData, reason },
      success: true,
      ip: req.ip
    });

    res.json({
      message: 'Data deletion request processed successfully',
      ...result
    });
  })
);

/**
 * @swagger
 * /gdpr/data-portability:
 *   post:
 *     summary: Request data portability (GDPR Article 20)
 *     description: Export user data in portable format
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               format:
 *                 type: string
 *                 enum: [json, csv, xml]
 *                 default: json
 *     responses:
 *       200:
 *         description: Data portability request processed
 */
router.post('/data-portability',
  authenticate,
  [
    body('userId').optional().isUUID().withMessage('Valid user ID required'),
    body('format').optional().isIn(['json', 'csv', 'xml']).withMessage('Invalid format'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { userId = req.user.id, format = 'json' } = req.body;
    const prisma = req.app.locals.prisma;

    // Check authorization
    if (userId !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ApiError(403, 'Access denied - can only export own data');
    }

    const gdprService = new GDPRService(prisma);
    const result = await gdprService.processDataPortabilityRequest(userId, req.user.id, format);

    logger.audit('gdpr_data_portability', {
      requestedBy: req.user.id,
      targetUserId: userId,
      format,
      success: true,
      ip: req.ip
    });

    res.json({
      message: 'Data portability request processed successfully',
      ...result
    });
  })
);

/**
 * @swagger
 * /gdpr/consent-withdrawal:
 *   post:
 *     summary: Withdraw consent (GDPR Article 7)
 *     description: Process consent withdrawal request
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - consentTypes
 *             properties:
 *               consentTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [marketing, analytics, location_tracking, data_processing]
 *               userId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Consent withdrawal processed
 */
router.post('/consent-withdrawal',
  authenticate,
  [
    body('consentTypes').isArray().withMessage('Consent types must be an array'),
    body('consentTypes.*').isIn(['marketing', 'analytics', 'location_tracking', 'data_processing']),
    body('userId').optional().isUUID().withMessage('Valid user ID required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { consentTypes, userId = req.user.id } = req.body;
    const prisma = req.app.locals.prisma;

    // Check authorization
    if (userId !== req.user.id && req.user.role !== 'ADMIN') {
      throw new ApiError(403, 'Access denied - can only withdraw own consent');
    }

    const gdprService = new GDPRService(prisma);
    const result = await gdprService.processConsentWithdrawal(userId, consentTypes, req.user.id);

    logger.audit('gdpr_consent_withdrawal', {
      requestedBy: req.user.id,
      targetUserId: userId,
      consentTypes,
      success: true,
      ip: req.ip
    });

    res.json({
      message: 'Consent withdrawal processed successfully',
      ...result
    });
  })
);

/**
 * @swagger
 * /gdpr/privacy-settings:
 *   get:
 *     summary: Get privacy settings
 *     description: Retrieve current privacy and consent settings
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Privacy settings retrieved
 */
router.get('/privacy-settings',
  authenticate,
  asyncHandler(async (req, res) => {
    const prisma = req.app.locals.prisma;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        preferences: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLoginAt: true
      }
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const privacySettings = {
      dataProcessingConsent: user.preferences.dataProcessingConsent ?? true,
      marketingConsent: user.preferences.marketingConsent ?? false,
      analyticsConsent: user.preferences.analyticsConsent ?? true,
      locationTrackingConsent: user.preferences.locationTrackingConsent ?? true,
      twoFactorEnabled: user.twoFactorEnabled,
      accountCreated: user.createdAt,
      lastLogin: user.lastLoginAt,
      dataRetentionPeriod: '7 years', // Configurable based on legal requirements
      rightsInformation: {
        rightToAccess: 'You can request a copy of your personal data',
        rightToRectification: 'You can request correction of inaccurate data',
        rightToErasure: 'You can request deletion of your personal data',
        rightToPortability: 'You can request your data in a portable format',
        rightToWithdrawConsent: 'You can withdraw consent at any time'
      }
    };

    res.json({
      privacySettings,
      lastUpdated: new Date().toISOString()
    });
  })
);

module.exports = router;
