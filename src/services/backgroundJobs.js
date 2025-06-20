const cron = require('node-cron');
const config = require('../config/config');
const logger = require('../config/logger');

/**
 * Start background jobs
 */
const startBackgroundJobs = (prisma) => {
  logger.info('Starting background jobs...');

  // Data cleanup job - runs daily at 2 AM
  if (config.CRON_CLEANUP_ENABLED) {
    cron.schedule('0 2 * * *', async () => {
      await runDataCleanup(prisma);
    }, {
      timezone: 'UTC',
    });
    logger.info('Data cleanup job scheduled');
  }

  // Notification processing job - runs every 5 minutes
  if (config.CRON_NOTIFICATIONS_ENABLED) {
    cron.schedule('*/5 * * * *', async () => {
      await processNotifications(prisma);
    }, {
      timezone: 'UTC',
    });
    logger.info('Notification processing job scheduled');
  }

  // Performance metrics calculation - runs daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    await calculatePerformanceMetrics(prisma);
  }, {
    timezone: 'UTC',
  });
  logger.info('Performance metrics job scheduled');

  // Session cleanup job - runs every hour
  cron.schedule('0 * * * *', async () => {
    await cleanupExpiredSessions();
  }, {
    timezone: 'UTC',
  });
  logger.info('Session cleanup job scheduled');

  // Shift status update job - runs every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await updateShiftStatuses(prisma);
  }, {
    timezone: 'UTC',
  });
  logger.info('Shift status update job scheduled');
};

/**
 * Data cleanup job
 */
const runDataCleanup = async (prisma) => {
  try {
    logger.info('Starting data cleanup job');
    const startTime = Date.now();

    // Clean up old location tracking data (older than 2 years)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const deletedLocationRecords = await prisma.locationTracking.deleteMany({
      where: {
        createdAt: {
          lt: twoYearsAgo,
        },
      },
    });

    // Clean up old audit logs (older than 7 years)
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

    const deletedAuditLogs = await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: sevenYearsAgo,
        },
      },
    });

    // Clean up old notifications (older than 6 months and read)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const deletedNotifications = await prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: sixMonthsAgo,
        },
        readAt: {
          not: null,
        },
      },
    });

    // Clean up old messages (older than 3 years)
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    const anonymizedMessages = await prisma.message.updateMany({
      where: {
        createdAt: {
          lt: threeYearsAgo,
        },
        message: {
          not: '[DELETED]',
        },
      },
      data: {
        message: '[DELETED]',
      },
    });

    const duration = Date.now() - startTime;
    logger.info('Data cleanup job completed', {
      duration: `${duration}ms`,
      deletedLocationRecords: deletedLocationRecords.count,
      deletedAuditLogs: deletedAuditLogs.count,
      deletedNotifications: deletedNotifications.count,
      anonymizedMessages: anonymizedMessages.count,
    });

  } catch (error) {
    logger.error('Data cleanup job failed', {
      error: error.message,
      stack: error.stack,
    });
  }
};

/**
 * Process pending notifications
 */
const processNotifications = async (prisma) => {
  try {
    logger.info('Processing pending notifications');

    // Get pending notifications
    const pendingNotifications = await prisma.notification.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: {
          lte: new Date(),
        },
      },
      include: {
        recipient: {
          select: {
            id: true,
            email: true,
            profile: true,
            preferences: true,
          },
        },
      },
      take: 100, // Process in batches
    });

    for (const notification of pendingNotifications) {
      try {
        // Process each notification channel
        for (const channel of notification.channels) {
          switch (channel) {
            case 'EMAIL':
              if (notification.recipient.preferences?.notifications?.emailEnabled) {
                await sendEmailNotification(notification);
              }
              break;
            case 'SMS':
              if (notification.recipient.preferences?.notifications?.smsEnabled) {
                await sendSMSNotification(notification);
              }
              break;
            case 'PUSH':
              if (notification.recipient.preferences?.notifications?.pushEnabled) {
                await sendPushNotification(notification);
              }
              break;
            default:
              logger.warn('Unknown notification channel', { channel });
          }
        }

        // Mark notification as sent
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

      } catch (error) {
        logger.error('Failed to process notification', {
          notificationId: notification.id,
          error: error.message,
        });

        // Mark notification as failed
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'FAILED' },
        });
      }
    }

    if (pendingNotifications.length > 0) {
      logger.info('Processed notifications', {
        count: pendingNotifications.length,
      });
    }

  } catch (error) {
    logger.error('Notification processing job failed', {
      error: error.message,
      stack: error.stack,
    });
  }
};

/**
 * Calculate performance metrics for agents
 */
const calculatePerformanceMetrics = async (prisma) => {
  try {
    logger.info('Calculating performance metrics');

    const agents = await prisma.agent.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });

    for (const agent of agents) {
      try {
        // Calculate metrics for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [shiftsCompleted, reportsSubmitted, attendanceRecords] = await Promise.all([
          prisma.shift.count({
            where: {
              agentId: agent.id,
              status: 'COMPLETED',
              startTime: { gte: thirtyDaysAgo },
            },
          }),
          prisma.report.count({
            where: {
              agentId: agent.id,
              status: { in: ['SUBMITTED', 'APPROVED'] },
              createdAt: { gte: thirtyDaysAgo },
            },
          }),
          prisma.attendance.findMany({
            where: {
              agentId: agent.id,
              createdAt: { gte: thirtyDaysAgo },
            },
            select: {
              totalHours: true,
              clockInTime: true,
              shift: {
                select: { startTime: true },
              },
            },
          }),
        ]);

        // Calculate punctuality (on-time clock-ins)
        const onTimeClockIns = attendanceRecords.filter(record => {
          if (!record.clockInTime || !record.shift?.startTime) return false;
          const timeDiff = Math.abs(record.clockInTime.getTime() - record.shift.startTime.getTime());
          return timeDiff <= 15 * 60 * 1000; // Within 15 minutes
        }).length;

        const punctualityRate = attendanceRecords.length > 0 ? 
          (onTimeClockIns / attendanceRecords.length * 100) : 0;

        // Calculate total hours worked
        const totalHours = attendanceRecords.reduce((sum, record) => {
          return sum + (record.totalHours ? parseFloat(record.totalHours) : 0);
        }, 0);

        // Update performance metrics
        await prisma.agent.update({
          where: { id: agent.id },
          data: {
            performanceMetrics: {
              shiftsCompleted,
              reportsSubmitted,
              totalHours: totalHours.toFixed(1),
              punctualityRate: punctualityRate.toFixed(1),
              lastCalculated: new Date(),
              period: '30_days',
            },
          },
        });

      } catch (error) {
        logger.error('Failed to calculate metrics for agent', {
          agentId: agent.id,
          error: error.message,
        });
      }
    }

    logger.info('Performance metrics calculation completed', {
      agentsProcessed: agents.length,
    });

  } catch (error) {
    logger.error('Performance metrics calculation failed', {
      error: error.message,
      stack: error.stack,
    });
  }
};

/**
 * Clean up expired sessions from Redis
 */
const cleanupExpiredSessions = async () => {
  try {
    const { cache } = require('./redis');
    
    // Redis automatically handles TTL expiration, but we can log the cleanup
    logger.info('Session cleanup job completed');

  } catch (error) {
    logger.error('Session cleanup job failed', {
      error: error.message,
    });
  }
};

/**
 * Update shift statuses based on time
 */
const updateShiftStatuses = async (prisma) => {
  try {
    const now = new Date();

    // Mark shifts as in progress if they've started
    const startedShifts = await prisma.shift.updateMany({
      where: {
        status: 'CONFIRMED',
        startTime: { lte: now },
        endTime: { gt: now },
      },
      data: { status: 'IN_PROGRESS' },
    });

    // Mark shifts as completed if they've ended (and no attendance record exists)
    const endedShifts = await prisma.shift.findMany({
      where: {
        status: 'IN_PROGRESS',
        endTime: { lte: now },
      },
      include: {
        attendance: true,
      },
    });

    for (const shift of endedShifts) {
      if (shift.attendance.length > 0) {
        // Check if agent clocked out
        const hasClockOut = shift.attendance.some(att => att.clockOutTime);
        if (hasClockOut) {
          await prisma.shift.update({
            where: { id: shift.id },
            data: { status: 'COMPLETED' },
          });
        }
      } else {
        // No attendance record - mark as no show
        await prisma.shift.update({
          where: { id: shift.id },
          data: { status: 'NO_SHOW' },
        });
      }
    }

    if (startedShifts.count > 0 || endedShifts.length > 0) {
      logger.info('Shift statuses updated', {
        startedShifts: startedShifts.count,
        processedEndedShifts: endedShifts.length,
      });
    }

  } catch (error) {
    logger.error('Shift status update job failed', {
      error: error.message,
      stack: error.stack,
    });
  }
};

/**
 * Real notification service implementations
 */
const sendEmailNotification = async (notification) => {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(config.SENDGRID_API_KEY);

  if (!config.SENDGRID_API_KEY) {
    throw new Error('SendGrid API key not configured');
  }

  const msg = {
    to: notification.recipient.email,
    from: {
      email: config.SENDGRID_FROM_EMAIL,
      name: config.SENDGRID_FROM_NAME,
    },
    subject: notification.title,
    text: notification.message,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${notification.title}</h2>
        <p style="color: #666; line-height: 1.6;">${notification.message}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">
          This is an automated message from BahinLink Workforce Management System.
        </p>
      </div>
    `,
  };

  await sgMail.send(msg);
  logger.info('Email notification sent', {
    notificationId: notification.id,
    recipient: notification.recipient.email,
  });
};

const sendSMSNotification = async (notification) => {
  const twilio = require('twilio');

  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials not configured');
  }

  const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

  const phoneNumber = notification.recipient.profile?.phone;
  if (!phoneNumber) {
    throw new Error('Recipient phone number not available');
  }

  await client.messages.create({
    body: `${notification.title}: ${notification.message}`,
    from: config.TWILIO_PHONE_NUMBER,
    to: phoneNumber,
  });

  logger.info('SMS notification sent', {
    notificationId: notification.id,
    recipient: phoneNumber,
  });
};

const sendPushNotification = async (notification) => {
  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }

  // Get user's FCM tokens (would be stored in user preferences)
  const fcmTokens = notification.recipient.preferences?.fcmTokens || [];

  if (fcmTokens.length === 0) {
    logger.warn('No FCM tokens found for user', {
      userId: notification.recipient.id,
    });
    return;
  }

  const message = {
    notification: {
      title: notification.title,
      body: notification.message,
    },
    data: {
      notificationId: notification.id,
      type: notification.type,
      ...notification.data,
    },
    tokens: fcmTokens,
  };

  const response = await admin.messaging().sendMulticast(message);

  logger.info('Push notification sent', {
    notificationId: notification.id,
    successCount: response.successCount,
    failureCount: response.failureCount,
  });
};

module.exports = {
  startBackgroundJobs,
  runDataCleanup,
  processNotifications,
  calculatePerformanceMetrics,
};
