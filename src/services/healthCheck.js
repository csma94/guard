const os = require('os');
const { performance } = require('perf_hooks');
const logger = require('../config/logger');

/**
 * Comprehensive health check service for production monitoring
 */
class HealthCheckService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.startTime = Date.now();
    this.checks = new Map();
    this.thresholds = {
      database: {
        responseTime: 1000, // 1 second
        timeout: 5000, // 5 seconds
      },
      redis: {
        responseTime: 100, // 100ms
        timeout: 2000, // 2 seconds
      },
      memory: {
        usage: 0.85, // 85% of available memory
      },
      cpu: {
        usage: 0.80, // 80% CPU usage
      },
      disk: {
        usage: 0.90, // 90% disk usage
      },
    };
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const startTime = performance.now();
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {},
      metrics: {},
    };

    try {
      // Run all health checks in parallel
      const [
        databaseCheck,
        redisCheck,
        systemCheck,
        externalServicesCheck,
        applicationCheck,
      ] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkSystemHealth(),
        this.checkExternalServices(),
        this.checkApplicationHealth(),
      ]);

      // Process results
      results.checks.database = this.processCheckResult(databaseCheck);
      results.checks.redis = this.processCheckResult(redisCheck);
      results.checks.system = this.processCheckResult(systemCheck);
      results.checks.externalServices = this.processCheckResult(externalServicesCheck);
      results.checks.application = this.processCheckResult(applicationCheck);

      // Calculate overall status
      const allChecks = Object.values(results.checks);
      const hasFailures = allChecks.some(check => check.status === 'unhealthy');
      const hasWarnings = allChecks.some(check => check.status === 'degraded');

      if (hasFailures) {
        results.status = 'unhealthy';
      } else if (hasWarnings) {
        results.status = 'degraded';
      }

      // Add performance metrics
      results.metrics = await this.collectMetrics();
      results.responseTime = Math.round(performance.now() - startTime);

      // Log health check results
      logger.info('Health check completed', {
        status: results.status,
        responseTime: results.responseTime,
        checks: Object.keys(results.checks).reduce((acc, key) => {
          acc[key] = results.checks[key].status;
          return acc;
        }, {}),
      });

      return results;
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        ...results,
        status: 'unhealthy',
        error: error.message,
        responseTime: Math.round(performance.now() - startTime),
      };
    }
  }

  /**
   * Check database connectivity and performance
   */
  async checkDatabase() {
    const startTime = performance.now();
    
    try {
      // Test basic connectivity
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database timeout')), this.thresholds.database.timeout)
        ),
      ]);

      // Test write operation
      const testRecord = await this.prisma.systemConfiguration.upsert({
        where: { key: 'HEALTH_CHECK' },
        update: { value: { lastCheck: new Date() } },
        create: { key: 'HEALTH_CHECK', value: { lastCheck: new Date() } },
      });

      const responseTime = Math.round(performance.now() - startTime);
      const isHealthy = responseTime < this.thresholds.database.responseTime;

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        responseTime,
        details: {
          connected: true,
          writeTest: !!testRecord,
          threshold: this.thresholds.database.responseTime,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Math.round(performance.now() - startTime),
        error: error.message,
        details: {
          connected: false,
        },
      };
    }
  }

  /**
   * Check Redis connectivity and performance
   */
  async checkRedis() {
    const startTime = performance.now();
    
    try {
      if (!this.redis) {
        return {
          status: 'degraded',
          responseTime: 0,
          details: {
            connected: false,
            reason: 'Redis not configured',
          },
        };
      }

      // Test basic connectivity
      const testKey = 'health_check_test';
      const testValue = Date.now().toString();

      await Promise.race([
        this.redis.setex(testKey, 10, testValue),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis timeout')), this.thresholds.redis.timeout)
        ),
      ]);

      // Test read operation
      const retrievedValue = await this.redis.get(testKey);
      await this.redis.del(testKey);

      const responseTime = Math.round(performance.now() - startTime);
      const isHealthy = responseTime < this.thresholds.redis.responseTime;

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        responseTime,
        details: {
          connected: true,
          writeTest: true,
          readTest: retrievedValue === testValue,
          threshold: this.thresholds.redis.responseTime,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Math.round(performance.now() - startTime),
        error: error.message,
        details: {
          connected: false,
        },
      };
    }
  }

  /**
   * Check system resource health
   */
  async checkSystemHealth() {
    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryUtilization = usedMemory / totalMemory;

      const cpuUsage = await this.getCPUUsage();
      const loadAverage = os.loadavg();

      // Check thresholds
      const memoryHealthy = memoryUtilization < this.thresholds.memory.usage;
      const cpuHealthy = cpuUsage < this.thresholds.cpu.usage;

      let status = 'healthy';
      if (!memoryHealthy || !cpuHealthy) {
        status = 'degraded';
      }

      return {
        status,
        details: {
          memory: {
            used: Math.round(usedMemory / 1024 / 1024), // MB
            total: Math.round(totalMemory / 1024 / 1024), // MB
            utilization: Math.round(memoryUtilization * 100), // %
            healthy: memoryHealthy,
            process: {
              rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
              heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
              heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            },
          },
          cpu: {
            usage: Math.round(cpuUsage * 100), // %
            healthy: cpuHealthy,
            loadAverage: loadAverage.map(load => Math.round(load * 100) / 100),
            cores: os.cpus().length,
          },
          uptime: Math.round(os.uptime()),
          platform: os.platform(),
          arch: os.arch(),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * Check external services connectivity
   */
  async checkExternalServices() {
    const services = [];
    const results = {};

    // Check AWS S3 if configured
    if (process.env.AWS_ACCESS_KEY_ID) {
      services.push(this.checkAWSS3());
    }

    // Check Twilio if configured
    if (process.env.TWILIO_ACCOUNT_SID) {
      services.push(this.checkTwilio());
    }

    // Check SendGrid if configured
    if (process.env.SENDGRID_API_KEY) {
      services.push(this.checkSendGrid());
    }

    if (services.length === 0) {
      return {
        status: 'healthy',
        details: {
          message: 'No external services configured',
        },
      };
    }

    try {
      const serviceResults = await Promise.allSettled(services);
      let overallStatus = 'healthy';

      serviceResults.forEach((result, index) => {
        const serviceName = ['s3', 'twilio', 'sendgrid'][index];
        if (result.status === 'fulfilled') {
          results[serviceName] = result.value;
          if (result.value.status !== 'healthy') {
            overallStatus = 'degraded';
          }
        } else {
          results[serviceName] = {
            status: 'unhealthy',
            error: result.reason.message,
          };
          overallStatus = 'unhealthy';
        }
      });

      return {
        status: overallStatus,
        details: results,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * Check application-specific health
   */
  async checkApplicationHealth() {
    try {
      // Check active connections
      const activeAgents = await this.prisma.agent.count({
        where: { status: 'ACTIVE' },
      });

      const activeShifts = await this.prisma.shift.count({
        where: { status: 'IN_PROGRESS' },
      });

      const recentReports = await this.prisma.report.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      return {
        status: 'healthy',
        details: {
          activeAgents,
          activeShifts,
          recentReports,
          features: {
            authentication: true,
            realTimeTracking: true,
            fileUpload: true,
            notifications: true,
          },
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * Collect performance metrics
   */
  async collectMetrics() {
    const memoryUsage = process.memoryUsage();
    
    return {
      process: {
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        memory: {
          rss: memoryUsage.rss,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
        },
        cpu: await this.getCPUUsage(),
      },
      system: {
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        cpus: os.cpus().length,
      },
      nodejs: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };
  }

  /**
   * Helper methods
   */
  processCheckResult(result) {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'unhealthy',
        error: result.reason.message,
      };
    }
  }

  async getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime.bigint();

      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = process.hrtime.bigint();
        const elapsedTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

        const totalUsage = (endUsage.user + endUsage.system) / 1000; // Convert to milliseconds
        const cpuPercent = (totalUsage / elapsedTime) * 100;

        resolve(Math.min(cpuPercent / os.cpus().length, 100) / 100); // Normalize to 0-1
      }, 100);
    });
  }

  async checkAWSS3() {
    // Simplified S3 check - would implement actual AWS SDK check
    return {
      status: 'healthy',
      details: { configured: true },
    };
  }

  async checkTwilio() {
    // Simplified Twilio check - would implement actual Twilio API check
    return {
      status: 'healthy',
      details: { configured: true },
    };
  }

  async checkSendGrid() {
    // Simplified SendGrid check - would implement actual SendGrid API check
    return {
      status: 'healthy',
      details: { configured: true },
    };
  }
}

module.exports = HealthCheckService;
