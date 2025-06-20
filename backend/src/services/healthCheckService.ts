import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    external: HealthCheck;
    system: HealthCheck;
  };
  score: number;
}

interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  responseTime: number;
  message?: string;
  details?: any;
}

export class HealthCheckService {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor() {
    this.prisma = new PrismaClient();
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const [database, redis, external, system] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkExternalServices(),
        this.checkSystemResources()
      ]);

      const checks = {
        database: this.getCheckResult(database),
        redis: this.getCheckResult(redis),
        external: this.getCheckResult(external),
        system: this.getCheckResult(system)
      };

      const score = this.calculateHealthScore(checks);
      const status = this.determineOverallStatus(score);

      const result: HealthCheckResult = {
        status,
        timestamp: new Date().toISOString(),
        checks,
        score
      };

      // Log health check results
      logger.info('Health check completed', {
        status,
        score,
        duration: Date.now() - startTime,
        checks: Object.entries(checks).map(([name, check]) => ({
          name,
          status: check.status,
          responseTime: check.responseTime
        }))
      });

      return result;
    } catch (error) {
      logger.error('Health check failed', { error });
      
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: { status: 'fail', responseTime: 0, message: 'Health check error' },
          redis: { status: 'fail', responseTime: 0, message: 'Health check error' },
          external: { status: 'fail', responseTime: 0, message: 'Health check error' },
          system: { status: 'fail', responseTime: 0, message: 'Health check error' }
        },
        score: 0
      };
    }
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      
      // Test write capability
      const testRecord = await this.prisma.healthCheck.create({
        data: {
          timestamp: new Date(),
          status: 'test'
        }
      });
      
      // Clean up test record
      await this.prisma.healthCheck.delete({
        where: { id: testRecord.id }
      });
      
      const responseTime = Date.now() - startTime;
      
      // Check connection pool
      const connectionCount = await this.prisma.$queryRaw`
        SELECT count(*) as active_connections 
        FROM pg_stat_activity 
        WHERE state = 'active'
      ` as any[];
      
      const activeConnections = parseInt(connectionCount[0]?.active_connections || '0');
      
      if (activeConnections > 80) {
        return {
          status: 'warn',
          responseTime,
          message: 'High connection count',
          details: { activeConnections }
        };
      }
      
      if (responseTime > 1000) {
        return {
          status: 'warn',
          responseTime,
          message: 'Slow database response',
          details: { responseTime }
        };
      }
      
      return {
        status: 'pass',
        responseTime,
        details: { activeConnections }
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        message: 'Database connection failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      await this.redis.ping();
      
      // Test read/write operations
      const testKey = `health_check_${Date.now()}`;
      await this.redis.set(testKey, 'test', 'EX', 10);
      const value = await this.redis.get(testKey);
      await this.redis.del(testKey);
      
      if (value !== 'test') {
        throw new Error('Redis read/write test failed');
      }
      
      const responseTime = Date.now() - startTime;
      
      // Check memory usage
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const usedMemory = memoryMatch ? parseInt(memoryMatch[1]) : 0;
      const maxMemoryMatch = info.match(/maxmemory:(\d+)/);
      const maxMemory = maxMemoryMatch ? parseInt(maxMemoryMatch[1]) : 0;
      
      const memoryUsagePercent = maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0;
      
      if (memoryUsagePercent > 90) {
        return {
          status: 'warn',
          responseTime,
          message: 'High memory usage',
          details: { memoryUsagePercent, usedMemory, maxMemory }
        };
      }
      
      if (responseTime > 500) {
        return {
          status: 'warn',
          responseTime,
          message: 'Slow Redis response',
          details: { responseTime }
        };
      }
      
      return {
        status: 'pass',
        responseTime,
        details: { memoryUsagePercent, usedMemory }
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        message: 'Redis connection failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkExternalServices(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const checks = await Promise.allSettled([
        this.checkClerkService(),
        this.checkEmailService(),
        this.checkSMSService(),
        this.checkMapsService()
      ]);
      
      const results = checks.map(check => 
        check.status === 'fulfilled' ? check.value : { status: 'fail', service: 'unknown' }
      );
      
      const failedServices = results.filter(r => r.status === 'fail');
      const warnServices = results.filter(r => r.status === 'warn');
      
      const responseTime = Date.now() - startTime;
      
      if (failedServices.length > 0) {
        return {
          status: 'warn',
          responseTime,
          message: `${failedServices.length} external service(s) failing`,
          details: { failed: failedServices, warned: warnServices }
        };
      }
      
      if (warnServices.length > 0) {
        return {
          status: 'warn',
          responseTime,
          message: `${warnServices.length} external service(s) degraded`,
          details: { warned: warnServices }
        };
      }
      
      return {
        status: 'pass',
        responseTime,
        details: { services: results.length }
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        message: 'External services check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private async checkClerkService(): Promise<{ status: string; service: string }> {
    try {
      // Simple connectivity check to Clerk
      const response = await fetch('https://api.clerk.dev/v1/health', {
        method: 'GET',
        timeout: 5000
      });
      
      return {
        status: response.ok ? 'pass' : 'warn',
        service: 'clerk'
      };
    } catch (error) {
      return { status: 'fail', service: 'clerk' };
    }
  }

  private async checkEmailService(): Promise<{ status: string; service: string }> {
    try {
      // Check if SendGrid API key is configured
      if (!process.env.SENDGRID_API_KEY) {
        return { status: 'warn', service: 'email' };
      }
      
      // Simple API check (without sending email)
      const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`
        },
        timeout: 5000
      });
      
      return {
        status: response.ok ? 'pass' : 'warn',
        service: 'email'
      };
    } catch (error) {
      return { status: 'fail', service: 'email' };
    }
  }

  private async checkSMSService(): Promise<{ status: string; service: string }> {
    try {
      // Check if Twilio credentials are configured
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        return { status: 'warn', service: 'sms' };
      }
      
      // Simple API check
      const auth = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64');
      
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`
          },
          timeout: 5000
        }
      );
      
      return {
        status: response.ok ? 'pass' : 'warn',
        service: 'sms'
      };
    } catch (error) {
      return { status: 'fail', service: 'sms' };
    }
  }

  private async checkMapsService(): Promise<{ status: string; service: string }> {
    try {
      // Check if Google Maps API key is configured
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        return { status: 'warn', service: 'maps' };
      }
      
      // Simple API check
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${process.env.GOOGLE_MAPS_API_KEY}`,
        {
          method: 'GET',
          timeout: 5000
        }
      );
      
      return {
        status: response.ok ? 'pass' : 'warn',
        service: 'maps'
      };
    } catch (error) {
      return { status: 'fail', service: 'maps' };
    }
  }

  private async checkSystemResources(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Convert to MB
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
      const rssMB = memoryUsage.rss / 1024 / 1024;
      
      const memoryUsagePercent = (heapUsedMB / heapTotalMB) * 100;
      
      const responseTime = Date.now() - startTime;
      
      if (memoryUsagePercent > 90) {
        return {
          status: 'warn',
          responseTime,
          message: 'High memory usage',
          details: { memoryUsagePercent, heapUsedMB, heapTotalMB, rssMB }
        };
      }
      
      if (rssMB > 1024) { // 1GB
        return {
          status: 'warn',
          responseTime,
          message: 'High RSS memory usage',
          details: { memoryUsagePercent, heapUsedMB, heapTotalMB, rssMB }
        };
      }
      
      return {
        status: 'pass',
        responseTime,
        details: { memoryUsagePercent, heapUsedMB, heapTotalMB, rssMB, cpuUsage }
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        message: 'System resources check failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  private getCheckResult(settledResult: PromiseSettledResult<HealthCheck>): HealthCheck {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    } else {
      return {
        status: 'fail',
        responseTime: 0,
        message: 'Check failed',
        details: { error: settledResult.reason }
      };
    }
  }

  private calculateHealthScore(checks: HealthCheckResult['checks']): number {
    const weights = {
      database: 40,
      redis: 20,
      external: 20,
      system: 20
    };
    
    let totalScore = 0;
    let totalWeight = 0;
    
    Object.entries(checks).forEach(([name, check]) => {
      const weight = weights[name as keyof typeof weights];
      let score = 0;
      
      switch (check.status) {
        case 'pass':
          score = 100;
          break;
        case 'warn':
          score = 70;
          break;
        case 'fail':
          score = 0;
          break;
      }
      
      totalScore += score * weight;
      totalWeight += weight;
    });
    
    return Math.round(totalScore / totalWeight);
  }

  private determineOverallStatus(score: number): 'healthy' | 'degraded' | 'unhealthy' {
    if (score >= 90) return 'healthy';
    if (score >= 70) return 'degraded';
    return 'unhealthy';
  }

  async getReadinessCheck(): Promise<{ ready: boolean; checks: any }> {
    try {
      // Quick checks for readiness
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.ping();
      
      return {
        ready: true,
        checks: {
          database: 'ready',
          redis: 'ready'
        }
      };
    } catch (error) {
      return {
        ready: false,
        checks: {
          database: 'not ready',
          redis: 'not ready',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  async getLivenessCheck(): Promise<{ alive: boolean }> {
    // Simple liveness check - if this method executes, the service is alive
    return { alive: true };
  }

  async cleanup(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      await this.redis.quit();
    } catch (error) {
      logger.error('Error during health check service cleanup', { error });
    }
  }
}
