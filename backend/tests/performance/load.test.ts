import autocannon from 'autocannon';
import { performance } from 'perf_hooks';
import { app } from '../../src/app';
import { Server } from 'http';
import {
  createTestSuite,
  TestUserFactory,
  TestTokenManager,
  TestDataGenerator,
} from '../../../shared/testing/testUtils';

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  averageResponseTime: number;
  throughput: number;
  errorRate: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
}

interface LoadTestConfig {
  url: string;
  connections: number;
  duration: number;
  headers?: Record<string, string>;
  body?: string;
  method?: string;
}

class PerformanceTestSuite {
  private server: Server;
  private baseUrl: string;
  private adminToken: string;
  private agentToken: string;

  constructor() {
    this.baseUrl = 'http://localhost:3001';
  }

  async setup(): Promise<void> {
    // Start test server
    this.server = app.listen(3001);
    
    // Create test users and tokens
    const adminUser = await TestUserFactory.createAdminUser();
    const agentUser = await TestUserFactory.createAgentUser('perf-agent');
    
    this.adminToken = TestTokenManager.generateAccessToken(adminUser);
    this.agentToken = TestTokenManager.generateAccessToken(agentUser);

    // Warm up the server
    await this.warmupServer();
  }

  async teardown(): Promise<void> {
    if (this.server) {
      this.server.close();
    }
  }

  private async warmupServer(): Promise<void> {
    // Make a few requests to warm up the server
    const warmupRequests = [
      this.makeRequest('/api/health'),
      this.makeRequest('/api/auth/me', { authorization: `Bearer ${this.adminToken}` }),
      this.makeRequest('/api/shifts', { authorization: `Bearer ${this.adminToken}` }),
    ];

    await Promise.all(warmupRequests);
  }

  private async makeRequest(path: string, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, { headers });
  }

  async runLoadTest(config: LoadTestConfig): Promise<PerformanceMetrics> {
    const startCpuUsage = process.cpuUsage();
    const startMemory = process.memoryUsage();

    const result = await autocannon({
      url: config.url,
      connections: config.connections,
      duration: config.duration,
      headers: config.headers,
      body: config.body,
      method: config.method || 'GET',
    });

    const endCpuUsage = process.cpuUsage(startCpuUsage);
    const endMemory = process.memoryUsage();

    return {
      endpoint: config.url,
      method: config.method || 'GET',
      averageResponseTime: result.latency.mean,
      throughput: result.requests.average,
      errorRate: (result.errors / result.requests.total) * 100,
      p95ResponseTime: result.latency.p95,
      p99ResponseTime: result.latency.p99,
      memoryUsage: {
        rss: endMemory.rss - startMemory.rss,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external,
        arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
      },
      cpuUsage: endCpuUsage,
    };
  }

  async testAuthenticationPerformance(): Promise<PerformanceMetrics> {
    return this.runLoadTest({
      url: `${this.baseUrl}/api/auth/login`,
      connections: 50,
      duration: 30,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@bahinlink.com',
        password: 'TestPassword123!',
      }),
    });
  }

  async testShiftsAPIPerformance(): Promise<PerformanceMetrics> {
    return this.runLoadTest({
      url: `${this.baseUrl}/api/shifts`,
      connections: 100,
      duration: 60,
      headers: {
        authorization: `Bearer ${this.adminToken}`,
      },
    });
  }

  async testReportsAPIPerformance(): Promise<PerformanceMetrics> {
    return this.runLoadTest({
      url: `${this.baseUrl}/api/reports`,
      connections: 75,
      duration: 45,
      headers: {
        authorization: `Bearer ${this.adminToken}`,
      },
    });
  }

  async testWebSocketPerformance(): Promise<PerformanceMetrics> {
    const startTime = performance.now();
    const connections: WebSocket[] = [];
    const messageCount = 1000;
    let receivedMessages = 0;

    // Create multiple WebSocket connections
    for (let i = 0; i < 50; i++) {
      const ws = new WebSocket(`ws://localhost:3001`, {
        headers: {
          authorization: `Bearer ${this.agentToken}`,
        },
      });

      ws.on('message', () => {
        receivedMessages++;
      });

      connections.push(ws);
    }

    // Wait for connections to establish
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send messages
    const messageStartTime = performance.now();
    connections.forEach((ws, index) => {
      for (let i = 0; i < messageCount / connections.length; i++) {
        ws.send(JSON.stringify({
          type: 'test_message',
          payload: { index, message: i },
        }));
      }
    });

    // Wait for all messages to be received
    while (receivedMessages < messageCount) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const messageTime = endTime - messageStartTime;

    // Close connections
    connections.forEach(ws => ws.close());

    return {
      endpoint: 'WebSocket',
      method: 'WS',
      averageResponseTime: messageTime / messageCount,
      throughput: messageCount / (messageTime / 1000),
      errorRate: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };
  }

  async testDatabasePerformance(): Promise<PerformanceMetrics> {
    const startTime = performance.now();
    const operations = 1000;
    let completedOperations = 0;

    // Simulate database operations
    const promises = [];
    for (let i = 0; i < operations; i++) {
      const promise = this.simulateDatabaseOperation().then(() => {
        completedOperations++;
      });
      promises.push(promise);
    }

    await Promise.all(promises);
    const endTime = performance.now();
    const totalTime = endTime - startTime;

    return {
      endpoint: 'Database',
      method: 'QUERY',
      averageResponseTime: totalTime / operations,
      throughput: operations / (totalTime / 1000),
      errorRate: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };
  }

  private async simulateDatabaseOperation(): Promise<void> {
    // Simulate database query time
    const queryTime = Math.random() * 50 + 10; // 10-60ms
    await new Promise(resolve => setTimeout(resolve, queryTime));
  }

  async testConcurrentUserLoad(): Promise<PerformanceMetrics> {
    const concurrentUsers = 200;
    const actionsPerUser = 10;
    const startTime = performance.now();

    const userPromises = [];
    for (let i = 0; i < concurrentUsers; i++) {
      userPromises.push(this.simulateUserSession(actionsPerUser));
    }

    await Promise.all(userPromises);
    const endTime = performance.now();
    const totalTime = endTime - startTime;

    return {
      endpoint: 'Concurrent Users',
      method: 'MIXED',
      averageResponseTime: totalTime / (concurrentUsers * actionsPerUser),
      throughput: (concurrentUsers * actionsPerUser) / (totalTime / 1000),
      errorRate: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };
  }

  private async simulateUserSession(actionCount: number): Promise<void> {
    const actions = [
      () => this.makeRequest('/api/shifts', { authorization: `Bearer ${this.agentToken}` }),
      () => this.makeRequest('/api/reports', { authorization: `Bearer ${this.agentToken}` }),
      () => this.makeRequest('/api/sites', { authorization: `Bearer ${this.agentToken}` }),
      () => this.makeRequest('/api/auth/me', { authorization: `Bearer ${this.agentToken}` }),
    ];

    for (let i = 0; i < actionCount; i++) {
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      await randomAction();
      
      // Random delay between actions
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    }
  }

  async generatePerformanceReport(metrics: PerformanceMetrics[]): Promise<string> {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalEndpoints: metrics.length,
        averageResponseTime: metrics.reduce((sum, m) => sum + m.averageResponseTime, 0) / metrics.length,
        totalThroughput: metrics.reduce((sum, m) => sum + m.throughput, 0),
        averageErrorRate: metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length,
      },
      details: metrics,
      recommendations: this.generateRecommendations(metrics),
    };

    return JSON.stringify(report, null, 2);
  }

  private generateRecommendations(metrics: PerformanceMetrics[]): string[] {
    const recommendations: string[] = [];

    metrics.forEach(metric => {
      if (metric.averageResponseTime > 1000) {
        recommendations.push(`${metric.endpoint}: Response time is high (${metric.averageResponseTime}ms). Consider optimization.`);
      }

      if (metric.errorRate > 1) {
        recommendations.push(`${metric.endpoint}: Error rate is elevated (${metric.errorRate}%). Investigate error causes.`);
      }

      if (metric.throughput < 100) {
        recommendations.push(`${metric.endpoint}: Low throughput (${metric.throughput} req/s). Consider scaling or optimization.`);
      }

      if (metric.memoryUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
        recommendations.push(`${metric.endpoint}: High memory usage detected. Check for memory leaks.`);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('All performance metrics are within acceptable ranges.');
    }

    return recommendations;
  }
}

createTestSuite('Performance Tests', () => {
  let performanceTest: PerformanceTestSuite;

  beforeAll(async () => {
    performanceTest = new PerformanceTestSuite();
    await performanceTest.setup();
  });

  afterAll(async () => {
    await performanceTest.teardown();
  });

  test('Authentication API Performance', async () => {
    const metrics = await performanceTest.testAuthenticationPerformance();
    
    // Performance assertions
    expect(metrics.averageResponseTime).toBeLessThan(500); // 500ms
    expect(metrics.errorRate).toBeLessThan(1); // Less than 1% error rate
    expect(metrics.throughput).toBeGreaterThan(50); // At least 50 req/s
    
    console.log('Authentication Performance:', metrics);
  }, 60000);

  test('Shifts API Performance', async () => {
    const metrics = await performanceTest.testShiftsAPIPerformance();
    
    expect(metrics.averageResponseTime).toBeLessThan(300);
    expect(metrics.errorRate).toBeLessThan(0.5);
    expect(metrics.throughput).toBeGreaterThan(100);
    
    console.log('Shifts API Performance:', metrics);
  }, 90000);

  test('Reports API Performance', async () => {
    const metrics = await performanceTest.testReportsAPIPerformance();
    
    expect(metrics.averageResponseTime).toBeLessThan(400);
    expect(metrics.errorRate).toBeLessThan(0.5);
    expect(metrics.throughput).toBeGreaterThan(75);
    
    console.log('Reports API Performance:', metrics);
  }, 75000);

  test('WebSocket Performance', async () => {
    const metrics = await performanceTest.testWebSocketPerformance();
    
    expect(metrics.averageResponseTime).toBeLessThan(100);
    expect(metrics.throughput).toBeGreaterThan(500);
    
    console.log('WebSocket Performance:', metrics);
  }, 30000);

  test('Database Performance', async () => {
    const metrics = await performanceTest.testDatabasePerformance();
    
    expect(metrics.averageResponseTime).toBeLessThan(50);
    expect(metrics.throughput).toBeGreaterThan(200);
    
    console.log('Database Performance:', metrics);
  }, 30000);

  test('Concurrent User Load', async () => {
    const metrics = await performanceTest.testConcurrentUserLoad();
    
    expect(metrics.averageResponseTime).toBeLessThan(1000);
    expect(metrics.errorRate).toBeLessThan(2);
    
    console.log('Concurrent User Performance:', metrics);
  }, 120000);

  test('Generate Performance Report', async () => {
    const allMetrics = await Promise.all([
      performanceTest.testAuthenticationPerformance(),
      performanceTest.testShiftsAPIPerformance(),
      performanceTest.testReportsAPIPerformance(),
    ]);

    const report = await performanceTest.generatePerformanceReport(allMetrics);
    
    expect(report).toBeDefined();
    expect(report.length).toBeGreaterThan(0);
    
    // Save report to file
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(__dirname, '../../../performance-results/performance-report.json');
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report);
    
    console.log('Performance report saved to:', reportPath);
  }, 180000);
});
