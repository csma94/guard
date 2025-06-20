const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

const logger = require('../config/logger');
const { generateSecureToken } = require('../utils/security');

class ReportDeliveryService {
  constructor(prisma, emailService) {
    this.prisma = prisma;
    this.emailService = emailService;
    this.deliveryQueue = new Map(); // In-memory queue for scheduled deliveries
  }

  /**
   * Schedule report delivery to client
   */
  async scheduleClientDelivery(report, scheduledTime = null) {
    try {
      const deliveryTime = scheduledTime ? new Date(scheduledTime) : new Date();
      
      // Create delivery record
      const delivery = await this.prisma.reportDelivery.create({
        data: {
          id: uuidv4(),
          reportId: report.id,
          clientId: report.shift.site.client.id,
          deliveryMethod: 'EMAIL',
          scheduledAt: deliveryTime,
          status: 'SCHEDULED',
          deliveryToken: generateSecureToken(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      // Schedule immediate delivery or queue for later
      if (deliveryTime <= new Date()) {
        await this.executeDelivery(delivery.id);
      } else {
        this.queueDelivery(delivery.id, deliveryTime);
      }

      logger.audit('report_delivery_scheduled', {
        reportId: report.id,
        deliveryId: delivery.id,
        clientId: report.shift.site.client.id,
        scheduledAt: deliveryTime,
      });

      return delivery;
    } catch (error) {
      logger.error('Failed to schedule report delivery:', error);
      throw error;
    }
  }

  /**
   * Execute report delivery
   */
  async executeDelivery(deliveryId) {
    try {
      const delivery = await this.prisma.reportDelivery.findUnique({
        where: { id: deliveryId },
        include: {
          report: {
            include: {
              shift: {
                include: {
                  site: {
                    include: {
                      client: true,
                    },
                  },
                  agent: {
                    include: {
                      user: {
                        select: {
                          id: true,
                          username: true,
                          profile: true,
                        },
                      },
                    },
                  },
                },
              },
              mediaFiles: true,
              agent: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      profile: true,
                    },
                  },
                },
              },
            },
          },
          client: true,
        },
      });

      if (!delivery) {
        throw new Error('Delivery record not found');
      }

      if (delivery.status !== 'SCHEDULED') {
        throw new Error('Delivery is not in scheduled status');
      }

      // Generate PDF report
      const pdfPath = await this.generatePDFReport(delivery.report);

      // Create client access link
      const accessLink = await this.createClientAccessLink(delivery);

      // Send email with PDF and access link
      await this.sendDeliveryEmail(delivery, pdfPath, accessLink);

      // Update delivery status
      await this.prisma.reportDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          deliveryDetails: {
            pdfGenerated: true,
            emailSent: true,
            accessLinkCreated: true,
          },
        },
      });

      // Create notification for client
      await this.createClientNotification(delivery);

      logger.audit('report_delivered', {
        deliveryId,
        reportId: delivery.reportId,
        clientId: delivery.clientId,
        deliveryMethod: delivery.deliveryMethod,
      });

      return { success: true, deliveryId, accessLink };
    } catch (error) {
      // Update delivery status to failed
      await this.prisma.reportDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          failureReason: error.message,
          attemptedAt: new Date(),
        },
      });

      logger.error('Failed to execute report delivery:', error);
      throw error;
    }
  }

  /**
   * Generate PDF report
   */
  async generatePDFReport(report) {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const filename = `report_${report.id}_${Date.now()}.pdf`;
      const filepath = path.join(process.env.UPLOAD_DIR || './uploads', 'reports', filename);

      // Ensure directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      // Create write stream
      const stream = require('fs').createWriteStream(filepath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).text('Security Report', { align: 'center' });
      doc.moveDown();

      // Report details
      doc.fontSize(14).text(`Report ID: ${report.id}`);
      doc.text(`Type: ${report.reportType}`);
      doc.text(`Title: ${report.title}`);
      doc.text(`Site: ${report.shift.site.name}`);
      doc.text(`Agent: ${report.agent.user.profile?.firstName} ${report.agent.user.profile?.lastName}`);
      doc.text(`Date: ${new Date(report.createdAt).toLocaleDateString()}`);
      doc.text(`Status: ${report.status}`);
      doc.moveDown();

      // Content
      doc.fontSize(16).text('Report Content:', { underline: true });
      doc.moveDown();
      doc.fontSize(12);

      if (report.content?.description) {
        doc.text(report.content.description);
        doc.moveDown();
      }

      // Observations
      if (report.observations && report.observations.length > 0) {
        doc.fontSize(14).text('Observations:', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        report.observations.forEach((obs, index) => {
          doc.text(`${index + 1}. ${obs}`);
        });
        doc.moveDown();
      }

      // Incidents
      if (report.incidents && report.incidents.length > 0) {
        doc.fontSize(14).text('Incidents:', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        report.incidents.forEach((incident, index) => {
          doc.text(`${index + 1}. ${incident.description}`);
          if (incident.severity) {
            doc.text(`   Severity: ${incident.severity}`);
          }
          if (incident.timestamp) {
            doc.text(`   Time: ${new Date(incident.timestamp).toLocaleString()}`);
          }
        });
        doc.moveDown();
      }

      // Weather conditions
      if (report.weatherConditions) {
        doc.fontSize(14).text('Weather Conditions:', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        doc.text(`Temperature: ${report.weatherConditions.temperature || 'N/A'}`);
        doc.text(`Conditions: ${report.weatherConditions.conditions || 'N/A'}`);
        doc.text(`Visibility: ${report.weatherConditions.visibility || 'N/A'}`);
        doc.moveDown();
      }

      // Equipment status
      if (report.equipmentStatus) {
        doc.fontSize(14).text('Equipment Status:', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        Object.entries(report.equipmentStatus).forEach(([equipment, status]) => {
          doc.text(`${equipment}: ${status}`);
        });
        doc.moveDown();
      }

      // Media files
      if (report.mediaFiles && report.mediaFiles.length > 0) {
        doc.fontSize(14).text('Attachments:', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        report.mediaFiles.forEach((file, index) => {
          doc.text(`${index + 1}. ${file.originalFilename} (${file.fileType})`);
          if (file.description) {
            doc.text(`   Description: ${file.description}`);
          }
        });
        doc.moveDown();
      }

      // QR code for verification
      const qrCodeData = `${process.env.CLIENT_PORTAL_URL}/reports/${report.id}/verify`;
      const qrCodeImage = await QRCode.toBuffer(qrCodeData);
      doc.addPage();
      doc.fontSize(14).text('Report Verification:', { underline: true });
      doc.moveDown();
      doc.text('Scan this QR code to verify the authenticity of this report:');
      doc.moveDown();
      doc.image(qrCodeImage, { width: 150 });

      // Footer
      doc.fontSize(10).text(`Generated on ${new Date().toLocaleString()}`, {
        align: 'center',
      });

      doc.end();

      // Wait for PDF generation to complete
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      return filepath;
    } catch (error) {
      logger.error('Failed to generate PDF report:', error);
      throw error;
    }
  }

  /**
   * Create client access link
   */
  async createClientAccessLink(delivery) {
    const baseUrl = process.env.CLIENT_PORTAL_URL || 'https://client.bahinlink.com';
    return `${baseUrl}/reports/${delivery.reportId}?token=${delivery.deliveryToken}`;
  }

  /**
   * Send delivery email
   */
  async sendDeliveryEmail(delivery, pdfPath, accessLink) {
    try {
      const client = delivery.client;
      const report = delivery.report;

      const emailData = {
        to: client.contactEmail,
        subject: `Security Report - ${report.shift.site.name} - ${new Date(report.createdAt).toLocaleDateString()}`,
        template: 'report-delivery',
        data: {
          clientName: client.companyName,
          reportTitle: report.title,
          siteName: report.shift.site.name,
          reportDate: new Date(report.createdAt).toLocaleDateString(),
          agentName: `${report.agent.user.profile?.firstName} ${report.agent.user.profile?.lastName}`,
          accessLink,
          reportId: report.id,
        },
        attachments: [
          {
            filename: `security_report_${report.id}.pdf`,
            path: pdfPath,
          },
        ],
      };

      await this.emailService.sendEmail(emailData);
    } catch (error) {
      logger.error('Failed to send delivery email:', error);
      throw error;
    }
  }

  /**
   * Create client notification
   */
  async createClientNotification(delivery) {
    try {
      // Get client users
      const clientUsers = await this.prisma.user.findMany({
        where: {
          role: 'CLIENT',
          clientId: delivery.clientId,
          status: 'ACTIVE',
        },
      });

      // Create notifications for all client users
      const notifications = clientUsers.map(user => ({
        id: uuidv4(),
        userId: user.id,
        type: 'INFO',
        title: 'New Security Report Available',
        message: `A new security report for ${delivery.report.shift.site.name} is now available for review`,
        data: {
          reportId: delivery.reportId,
          deliveryId: delivery.id,
          siteName: delivery.report.shift.site.name,
        },
        channels: ['PUSH', 'EMAIL'],
        status: 'PENDING',
      }));

      if (notifications.length > 0) {
        await this.prisma.notification.createMany({
          data: notifications,
        });
      }
    } catch (error) {
      logger.error('Failed to create client notification:', error);
    }
  }

  /**
   * Queue delivery for later execution
   */
  queueDelivery(deliveryId, scheduledTime) {
    const delay = scheduledTime.getTime() - Date.now();
    
    if (delay > 0) {
      setTimeout(async () => {
        try {
          await this.executeDelivery(deliveryId);
          this.deliveryQueue.delete(deliveryId);
        } catch (error) {
          logger.error('Queued delivery failed:', error);
        }
      }, delay);

      this.deliveryQueue.set(deliveryId, {
        scheduledTime,
        timeout: delay,
      });
    }
  }

  /**
   * Process client signature
   */
  async processClientSignature(reportId, signatureData) {
    try {
      const { signature, signedBy, feedback, approved } = signatureData;

      const report = await this.prisma.report.update({
        where: { id: reportId },
        data: {
          clientSignature: {
            signature,
            signedBy,
            signedAt: new Date(),
            feedback,
            approved,
          },
          status: approved ? 'CLIENT_APPROVED' : 'CLIENT_REJECTED',
          clientApprovedAt: approved ? new Date() : null,
        },
        include: {
          shift: {
            include: {
              site: {
                include: {
                  client: true,
                },
              },
            },
          },
        },
      });

      // Create workflow entry
      await this.prisma.reportWorkflow.create({
        data: {
          id: uuidv4(),
          reportId,
          action: approved ? 'CLIENT_APPROVED' : 'CLIENT_REJECTED',
          metadata: {
            signedBy,
            feedback,
            signedAt: new Date(),
          },
          timestamp: new Date(),
        },
      });

      // Notify supervisors and agents
      await this.createSignatureNotifications(report, approved);

      logger.audit('client_signature_processed', {
        reportId,
        signedBy,
        approved,
        feedback: feedback ? 'provided' : 'none',
      });

      return { success: true, report };
    } catch (error) {
      logger.error('Failed to process client signature:', error);
      throw error;
    }
  }

  /**
   * Create signature notifications
   */
  async createSignatureNotifications(report, approved) {
    try {
      const notifications = [];

      // Notify the agent
      notifications.push({
        id: uuidv4(),
        userId: report.agentId,
        type: 'INFO',
        title: `Report ${approved ? 'Approved' : 'Rejected'} by Client`,
        message: `Your report for ${report.shift.site.name} has been ${approved ? 'approved' : 'rejected'} by the client`,
        data: {
          reportId: report.id,
          approved,
          siteName: report.shift.site.name,
        },
        channels: ['PUSH', 'EMAIL'],
        status: 'PENDING',
      });

      // Notify supervisors
      const supervisors = await this.prisma.user.findMany({
        where: {
          role: { in: ['ADMIN', 'SUPERVISOR'] },
          status: 'ACTIVE',
        },
      });

      supervisors.forEach(supervisor => {
        notifications.push({
          id: uuidv4(),
          userId: supervisor.id,
          type: 'INFO',
          title: `Client ${approved ? 'Approved' : 'Rejected'} Report`,
          message: `Report for ${report.shift.site.name} has been ${approved ? 'approved' : 'rejected'} by client`,
          data: {
            reportId: report.id,
            approved,
            siteName: report.shift.site.name,
            clientName: report.shift.site.client.companyName,
          },
          channels: ['PUSH'],
          status: 'PENDING',
        });
      });

      if (notifications.length > 0) {
        await this.prisma.notification.createMany({
          data: notifications,
        });
      }
    } catch (error) {
      logger.error('Failed to create signature notifications:', error);
    }
  }

  /**
   * Get delivery status
   */
  async getDeliveryStatus(reportId) {
    try {
      const deliveries = await this.prisma.reportDelivery.findMany({
        where: { reportId },
        orderBy: { createdAt: 'desc' },
      });

      return deliveries;
    } catch (error) {
      logger.error('Failed to get delivery status:', error);
      throw error;
    }
  }

  /**
   * Retry failed delivery
   */
  async retryDelivery(deliveryId) {
    try {
      const delivery = await this.prisma.reportDelivery.findUnique({
        where: { id: deliveryId },
      });

      if (!delivery || delivery.status !== 'FAILED') {
        throw new Error('Delivery not found or not in failed status');
      }

      // Reset delivery status
      await this.prisma.reportDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SCHEDULED',
          failureReason: null,
          attemptedAt: null,
        },
      });

      // Execute delivery
      return await this.executeDelivery(deliveryId);
    } catch (error) {
      logger.error('Failed to retry delivery:', error);
      throw error;
    }
  }
}

module.exports = ReportDeliveryService;
