const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Comprehensive error handling and recovery service
 */
class ErrorHandlerService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.errorCounts = new Map();
    this.circuitBreakers = new Map();
    this.retryQueues = new Map();
    
    // Initialize error categories and handlers
    this.initializeErrorHandlers();
    
    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Initialize error handlers for different categories
   */
  initializeErrorHandlers() {
    this.errorHandlers = {
      // Database errors
      database: {
        P2002: this.handleUniqueConstraintError.bind(this),
        P2025: this.handleRecordNotFoundError.bind(this),
        P2003: this.handleForeignKeyError.bind(this),
        P2014: this.handleInvalidIdError.bind(this),
        P1001: this.handleDatabaseConnectionError.bind(this),
        P1008: this.handleDatabaseTimeoutError.bind(this),
      },
      
      // Authentication errors
      authentication: {
        INVALID_TOKEN: this.handleInvalidTokenError.bind(this),
        TOKEN_EXPIRED: this.handleTokenExpiredError.bind(this),
        INSUFFICIENT_PERMISSIONS: this.handlePermissionError.bind(this),
        ACCOUNT_LOCKED: this.handleAccountLockedError.bind(this),
        INVALID_CREDENTIALS: this.handleInvalidCredentialsError.bind(this),
      },
      
      // Business logic errors
      business: {
        SHIFT_CONFLICT: this.handleShiftConflictError.bind(this),
        INVALID_SCHEDULE: this.handleInvalidScheduleError.bind(this),
        CAPACITY_EXCEEDED: this.handleCapacityExceededError.bind(this),
        WORKFLOW_VIOLATION: this.handleWorkflowViolationError.bind(this),
      },
      
      // External service errors
      external: {
        TWILIO_ERROR: this.handleTwilioError.bind(this),
        SENDGRID_ERROR: this.handleSendGridError.bind(this),
        AWS_ERROR: this.handleAWSError.bind(this),
        PAYMENT_ERROR: this.handlePaymentError.bind(this),
      },
      
      // System errors
      system: {
        MEMORY_LIMIT: this.handleMemoryLimitError.bind(this),
        CPU_LIMIT: this.handleCPULimitError.bind(this),
        DISK_SPACE: this.handleDiskSpaceError.bind(this),
        NETWORK_ERROR: this.handleNetworkError.bind(this),
      },
    };

    // Circuit breaker configurations
    this.circuitBreakerConfigs = {
      database: { threshold: 5, timeout: 30000, resetTimeout: 60000 },
      external_api: { threshold: 3, timeout: 10000, resetTimeout: 30000 },
      file_system: { threshold: 10, timeout: 5000, resetTimeout: 15000 },
    };
  }

  /**
   * Main error handling entry point
   */
  async handleError(error, context = {}) {
    try {
      // Enrich error with context
      const enrichedError = this.enrichError(error, context);
      
      // Log error
      await this.logError(enrichedError);
      
      // Update error metrics
      this.updateErrorMetrics(enrichedError);
      
      // Check circuit breakers
      await this.checkCircuitBreakers(enrichedError);
      
      // Determine error category and handler
      const { category, handler } = this.categorizeError(enrichedError);
      
      // Execute specific error handler
      const handlerResult = await handler(enrichedError, context);
      
      // Attempt recovery if possible
      const recoveryResult = await this.attemptRecovery(enrichedError, handlerResult);
      
      // Return processed error response
      return this.formatErrorResponse(enrichedError, handlerResult, recoveryResult);
      
    } catch (handlingError) {
      // Error in error handling - log and return generic error
      logger.error('Error in error handling', {
        originalError: error.message,
        handlingError: handlingError.message,
        stack: handlingError.stack,
      });
      
      return this.formatGenericErrorResponse(error);
    }
  }

  /**
   * Enrich error with additional context and metadata
   */
  enrichError(error, context) {
    const enriched = {
      ...error,
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version,
        nodeVersion: process.version,
      },
      stack: error.stack,
      fingerprint: this.generateErrorFingerprint(error),
    };

    // Add request context if available
    if (context.req) {
      enriched.request = {
        method: context.req.method,
        url: context.req.url,
        headers: this.sanitizeHeaders(context.req.headers),
        ip: context.req.ip,
        userAgent: context.req.get('User-Agent'),
        userId: context.req.user?.id,
      };
    }

    // Add database context if available
    if (error.code && error.code.startsWith('P')) {
      enriched.database = {
        code: error.code,
        meta: error.meta,
        clientVersion: error.clientVersion,
      };
    }

    return enriched;
  }

  /**
   * Categorize error and return appropriate handler
   */
  categorizeError(error) {
    // Database errors (Prisma)
    if (error.code && error.code.startsWith('P')) {
      const handler = this.errorHandlers.database[error.code] || this.handleGenericDatabaseError.bind(this);
      return { category: 'database', handler };
    }

    // Authentication errors
    if (error.name === 'UnauthorizedError' || error.message.includes('authentication')) {
      const errorType = this.extractAuthErrorType(error);
      const handler = this.errorHandlers.authentication[errorType] || this.handleGenericAuthError.bind(this);
      return { category: 'authentication', handler };
    }

    // Business logic errors
    if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
      const errorType = this.extractBusinessErrorType(error);
      const handler = this.errorHandlers.business[errorType] || this.handleGenericBusinessError.bind(this);
      return { category: 'business', handler };
    }

    // External service errors
    if (error.message.includes('Twilio') || error.message.includes('SendGrid') || error.message.includes('AWS')) {
      const errorType = this.extractExternalErrorType(error);
      const handler = this.errorHandlers.external[errorType] || this.handleGenericExternalError.bind(this);
      return { category: 'external', handler };
    }

    // System errors
    if (error.code === 'EMFILE' || error.code === 'ENOMEM' || error.code === 'ENOSPC') {
      const errorType = this.extractSystemErrorType(error);
      const handler = this.errorHandlers.system[errorType] || this.handleGenericSystemError.bind(this);
      return { category: 'system', handler };
    }

    // Default to generic error handler
    return { category: 'generic', handler: this.handleGenericError.bind(this) };
  }

  /**
   * Database error handlers
   */
  async handleUniqueConstraintError(error, context) {
    const field = error.meta?.target?.[0] || 'field';
    return {
      statusCode: 409,
      message: `A record with this ${field} already exists`,
      code: 'DUPLICATE_RECORD',
      field,
      recoverable: false,
      userMessage: `This ${field} is already in use. Please choose a different one.`,
    };
  }

  async handleRecordNotFoundError(error, context) {
    return {
      statusCode: 404,
      message: 'The requested record was not found',
      code: 'RECORD_NOT_FOUND',
      recoverable: false,
      userMessage: 'The requested item could not be found.',
    };
  }

  async handleForeignKeyError(error, context) {
    const field = error.meta?.field_name || 'reference';
    return {
      statusCode: 400,
      message: `Invalid reference: ${field}`,
      code: 'INVALID_REFERENCE',
      field,
      recoverable: false,
      userMessage: 'The referenced item does not exist.',
    };
  }

  async handleDatabaseConnectionError(error, context) {
    // Trigger circuit breaker
    await this.triggerCircuitBreaker('database');
    
    return {
      statusCode: 503,
      message: 'Database connection failed',
      code: 'DATABASE_UNAVAILABLE',
      recoverable: true,
      retryAfter: 30,
      userMessage: 'Service temporarily unavailable. Please try again later.',
    };
  }

  /**
   * Authentication error handlers
   */
  async handleInvalidTokenError(error, context) {
    return {
      statusCode: 401,
      message: 'Invalid authentication token',
      code: 'INVALID_TOKEN',
      recoverable: false,
      userMessage: 'Please log in again.',
    };
  }

  async handleTokenExpiredError(error, context) {
    return {
      statusCode: 401,
      message: 'Authentication token has expired',
      code: 'TOKEN_EXPIRED',
      recoverable: true,
      action: 'refresh_token',
      userMessage: 'Your session has expired. Please log in again.',
    };
  }

  async handleAccountLockedError(error, context) {
    // Log security event
    await this.logSecurityEvent('ACCOUNT_LOCKED_ACCESS_ATTEMPT', context);
    
    return {
      statusCode: 423,
      message: 'Account is locked',
      code: 'ACCOUNT_LOCKED',
      recoverable: false,
      userMessage: 'Your account has been locked. Please contact support.',
    };
  }

  /**
   * Business logic error handlers
   */
  async handleShiftConflictError(error, context) {
    return {
      statusCode: 409,
      message: 'Shift scheduling conflict detected',
      code: 'SHIFT_CONFLICT',
      recoverable: true,
      suggestions: ['Choose a different time slot', 'Assign to a different agent'],
      userMessage: 'This shift conflicts with an existing assignment.',
    };
  }

  async handleCapacityExceededError(error, context) {
    return {
      statusCode: 429,
      message: 'System capacity exceeded',
      code: 'CAPACITY_EXCEEDED',
      recoverable: true,
      retryAfter: 60,
      userMessage: 'System is currently at capacity. Please try again later.',
    };
  }

  /**
   * External service error handlers
   */
  async handleTwilioError(error, context) {
    // Queue for retry
    await this.queueForRetry('twilio', context.operation, context.data);
    
    return {
      statusCode: 502,
      message: 'SMS service temporarily unavailable',
      code: 'SMS_SERVICE_ERROR',
      recoverable: true,
      retryAfter: 300,
      userMessage: 'Unable to send SMS. The message has been queued for retry.',
    };
  }

  async handleAWSError(error, context) {
    // Check if it's a temporary AWS issue
    const isTemporary = error.statusCode >= 500 || error.code === 'ServiceUnavailable';
    
    if (isTemporary) {
      await this.queueForRetry('aws', context.operation, context.data);
    }
    
    return {
      statusCode: isTemporary ? 502 : 400,
      message: isTemporary ? 'File service temporarily unavailable' : 'File operation failed',
      code: isTemporary ? 'FILE_SERVICE_ERROR' : 'FILE_OPERATION_ERROR',
      recoverable: isTemporary,
      retryAfter: isTemporary ? 120 : undefined,
      userMessage: isTemporary ? 
        'File service is temporarily unavailable. Please try again later.' :
        'File operation failed. Please check your file and try again.',
    };
  }

  /**
   * System error handlers
   */
  async handleMemoryLimitError(error, context) {
    // Trigger garbage collection
    if (global.gc) {
      global.gc();
    }
    
    // Alert system administrators
    await this.alertAdministrators('MEMORY_LIMIT_EXCEEDED', error);
    
    return {
      statusCode: 503,
      message: 'System memory limit exceeded',
      code: 'MEMORY_LIMIT_EXCEEDED',
      recoverable: true,
      retryAfter: 60,
      userMessage: 'System is experiencing high load. Please try again later.',
    };
  }

  /**
   * Generic error handlers
   */
  async handleGenericError(error, context) {
    return {
      statusCode: 500,
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      recoverable: false,
      userMessage: 'Something went wrong. Please try again or contact support.',
    };
  }

  /**
   * Circuit breaker management
   */
  async triggerCircuitBreaker(service) {
    const config = this.circuitBreakerConfigs[service];
    if (!config) return;

    const breaker = this.circuitBreakers.get(service) || {
      state: 'closed',
      failures: 0,
      lastFailure: null,
      nextAttempt: null,
    };

    breaker.failures++;
    breaker.lastFailure = Date.now();

    if (breaker.failures >= config.threshold) {
      breaker.state = 'open';
      breaker.nextAttempt = Date.now() + config.resetTimeout;
      
      logger.warn('Circuit breaker opened', {
        service,
        failures: breaker.failures,
        nextAttempt: new Date(breaker.nextAttempt),
      });
    }

    this.circuitBreakers.set(service, breaker);
  }

  async checkCircuitBreakers(error) {
    // Check if any circuit breakers should be reset
    for (const [service, breaker] of this.circuitBreakers.entries()) {
      if (breaker.state === 'open' && Date.now() > breaker.nextAttempt) {
        breaker.state = 'half-open';
        logger.info('Circuit breaker moved to half-open', { service });
      }
    }
  }

  /**
   * Recovery mechanisms
   */
  async attemptRecovery(error, handlerResult) {
    if (!handlerResult.recoverable) {
      return { attempted: false, success: false };
    }

    const recoveryStrategies = {
      database: this.recoverDatabaseConnection.bind(this),
      external_api: this.recoverExternalAPI.bind(this),
      memory: this.recoverMemory.bind(this),
    };

    const strategy = recoveryStrategies[handlerResult.code] || recoveryStrategies.database;
    
    try {
      const success = await strategy(error, handlerResult);
      return { attempted: true, success };
    } catch (recoveryError) {
      logger.error('Recovery attempt failed', {
        originalError: error.message,
        recoveryError: recoveryError.message,
      });
      return { attempted: true, success: false };
    }
  }

  async recoverDatabaseConnection() {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      return false;
    }
  }

  async recoverMemory() {
    try {
      if (global.gc) {
        global.gc();
      }
      
      // Check memory usage
      const memUsage = process.memoryUsage();
      const memoryLimit = 1024 * 1024 * 1024; // 1GB
      
      return memUsage.heapUsed < memoryLimit;
    } catch (error) {
      return false;
    }
  }

  /**
   * Utility methods
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateErrorFingerprint(error) {
    const key = `${error.name}:${error.message}:${error.code || 'no-code'}`;
    return require('crypto').createHash('md5').update(key).digest('hex');
  }

  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    return sanitized;
  }

  extractAuthErrorType(error) {
    if (error.message.includes('token')) return 'INVALID_TOKEN';
    if (error.message.includes('expired')) return 'TOKEN_EXPIRED';
    if (error.message.includes('permission')) return 'INSUFFICIENT_PERMISSIONS';
    return 'INVALID_CREDENTIALS';
  }

  extractBusinessErrorType(error) {
    if (error.message.includes('conflict')) return 'SHIFT_CONFLICT';
    if (error.message.includes('capacity')) return 'CAPACITY_EXCEEDED';
    if (error.message.includes('schedule')) return 'INVALID_SCHEDULE';
    return 'WORKFLOW_VIOLATION';
  }

  extractExternalErrorType(error) {
    if (error.message.includes('Twilio')) return 'TWILIO_ERROR';
    if (error.message.includes('SendGrid')) return 'SENDGRID_ERROR';
    if (error.message.includes('AWS')) return 'AWS_ERROR';
    return 'EXTERNAL_SERVICE_ERROR';
  }

  extractSystemErrorType(error) {
    if (error.code === 'ENOMEM') return 'MEMORY_LIMIT';
    if (error.code === 'ENOSPC') return 'DISK_SPACE';
    if (error.code === 'EMFILE') return 'FILE_LIMIT';
    return 'SYSTEM_ERROR';
  }

  async logError(error) {
    logger.error('Application error', {
      errorId: error.id,
      fingerprint: error.fingerprint,
      message: error.message,
      stack: error.stack,
      context: error.context,
      request: error.request,
    });

    // Store in database for analysis
    try {
      await this.prisma.errorLog.create({
        data: {
          errorId: error.id,
          fingerprint: error.fingerprint,
          message: error.message,
          stack: error.stack,
          context: error.context,
          level: 'error',
        },
      });
    } catch (dbError) {
      logger.error('Failed to store error in database', { error: dbError.message });
    }
  }

  updateErrorMetrics(error) {
    const key = error.fingerprint;
    const count = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, count + 1);
  }

  async queueForRetry(service, operation, data) {
    try {
      if (!this.redis) return;

      const retryItem = {
        service,
        operation,
        data,
        timestamp: Date.now(),
        attempts: 0,
        maxAttempts: 3,
      };

      await this.redis.lpush(`retry_queue:${service}`, JSON.stringify(retryItem));
      await this.redis.expire(`retry_queue:${service}`, 24 * 60 * 60); // 24 hours
    } catch (error) {
      logger.error('Failed to queue for retry', { service, error: error.message });
    }
  }

  async alertAdministrators(alertType, error) {
    // Implementation would send alerts via email, Slack, etc.
    logger.error('Administrator alert', {
      alertType,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  async logSecurityEvent(eventType, context) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: eventType,
          userId: context.req?.user?.id,
          details: {
            ip: context.req?.ip,
            userAgent: context.req?.get('User-Agent'),
            timestamp: new Date().toISOString(),
          },
          ipAddress: context.req?.ip,
          userAgent: context.req?.get('User-Agent'),
        },
      });
    } catch (error) {
      logger.error('Failed to log security event', { error: error.message });
    }
  }

  formatErrorResponse(error, handlerResult, recoveryResult) {
    return {
      error: {
        id: error.id,
        code: handlerResult.code,
        message: handlerResult.userMessage || handlerResult.message,
        statusCode: handlerResult.statusCode,
        timestamp: error.timestamp,
        recoverable: handlerResult.recoverable,
        retryAfter: handlerResult.retryAfter,
        suggestions: handlerResult.suggestions,
        action: handlerResult.action,
      },
      recovery: recoveryResult,
    };
  }

  formatGenericErrorResponse(error) {
    return {
      error: {
        id: this.generateErrorId(),
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        statusCode: 500,
        timestamp: new Date().toISOString(),
        recoverable: false,
      },
    };
  }

  startPeriodicCleanup() {
    setInterval(() => {
      // Clean up old error counts
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      for (const [key, data] of this.errorCounts.entries()) {
        if (data.timestamp < oneHourAgo) {
          this.errorCounts.delete(key);
        }
      }
    }, 60 * 60 * 1000); // Run every hour
  }
}

module.exports = ErrorHandlerService;
