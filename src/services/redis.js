const redis = require('redis');
const config = require('../config/config');
const logger = require('../config/logger');

let redisClient = null;

/**
 * Initialize Redis connection with timeout and resilient error handling
 */
const initializeRedis = async () => {
  try {
    // Create Redis client with connection timeout
    redisClient = redis.createClient({
      url: config.REDIS_URL,
      socket: {
        connectTimeout: 5000, // 5 second timeout
        lazyConnect: true,
      },
      retry_strategy: (options) => {
        // Limit retry attempts for faster failure
        if (options.attempt > 3) {
          logger.warn('Redis max retry attempts reached, giving up');
          return undefined;
        }
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.warn('Redis connection refused, retrying...');
          return Math.min(options.attempt * 1000, 3000);
        }
        return Math.min(options.attempt * 1000, 3000);
      },
    });

    redisClient.on('error', (err) => {
      logger.warn('Redis Client Error (non-critical):', err.message);
    });

    redisClient.on('connect', () => {
      logger.info('Redis Client Connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis Client Ready');
    });

    redisClient.on('end', () => {
      logger.info('Redis Client Disconnected');
    });

    // Connect with timeout
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
    });

    await Promise.race([connectPromise, timeoutPromise]);

    // Test connection with timeout
    const pingPromise = redisClient.ping();
    const pingTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Redis ping timeout')), 2000);
    });

    await Promise.race([pingPromise, pingTimeoutPromise]);
    logger.info('Redis connection established successfully');

    return redisClient;
  } catch (error) {
    logger.warn('Redis initialization failed (continuing without Redis):', error.message);
    // Clean up failed client
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (e) {
        // Ignore cleanup errors
      }
      redisClient = null;
    }
    // Don't throw error - Redis is not critical for basic functionality
    return null;
  }
};

/**
 * Get Redis client instance
 */
const getRedisClient = () => {
  return redisClient;
};

/**
 * Cache operations
 */
const cache = {
  /**
   * Set a value in cache
   */
  async set(key, value, ttl = config.REDIS_TTL) {
    if (!redisClient) return false;
    
    try {
      const serializedValue = JSON.stringify(value);
      await redisClient.setEx(key, ttl, serializedValue);
      return true;
    } catch (error) {
      logger.error('Redis SET error:', error);
      return false;
    }
  },

  /**
   * Get a value from cache
   */
  async get(key) {
    if (!redisClient) return null;
    
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis GET error:', error);
      return null;
    }
  },

  /**
   * Delete a value from cache
   */
  async del(key) {
    if (!redisClient) return false;
    
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL error:', error);
      return false;
    }
  },

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!redisClient) return false;
    
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', error);
      return false;
    }
  },

  /**
   * Set expiration for a key
   */
  async expire(key, ttl) {
    if (!redisClient) return false;
    
    try {
      await redisClient.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Redis EXPIRE error:', error);
      return false;
    }
  },

  /**
   * Increment a value
   */
  async incr(key) {
    if (!redisClient) return null;
    
    try {
      return await redisClient.incr(key);
    } catch (error) {
      logger.error('Redis INCR error:', error);
      return null;
    }
  },

  /**
   * Add to set
   */
  async sadd(key, ...members) {
    if (!redisClient) return false;
    
    try {
      await redisClient.sAdd(key, members);
      return true;
    } catch (error) {
      logger.error('Redis SADD error:', error);
      return false;
    }
  },

  /**
   * Remove from set
   */
  async srem(key, ...members) {
    if (!redisClient) return false;
    
    try {
      await redisClient.sRem(key, members);
      return true;
    } catch (error) {
      logger.error('Redis SREM error:', error);
      return false;
    }
  },

  /**
   * Check if member exists in set
   */
  async sismember(key, member) {
    if (!redisClient) return false;
    
    try {
      const result = await redisClient.sIsMember(key, member);
      return result === 1;
    } catch (error) {
      logger.error('Redis SISMEMBER error:', error);
      return false;
    }
  },
};

/**
 * Session operations
 */
const session = {
  /**
   * Store session data
   */
  async set(sessionId, data, ttl = config.SESSION_TIMEOUT / 1000) {
    const key = `session:${sessionId}`;
    return await cache.set(key, data, ttl);
  },

  /**
   * Get session data
   */
  async get(sessionId) {
    const key = `session:${sessionId}`;
    return await cache.get(key);
  },

  /**
   * Delete session
   */
  async delete(sessionId) {
    const key = `session:${sessionId}`;
    return await cache.del(key);
  },

  /**
   * Refresh session TTL
   */
  async refresh(sessionId, ttl = config.SESSION_TIMEOUT / 1000) {
    const key = `session:${sessionId}`;
    return await cache.expire(key, ttl);
  },
};

/**
 * Rate limiting operations
 */
const rateLimit = {
  /**
   * Check and increment rate limit counter
   */
  async check(key, limit, window) {
    if (!redisClient) return { allowed: true, remaining: limit };
    
    try {
      const current = await redisClient.incr(key);
      
      if (current === 1) {
        await redisClient.expire(key, window);
      }
      
      const remaining = Math.max(0, limit - current);
      const allowed = current <= limit;
      
      return { allowed, remaining, current };
    } catch (error) {
      logger.error('Redis rate limit error:', error);
      return { allowed: true, remaining: limit };
    }
  },
};

/**
 * Blacklist operations (for token invalidation)
 */
const blacklist = {
  /**
   * Add token to blacklist
   */
  async add(token, ttl) {
    const key = `blacklist:${token}`;
    return await cache.set(key, true, ttl);
  },

  /**
   * Check if token is blacklisted
   */
  async check(token) {
    const key = `blacklist:${token}`;
    return await cache.exists(key);
  },
};

module.exports = {
  initializeRedis,
  getRedisClient,
  cache,
  session,
  rateLimit,
  blacklist,
};
