import { Config } from './types';

export const productionConfig: Config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    wsPort: parseInt(process.env.WS_PORT || '3001', 10),
    clusterMode: process.env.CLUSTER_MODE === 'true',
    workers: process.env.WORKERS === 'auto' ? 'auto' : parseInt(process.env.WORKERS || '1', 10),
    keepAliveTimeout: 65000,
    headersTimeout: 66000,
    maxHeaderSize: 16384,
    requestTimeout: 30000,
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL!,
    ssl: process.env.DATABASE_SSL === 'true',
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN || '5', 10),
      max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
      acquireTimeoutMillis: parseInt(process.env.DATABASE_TIMEOUT || '30000', 10),
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    },
    retryAttempts: parseInt(process.env.DATABASE_RETRY_ATTEMPTS || '3', 10),
    retryDelay: 1000,
    autoLoadEntities: false,
    synchronize: false,
    logging: false,
    cache: {
      type: 'redis',
      options: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: 2,
      },
      duration: 30000,
    },
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL!,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
    family: 4,
    keyPrefix: 'bahinlink:',
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  // Clerk Authentication Configuration
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY!,
    webhookSecret: process.env.CLERK_WEBHOOK_SECRET!,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
  },

  // Security Configuration
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY!,
    encryptionAlgorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    hashRounds: parseInt(process.env.HASH_ROUNDS || '12', 10),
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ['https://app.bahinlink.com'],
      credentials: process.env.CORS_CREDENTIALS === 'true',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
      maxAge: 86400,
    },
    helmet: {
      enabled: process.env.HELMET_ENABLED !== 'false',
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", 'wss:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    },
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true',
      standardHeaders: true,
      legacyHeaders: false,
    },
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: {
      enabled: process.env.LOG_FILE_ENABLED === 'true',
      path: process.env.LOG_FILE_PATH || '/app/logs/application.log',
      maxSize: process.env.LOG_MAX_SIZE || '100m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '10', 10),
      compress: process.env.LOG_COMPRESS === 'true',
    },
    console: {
      enabled: true,
      colorize: false,
      timestamp: true,
    },
    errorFile: '/app/logs/error.log',
    accessFile: '/app/logs/access.log',
  },

  // Monitoring Configuration
  monitoring: {
    apm: {
      enabled: process.env.APM_ENABLED === 'true',
      serviceName: process.env.APM_SERVICE_NAME || 'bahinlink-api',
      environment: process.env.APM_ENVIRONMENT || 'production',
      serverUrl: process.env.APM_SERVER_URL,
      secretToken: process.env.APM_SECRET_TOKEN,
    },
    metrics: {
      enabled: process.env.METRICS_ENABLED === 'true',
      port: parseInt(process.env.METRICS_PORT || '9090', 10),
      path: process.env.METRICS_PATH || '/metrics',
      collectDefaultMetrics: true,
      timeout: 10000,
    },
    healthCheck: {
      enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
      path: process.env.HEALTH_CHECK_PATH || '/health',
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),
    },
  },

  // Cache Configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000', 10),
    checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD || '600', 10),
    enabled: process.env.CACHE_ENABLED !== 'false',
    compression: true,
  },

  // File Upload Configuration
  upload: {
    maxSize: process.env.UPLOAD_MAX_SIZE || '50mb',
    allowedTypes: process.env.UPLOAD_ALLOWED_TYPES?.split(',') || [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'video/mp4',
      'audio/mpeg',
    ],
    destination: process.env.UPLOAD_DESTINATION || '/app/uploads',
    tempDir: process.env.UPLOAD_TEMP_DIR || '/tmp/uploads',
    preservePath: false,
    safeFileNames: true,
    createParentPath: true,
  },

  // WebSocket Configuration
  websocket: {
    port: parseInt(process.env.WS_PORT || '3001', 10),
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
    heartbeatTimeout: parseInt(process.env.WS_HEARTBEAT_TIMEOUT || '60000', 10),
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || '10000', 10),
    compression: process.env.WS_COMPRESSION === 'true',
    cors: {
      origin: process.env.WS_CORS_ORIGIN?.split(',') || ['https://app.bahinlink.com'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  },

  // Background Jobs Configuration
  queue: {
    redis: {
      url: process.env.QUEUE_REDIS_URL || process.env.REDIS_URL!,
      db: 1,
    },
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
    maxAttempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS || '3', 10),
    backoffType: process.env.QUEUE_BACKOFF_TYPE || 'exponential',
    backoffDelay: parseInt(process.env.QUEUE_BACKOFF_DELAY || '2000', 10),
    removeOnComplete: 100,
    removeOnFail: 50,
  },

  // External Services Configuration
  services: {
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      s3: {
        bucket: process.env.S3_BUCKET!,
        region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
        cdnUrl: process.env.S3_CDN_URL,
      },
    },
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      databaseUrl: process.env.FIREBASE_DATABASE_URL,
    },
    email: {
      smtp: {
        host: process.env.SMTP_HOST!,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER!,
          pass: process.env.SMTP_PASS!,
        },
      },
      from: process.env.EMAIL_FROM || 'noreply@bahinlink.com',
      fromName: process.env.EMAIL_FROM_NAME || 'BahinLink Security',
    },
    pushNotifications: {
      vapid: {
        publicKey: process.env.VAPID_PUBLIC_KEY!,
        privateKey: process.env.VAPID_PRIVATE_KEY!,
        email: process.env.VAPID_EMAIL!,
      },
      fcm: {
        serverKey: process.env.FCM_SERVER_KEY,
      },
      apns: {
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
        privateKey: process.env.APNS_PRIVATE_KEY,
        production: true,
      },
    },
    google: {
      mapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
      geocodingApiKey: process.env.GOOGLE_GEOCODING_API_KEY,
    },
  },

  // Feature Flags
  features: {
    realTimeTracking: process.env.FEATURE_REAL_TIME_TRACKING === 'true',
    emergencyAlerts: process.env.FEATURE_EMERGENCY_ALERTS === 'true',
    voiceMessages: process.env.FEATURE_VOICE_MESSAGES === 'true',
    videoCalls: process.env.FEATURE_VIDEO_CALLS === 'true',
    biometricAuth: process.env.FEATURE_BIOMETRIC_AUTH === 'true',
    offlineMode: process.env.FEATURE_OFFLINE_MODE === 'true',
    analytics: process.env.FEATURE_ANALYTICS === 'true',
    reporting: process.env.FEATURE_REPORTING === 'true',
  },

  // Performance Configuration
  performance: {
    compression: {
      enabled: process.env.COMPRESSION_ENABLED !== 'false',
      level: parseInt(process.env.COMPRESSION_LEVEL || '6', 10),
      threshold: parseInt(process.env.COMPRESSION_THRESHOLD || '1024', 10),
    },
    etag: process.env.ETAG_ENABLED !== 'false',
    staticCache: {
      maxAge: parseInt(process.env.STATIC_CACHE_MAX_AGE || '31536000', 10),
    },
  },

  // Environment
  environment: 'production',
  debug: false,
  version: process.env.APP_VERSION || '1.0.0',
};
