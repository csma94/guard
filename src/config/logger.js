const winston = require('winston');
const path = require('path');
const config = require('./config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return msg;
  })
);

// Create transports array
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    level: config.LOG_LEVEL,
    format: config.NODE_ENV === 'development' ? consoleFormat : logFormat,
    handleExceptions: true,
    handleRejections: true,
  })
);

// File transports (production and development)
if (config.NODE_ENV !== 'test') {
  // Ensure logs directory exists
  const fs = require('fs');
  const logsDir = path.dirname(config.LOG_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: config.LOG_FILE,
      level: config.LOG_LEVEL,
      format: logFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );

  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );

  // Security log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'warn',
      format: logFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  defaultMeta: {
    service: 'bahinlink-api',
    environment: config.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  },
  transports,
  exitOnError: false,
});

// Add custom logging methods
logger.security = (message, meta = {}) => {
  logger.warn(message, { ...meta, type: 'security' });
};

logger.audit = (message, meta = {}) => {
  logger.info(message, { ...meta, type: 'audit' });
};

logger.performance = (message, meta = {}) => {
  logger.info(message, { ...meta, type: 'performance' });
};

logger.business = (message, meta = {}) => {
  logger.info(message, { ...meta, type: 'business' });
};

// Request logging helper
logger.request = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.id,
    type: 'request',
  };

  if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

// Error logging helper
logger.error = (message, error = {}) => {
  const errorData = {
    message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    type: 'error',
  };

  winston.loggers.get('default').error(errorData);
};

// Database logging helper
logger.database = (operation, table, duration, meta = {}) => {
  logger.info('Database Operation', {
    operation,
    table,
    duration: `${duration}ms`,
    ...meta,
    type: 'database',
  });
};

// Authentication logging helper
logger.auth = (event, userId, meta = {}) => {
  const logLevel = meta.success ? 'info' : 'warn';
  logger[logLevel]('Authentication Event', {
    event,
    userId,
    ...meta,
    type: 'authentication',
  });
};

// Authorization logging helper
logger.authz = (event, userId, resource, meta = {}) => {
  const logLevel = meta.allowed ? 'info' : 'warn';
  logger[logLevel]('Authorization Event', {
    event,
    userId,
    resource,
    ...meta,
    type: 'authorization',
  });
};

// Stream for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

// Handle uncaught exceptions and rejections
if (config.NODE_ENV === 'production') {
  logger.exceptions.handle(
    new winston.transports.File({
      filename: path.join(path.dirname(config.LOG_FILE), 'exceptions.log'),
      format: logFormat,
    })
  );

  logger.rejections.handle(
    new winston.transports.File({
      filename: path.join(path.dirname(config.LOG_FILE), 'rejections.log'),
      format: logFormat,
    })
  );
}

module.exports = logger;
