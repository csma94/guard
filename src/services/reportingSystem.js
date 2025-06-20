const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * Advanced digital reporting system with workflows and approvals
 */
class ReportingSystemService {
  constructor(prisma, io) {
    this.prisma = prisma;
    this.io = io;
  }

  /**
   * Create a new report with intelligent validation
   */
  async createReport(reportData, createdBy) {
    try {
      const {
        shiftId,
        siteId,
        reportType,
        title,
        content,
        observations,
        incidents = [],
        weatherConditions,
        equipmentStatus,
        priority = 'NORMAL',
        templateId = null,
        isDraft = true,
      } = reportData;

      // Validate shift and site
      await this.validateReportContext(shiftId, siteId, createdBy);

      // Apply template if specified
      let processedContent = content;
      if (templateId) {
        processedContent = await this.applyReportTemplate(templateId, content);
      }

      // Create the report
      const report = await this.prisma.report.create({
        data: {
          id: uuidv4(),
          shiftId,
          siteId,
          agentId: createdBy,
          reportType,
          title,
          content: processedContent,
          observations,
          incidents,
          weatherConditions,
          equipmentStatus,
          priority,
          status: isDraft ? 'DRAFT' : 'SUBMITTED',
          submittedAt: isDraft ? null : new Date(),
        },
        include: {
          shift: {
            include: {
              site: {
                select: {
                  id: true,
                  name: true,
                  client: {
                    select: {
                      id: true,
                      companyName: true,
                    },
                  },
                },
              },
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
      });

      // Create workflow entry
      await this.createReportWorkflow(report.id, isDraft ? 'DRAFT_CREATED' : 'SUBMITTED');

      // Emit real-time update
      this.emitReportUpdate(report, 'created');

      logger.audit('report_created', {
        createdBy,
        reportId: report.id,
        reportType,
        shiftId,
        siteId,
        isDraft,
      });

      return {
        success: true,
        report,
        message: isDraft ? 'Report draft created successfully' : 'Report submitted successfully',
      };
    } catch (error) {
      logger.error('Failed to create report:', error);
      throw error;
    }
  }

  /**
   * Submit report for review
   */
  async submitReport(reportId, submittedBy, submissionData = {}) {
    try {
      const { finalReview = false, clientNotification = true } = submissionData;

      // Get current report
      const report = await this.prisma.report.findUnique({
        where: { id: reportId },
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
          mediaFiles: true,
        },
      });

      if (!report) {
        throw new Error('Report not found');
      }

      if (report.agentId !== submittedBy) {
        throw new Error('Only the report author can submit the report');
      }

      if (report.status !== 'DRAFT') {
        throw new Error('Only draft reports can be submitted');
      }

      // Validate report completeness
      const validation = await this.validateReportCompleteness(report);
      if (!validation.isComplete) {
        return {
          success: false,
          errors: validation.errors,
          message: 'Report is incomplete and cannot be submitted',
        };
      }

      // Update report status
      const updatedReport = await this.prisma.report.update({
        where: { id: reportId },
        data: {
          status: 'SUBMITTED',
          submittedAt: new Date(),
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
      });

      // Create workflow entry
      await this.createReportWorkflow(reportId, 'SUBMITTED', {
        submittedBy,
        finalReview,
      });

      // Create notifications
      await this.createSubmissionNotifications(updatedReport, clientNotification);

      // Emit real-time update
      this.emitReportUpdate(updatedReport, 'submitted');

      logger.audit('report_submitted', {
        submittedBy,
        reportId,
        finalReview,
        clientNotification,
      });

      return {
        success: true,
        report: updatedReport,
        message: 'Report submitted successfully',
      };
    } catch (error) {
      logger.error('Failed to submit report:', error);
      throw error;
    }
  }

  /**
   * Review and approve/reject report
   */
  async reviewReport(reportId, reviewData, reviewedBy) {
    try {
      const {
        action, // 'APPROVE', 'REJECT', 'REQUEST_CHANGES'
        reviewerNotes,
        clientApprovalRequired = false,
        scheduledDelivery = null,
      } = reviewData;

      // Get current report
      const report = await this.prisma.report.findUnique({
        where: { id: reportId },
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

      if (!report) {
        throw new Error('Report not found');
      }

      if (report.status !== 'SUBMITTED' && report.status !== 'UNDER_REVIEW') {
        throw new Error('Report is not in a reviewable state');
      }

      // Determine new status based on action
      let newStatus;
      switch (action) {
        case 'APPROVE':
          newStatus = clientApprovalRequired ? 'PENDING_CLIENT_APPROVAL' : 'APPROVED';
          break;
        case 'REJECT':
          newStatus = 'REJECTED';
          break;
        case 'REQUEST_CHANGES':
          newStatus = 'CHANGES_REQUESTED';
          break;
        default:
          throw new Error('Invalid review action');
      }

      // Update report
      const updatedReport = await this.prisma.report.update({
        where: { id: reportId },
        data: {
          status: newStatus,
          reviewedBy,
          reviewedAt: new Date(),
          reviewerNotes,
          ...(scheduledDelivery && { scheduledDelivery: new Date(scheduledDelivery) }),
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
          reviewer: {
            select: {
              id: true,
              username: true,
              profile: true,
            },
          },
        },
      });

      // Create workflow entry
      await this.createReportWorkflow(reportId, action, {
        reviewedBy,
        reviewerNotes,
        clientApprovalRequired,
      });

      // Create notifications
      await this.createReviewNotifications(updatedReport, action);

      // Schedule client delivery if approved
      if (newStatus === 'APPROVED' && !clientApprovalRequired) {
        await this.scheduleClientDelivery(updatedReport, scheduledDelivery);
      }

      // Emit real-time update
      this.emitReportUpdate(updatedReport, 'reviewed', { action, reviewerNotes });

      logger.audit('report_reviewed', {
        reviewedBy,
        reportId,
        action,
        newStatus,
        clientApprovalRequired,
      });

      return {
        success: true,
        report: updatedReport,
        action,
        message: `Report ${action.toLowerCase()} successfully`,
      };
    } catch (error) {
      logger.error('Failed to review report:', error);
      throw error;
    }
  }

  /**
   * Handle client signature and approval
   */
  async processClientSignature(reportId, signatureData, processedBy) {
    try {
      const {
        clientSignature,
        clientFeedback = '',
        clientApproval = true,
        signedAt = new Date(),
      } = signatureData;

      // Get current report
      const report = await this.prisma.report.findUnique({
        where: { id: reportId },
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

      if (!report) {
        throw new Error('Report not found');
      }

      if (report.status !== 'PENDING_CLIENT_APPROVAL' && report.status !== 'APPROVED') {
        throw new Error('Report is not ready for client signature');
      }

      // Update report with client signature
      const updatedReport = await this.prisma.report.update({
        where: { id: reportId },
        data: {
          clientSignature: {
            signature: clientSignature,
            signedAt,
            signedBy: processedBy,
            feedback: clientFeedback,
            approved: clientApproval,
          },
          status: clientApproval ? 'CLIENT_APPROVED' : 'CLIENT_REJECTED',
          clientApprovedAt: clientApproval ? new Date() : null,
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
      });

      // Create workflow entry
      await this.createReportWorkflow(reportId, clientApproval ? 'CLIENT_APPROVED' : 'CLIENT_REJECTED', {
        processedBy,
        clientFeedback,
        signedAt,
      });

      // Create notifications
      await this.createClientSignatureNotifications(updatedReport, clientApproval);

      // Emit real-time update
      this.emitReportUpdate(updatedReport, 'client_signed', { approved: clientApproval });

      logger.audit('report_client_signature', {
        processedBy,
        reportId,
        clientApproval,
        signedAt,
      });

      return {
        success: true,
        report: updatedReport,
        clientApproval,
        message: clientApproval ? 'Report approved by client' : 'Report rejected by client',
      };
    } catch (error) {
      logger.error('Failed to process client signature:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive report analytics
   */
  async generateReportAnalytics(filters = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        endDate = new Date(),
        siteId,
        agentId,
        reportType,
        clientId,
      } = filters;

      const where = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        deletedAt: null,
        ...(siteId && { siteId }),
        ...(agentId && { agentId }),
        ...(reportType && { reportType }),
        ...(clientId && {
          shift: {
            site: {
              clientId,
            },
          },
        }),
      };

      // Get basic metrics
      const [
        totalReports,
        draftReports,
        submittedReports,
        approvedReports,
        rejectedReports,
        avgProcessingTime,
      ] = await Promise.all([
        this.prisma.report.count({ where }),
        this.prisma.report.count({ where: { ...where, status: 'DRAFT' } }),
        this.prisma.report.count({ where: { ...where, status: 'SUBMITTED' } }),
        this.prisma.report.count({ where: { ...where, status: { in: ['APPROVED', 'CLIENT_APPROVED'] } } }),
        this.prisma.report.count({ where: { ...where, status: { in: ['REJECTED', 'CLIENT_REJECTED'] } } }),
        this.calculateAverageProcessingTime(where),
      ]);

      // Get report type distribution
      const reportTypeDistribution = await this.prisma.report.groupBy({
        by: ['reportType'],
        where,
        _count: {
          id: true,
        },
      });

      // Get agent performance
      const agentPerformance = await this.getAgentReportPerformance(where);

      // Get client satisfaction metrics
      const clientSatisfaction = await this.getClientSatisfactionMetrics(where);

      // Get trend data
      const trends = await this.getReportTrends(startDate, endDate, where);

      return {
        period: { startDate, endDate },
        summary: {
          totalReports,
          draftReports,
          submittedReports,
          approvedReports,
          rejectedReports,
          completionRate: totalReports > 0 ? ((approvedReports / totalReports) * 100).toFixed(1) : 0,
          avgProcessingTime: avgProcessingTime || 0,
        },
        distribution: {
          byType: reportTypeDistribution,
          byStatus: {
            draft: draftReports,
            submitted: submittedReports,
            approved: approvedReports,
            rejected: rejectedReports,
          },
        },
        performance: {
          agents: agentPerformance,
          clientSatisfaction,
        },
        trends,
        filters,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to generate report analytics:', error);
      throw error;
    }
  }

  // Helper methods

  async validateReportContext(shiftId, siteId, agentId) {
    // Validate shift exists and belongs to agent
    const shift = await this.prisma.shift.findFirst({
      where: {
        id: shiftId,
        agentId,
        siteId,
        deletedAt: null,
      },
    });

    if (!shift) {
      throw new Error('Invalid shift or access denied');
    }

    return shift;
  }

  async applyReportTemplate(templateId, content) {
    // This would apply a report template to the content
    // For now, return the content as-is
    return content;
  }

  async validateReportCompleteness(report) {
    const errors = [];

    // Check required fields based on report type
    if (!report.title || report.title.trim().length === 0) {
      errors.push('Report title is required');
    }

    if (!report.content || Object.keys(report.content).length === 0) {
      errors.push('Report content is required');
    }

    // Check for required media files for certain report types
    if (report.reportType === 'INCIDENT' && report.mediaFiles.length === 0) {
      errors.push('Incident reports require at least one media file');
    }

    return {
      isComplete: errors.length === 0,
      errors,
    };
  }

  async createReportWorkflow(reportId, action, metadata = {}) {
    await this.prisma.reportWorkflow.create({
      data: {
        id: uuidv4(),
        reportId,
        action,
        metadata,
        timestamp: new Date(),
      },
    });
  }

  async createSubmissionNotifications(report, clientNotification) {
    // Create notification for supervisors
    await this.prisma.notification.create({
      data: {
        id: uuidv4(),
        recipientId: report.shift.supervisorId || report.agentId,
        type: 'INFO',
        title: 'Report Submitted for Review',
        message: `Report "${report.title}" has been submitted for review`,
        data: {
          reportId: report.id,
          reportType: report.reportType,
          agentId: report.agentId,
          siteId: report.siteId,
        },
        channels: ['PUSH', 'EMAIL'],
        status: 'PENDING',
      },
    });

    // Create client notification if requested
    if (clientNotification) {
      // Implementation would depend on client notification preferences
    }
  }

  async createReviewNotifications(report, action) {
    // Notify the report author
    await this.prisma.notification.create({
      data: {
        id: uuidv4(),
        recipientId: report.agent.user.id,
        type: action === 'APPROVE' ? 'INFO' : 'WARNING',
        title: `Report ${action.charAt(0) + action.slice(1).toLowerCase()}`,
        message: `Your report "${report.title}" has been ${action.toLowerCase()}`,
        data: {
          reportId: report.id,
          action,
          reviewerNotes: report.reviewerNotes,
        },
        channels: ['PUSH', 'EMAIL'],
        status: 'PENDING',
      },
    });
  }

  async createClientSignatureNotifications(report, approved) {
    // Notify relevant stakeholders about client signature
    await this.prisma.notification.create({
      data: {
        id: uuidv4(),
        recipientId: report.agentId,
        type: approved ? 'INFO' : 'WARNING',
        title: `Client ${approved ? 'Approved' : 'Rejected'} Report`,
        message: `Client has ${approved ? 'approved' : 'rejected'} report "${report.title}"`,
        data: {
          reportId: report.id,
          clientApproval: approved,
        },
        channels: ['PUSH', 'EMAIL'],
        status: 'PENDING',
      },
    });
  }

  async scheduleClientDelivery(report, scheduledTime) {
    // Schedule report delivery to client
    // This would integrate with email/notification services
    logger.info('Report delivery scheduled', {
      reportId: report.id,
      clientId: report.shift.site.client.id,
      scheduledTime,
    });
  }

  emitReportUpdate(report, action, metadata = {}) {
    if (this.io) {
      this.io.to('role:supervisor').to('role:admin').emit('report_update', {
        action,
        report: {
          id: report.id,
          title: report.title,
          reportType: report.reportType,
          status: report.status,
          agentId: report.agentId,
          siteId: report.siteId,
          siteName: report.shift?.site?.name,
          agentName: report.agent?.user?.profile?.firstName + ' ' + report.agent?.user?.profile?.lastName,
        },
        metadata,
        timestamp: new Date(),
      });

      // Notify the agent
      if (report.agent?.user?.id) {
        this.io.to(`user:${report.agent.user.id}`).emit('my_report_update', {
          action,
          report,
          metadata,
          timestamp: new Date(),
        });
      }
    }
  }

  async calculateAverageProcessingTime(where) {
    // Calculate average time from submission to approval
    const reports = await this.prisma.report.findMany({
      where: {
        ...where,
        submittedAt: { not: null },
        reviewedAt: { not: null },
      },
      select: {
        submittedAt: true,
        reviewedAt: true,
      },
    });

    if (reports.length === 0) return 0;

    const totalTime = reports.reduce((sum, report) => {
      return sum + (report.reviewedAt - report.submittedAt);
    }, 0);

    return Math.round(totalTime / reports.length / (1000 * 60 * 60)); // Hours
  }

  async getAgentReportPerformance(where) {
    // Get agent performance metrics
    return await this.prisma.report.groupBy({
      by: ['agentId'],
      where,
      _count: {
        id: true,
      },
      _avg: {
        // This would require additional fields in the schema
      },
    });
  }

  async getClientSatisfactionMetrics(where) {
    // Calculate client satisfaction based on approvals/rejections
    const clientApprovals = await this.prisma.report.count({
      where: {
        ...where,
        status: 'CLIENT_APPROVED',
      },
    });

    const clientRejections = await this.prisma.report.count({
      where: {
        ...where,
        status: 'CLIENT_REJECTED',
      },
    });

    const total = clientApprovals + clientRejections;
    const satisfactionRate = total > 0 ? (clientApprovals / total * 100).toFixed(1) : 0;

    return {
      approvals: clientApprovals,
      rejections: clientRejections,
      satisfactionRate: parseFloat(satisfactionRate),
    };
  }

  async getReportTrends(startDate, endDate, where) {
    // Generate trend data for reports over time
    // This would require more complex date grouping queries
    return {
      daily: [],
      weekly: [],
      monthly: [],
    };
  }
  /**
   * Bulk approve reports
   */
  async bulkApproveReports(reportIds, approvedBy, reviewerNotes = '') {
    try {
      // Validate reports exist and are in correct status
      const reports = await this.prisma.report.findMany({
        where: {
          id: { in: reportIds },
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
          deletedAt: null
        },
        include: {
          shift: {
            include: {
              site: {
                include: { client: true }
              }
            }
          },
          agent: {
            include: {
              user: {
                select: { id: true, username: true, profile: true }
              }
            }
          }
        }
      });

      if (reports.length === 0) {
        throw new Error('No valid reports found for approval');
      }

      const results = {
        approvedCount: 0,
        failedCount: 0,
        errors: [],
        approvedReports: []
      };

      // Process each report
      for (const report of reports) {
        try {
          const updatedReport = await this.prisma.report.update({
            where: { id: report.id },
            data: {
              status: 'APPROVED',
              reviewedBy: approvedBy,
              reviewedAt: new Date(),
              reviewerNotes
            }
          });

          // Create workflow entry
          await this.createReportWorkflow(report.id, 'APPROVE', {
            reviewedBy: approvedBy,
            reviewerNotes,
            bulkOperation: true
          });

          // Create notification
          await this.createReviewNotifications(updatedReport, 'APPROVE');

          results.approvedCount++;
          results.approvedReports.push({
            id: report.id,
            title: report.title,
            agentName: `${report.agent.user.profile?.firstName || ''} ${report.agent.user.profile?.lastName || ''}`.trim()
          });

          // Emit real-time update
          this.emitReportUpdate(updatedReport, 'bulk_approved');

        } catch (error) {
          results.failedCount++;
          results.errors.push({
            reportId: report.id,
            error: error.message
          });
        }
      }

      logger.audit('bulk_reports_approved', {
        approvedBy,
        reportIds,
        approvedCount: results.approvedCount,
        failedCount: results.failedCount
      });

      return results;

    } catch (error) {
      logger.error('Failed to bulk approve reports:', error);
      throw error;
    }
  }

  /**
   * Export reports in various formats
   */
  async exportReports(filters, format, user) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate = new Date(),
        siteId,
        reportType,
        status
      } = filters;

      // Build where clause based on user permissions
      const where = {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        },
        deletedAt: null
      };

      if (siteId) where.siteId = siteId;
      if (reportType) where.reportType = reportType;
      if (status) where.status = status;

      // Apply user-specific filters
      if (user.role === 'AGENT' && user.agent) {
        where.agentId = user.agent.id;
      } else if (user.role === 'CLIENT' && user.client) {
        where.shift = {
          site: {
            clientId: user.client.id
          }
        };
      }

      // Get reports
      const reports = await this.prisma.report.findMany({
        where,
        include: {
          agent: {
            include: {
              user: {
                select: { id: true, username: true, profile: true }
              }
            }
          },
          site: {
            select: { id: true, name: true, address: true }
          },
          shift: {
            select: { id: true, startTime: true, endTime: true }
          },
          mediaFiles: {
            select: { id: true, filename: true, fileType: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Generate export data based on format
      let exportData;
      switch (format) {
        case 'csv':
          exportData = this.generateCSVExport(reports);
          break;
        case 'pdf':
          exportData = await this.generatePDFExport(reports, filters);
          break;
        case 'excel':
          exportData = await this.generateExcelExport(reports);
          break;
        default:
          throw new Error('Unsupported export format');
      }

      // Log export activity
      logger.audit('reports_exported', {
        exportedBy: user.id,
        format,
        filters,
        recordCount: reports.length
      });

      return {
        success: true,
        data: exportData,
        recordCount: reports.length,
        format
      };

    } catch (error) {
      logger.error('Failed to export reports:', error);
      throw error;
    }
  }

  /**
   * Generate CSV export
   */
  generateCSVExport(reports) {
    const headers = [
      'ID',
      'Title',
      'Type',
      'Status',
      'Priority',
      'Agent',
      'Site',
      'Created At',
      'Submitted At',
      'Reviewed At',
      'Observations',
      'Weather Conditions',
      'Equipment Status',
      'Media Files Count'
    ];

    const rows = reports.map(report => [
      report.id,
      report.title,
      report.reportType,
      report.status,
      report.priority,
      `${report.agent.user.profile?.firstName || ''} ${report.agent.user.profile?.lastName || ''}`.trim(),
      report.site.name,
      report.createdAt.toISOString(),
      report.submittedAt ? report.submittedAt.toISOString() : '',
      report.reviewedAt ? report.reviewedAt.toISOString() : '',
      report.observations || '',
      report.weatherConditions || '',
      report.equipmentStatus || '',
      report.mediaFiles.length
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    return csvContent;
  }

  /**
   * Generate PDF export (placeholder - would use a PDF library like puppeteer or jsPDF)
   */
  async generatePDFExport(reports, filters) {
    // This would typically use a PDF generation library
    // For now, return a simple text representation
    const content = `
REPORTS EXPORT
Generated: ${new Date().toISOString()}
Period: ${filters.startDate} to ${filters.endDate}
Total Reports: ${reports.length}

${reports.map(report => `
Report ID: ${report.id}
Title: ${report.title}
Type: ${report.reportType}
Status: ${report.status}
Agent: ${report.agent.user.profile?.firstName || ''} ${report.agent.user.profile?.lastName || ''}
Site: ${report.site.name}
Created: ${report.createdAt.toISOString()}
---
`).join('')}
    `;

    return Buffer.from(content, 'utf8');
  }

  /**
   * Generate Excel export (placeholder - would use a library like exceljs)
   */
  async generateExcelExport(reports) {
    // This would typically use an Excel generation library
    // For now, return CSV format as fallback
    return this.generateCSVExport(reports);
  }
}

module.exports = ReportingSystemService;
