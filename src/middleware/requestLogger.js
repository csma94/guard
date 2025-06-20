const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * Request logging middleware
 * Adds request ID and logs request/response details
 */
const requestLogger = (req, res, next) => {
  // Generate unique request ID
  req.id = uuidv4();
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.id);
  
  // Start timer
  const startTime = Date.now();
  
  // Log request
  logger.info('Incoming Request', {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    userId: req.user?.id,
    type: 'request_start',
  });
  
  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Log response
    logger.info('Outgoing Response', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: JSON.stringify(data).length,
      userId: req.user?.id,
      type: 'request_end',
    });
    
    // Call original json method
    return originalJson.call(this, data);
  };
  
  // Override res.send to log response
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Log response
    logger.info('Outgoing Response', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: data ? data.length : 0,
      userId: req.user?.id,
      type: 'request_end',
    });
    
    // Call original send method
    return originalSend.call(this, data);
  };
  
  // Log when response finishes
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // Performance logging
    if (responseTime > 1000) {
      logger.performance('Slow Request', {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
        userId: req.user?.id,
      });
    }
    
    // Error logging
    if (res.statusCode >= 400) {
      logger.warn('Request Error', {
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
        userId: req.user?.id,
      });
    }
  });
  
  next();
};

module.exports = {
  requestLogger,
};
