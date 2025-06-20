require('dotenv').config();

const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  API_VERSION: process.env.API_VERSION || 'v1',

  // Database
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_POOL_SIZE: parseInt(process.env.DATABASE_POOL_SIZE, 10) || 20,
  DATABASE_TIMEOUT: parseInt(process.env.DATABASE_TIMEOUT, 10) || 30000,

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_TTL: parseInt(process.env.REDIS_TTL, 10) || 3600,

  // Clerk Authentication
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,

  // Encryption (for general data encryption, not authentication)
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'your-32-byte-encryption-key-here',

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3001',
  CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true',

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000,
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 5,

  // File Storage (AWS S3)
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || 'bahinlink-media',
  AWS_S3_REGION: process.env.AWS_S3_REGION || 'us-east-1',

  // External APIs
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  GOOGLE_GEOCODING_API_KEY: process.env.GOOGLE_GEOCODING_API_KEY,

  // Push Notifications
  FCM_SERVER_KEY: process.env.FCM_SERVER_KEY,
  FCM_SENDER_ID: process.env.FCM_SENDER_ID,

  // SMS/Email Services
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || 'noreply@bahinlink.com',
  SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME || 'BahinLink',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || 'logs/app.log',

  // Security
  HELMET_CSP_ENABLED: process.env.HELMET_CSP_ENABLED === 'true',
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',

  // Monitoring
  SENTRY_DSN: process.env.SENTRY_DSN,
  NEW_RELIC_LICENSE_KEY: process.env.NEW_RELIC_LICENSE_KEY,

  // Development/Testing
  MOCK_EXTERNAL_SERVICES: process.env.MOCK_EXTERNAL_SERVICES === 'true',
  ENABLE_API_DOCS: process.env.ENABLE_API_DOCS === 'true',
  ENABLE_PRISMA_STUDIO: process.env.ENABLE_PRISMA_STUDIO === 'true',

  // Geofencing
  DEFAULT_GEOFENCE_RADIUS: parseInt(process.env.DEFAULT_GEOFENCE_RADIUS, 10) || 100,
  MAX_GEOFENCE_RADIUS: parseInt(process.env.MAX_GEOFENCE_RADIUS, 10) || 1000,

  // File Upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'application/pdf',
  ],

  // Session Management (handled by Clerk)
  // SESSION_TIMEOUT - Managed by Clerk
  // REFRESH_TOKEN_ROTATION - Managed by Clerk
  // DEVICE_TRUST_DURATION - Managed by Clerk

  // Background Jobs
  CRON_CLEANUP_ENABLED: process.env.CRON_CLEANUP_ENABLED === 'true',
  CRON_BACKUP_ENABLED: process.env.CRON_BACKUP_ENABLED === 'true',
  CRON_NOTIFICATIONS_ENABLED: process.env.CRON_NOTIFICATIONS_ENABLED === 'true',

  // Feature Flags
  FEATURE_2FA_ENABLED: process.env.FEATURE_2FA_ENABLED === 'true',
  FEATURE_OFFLINE_SYNC: process.env.FEATURE_OFFLINE_SYNC === 'true',
  FEATURE_REAL_TIME_TRACKING: process.env.FEATURE_REAL_TIME_TRACKING === 'true',
  FEATURE_CLIENT_PORTAL: process.env.FEATURE_CLIENT_PORTAL === 'true',

  // Validation
  validate() {
    const required = [
      'DATABASE_URL',
      'CLERK_SECRET_KEY',
    ];

    const missing = required.filter(key => !this[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate Clerk secret key format
    if (this.CLERK_SECRET_KEY && !this.CLERK_SECRET_KEY.startsWith('sk_')) {
      throw new Error('CLERK_SECRET_KEY must start with "sk_"');
    }

    // Validate encryption key length
    if (this.ENCRYPTION_KEY && this.ENCRYPTION_KEY.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }

    return true;
  },
};

// Validate configuration on load
if (process.env.NODE_ENV !== 'test') {
  config.validate();
}

module.exports = config;
