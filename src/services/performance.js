const Redis = require('redis');
const logger = require('../config/logger');

/**
 * Performance Optimization and Scalability Service
 * Handles caching, query optimization, connection pooling, and performance monitoring
 */
class PerformanceService {
  constructor(prisma, config = {}) {
    this.prisma = prisma;
    this.config = {
      redis: {
        host: config.redisHost || 'localhost',
        port: config.redisPort || 6379,
        password: config.redisPassword,
        db: config.redisDb || 0
      },
      cache: {
        defaultTTL: config.defaultTTL || 3600, // 1 hour
        maxMemory: config.maxMemory || '256mb',
        evictionPolicy: config.evictionPolicy || 'allkeys-lru'
      },
      performance: {
        slowQueryThreshold: config.slowQueryThreshold || 1000, // 1 second
        connectionPoolSize: config.connectionPoolSize || 10,
        queryTimeout: config.queryTimeout || 30000 // 30 seconds
      }
    };

    this.redis = null;
    this.queryMetrics = new Map();
    this.performanceMetrics = {
      totalQueries: 0,
      slowQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0
    };

    this.initializeCache();
    this.setupPerformanceMonitoring();
  }

  /**
   * Initialize Redis cache connection
   */
  async initializeCache() {
    try {
      this.redis = Redis.createClient({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Redis retry time exhausted');
          }
          if (options.attempt > 10) {
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.redis.on('connect', () => {
        logger.info('Redis cache connected successfully');
      });

      this.redis.on('error', (err) => {
        logger.error('Redis cache error:', err);
      });

      // Configure Redis for optimal performance
      await this.configureRedis();

    } catch (error) {
      logger.error('Failed to initialize Redis cache:', error);
      // Continue without cache if Redis is not available
    }
  }

  /**
   * Configure Redis for optimal performance
   */
  async configureRedis() {
    if (!this.redis) return;

    try {
      await this.redis.config('SET', 'maxmemory', this.config.cache.maxMemory);
      await this.redis.config('SET', 'maxmemory-policy', this.config.cache.evictionPolicy);
      await this.redis.config('SET', 'save', ''); // Disable persistence for performance
    } catch (error) {
      logger.warn('Failed to configure Redis:', error);
    }
  }

  /**
   * Setup performance monitoring
   */
  setupPerformanceMonitoring() {
    // Monitor Prisma queries
    this.prisma.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;

      // Track query metrics
      this.trackQueryPerformance(params, duration);

      // Log slow queries
      if (duration > this.config.performance.slowQueryThreshold) {
        logger.warn('Slow query detected', {
          model: params.model,
          action: params.action,
          duration,
          args: params.args
        });
        this.performanceMetrics.slowQueries++;
      }

      this.performanceMetrics.totalQueries++;
      this.updateAverageResponseTime(duration);

      return result;
    });
  }

  /**
   * Cache data with automatic expiration
   */
  async setCache(key, data, ttl = null) {
    if (!this.redis) return false;

    try {
      const serializedData = JSON.stringify(data);
      const expiration = ttl || this.config.cache.defaultTTL;
      
      await this.redis.setex(key, expiration, serializedData);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Retrieve data from cache
   */
  async getCache(key) {
    if (!this.redis) return null;

    try {
      const data = await this.redis.get(key);
      if (data) {
        this.performanceMetrics.cacheHits++;
        return JSON.parse(data);
      } else {
        this.performanceMetrics.cacheMisses++;
        return null;
      }
    } catch (error) {
      logger.error('Cache get error:', error);
      this.performanceMetrics.cacheMisses++;
      return null;
    }
  }

  /**
   * Delete cache entry
   */
  async deleteCache(key) {
    if (!this.redis) return false;

    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Clear cache by pattern
   */
  async clearCachePattern(pattern) {
    if (!this.redis) return false;

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;
    } catch (error) {
      logger.error('Cache pattern clear error:', error);
      return false;
    }
  }

  /**
   * Cached database query wrapper
   */
  async cachedQuery(cacheKey, queryFunction, ttl = null) {
    // Try to get from cache first
    const cachedResult = await this.getCache(cacheKey);
    if (cachedResult !== null) {
      return cachedResult;
    }

    // Execute query if not in cache
    const result = await queryFunction();
    
    // Cache the result
    await this.setCache(cacheKey, result, ttl);
    
    return result;
  }

  /**
   * Optimized user lookup with caching
   */
  async getCachedUser(userId) {
    const cacheKey = `user:${userId}`;
    
    return await this.cachedQuery(cacheKey, async () => {
      return await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          status: true,
          profile: true,
          lastLoginAt: true
        }
      });
    }, 1800); // 30 minutes
  }

  /**
   * Optimized site data with caching
   */
  async getCachedSiteData(siteId) {
    const cacheKey = `site:${siteId}`;
    
    return await this.cachedQuery(cacheKey, async () => {
      return await this.prisma.site.findUnique({
        where: { id: siteId },
        include: {
          client: {
            select: {
              id: true,
              companyName: true,
              serviceLevel: true
            }
          },
          shifts: {
            where: {
              status: { in: ['SCHEDULED', 'IN_PROGRESS'] }
            },
            take: 10,
            orderBy: { startTime: 'asc' }
          }
        }
      });
    }, 900); // 15 minutes
  }

  /**
   * Optimized analytics data with caching
   */
  async getCachedAnalytics(filters, analyticsType) {
    const cacheKey = `analytics:${analyticsType}:${JSON.stringify(filters)}`;
    
    return await this.cachedQuery(cacheKey, async () => {
      // This would call the appropriate analytics function
      // For now, return a placeholder
      return {
        type: analyticsType,
        filters,
        data: {},
        generatedAt: new Date()
      };
    }, 3600); // 1 hour
  }

  /**
   * Batch operations for improved performance
   */
  async batchUpdateShifts(updates) {
    const batchSize = 100;
    const results = [];

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      const batchPromises = batch.map(update => 
        this.prisma.shift.update({
          where: { id: update.id },
          data: update.data
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Clear related cache entries
      batch.forEach(update => {
        this.deleteCache(`shift:${update.id}`);
        this.clearCachePattern(`site:${update.siteId}*`);
      });
    }

    return results;
  }

  /**
   * Optimized pagination with cursor-based approach
   */
  async getPaginatedResults(model, options = {}) {
    const {
      cursor,
      take = 20,
      where = {},
      orderBy = { createdAt: 'desc' },
      include,
      select
    } = options;

    const queryOptions = {
      take: take + 1, // Take one extra to check if there are more results
      where,
      orderBy,
      ...(include && { include }),
      ...(select && { select })
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1; // Skip the cursor
    }

    const results = await this.prisma[model].findMany(queryOptions);
    
    const hasMore = results.length > take;
    if (hasMore) {
      results.pop(); // Remove the extra result
    }

    const nextCursor = hasMore ? results[results.length - 1]?.id : null;

    return {
      data: results,
      hasMore,
      nextCursor
    };
  }

  /**
   * Database connection pool optimization
   */
  async optimizeConnectionPool() {
    try {
      // Get current connection info
      const connections = await this.prisma.$queryRaw`
        SELECT count(*) as total_connections,
               count(*) FILTER (WHERE state = 'active') as active_connections,
               count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `;

      logger.info('Database connection pool status:', connections[0]);

      // Optimize based on current usage
      if (connections[0].active_connections > this.config.performance.connectionPoolSize * 0.8) {
        logger.warn('High database connection usage detected');
        // Could implement connection pool scaling here
      }

      return connections[0];
    } catch (error) {
      logger.error('Failed to check connection pool:', error);
      return null;
    }
  }

  /**
   * Query optimization suggestions
   */
  async analyzeQueryPerformance() {
    const analysis = {
      totalQueries: this.performanceMetrics.totalQueries,
      slowQueries: this.performanceMetrics.slowQueries,
      slowQueryPercentage: (this.performanceMetrics.slowQueries / this.performanceMetrics.totalQueries) * 100,
      averageResponseTime: this.performanceMetrics.averageResponseTime,
      cacheHitRate: (this.performanceMetrics.cacheHits / (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses)) * 100,
      topSlowQueries: this.getTopSlowQueries(),
      recommendations: this.generateOptimizationRecommendations()
    };

    return analysis;
  }

  /**
   * Memory usage optimization
   */
  async optimizeMemoryUsage() {
    try {
      // Clear expired cache entries
      if (this.redis) {
        await this.redis.flushdb();
        logger.info('Cache cleared for memory optimization');
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered');
      }

      // Get current memory usage
      const memoryUsage = process.memoryUsage();
      
      return {
        memoryUsage,
        optimizationPerformed: true,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Memory optimization failed:', error);
      throw error;
    }
  }

  /**
   * Performance monitoring and alerting
   */
  async monitorPerformance() {
    const metrics = {
      responseTime: this.performanceMetrics.averageResponseTime,
      queryCount: this.performanceMetrics.totalQueries,
      slowQueryCount: this.performanceMetrics.slowQueries,
      cacheHitRate: (this.performanceMetrics.cacheHits / (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses)) * 100,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };

    // Check for performance issues
    const alerts = [];

    if (metrics.responseTime > 2000) {
      alerts.push({
        type: 'HIGH_RESPONSE_TIME',
        severity: 'WARNING',
        message: `Average response time is ${metrics.responseTime}ms`,
        threshold: 2000
      });
    }

    if (metrics.cacheHitRate < 70) {
      alerts.push({
        type: 'LOW_CACHE_HIT_RATE',
        severity: 'WARNING',
        message: `Cache hit rate is ${metrics.cacheHitRate.toFixed(1)}%`,
        threshold: 70
      });
    }

    if (metrics.memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
      alerts.push({
        type: 'HIGH_MEMORY_USAGE',
        severity: 'CRITICAL',
        message: `Memory usage is ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`,
        threshold: 500
      });
    }

    return {
      metrics,
      alerts,
      timestamp: new Date()
    };
  }

  // Helper methods

  trackQueryPerformance(params, duration) {
    const queryKey = `${params.model}.${params.action}`;
    
    if (!this.queryMetrics.has(queryKey)) {
      this.queryMetrics.set(queryKey, {
        count: 0,
        totalDuration: 0,
        maxDuration: 0,
        minDuration: Infinity
      });
    }

    const metrics = this.queryMetrics.get(queryKey);
    metrics.count++;
    metrics.totalDuration += duration;
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    metrics.minDuration = Math.min(metrics.minDuration, duration);
  }

  updateAverageResponseTime(duration) {
    const alpha = 0.1; // Exponential moving average factor
    this.performanceMetrics.averageResponseTime = 
      (alpha * duration) + ((1 - alpha) * this.performanceMetrics.averageResponseTime);
  }

  getTopSlowQueries(limit = 10) {
    const queries = Array.from(this.queryMetrics.entries())
      .map(([key, metrics]) => ({
        query: key,
        averageDuration: metrics.totalDuration / metrics.count,
        maxDuration: metrics.maxDuration,
        count: metrics.count
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, limit);

    return queries;
  }

  generateOptimizationRecommendations() {
    const recommendations = [];

    if (this.performanceMetrics.slowQueries > 0) {
      recommendations.push({
        type: 'QUERY_OPTIMIZATION',
        priority: 'HIGH',
        message: 'Consider adding database indexes for slow queries',
        action: 'Review slow query log and add appropriate indexes'
      });
    }

    const cacheHitRate = (this.performanceMetrics.cacheHits / (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses)) * 100;
    if (cacheHitRate < 80) {
      recommendations.push({
        type: 'CACHE_OPTIMIZATION',
        priority: 'MEDIUM',
        message: 'Cache hit rate is below optimal threshold',
        action: 'Increase cache TTL or implement more aggressive caching'
      });
    }

    return recommendations;
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    try {
      if (this.redis) {
        await this.redis.quit();
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.error('Error during performance service shutdown:', error);
    }
  }
}

module.exports = PerformanceService;
