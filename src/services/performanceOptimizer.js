const logger = require('../config/logger');

/**
 * Production-grade performance optimization service
 * Handles database optimization, caching strategies, and performance monitoring
 */
class PerformanceOptimizerService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.queryCache = new Map();
    this.performanceMetrics = new Map();
    this.connectionPool = null;
    
    // Initialize optimization strategies
    this.initializeOptimizations();
  }

  /**
   * Initialize performance optimizations
   */
  initializeOptimizations() {
    // Database connection pool configuration
    this.connectionPoolConfig = {
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    };

    // Cache configuration
    this.cacheConfig = {
      defaultTTL: 300, // 5 minutes
      maxSize: 1000,
      strategies: {
        user: { ttl: 900, maxSize: 500 }, // 15 minutes
        shift: { ttl: 600, maxSize: 1000 }, // 10 minutes
        site: { ttl: 1800, maxSize: 200 }, // 30 minutes
        report: { ttl: 300, maxSize: 500 }, // 5 minutes
      },
    };

    // Query optimization patterns
    this.queryOptimizations = {
      // Common query patterns with optimized versions
      userWithProfile: {
        include: {
          profile: true,
          agent: {
            select: {
              id: true,
              employeeId: true,
              status: true,
              skills: true,
            },
          },
        },
      },
      
      shiftWithDetails: {
        include: {
          site: {
            select: {
              id: true,
              name: true,
              address: true,
              coordinates: true,
            },
          },
          agent: {
            select: {
              id: true,
              employeeId: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  profile: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      
      reportWithMedia: {
        include: {
          mediaFiles: {
            select: {
              id: true,
              filename: true,
              fileType: true,
              fileSize: true,
              thumbnailPath: true,
            },
          },
          agent: {
            select: {
              id: true,
              user: {
                select: {
                  profile: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    // Start performance monitoring
    this.startPerformanceMonitoring();
  }

  /**
   * Optimized database queries with caching
   */
  async optimizedQuery(model, operation, params, cacheKey = null, ttl = null) {
    const startTime = performance.now();
    
    try {
      // Check cache first
      if (cacheKey && this.redis) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          this.recordQueryMetrics('cache_hit', performance.now() - startTime);
          return JSON.parse(cached);
        }
      }

      // Execute optimized query
      const result = await this.executeOptimizedQuery(model, operation, params);
      
      // Cache result
      if (cacheKey && this.redis && result) {
        const cacheTTL = ttl || this.cacheConfig.defaultTTL;
        await this.redis.setex(cacheKey, cacheTTL, JSON.stringify(result));
      }

      this.recordQueryMetrics('database_hit', performance.now() - startTime);
      return result;
      
    } catch (error) {
      this.recordQueryMetrics('error', performance.now() - startTime);
      logger.error('Optimized query failed', {
        model,
        operation,
        error: error.message,
        duration: performance.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Execute optimized database query
   */
  async executeOptimizedQuery(model, operation, params) {
    const modelInstance = this.prisma[model];
    
    if (!modelInstance) {
      throw new Error(`Model ${model} not found`);
    }

    // Apply query optimizations
    const optimizedParams = this.applyQueryOptimizations(model, operation, params);
    
    // Execute query with timeout
    return await Promise.race([
      modelInstance[operation](optimizedParams),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 30000)
      ),
    ]);
  }

  /**
   * Apply query optimizations based on patterns
   */
  applyQueryOptimizations(model, operation, params) {
    const optimized = { ...params };
    
    // Apply model-specific optimizations
    if (this.queryOptimizations[`${model}WithDetails`]) {
      optimized.include = {
        ...optimized.include,
        ...this.queryOptimizations[`${model}WithDetails`].include,
      };
    }

    // Add pagination limits
    if (operation === 'findMany' && !optimized.take) {
      optimized.take = 100; // Default limit
    }

    // Optimize ordering
    if (optimized.orderBy && Array.isArray(optimized.orderBy)) {
      // Ensure we have proper indexes for multi-column sorts
      optimized.orderBy = optimized.orderBy.slice(0, 2); // Limit to 2 columns
    }

    // Add select optimization for large tables
    if (this.isLargeTable(model) && !optimized.select && !optimized.include) {
      optimized.select = this.getOptimizedSelect(model);
    }

    return optimized;
  }

  /**
   * Batch operations for better performance
   */
  async batchOperation(operations) {
    const startTime = performance.now();
    
    try {
      // Group operations by type
      const grouped = this.groupOperations(operations);
      
      // Execute in transaction for consistency
      const results = await this.prisma.$transaction(async (tx) => {
        const batchResults = [];
        
        // Execute batch creates
        if (grouped.creates.length > 0) {
          const createResults = await this.executeBatchCreates(tx, grouped.creates);
          batchResults.push(...createResults);
        }
        
        // Execute batch updates
        if (grouped.updates.length > 0) {
          const updateResults = await this.executeBatchUpdates(tx, grouped.updates);
          batchResults.push(...updateResults);
        }
        
        // Execute batch deletes
        if (grouped.deletes.length > 0) {
          const deleteResults = await this.executeBatchDeletes(tx, grouped.deletes);
          batchResults.push(...deleteResults);
        }
        
        return batchResults;
      });
      
      this.recordQueryMetrics('batch_operation', performance.now() - startTime);
      return results;
      
    } catch (error) {
      logger.error('Batch operation failed', {
        operationCount: operations.length,
        error: error.message,
        duration: performance.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Intelligent caching strategies
   */
  async smartCache(key, fetchFunction, options = {}) {
    const {
      ttl = this.cacheConfig.defaultTTL,
      refreshThreshold = 0.8, // Refresh when 80% of TTL has passed
      backgroundRefresh = true,
    } = options;

    try {
      // Check cache
      if (this.redis) {
        const cached = await this.redis.get(key);
        const ttlRemaining = await this.redis.ttl(key);
        
        if (cached) {
          const data = JSON.parse(cached);
          
          // Background refresh if near expiration
          if (backgroundRefresh && ttlRemaining < (ttl * (1 - refreshThreshold))) {
            this.backgroundRefresh(key, fetchFunction, ttl);
          }
          
          return data;
        }
      }
      
      // Fetch fresh data
      const data = await fetchFunction();
      
      // Cache the result
      if (this.redis && data) {
        await this.redis.setex(key, ttl, JSON.stringify(data));
      }
      
      return data;
      
    } catch (error) {
      logger.error('Smart cache operation failed', {
        key,
        error: error.message,
      });
      
      // Try to return stale data if available
      if (this.redis) {
        try {
          const stale = await this.redis.get(key);
          if (stale) {
            logger.warn('Returning stale cache data due to error', { key });
            return JSON.parse(stale);
          }
        } catch (staleError) {
          // Ignore stale data errors
        }
      }
      
      throw error;
    }
  }

  /**
   * Background refresh for cache
   */
  async backgroundRefresh(key, fetchFunction, ttl) {
    try {
      const data = await fetchFunction();
      if (this.redis && data) {
        await this.redis.setex(key, ttl, JSON.stringify(data));
        logger.debug('Background cache refresh completed', { key });
      }
    } catch (error) {
      logger.warn('Background cache refresh failed', {
        key,
        error: error.message,
      });
    }
  }

  /**
   * Query result aggregation and optimization
   */
  async aggregateQuery(model, aggregations, filters = {}) {
    const startTime = performance.now();
    
    try {
      const cacheKey = `agg:${model}:${this.hashObject({ aggregations, filters })}`;
      
      return await this.smartCache(cacheKey, async () => {
        const modelInstance = this.prisma[model];
        
        // Build aggregation query
        const query = {
          where: filters,
          _count: aggregations.count || undefined,
          _sum: aggregations.sum || undefined,
          _avg: aggregations.avg || undefined,
          _min: aggregations.min || undefined,
          _max: aggregations.max || undefined,
        };
        
        // Remove undefined aggregations
        Object.keys(query).forEach(key => {
          if (query[key] === undefined) {
            delete query[key];
          }
        });
        
        return await modelInstance.aggregate(query);
      }, { ttl: 600 }); // Cache for 10 minutes
      
    } catch (error) {
      logger.error('Aggregate query failed', {
        model,
        aggregations,
        error: error.message,
        duration: performance.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Connection pool management
   */
  async optimizeConnectionPool() {
    try {
      // Monitor current connections
      const connectionInfo = await this.getConnectionInfo();
      
      // Adjust pool size based on load
      if (connectionInfo.active > connectionInfo.max * 0.8) {
        logger.warn('High database connection usage', connectionInfo);
        
        // Could trigger scaling or alerting here
        await this.alertHighConnectionUsage(connectionInfo);
      }
      
      // Clean up idle connections
      await this.cleanupIdleConnections();
      
      return connectionInfo;
      
    } catch (error) {
      logger.error('Connection pool optimization failed', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Performance monitoring and metrics
   */
  startPerformanceMonitoring() {
    // Monitor query performance every minute
    setInterval(async () => {
      await this.collectPerformanceMetrics();
    }, 60000);
    
    // Cleanup old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
  }

  async collectPerformanceMetrics() {
    try {
      const metrics = {
        timestamp: Date.now(),
        database: await this.getDatabaseMetrics(),
        cache: await this.getCacheMetrics(),
        memory: this.getMemoryMetrics(),
        queries: this.getQueryMetrics(),
      };
      
      // Store metrics
      this.performanceMetrics.set(metrics.timestamp, metrics);
      
      // Alert on performance issues
      await this.checkPerformanceThresholds(metrics);
      
    } catch (error) {
      logger.error('Performance metrics collection failed', {
        error: error.message,
      });
    }
  }

  /**
   * Utility methods
   */
  groupOperations(operations) {
    return operations.reduce((groups, op) => {
      if (!groups[op.type + 's']) {
        groups[op.type + 's'] = [];
      }
      groups[op.type + 's'].push(op);
      return groups;
    }, { creates: [], updates: [], deletes: [] });
  }

  async executeBatchCreates(tx, creates) {
    const results = [];
    
    // Group by model for batch creation
    const byModel = creates.reduce((groups, create) => {
      if (!groups[create.model]) {
        groups[create.model] = [];
      }
      groups[create.model].push(create.data);
      return groups;
    }, {});
    
    for (const [model, dataArray] of Object.entries(byModel)) {
      const result = await tx[model].createMany({
        data: dataArray,
        skipDuplicates: true,
      });
      results.push(result);
    }
    
    return results;
  }

  async executeBatchUpdates(tx, updates) {
    const results = [];
    
    for (const update of updates) {
      const result = await tx[update.model].update({
        where: update.where,
        data: update.data,
      });
      results.push(result);
    }
    
    return results;
  }

  async executeBatchDeletes(tx, deletes) {
    const results = [];
    
    for (const deleteOp of deletes) {
      const result = await tx[deleteOp.model].delete({
        where: deleteOp.where,
      });
      results.push(result);
    }
    
    return results;
  }

  isLargeTable(model) {
    const largeTables = ['auditLog', 'locationTracking', 'notification', 'message'];
    return largeTables.includes(model);
  }

  getOptimizedSelect(model) {
    const selectMaps = {
      user: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      shift: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        siteId: true,
        agentId: true,
        createdAt: true,
        updatedAt: true,
      },
      report: {
        id: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        agentId: true,
        createdAt: true,
        updatedAt: true,
      },
    };
    
    return selectMaps[model] || undefined;
  }

  recordQueryMetrics(type, duration) {
    const key = `query_${type}`;
    const current = this.performanceMetrics.get(key) || { count: 0, totalTime: 0 };
    
    current.count++;
    current.totalTime += duration;
    current.avgTime = current.totalTime / current.count;
    current.lastUpdate = Date.now();
    
    this.performanceMetrics.set(key, current);
  }

  hashObject(obj) {
    return require('crypto')
      .createHash('md5')
      .update(JSON.stringify(obj))
      .digest('hex');
  }

  async getConnectionInfo() {
    // This would need to be implemented based on your database setup
    return {
      active: 10,
      idle: 5,
      max: 20,
      min: 5,
    };
  }

  async cleanupIdleConnections() {
    // Implementation would depend on database driver
    logger.debug('Cleaning up idle database connections');
  }

  async alertHighConnectionUsage(connectionInfo) {
    logger.warn('High database connection usage detected', connectionInfo);
    // Could send alerts to monitoring systems
  }

  async getDatabaseMetrics() {
    return {
      connections: await this.getConnectionInfo(),
      queryCount: this.performanceMetrics.get('query_database_hit')?.count || 0,
      avgQueryTime: this.performanceMetrics.get('query_database_hit')?.avgTime || 0,
    };
  }

  async getCacheMetrics() {
    if (!this.redis) return { enabled: false };
    
    try {
      const info = await this.redis.info('memory');
      return {
        enabled: true,
        hitRate: this.calculateCacheHitRate(),
        memoryUsage: this.parseCacheMemoryInfo(info),
      };
    } catch (error) {
      return { enabled: true, error: error.message };
    }
  }

  getMemoryMetrics() {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
    };
  }

  getQueryMetrics() {
    const dbHits = this.performanceMetrics.get('query_database_hit') || { count: 0 };
    const cacheHits = this.performanceMetrics.get('query_cache_hit') || { count: 0 };
    
    return {
      totalQueries: dbHits.count + cacheHits.count,
      cacheHitRate: this.calculateCacheHitRate(),
      avgDatabaseTime: dbHits.avgTime || 0,
    };
  }

  calculateCacheHitRate() {
    const dbHits = this.performanceMetrics.get('query_database_hit')?.count || 0;
    const cacheHits = this.performanceMetrics.get('query_cache_hit')?.count || 0;
    const total = dbHits + cacheHits;
    
    return total > 0 ? (cacheHits / total) * 100 : 0;
  }

  parseCacheMemoryInfo(info) {
    // Parse Redis memory info
    const lines = info.split('\r\n');
    const memoryLine = lines.find(line => line.startsWith('used_memory:'));
    return memoryLine ? parseInt(memoryLine.split(':')[1]) : 0;
  }

  async checkPerformanceThresholds(metrics) {
    const thresholds = {
      avgQueryTime: 1000, // 1 second
      cacheHitRate: 70, // 70%
      memoryUsage: 0.8, // 80% of available memory
    };
    
    if (metrics.queries.avgDatabaseTime > thresholds.avgQueryTime) {
      logger.warn('Slow query performance detected', {
        avgTime: metrics.queries.avgDatabaseTime,
        threshold: thresholds.avgQueryTime,
      });
    }
    
    if (metrics.queries.cacheHitRate < thresholds.cacheHitRate) {
      logger.warn('Low cache hit rate detected', {
        hitRate: metrics.queries.cacheHitRate,
        threshold: thresholds.cacheHitRate,
      });
    }
  }

  cleanupOldMetrics() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [timestamp, metrics] of this.performanceMetrics.entries()) {
      if (typeof timestamp === 'number' && timestamp < oneHourAgo) {
        this.performanceMetrics.delete(timestamp);
      }
    }
  }
}

module.exports = PerformanceOptimizerService;
