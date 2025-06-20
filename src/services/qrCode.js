const QRCode = require('qrcode');
const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * QR Code Service for site-based authentication and verification
 */
class QRCodeService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Generate QR code for a site
   */
  async generateSiteQRCode(siteId, options = {}) {
    try {
      const {
        expiresIn = 24 * 60 * 60 * 1000, // 24 hours default
        includeLocation = true,
        customData = {}
      } = options;

      // Get site information
      const site = await this.prisma.site.findUnique({
        where: { id: siteId },
        include: {
          client: {
            select: { id: true, companyName: true }
          }
        }
      });

      if (!site) {
        throw new Error('Site not found');
      }

      // Generate unique QR code data
      const qrData = {
        type: 'SITE_CHECKIN',
        siteId: site.id,
        siteName: site.name,
        clientId: site.client.id,
        clientName: site.client.companyName,
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + expiresIn).toISOString(),
        nonce: crypto.randomBytes(16).toString('hex'),
        ...customData
      };

      // Add location data if requested
      if (includeLocation && site.coordinates) {
        const coordinates = this.parseCoordinates(site.coordinates);
        qrData.location = {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          radius: site.geofenceRadius || 100
        };
      }

      // Create signature for verification
      const signature = this.createQRSignature(qrData);
      qrData.signature = signature;

      // Generate QR code string
      const qrString = JSON.stringify(qrData);
      
      // Generate QR code image
      const qrCodeImage = await QRCode.toDataURL(qrString, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });

      // Store QR code in database
      const qrCodeRecord = await this.prisma.qRCode.create({
        data: {
          id: crypto.randomUUID(),
          siteId: site.id,
          code: qrData.nonce,
          data: qrData,
          expiresAt: new Date(qrData.expiresAt),
          isActive: true,
          createdAt: new Date()
        }
      });

      logger.info('QR code generated for site', {
        siteId: site.id,
        qrCodeId: qrCodeRecord.id,
        expiresAt: qrData.expiresAt
      });

      return {
        qrCodeId: qrCodeRecord.id,
        qrCodeImage,
        qrData,
        expiresAt: qrData.expiresAt,
        downloadUrl: `/api/sites/${siteId}/qr-code/${qrCodeRecord.id}/download`
      };

    } catch (error) {
      logger.error('Failed to generate QR code:', error);
      throw error;
    }
  }

  /**
   * Verify and validate QR code scan
   */
  async verifyQRCode(qrString, scanLocation = null, agentId = null) {
    try {
      // Parse QR code data
      let qrData;
      try {
        qrData = JSON.parse(qrString);
      } catch (parseError) {
        throw new Error('Invalid QR code format');
      }

      // Validate required fields
      if (!qrData.type || !qrData.siteId || !qrData.signature || !qrData.nonce) {
        throw new Error('Invalid QR code data structure');
      }

      // Check if QR code type is supported
      if (qrData.type !== 'SITE_CHECKIN') {
        throw new Error('Unsupported QR code type');
      }

      // Verify signature
      const expectedSignature = this.createQRSignature({
        ...qrData,
        signature: undefined
      });

      if (qrData.signature !== expectedSignature) {
        throw new Error('QR code signature verification failed');
      }

      // Check expiration
      const now = new Date();
      const expiresAt = new Date(qrData.expiresAt);
      if (now > expiresAt) {
        throw new Error('QR code has expired');
      }

      // Get QR code record from database
      const qrCodeRecord = await this.prisma.qRCode.findFirst({
        where: {
          code: qrData.nonce,
          siteId: qrData.siteId,
          isActive: true,
          expiresAt: { gt: now }
        },
        include: {
          site: {
            include: {
              client: true
            }
          }
        }
      });

      if (!qrCodeRecord) {
        throw new Error('QR code not found or inactive');
      }

      // Validate location if provided
      let locationValid = true;
      let distanceFromSite = null;

      if (scanLocation && qrData.location) {
        const siteCoordinates = {
          latitude: qrData.location.latitude,
          longitude: qrData.location.longitude
        };

        distanceFromSite = this.calculateDistance(
          scanLocation.latitude,
          scanLocation.longitude,
          siteCoordinates.latitude,
          siteCoordinates.longitude
        );

        const allowedRadius = qrData.location.radius || 100; // meters
        locationValid = distanceFromSite <= allowedRadius;
      }

      // Log scan attempt
      await this.logQRCodeScan({
        qrCodeId: qrCodeRecord.id,
        agentId,
        scanLocation,
        locationValid,
        distanceFromSite,
        success: locationValid
      });

      const result = {
        valid: locationValid,
        siteId: qrData.siteId,
        siteName: qrData.siteName,
        clientId: qrData.clientId,
        clientName: qrData.clientName,
        scanTime: now.toISOString(),
        locationValid,
        distanceFromSite,
        site: qrCodeRecord.site
      };

      if (!locationValid) {
        result.error = `Location verification failed. You are ${Math.round(distanceFromSite)}m from the site (allowed: ${qrData.location?.radius || 100}m)`;
      }

      return result;

    } catch (error) {
      logger.error('QR code verification failed:', error);
      throw error;
    }
  }

  /**
   * Get QR code for download
   */
  async getQRCodeForDownload(siteId, qrCodeId) {
    try {
      const qrCodeRecord = await this.prisma.qRCode.findFirst({
        where: {
          id: qrCodeId,
          siteId: siteId,
          isActive: true
        },
        include: {
          site: true
        }
      });

      if (!qrCodeRecord) {
        throw new Error('QR code not found');
      }

      // Regenerate QR code image from stored data
      const qrString = JSON.stringify(qrCodeRecord.data);
      const qrCodeImage = await QRCode.toDataURL(qrString, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 512 // Higher resolution for download
      });

      return {
        qrCodeImage,
        filename: `${qrCodeRecord.site.name.replace(/[^a-zA-Z0-9]/g, '_')}_QR_Code.png`,
        site: qrCodeRecord.site,
        expiresAt: qrCodeRecord.expiresAt
      };

    } catch (error) {
      logger.error('Failed to get QR code for download:', error);
      throw error;
    }
  }

  /**
   * Deactivate QR code
   */
  async deactivateQRCode(qrCodeId) {
    try {
      const updated = await this.prisma.qRCode.update({
        where: { id: qrCodeId },
        data: {
          isActive: false,
          deactivatedAt: new Date()
        }
      });

      logger.info('QR code deactivated', { qrCodeId });
      return updated;

    } catch (error) {
      logger.error('Failed to deactivate QR code:', error);
      throw error;
    }
  }

  /**
   * Clean up expired QR codes
   */
  async cleanupExpiredQRCodes() {
    try {
      const now = new Date();
      
      const result = await this.prisma.qRCode.updateMany({
        where: {
          expiresAt: { lt: now },
          isActive: true
        },
        data: {
          isActive: false,
          deactivatedAt: now
        }
      });

      logger.info('Cleaned up expired QR codes', { count: result.count });
      return result;

    } catch (error) {
      logger.error('Failed to cleanup expired QR codes:', error);
      throw error;
    }
  }

  // Helper methods

  createQRSignature(data) {
    const secret = process.env.QR_CODE_SECRET || 'default-qr-secret';
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHmac('sha256', secret).update(dataString).digest('hex');
  }

  parseCoordinates(coordinatesString) {
    // Parse PostgreSQL POINT format: (longitude,latitude)
    const match = coordinatesString.match(/\(([^,]+),([^)]+)\)/);
    if (match) {
      return {
        longitude: parseFloat(match[1]),
        latitude: parseFloat(match[2])
      };
    }
    throw new Error('Invalid coordinates format');
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  async logQRCodeScan(scanData) {
    try {
      await this.prisma.qRCodeScan.create({
        data: {
          id: crypto.randomUUID(),
          qrCodeId: scanData.qrCodeId,
          agentId: scanData.agentId,
          scanLocation: scanData.scanLocation ? 
            `POINT(${scanData.scanLocation.longitude} ${scanData.scanLocation.latitude})` : null,
          locationValid: scanData.locationValid,
          distanceFromSite: scanData.distanceFromSite,
          success: scanData.success,
          scannedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to log QR code scan:', error);
      // Don't throw error as this is just logging
    }
  }
}

module.exports = QRCodeService;
