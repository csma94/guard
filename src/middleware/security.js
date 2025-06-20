const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * Security middleware configuration
 */

// Helmet configuration for security headers
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "ws:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Rate limiting configuration
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: {
    error: 'Too many requests',
    message,
    retryAfter: Math.ceil(windowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
    });
    res.status(429).json({
      error: 'Too many requests',
      message,
      retryAfter: Math.ceil(windowMs / 1000),
    });
  },
});

// General rate limiting
const generalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP, please try again later'
);

// Strict rate limiting for auth endpoints
const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // limit each IP to 5 requests per windowMs
  'Too many authentication attempts, please try again later'
);

// API rate limiting
const apiRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  1000, // limit each IP to 1000 requests per windowMs
  'API rate limit exceeded, please try again later'
);

// Slow down middleware for repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per 15 minutes, then...
  delayMs: 500, // begin adding 500ms of delay per request above 50
  maxDelayMs: 20000, // maximum delay of 20 seconds
});

/**
 * Input validation and sanitization
 */
const sanitizeInput = (req, res, next) => {
  // Remove null bytes and control characters
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj.replace(/[\x00-\x1F\x7F]/g, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  
  next();
};

/**
 * CSRF protection
 */
const csrfProtection = (req, res, next) => {
  // Skip CSRF for API endpoints with proper authentication
  if (req.path.startsWith('/api/') && req.headers.authorization) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    logger.warn('CSRF token validation failed', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
    });
    return res.status(403).json({
      error: 'Invalid CSRF token',
      message: 'CSRF token validation failed',
    });
  }

  next();
};

/**
 * Generate CSRF token
 */
const generateCSRFToken = (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
};

/**
 * SQL injection protection
 */
const sqlInjectionProtection = (req, res, next) => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
    /(;|\-\-|\/\*|\*\/|xp_|sp_)/i,
    /(\b(OR|AND)\b.*=.*)/i,
  ];

  const checkForSQLInjection = (obj) => {
    if (typeof obj === 'string') {
      for (const pattern of sqlPatterns) {
        if (pattern.test(obj)) {
          return true;
        }
      }
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (checkForSQLInjection(obj[key])) {
          return true;
        }
      }
    }
    return false;
  };

  if (checkForSQLInjection(req.body) || 
      checkForSQLInjection(req.query) || 
      checkForSQLInjection(req.params)) {
    logger.warn('Potential SQL injection attempt detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      body: req.body,
      query: req.query,
      params: req.params,
    });
    return res.status(400).json({
      error: 'Invalid input detected',
      message: 'Request contains potentially malicious content',
    });
  }

  next();
};

/**
 * XSS protection
 */
const xssProtection = (req, res, next) => {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<img[^>]+src[^>]*>/gi,
  ];

  const checkForXSS = (obj) => {
    if (typeof obj === 'string') {
      for (const pattern of xssPatterns) {
        if (pattern.test(obj)) {
          return true;
        }
      }
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (checkForXSS(obj[key])) {
          return true;
        }
      }
    }
    return false;
  };

  if (checkForXSS(req.body) || 
      checkForXSS(req.query) || 
      checkForXSS(req.params)) {
    logger.warn('Potential XSS attempt detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      body: req.body,
      query: req.query,
      params: req.params,
    });
    return res.status(400).json({
      error: 'Invalid input detected',
      message: 'Request contains potentially malicious content',
    });
  }

  next();
};

/**
 * Request size limiting
 */
const requestSizeLimit = (req, res, next) => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const contentLength = parseInt(req.headers['content-length'] || '0');

  if (contentLength > maxSize) {
    logger.warn('Request size limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      contentLength,
      maxSize,
    });
    return res.status(413).json({
      error: 'Request too large',
      message: 'Request size exceeds maximum allowed limit',
    });
  }

  next();
};

/**
 * IP whitelist/blacklist
 */
const ipFilter = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Blacklisted IPs (could be loaded from database)
  const blacklistedIPs = process.env.BLACKLISTED_IPS?.split(',') || [];
  
  if (blacklistedIPs.includes(clientIP)) {
    logger.warn('Blocked request from blacklisted IP', {
      ip: clientIP,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
    });
    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP address has been blocked',
    });
  }

  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

/**
 * Advanced threat detection
 */
const threatDetection = (req, res, next) => {
  const suspiciousPatterns = [
    // Directory traversal
    /\.\.[\/\\]/g,
    /((\%2E){2}){1,}/i,

    // Command injection
    /[;&|`$(){}[\]]/g,
    /\b(cat|ls|pwd|id|whoami|uname|netstat|ps|kill|rm|mv|cp)\b/i,

    // File inclusion
    /\b(file|http|https|ftp|php|data):/i,

    // LDAP injection
    /[()&|!]/g,

    // XML injection
    /<\?xml|<!DOCTYPE|<!ENTITY/i,
  ];

  const blockedUserAgents = [
    /sqlmap/i,
    /nikto/i,
    /nessus/i,
    /burp/i,
    /w3af/i,
    /acunetix/i,
    /netsparker/i,
    /appscan/i,
    /havij/i,
    /pangolin/i,
  ];

  // Check user agent
  const userAgent = req.get('User-Agent') || '';
  if (blockedUserAgents.some(pattern => pattern.test(userAgent))) {
    logger.warn('Blocked malicious user agent', {
      ip: req.ip,
      userAgent,
      endpoint: req.path,
    });
    return res.status(403).json({
      error: 'Access denied',
      message: 'Request blocked due to suspicious activity',
    });
  }

  // Check for suspicious patterns in all inputs
  const checkInputs = (obj) => {
    if (typeof obj === 'string') {
      return suspiciousPatterns.some(pattern => pattern.test(obj));
    }
    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some(value => checkInputs(value));
    }
    return false;
  };

  if (checkInputs(req.body) || checkInputs(req.query) || checkInputs(req.params)) {
    logger.warn('Suspicious pattern detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method,
    });
    return res.status(400).json({
      error: 'Invalid input detected',
      message: 'Request contains potentially malicious content',
    });
  }

  next();
};

/**
 * Honeypot middleware
 */
const honeypot = (req, res, next) => {
  // Check for honeypot fields in request body
  const honeypotFields = ['honeypot', 'bot_trap', 'email_confirm', 'website'];

  if (req.body) {
    for (const field of honeypotFields) {
      if (req.body[field]) {
        logger.warn('Honeypot trap triggered', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          honeypotField: field,
        });

        // Silently reject the request (appear successful to bots)
        return res.status(200).json({ success: true });
      }
    }
  }

  next();
};

/**
 * Request fingerprinting for anomaly detection
 */
const requestFingerprinting = (req, res, next) => {
  const fingerprint = {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    acceptLanguage: req.get('Accept-Language'),
    acceptEncoding: req.get('Accept-Encoding'),
    connection: req.get('Connection'),
    timestamp: Date.now(),
  };

  // Store fingerprint for analysis (could be stored in Redis)
  req.fingerprint = fingerprint;

  // Basic anomaly detection
  const suspiciousIndicators = [
    !fingerprint.userAgent, // Missing user agent
    fingerprint.userAgent && fingerprint.userAgent.length < 10, // Very short user agent
    !fingerprint.acceptLanguage, // Missing accept language
    !fingerprint.acceptEncoding, // Missing accept encoding
  ];

  const suspiciousCount = suspiciousIndicators.filter(Boolean).length;

  if (suspiciousCount >= 2) {
    logger.warn('Suspicious request fingerprint', {
      ...fingerprint,
      endpoint: req.path,
      suspiciousCount,
    });
  }

  next();
};

/**
 * Request logging for security monitoring
 */
const securityLogger = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length'),
      referer: req.get('Referer'),
      fingerprint: req.fingerprint,
    };

    // Log suspicious activities
    if (res.statusCode >= 400) {
      logger.warn('HTTP error response', logData);
    }

    // Log slow requests
    if (duration > 5000) {
      logger.warn('Slow request detected', logData);
    }

    // Log large responses
    const responseSize = parseInt(res.get('Content-Length') || '0');
    if (responseSize > 1024 * 1024) { // 1MB
      logger.warn('Large response detected', logData);
    }

    // Log authentication events
    if (req.path.includes('/auth/')) {
      logger.info('Authentication event', {
        ...logData,
        authEvent: true,
      });
    }

    // Log admin access
    if (req.user && req.user.role === 'ADMIN') {
      logger.info('Admin access', {
        ...logData,
        userId: req.user.id,
        adminAccess: true,
      });
    }
  });

  next();
};

/**
 * Validation error handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation errors', {
      ip: req.ip,
      endpoint: req.path,
      errors: errors.array(),
    });
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Request validation failed',
      details: errors.array(),
    });
  }
  next();
};

/**
 * Advanced input validation with schema validation
 */
const advancedInputValidation = (schema) => {
  return (req, res, next) => {
    try {
      // Validate against provided schema
      if (schema) {
        const { error, value } = schema.validate(req.body);
        if (error) {
          logger.warn('Schema validation failed', {
            ip: req.ip,
            endpoint: req.path,
            error: error.details,
          });
          return res.status(400).json({
            error: 'Validation failed',
            message: 'Request data does not match required schema',
            details: error.details,
          });
        }
        req.body = value; // Use sanitized value
      }

      // Additional security checks
      const checkSecurityConstraints = (obj, path = '') => {
        if (typeof obj === 'string') {
          // Check string length limits
          if (obj.length > 10000) {
            throw new Error(`String too long at ${path}`);
          }

          // Check for null bytes
          if (obj.includes('\0')) {
            throw new Error(`Null byte detected at ${path}`);
          }

          // Check for control characters
          if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(obj)) {
            throw new Error(`Control characters detected at ${path}`);
          }
        } else if (Array.isArray(obj)) {
          // Limit array size
          if (obj.length > 1000) {
            throw new Error(`Array too large at ${path}`);
          }
          obj.forEach((item, index) => {
            checkSecurityConstraints(item, `${path}[${index}]`);
          });
        } else if (typeof obj === 'object' && obj !== null) {
          // Limit object depth and size
          const keys = Object.keys(obj);
          if (keys.length > 100) {
            throw new Error(`Object too large at ${path}`);
          }
          keys.forEach(key => {
            checkSecurityConstraints(obj[key], path ? `${path}.${key}` : key);
          });
        }
      };

      checkSecurityConstraints(req.body);
      checkSecurityConstraints(req.query);

      next();
    } catch (error) {
      logger.warn('Advanced input validation failed', {
        ip: req.ip,
        endpoint: req.path,
        error: error.message,
      });
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Request contains invalid or potentially dangerous data',
      });
    }
  };
};

/**
 * Content type validation
 */
const validateContentType = (allowedTypes = ['application/json']) => {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next();
    }

    const contentType = req.get('Content-Type');
    if (!contentType) {
      return res.status(400).json({
        error: 'Missing Content-Type header',
        message: 'Content-Type header is required',
      });
    }

    const isAllowed = allowedTypes.some(type =>
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isAllowed) {
      logger.warn('Invalid content type', {
        ip: req.ip,
        endpoint: req.path,
        contentType,
        allowedTypes,
      });
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
      });
    }

    next();
  };
};

module.exports = {
  helmetConfig,
  generalRateLimit,
  authRateLimit,
  apiRateLimit,
  speedLimiter,
  sanitizeInput,
  csrfProtection,
  generateCSRFToken,
  sqlInjectionProtection,
  xssProtection,
  requestSizeLimit,
  ipFilter,
  securityHeaders,
  securityLogger,
  handleValidationErrors,
  threatDetection,
  honeypot,
  requestFingerprinting,
  advancedInputValidation,
  validateContentType,
};
