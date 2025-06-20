const logger = require('../config/logger');
const config = require('../config/config');

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Convert Prisma errors to API errors
 */
const handlePrismaError = (error) => {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const field = error.meta?.target?.[0] || 'field';
      return new ApiError(409, `${field} already exists`);
    
    case 'P2025':
      // Record not found
      return new ApiError(404, 'Record not found');
    
    case 'P2003':
      // Foreign key constraint violation
      return new ApiError(400, 'Invalid reference to related record');
    
    case 'P2014':
      // Required relation violation
      return new ApiError(400, 'Required relation is missing');
    
    case 'P2021':
      // Table does not exist
      return new ApiError(500, 'Database table not found');
    
    case 'P2022':
      // Column does not exist
      return new ApiError(500, 'Database column not found');
    
    default:
      logger.error('Unhandled Prisma error:', {
        code: error.code,
        message: error.message,
        meta: error.meta,
      });
      return new ApiError(500, 'Database operation failed');
  }
};

/**
 * Convert validation errors to API errors
 */
const handleValidationError = (error) => {
  const errors = error.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message,
  }));
  
  return new ApiError(400, 'Validation failed', true, JSON.stringify(errors));
};

/**
 * Convert JWT errors to API errors
 */
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new ApiError(401, 'Invalid token');
  }
  
  if (error.name === 'TokenExpiredError') {
    return new ApiError(401, 'Token expired');
  }
  
  return new ApiError(401, 'Authentication failed');
};

/**
 * Error handler middleware
 */
const errorHandler = (error, req, res, next) => {
  let apiError = error;
  
  // Convert known errors to ApiError
  if (!(error instanceof ApiError)) {
    if (error.code && error.code.startsWith('P')) {
      // Prisma error
      apiError = handlePrismaError(error);
    } else if (error.name === 'ValidationError' || error.isJoi) {
      // Joi validation error
      apiError = handleValidationError(error);
    } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      // JWT error
      apiError = handleJWTError(error);
    } else if (error.name === 'MulterError') {
      // File upload error
      if (error.code === 'LIMIT_FILE_SIZE') {
        apiError = new ApiError(413, 'File too large');
      } else if (error.code === 'LIMIT_FILE_COUNT') {
        apiError = new ApiError(400, 'Too many files');
      } else {
        apiError = new ApiError(400, 'File upload error');
      }
    } else {
      // Generic error
      const statusCode = error.statusCode || 500;
      const message = error.isOperational ? error.message : 'Internal server error';
      apiError = new ApiError(statusCode, message, false, error.stack);
    }
  }
  
  // Log error
  const logLevel = apiError.statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel]('API Error:', {
    statusCode: apiError.statusCode,
    message: apiError.message,
    stack: apiError.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    requestId: req.id,
  });
  
  // Send error response
  const response = {
    error: {
      code: getErrorCode(apiError.statusCode),
      message: apiError.message,
      ...(config.NODE_ENV === 'development' && {
        stack: apiError.stack,
      }),
      requestId: req.id,
    },
  };
  
  // Add validation details if available
  if (apiError.statusCode === 400 && apiError.stack) {
    try {
      const validationErrors = JSON.parse(apiError.stack);
      response.error.details = { fieldErrors: validationErrors };
    } catch (e) {
      // Stack is not JSON, ignore
    }
  }
  
  res.status(apiError.statusCode).json(response);
};

/**
 * Not found handler middleware
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(404, `Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Get error code from status code
 */
const getErrorCode = (statusCode) => {
  const codes = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
  };
  
  return codes[statusCode] || 'UNKNOWN_ERROR';
};

module.exports = {
  ApiError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handlePrismaError,
  handleValidationError,
  handleJWTError,
};
