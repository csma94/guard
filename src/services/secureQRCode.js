const crypto = require('crypto');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * Secure QR Code Service with encryption and offline verification
 */
class SecureQRCodeService {
  constructor(prisma) {
    this.prisma = prisma;
    this.encryptionKey = process.env.QR_ENCRYPTION_KEY || this.generateEncryptionKey();
    this.signingKey = process.env.QR_SIGNING_KEY || this.generateSigningKey();
    this.algorithm = 'aes-256-gcm';
  }

  /**
   * Generate secure QR code with encryption and digital signature
   */
  async generateSecureQRCode(siteId, options = {}) {
    try {
      const {
        expiresIn = 24 * 60 * 60 * 1000, // 24 hours
        includeLocation = true,
        allowOfflineVerification = true,
        securityLevel = 'HIGH', // LOW, MEDIUM, HIGH, CRITICAL
        customData = {},
        agentId = null, // For agent-specific QR codes
      } = options;

      // Get site information
      const site = await this.prisma.site.findUnique({
        where: { id: siteId },
        include: {
          client: {
            select: { id: true, companyName: true },
          },
        },
      });

      if (!site) {
        throw new Error('Site not found');
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + expiresIn);

      // Create base QR data
      const qrData = {
        version: '2.0',
        type: 'SECURE_SITE_CHECKIN',
        id: uuidv4(),
        siteId: site.id,
        siteName: site.name,
        clientId: site.client.id,
        clientName: site.client.companyName,
        timestamp: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        securityLevel,
        agentId,
        nonce: crypto.randomBytes(32).toString('hex'),
        ...customData,
      };

      // Add location data if requested
      if (includeLocation && site.coordinates) {
        const coordinates = this.parseCoordinates(site.coordinates);
        qrData.location = {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          radius: site.geofenceRadius || 100,
          accuracy: 10, // Required accuracy in meters
        };
      }

      // Add offline verification data if enabled
      if (allowOfflineVerification) {
        qrData.offlineData = await this.generateOfflineVerificationData(site, agentId);
      }

      // Encrypt sensitive data
      const encryptedData = this.encryptQRData(qrData);

      // Create digital signature
      const signature = this.createDigitalSignature(encryptedData);

      // Final QR payload
      const qrPayload = {
        v: '2.0', // Version
        d: encryptedData, // Encrypted data
        s: signature, // Digital signature
        t: now.getTime(), // Timestamp for replay protection
      };

      // Generate QR code image
      const qrString = JSON.stringify(qrPayload);
      const qrCodeImage = await this.generateQRCodeImage(qrString, securityLevel);

      // Store QR code in database
      const qrCodeRecord = await this.prisma.qRCode.create({
        data: {
          id: qrData.id,
          siteId: site.id,
          code: qrData.nonce,
          data: qrData,
          expiresAt,
          isActive: true,
        },
      });

      // Log QR code generation
      logger.info('Secure QR code generated', {
        qrCodeId: qrCodeRecord.id,
        siteId: site.id,
        securityLevel,
        expiresAt: expiresAt.toISOString(),
        agentSpecific: !!agentId,
      });

      return {
        qrCodeId: qrCodeRecord.id,
        qrCodeImage,
        qrString,
        expiresAt: expiresAt.toISOString(),
        securityLevel,
        downloadUrl: `/api/sites/${siteId}/secure-qr/${qrCodeRecord.id}/download`,
      };
    } catch (error) {
      logger.error('Failed to generate secure QR code:', error);
      throw error;
    }
  }

  /**
   * Verify secure QR code with comprehensive validation
   */
  async verifySecureQRCode(qrString, scanContext = {}) {
    try {
      const {
        scanLocation = null,
        agentId = null,
        deviceId = null,
        timestamp = new Date(),
        allowOfflineVerification = false,
      } = scanContext;

      // Parse QR payload
      let qrPayload;
      try {
        qrPayload = JSON.parse(qrString);
      } catch (parseError) {
        throw new Error('Invalid QR code format');
      }

      // Validate payload structure
      if (!qrPayload.v || !qrPayload.d || !qrPayload.s || !qrPayload.t) {
        throw new Error('Invalid QR code structure');
      }

      // Check version compatibility
      if (qrPayload.v !== '2.0') {
        throw new Error('Unsupported QR code version');
      }

      // Verify digital signature
      if (!this.verifyDigitalSignature(qrPayload.d, qrPayload.s)) {
        throw new Error('QR code signature verification failed');
      }

      // Check for replay attacks
      const scanTime = new Date(timestamp);
      const qrTime = new Date(qrPayload.t);
      const timeDiff = Math.abs(scanTime.getTime() - qrTime.getTime());
      
      if (timeDiff > 5 * 60 * 1000) { // 5 minutes tolerance
        throw new Error('QR code timestamp is too old (possible replay attack)');
      }

      // Decrypt QR data
      const qrData = this.decryptQRData(qrPayload.d);

      // Validate expiration
      const now = new Date();
      const expiresAt = new Date(qrData.expiresAt);
      if (now > expiresAt) {
        throw new Error('QR code has expired');
      }

      // Validate agent-specific QR codes
      if (qrData.agentId && qrData.agentId !== agentId) {
        throw new Error('QR code is not valid for this agent');
      }

      // Perform online verification if possible
      let onlineVerification = null;
      if (!allowOfflineVerification) {
        onlineVerification = await this.performOnlineVerification(qrData, agentId);
      }

      // Validate location if provided
      const locationValidation = await this.validateLocation(
        qrData.location,
        scanLocation,
        qrData.securityLevel
      );

      // Log scan attempt
      await this.logSecureQRCodeScan({
        qrCodeId: qrData.id,
        agentId,
        deviceId,
        scanLocation,
        locationValidation,
        onlineVerification,
        securityLevel: qrData.securityLevel,
      });

      const result = {
        valid: locationValidation.valid && (onlineVerification?.valid !== false),
        qrCodeId: qrData.id,
        siteId: qrData.siteId,
        siteName: qrData.siteName,
        clientId: qrData.clientId,
        clientName: qrData.clientName,
        scanTime: scanTime.toISOString(),
        securityLevel: qrData.securityLevel,
        locationValidation,
        onlineVerification,
        offlineCapable: !!qrData.offlineData,
      };

      if (!result.valid) {
        result.errors = [];
        if (!locationValidation.valid) {
          result.errors.push(locationValidation.error);
        }
        if (onlineVerification && !onlineVerification.valid) {
          result.errors.push(onlineVerification.error);
        }
      }

      return result;
    } catch (error) {
      logger.error('Secure QR code verification failed:', error);
      
      // Log failed verification attempt
      await this.logFailedVerification(qrString, scanContext, error.message);
      
      throw error;
    }
  }

  /**
   * Generate offline verification data
   */
  async generateOfflineVerificationData(site, agentId = null) {
    const offlineData = {
      siteHash: this.generateSiteHash(site),
      validationRules: {
        locationRequired: !!site.coordinates,
        geofenceRadius: site.geofenceRadius || 100,
        timeWindows: site.operatingHours || null,
      },
    };

    if (agentId) {
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          skills: true,
          certifications: true,
        },
      });

      if (agent) {
        offlineData.agentHash = this.generateAgentHash(agent);
        offlineData.requiredSkills = site.requirements?.skills || [];
      }
    }

    return offlineData;
  }

  /**
   * Encrypt QR data
   */
  encryptQRData(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
    cipher.setAAD(Buffer.from('qr-auth-data'));

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      data: encrypted,
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt QR data
   */
  decryptQRData(encryptedData) {
    const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
    decipher.setAAD(Buffer.from('qr-auth-data'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  /**
   * Create digital signature
   */
  createDigitalSignature(data) {
    const dataString = JSON.stringify(data);
    return crypto
      .createHmac('sha256', this.signingKey)
      .update(dataString)
      .digest('hex');
  }

  /**
   * Verify digital signature
   */
  verifyDigitalSignature(data, signature) {
    const expectedSignature = this.createDigitalSignature(data);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Generate QR code image with security level styling
   */
  async generateQRCodeImage(qrString, securityLevel) {
    const securityConfig = {
      LOW: { errorCorrectionLevel: 'L', width: 200 },
      MEDIUM: { errorCorrectionLevel: 'M', width: 256 },
      HIGH: { errorCorrectionLevel: 'Q', width: 300 },
      CRITICAL: { errorCorrectionLevel: 'H', width: 400 },
    };

    const config = securityConfig[securityLevel] || securityConfig.MEDIUM;

    return await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: config.errorCorrectionLevel,
      type: 'image/png',
      quality: 0.95,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      width: config.width,
    });
  }

  /**
   * Validate location with enhanced security
   */
  async validateLocation(expectedLocation, scanLocation, securityLevel) {
    if (!expectedLocation || !scanLocation) {
      return {
        valid: !expectedLocation, // Valid if no location required
        error: expectedLocation ? 'Location verification required' : null,
      };
    }

    const distance = this.calculateDistance(
      scanLocation.latitude,
      scanLocation.longitude,
      expectedLocation.latitude,
      expectedLocation.longitude
    );

    // Adjust allowed radius based on security level
    const securityMultipliers = {
      LOW: 2.0,
      MEDIUM: 1.5,
      HIGH: 1.0,
      CRITICAL: 0.5,
    };

    const multiplier = securityMultipliers[securityLevel] || 1.0;
    const allowedRadius = expectedLocation.radius * multiplier;

    const valid = distance <= allowedRadius;

    return {
      valid,
      distance,
      allowedRadius,
      accuracy: scanLocation.accuracy,
      error: valid ? null : `Location verification failed. Distance: ${Math.round(distance)}m (allowed: ${Math.round(allowedRadius)}m)`,
    };
  }

  /**
   * Generate encryption key
   */
  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate signing key
   */
  generateSigningKey() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Calculate distance between coordinates
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Parse coordinates from PostGIS format
   */
  parseCoordinates(coordinatesString) {
    // Parse "POINT(longitude latitude)" format
    const match = coordinatesString.match(/POINT\(([^)]+)\)/);
    if (match) {
      const [longitude, latitude] = match[1].split(' ').map(Number);
      return { latitude, longitude };
    }
    throw new Error('Invalid coordinates format');
  }

  /**
   * Generate site hash for offline verification
   */
  generateSiteHash(site) {
    const siteData = {
      id: site.id,
      name: site.name,
      coordinates: site.coordinates,
      geofenceRadius: site.geofenceRadius,
    };
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(siteData))
      .digest('hex');
  }

  /**
   * Generate agent hash for offline verification
   */
  generateAgentHash(agent) {
    const agentData = {
      id: agent.id,
      skills: agent.skills,
      certifications: agent.certifications,
    };
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(agentData))
      .digest('hex');
  }

  /**
   * Perform online verification
   */
  async performOnlineVerification(qrData, agentId) {
    try {
      // Check if QR code exists and is active
      const qrCodeRecord = await this.prisma.qRCode.findUnique({
        where: { id: qrData.id },
        include: { site: true },
      });

      if (!qrCodeRecord || !qrCodeRecord.isActive) {
        return {
          valid: false,
          error: 'QR code not found or inactive',
        };
      }

      // Check if agent has access to this site
      if (agentId) {
        const hasAccess = await this.checkAgentSiteAccess(agentId, qrData.siteId);
        if (!hasAccess) {
          return {
            valid: false,
            error: 'Agent does not have access to this site',
          };
        }
      }

      return { valid: true };
    } catch (error) {
      logger.error('Online verification failed:', error);
      return {
        valid: false,
        error: 'Online verification failed',
      };
    }
  }

  /**
   * Check agent site access
   */
  async checkAgentSiteAccess(agentId, siteId) {
    // Check if agent has any active shifts at this site
    const activeShift = await this.prisma.shift.findFirst({
      where: {
        agentId,
        siteId,
        status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
        startTime: { lte: new Date() },
        endTime: { gte: new Date() },
        deletedAt: null,
      },
    });

    return !!activeShift;
  }

  /**
   * Log secure QR code scan
   */
  async logSecureQRCodeScan(scanData) {
    try {
      await this.prisma.qRCodeScan.create({
        data: {
          id: uuidv4(),
          qrCodeId: scanData.qrCodeId,
          agentId: scanData.agentId,
          scanLocation: scanData.scanLocation
            ? `POINT(${scanData.scanLocation.longitude} ${scanData.scanLocation.latitude})`
            : null,
          locationValid: scanData.locationValidation?.valid || false,
          distanceFromSite: scanData.locationValidation?.distance || null,
          success: scanData.locationValidation?.valid && scanData.onlineVerification?.valid !== false,
          scannedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to log secure QR code scan:', error);
    }
  }

  /**
   * Log failed verification attempt
   */
  async logFailedVerification(qrString, scanContext, errorMessage) {
    try {
      logger.warn('QR code verification failed', {
        error: errorMessage,
        agentId: scanContext.agentId,
        deviceId: scanContext.deviceId,
        scanLocation: scanContext.scanLocation,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to log failed verification:', error);
    }
  }
}

module.exports = SecureQRCodeService;
