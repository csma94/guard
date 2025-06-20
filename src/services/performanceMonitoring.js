const os = require('os');
const { performance } = require('perf_hooks');
const logger = require('../config/logger');

/**
 * Performance monitoring service for production metrics
 */
class PerformanceMonitoringService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.metrics = new Map();
    this.startTime = Date.now();
    this.requestCounts = new Map();
    this.responseTimes = [];
    this.errorCounts = new Map();
    this.slowQueries = [];
    this.memorySnapshots = [];
    
    // Start periodic metric collection
    this.startMetricCollection();
  }

  /**
   * Start periodic metric collection
   */
  startMetricCollection() {
    // Collect metrics every 30 seconds
    setInterval(() => {
      this.collectPerformanceMetrics();
    }, 30000);

    // Clean old data every 5 minutes
    setInterval(() => {
      this.cleanOldMetrics();
    }, 300000);
  }

  /**
   * Record API request metrics
   */
  recordRequest(method, path, statusCode, responseTime) {
    const key = `${method}:${path}`;
    
    // Update request counts
    const currentCount = this.requestCounts.get(key) || 0;
    this.requestCounts.set(key, currentCount + 1);
    
    // Record response time
    this.responseTimes.push({
      timestamp: Date.now(),
      method,
      path,
      statusCode,
      responseTime,
    });
    
    // Record errors
    if (statusCode >= 400) {
      const errorKey = `${statusCode}:${key}`;
      const errorCount = this.errorCounts.get(errorKey) || 0;
      this.errorCounts.set(errorKey, errorCount + 1);
    }
    
    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
  }

  /**
   * Record slow database query
   */
  recordSlowQuery(query, duration, params = {}) {
    this.slowQueries.push({
      timestamp: Date.now(),
      query: query.substring(0, 500), // Truncate long queries
      duration,
      params: JSON.stringify(params).substring(0, 200),
    });
    
    // Keep only last 100 slow queries
    if (this.slowQueries.length > 100) {
      this.slowQueries = this.slowQueries.slice(-100);
    }
  }

  /**
   * Get detailed performance metrics
   */
  async getDetailedMetrics() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    return {
      timestamp: new Date().toISOString(),
      uptime,
      requests: this.getRequestMetrics(),
      performance: this.getPerformanceMetrics(),
      database: await this.getDatabaseMetrics(),
      cache: await this.getCacheMetrics(),
      system: this.getSystemMetrics(),
      errors: this.getErrorMetrics(),
    };
  }

  /**
   * Get request metrics
   */
  getRequestMetrics() {
    const now = Date.now();
    const lastHour = now - (60 * 60 * 1000);
    
    // Filter recent response times
    const recentResponses = this.responseTimes.filter(r => r.timestamp > lastHour);
    
    if (recentResponses.length === 0) {
      return {
        total: 0,
        rps: 0,
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
      };
    }
    
    // Calculate response time percentiles
    const sortedTimes = recentResponses.map(r => r.responseTime).sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    
    return {
      total: recentResponses.length,
      rps: recentResponses.length / 3600, // Requests per second over last hour
      averageResponseTime: sortedTimes.reduce((sum, time) => sum + time, 0) / sortedTimes.length,
      p95ResponseTime: sortedTimes[p95Index] || 0,
      p99ResponseTime: sortedTimes[p99Index] || 0,
      statusCodes: this.getStatusCodeDistribution(recentResponses),
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const memUsage = process.memoryUsage();
    
    return {
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      cpu: {
        usage: this.getCurrentCPUUsage(),
        loadAverage: os.loadavg(),
      },
      eventLoop: {
        lag: this.getEventLoopLag(),
      },
      gc: this.getGCMetrics(),
    };
  }

  /**
   * Get database metrics
   */
  async getDatabaseMetrics() {
    try {
      const startTime = performance.now();
      
      // Test query performance
      await this.prisma.$queryRaw`SELECT 1`;
      const queryTime = performance.now() - startTime;
      
      // Get connection pool info (if available)
      const poolInfo = this.prisma._engine?.connectionInfo || {};
      
      return {
        connectionTime: Math.round(queryTime),
        slowQueries: this.slowQueries.slice(-10), // Last 10 slow queries
        poolInfo,
        status: 'connected',
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        slowQueries: this.slowQueries.slice(-10),
      };
    }
  }

  /**
   * Get cache metrics
   */
  async getCacheMetrics() {
    try {
      if (!this.redis) {
        return {
          status: 'not_configured',
        };
      }
      
      const startTime = performance.now();
      await this.redis.ping();
      const pingTime = performance.now() - startTime;
      
      // Get Redis info if available
      let info = {};
      try {
        const redisInfo = await this.redis.info();
        info = this.parseRedisInfo(redisInfo);
      } catch (e) {
        // Redis info not available
      }
      
      return {
        status: 'connected',
        pingTime: Math.round(pingTime),
        info,
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        utilization: (os.totalmem() - os.freemem()) / os.totalmem(),
      },
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
    };
  }

  /**
   * Get error metrics
   */
  getErrorMetrics() {
    const now = Date.now();
    const lastHour = now - (60 * 60 * 1000);
    
    // Filter recent errors
    const recentErrors = this.responseTimes.filter(r => 
      r.timestamp > lastHour && r.statusCode >= 400
    );
    
    const errorsByStatus = {};
    recentErrors.forEach(error => {
      errorsByStatus[error.statusCode] = (errorsByStatus[error.statusCode] || 0) + 1;
    });
    
    return {
      total: recentErrors.length,
      rate: recentErrors.length / 3600, // Errors per second over last hour
      byStatusCode: errorsByStatus,
      recent: recentErrors.slice(-10), // Last 10 errors
    };
  }

  /**
   * Get Prometheus-formatted metrics
   */
  async getPrometheusMetrics() {
    const metrics = await this.getDetailedMetrics();
    const lines = [];
    
    // Request metrics
    lines.push(`# HELP http_requests_total Total number of HTTP requests`);
    lines.push(`# TYPE http_requests_total counter`);
    lines.push(`http_requests_total ${metrics.requests.total}`);
    
    lines.push(`# HELP http_request_duration_seconds HTTP request duration in seconds`);
    lines.push(`# TYPE http_request_duration_seconds histogram`);
    lines.push(`http_request_duration_seconds_sum ${metrics.requests.averageResponseTime / 1000}`);
    lines.push(`http_request_duration_seconds_count ${metrics.requests.total}`);
    
    // Memory metrics
    lines.push(`# HELP process_resident_memory_bytes Resident memory size in bytes`);
    lines.push(`# TYPE process_resident_memory_bytes gauge`);
    lines.push(`process_resident_memory_bytes ${metrics.performance.memory.rss}`);
    
    lines.push(`# HELP process_heap_bytes Process heap size in bytes`);
    lines.push(`# TYPE process_heap_bytes gauge`);
    lines.push(`process_heap_bytes ${metrics.performance.memory.heapUsed}`);
    
    // CPU metrics
    lines.push(`# HELP process_cpu_usage_ratio Process CPU usage ratio`);
    lines.push(`# TYPE process_cpu_usage_ratio gauge`);
    lines.push(`process_cpu_usage_ratio ${metrics.performance.cpu.usage}`);
    
    // Database metrics
    lines.push(`# HELP database_connection_time_seconds Database connection time in seconds`);
    lines.push(`# TYPE database_connection_time_seconds gauge`);
    lines.push(`database_connection_time_seconds ${metrics.database.connectionTime / 1000}`);
    
    return lines.join('\n') + '\n';
  }

  /**
   * Helper methods
   */
  collectPerformanceMetrics() {
    const memUsage = process.memoryUsage();
    this.memorySnapshots.push({
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
    });
    
    // Keep only last 100 snapshots
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots = this.memorySnapshots.slice(-100);
    }
  }

  cleanOldMetrics() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    // Clean old response times
    this.responseTimes = this.responseTimes.filter(r => r.timestamp > oneHourAgo);
    
    // Clean old slow queries
    this.slowQueries = this.slowQueries.filter(q => q.timestamp > oneHourAgo);
    
    // Clean old memory snapshots
    this.memorySnapshots = this.memorySnapshots.filter(s => s.timestamp > oneHourAgo);
  }

  getStatusCodeDistribution(responses) {
    const distribution = {};
    responses.forEach(response => {
      const statusClass = `${Math.floor(response.statusCode / 100)}xx`;
      distribution[statusClass] = (distribution[statusClass] || 0) + 1;
    });
    return distribution;
  }

  getCurrentCPUUsage() {
    // Simplified CPU usage calculation
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    return Math.min(loadAvg / cpuCount, 1);
  }

  getEventLoopLag() {
    // Simplified event loop lag measurement
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
      this.eventLoopLag = lag;
    });
    return this.eventLoopLag || 0;
  }

  getGCMetrics() {
    // Simplified GC metrics - would need gc-stats package for detailed metrics
    return {
      collections: 0,
      duration: 0,
    };
  }

  parseRedisInfo(infoString) {
    const info = {};
    const lines = infoString.split('\r\n');
    
    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        info[key] = value;
      }
    });
    
    return {
      version: info.redis_version,
      uptime: info.uptime_in_seconds,
      connectedClients: info.connected_clients,
      usedMemory: info.used_memory,
      totalCommandsProcessed: info.total_commands_processed,
    };
  }

  /**
   * Detect memory leaks
   */
  async detectMemoryLeaks() {
    if (this.memorySnapshots.length < 10) {
      return {
        detected: false,
        reason: 'Insufficient data',
      };
    }
    
    // Check for consistent memory growth
    const recent = this.memorySnapshots.slice(-10);
    const growth = recent[recent.length - 1].heapUsed - recent[0].heapUsed;
    const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
    const growthRate = growth / timeSpan; // bytes per millisecond
    
    // If memory is growing more than 1MB per minute consistently
    const threshold = (1024 * 1024) / (60 * 1000); // 1MB per minute in bytes per millisecond
    
    return {
      detected: growthRate > threshold,
      growthRate: Math.round(growthRate * 60 * 1000), // bytes per minute
      threshold: Math.round(threshold * 60 * 1000),
    };
  }

  /**
   * Get slow queries
   */
  async getSlowQueries() {
    return this.slowQueries.slice(-20); // Last 20 slow queries
  }

  /**
   * Get error rates
   */
  async getErrorRates() {
    const now = Date.now();
    const intervals = [
      { name: '1m', duration: 60 * 1000 },
      { name: '5m', duration: 5 * 60 * 1000 },
      { name: '15m', duration: 15 * 60 * 1000 },
      { name: '1h', duration: 60 * 60 * 1000 },
    ];
    
    const rates = {};
    
    intervals.forEach(interval => {
      const cutoff = now - interval.duration;
      const requests = this.responseTimes.filter(r => r.timestamp > cutoff);
      const errors = requests.filter(r => r.statusCode >= 400);
      
      rates[interval.name] = {
        total: requests.length,
        errors: errors.length,
        rate: requests.length > 0 ? (errors.length / requests.length) * 100 : 0,
      };
    });
    
    return rates;
  }
}

module.exports = PerformanceMonitoringService;
