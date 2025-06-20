import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { Server } from 'socket.io';
import { createServer } from 'http';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  clientId?: string;
  agentId?: string;
}

export interface TestContext {
  mongoServer: MongoMemoryServer;
  redisServer: any;
  httpServer: any;
  socketServer: Server;
  testUsers: Map<string, TestUser>;
  cleanup: () => Promise<void>;
}

export class TestDatabaseManager {
  private mongoServer: MongoMemoryServer | null = null;
  private redisServer: any = null;

  async setupTestDatabase(): Promise<{ mongoUri: string; redisPort: number }> {
    // Setup MongoDB Memory Server
    this.mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'bahinlink_test',
      },
    });
    const mongoUri = this.mongoServer.getUri();

    // Setup Redis Memory Server (using ioredis-mock for testing)
    const RedisMock = require('ioredis-mock');
    this.redisServer = new RedisMock();
    const redisPort = 6380; // Mock port

    // Connect to test database
    await mongoose.connect(mongoUri);

    return { mongoUri, redisPort };
  }

  async teardownTestDatabase(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }

    if (this.mongoServer) {
      await this.mongoServer.stop();
    }

    if (this.redisServer) {
      this.redisServer.disconnect();
    }
  }

  async clearTestData(): Promise<void> {
    if (mongoose.connection.readyState === 1) {
      const collections = await mongoose.connection.db.collections();
      await Promise.all(collections.map(collection => collection.deleteMany({})));
    }

    if (this.redisServer) {
      await this.redisServer.flushall();
    }
  }
}

export class TestUserFactory {
  private static userCounter = 0;

  static async createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
    this.userCounter++;
    const defaultPassword = 'TestPassword123!';
    
    const user: TestUser = {
      id: `test-user-${this.userCounter}`,
      email: `test${this.userCounter}@example.com`,
      password: defaultPassword,
      role: 'agent',
      permissions: ['shifts.read', 'reports.create'],
      isActive: true,
      ...overrides,
    };

    // Hash password for database storage
    if (user.password === defaultPassword || overrides.password) {
      user.password = await bcrypt.hash(user.password, 10);
    }

    return user;
  }

  static async createAdminUser(): Promise<TestUser> {
    return this.createTestUser({
      role: 'admin',
      permissions: [
        'users.create', 'users.read', 'users.update', 'users.delete',
        'agents.create', 'agents.read', 'agents.update', 'agents.delete',
        'shifts.create', 'shifts.read', 'shifts.update', 'shifts.delete',
        'reports.create', 'reports.read', 'reports.update', 'reports.delete',
        'sites.create', 'sites.read', 'sites.update', 'sites.delete',
        'analytics.read', 'system.configure',
      ],
    });
  }

  static async createClientUser(clientId: string): Promise<TestUser> {
    return this.createTestUser({
      role: 'client',
      clientId,
      permissions: ['reports.read', 'sites.read', 'analytics.read'],
    });
  }

  static async createAgentUser(agentId: string): Promise<TestUser> {
    return this.createTestUser({
      role: 'agent',
      agentId,
      permissions: ['shifts.read', 'shifts.update', 'reports.create', 'reports.read'],
    });
  }
}

export class TestTokenManager {
  private static readonly JWT_SECRET = 'test-jwt-secret';
  private static readonly JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';

  static generateAccessToken(user: TestUser, sessionId: string = 'test-session'): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        sessionId,
        type: 'access',
      },
      this.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }

  static generateRefreshToken(user: TestUser, sessionId: string = 'test-session'): string {
    return jwt.sign(
      {
        userId: user.id,
        sessionId,
        type: 'refresh',
      },
      this.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
  }

  static verifyAccessToken(token: string): any {
    return jwt.verify(token, this.JWT_SECRET);
  }

  static verifyRefreshToken(token: string): any {
    return jwt.verify(token, this.JWT_REFRESH_SECRET);
  }
}

export class MockRequestBuilder {
  private req: Partial<Request>;

  constructor() {
    this.req = {
      headers: {},
      query: {},
      params: {},
      body: {},
      method: 'GET',
      url: '/',
      ip: '127.0.0.1',
    };
  }

  withUser(user: TestUser): this {
    this.req.user = user;
    return this;
  }

  withAuth(token: string): this {
    this.req.headers = {
      ...this.req.headers,
      authorization: `Bearer ${token}`,
    };
    return this;
  }

  withBody(body: any): this {
    this.req.body = body;
    return this;
  }

  withQuery(query: any): this {
    this.req.query = query;
    return this;
  }

  withParams(params: any): this {
    this.req.params = params;
    return this;
  }

  withMethod(method: string): this {
    this.req.method = method;
    return this;
  }

  withUrl(url: string): this {
    this.req.url = url;
    return this;
  }

  withIP(ip: string): this {
    this.req.ip = ip;
    return this;
  }

  withHeaders(headers: any): this {
    this.req.headers = { ...this.req.headers, ...headers };
    return this;
  }

  build(): Request {
    return this.req as Request;
  }
}

export class MockResponseBuilder {
  private res: Partial<Response>;
  private statusCode: number = 200;
  private responseData: any = null;
  private headers: Record<string, string> = {};

  constructor() {
    this.res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((data) => {
        this.responseData = data;
        return this.res;
      }),
      send: jest.fn().mockImplementation((data) => {
        this.responseData = data;
        return this.res;
      }),
      setHeader: jest.fn().mockImplementation((name, value) => {
        this.headers[name] = value;
        return this.res;
      }),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    };
  }

  expectStatus(status: number): this {
    (this.res.status as jest.Mock).mockImplementation((code: number) => {
      this.statusCode = code;
      return this.res;
    });
    return this;
  }

  build(): Response {
    return this.res as Response;
  }

  getStatusCode(): number {
    return this.statusCode;
  }

  getResponseData(): any {
    return this.responseData;
  }

  getHeaders(): Record<string, string> {
    return this.headers;
  }
}

export class TestDataGenerator {
  static generateShiftData(overrides: any = {}) {
    return {
      id: `shift-${Date.now()}`,
      agentId: 'test-agent-1',
      siteId: 'test-site-1',
      startTime: new Date(),
      endTime: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
      status: 'scheduled',
      shiftType: 'regular',
      ...overrides,
    };
  }

  static generateReportData(overrides: any = {}) {
    return {
      id: `report-${Date.now()}`,
      title: 'Test Security Report',
      type: 'patrol',
      agentId: 'test-agent-1',
      siteId: 'test-site-1',
      shiftId: 'test-shift-1',
      content: 'Test report content',
      status: 'submitted',
      createdAt: new Date(),
      ...overrides,
    };
  }

  static generateSiteData(overrides: any = {}) {
    return {
      id: `site-${Date.now()}`,
      name: 'Test Security Site',
      address: '123 Test Street, Test City',
      clientId: 'test-client-1',
      coordinates: {
        latitude: 40.7128,
        longitude: -74.0060,
      },
      isActive: true,
      ...overrides,
    };
  }

  static generateClientData(overrides: any = {}) {
    return {
      id: `client-${Date.now()}`,
      name: 'Test Security Client',
      email: 'client@test.com',
      phone: '+1234567890',
      address: '456 Client Avenue, Client City',
      isActive: true,
      ...overrides,
    };
  }

  static generateAgentData(overrides: any = {}) {
    return {
      id: `agent-${Date.now()}`,
      userId: 'test-user-1',
      employeeId: 'EMP001',
      licenseNumber: 'LIC123456',
      certifications: ['Basic Security', 'First Aid'],
      skills: ['patrol', 'surveillance'],
      isActive: true,
      ...overrides,
    };
  }
}

export class TestSocketManager {
  private server: Server;
  private httpServer: any;

  constructor() {
    this.httpServer = createServer();
    this.server = new Server(this.httpServer);
  }

  async start(port: number = 0): Promise<number> {
    return new Promise((resolve) => {
      this.httpServer.listen(port, () => {
        const actualPort = this.httpServer.address()?.port || port;
        resolve(actualPort);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.httpServer.close(() => {
          resolve();
        });
      });
    });
  }

  getServer(): Server {
    return this.server;
  }
}

export class TestAssertions {
  static expectValidationError(response: any, field: string): void {
    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
    expect(response.body.validationErrors).toBeDefined();
    expect(response.body.validationErrors[field]).toBeDefined();
  }

  static expectUnauthorized(response: any): void {
    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/unauthorized|authentication/i);
  }

  static expectForbidden(response: any): void {
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/forbidden|permission/i);
  }

  static expectNotFound(response: any): void {
    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/i);
  }

  static expectSuccess(response: any, expectedData?: any): void {
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    if (expectedData) {
      expect(response.body).toMatchObject(expectedData);
    }
  }

  static expectPaginatedResponse(response: any): void {
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.pagination).toHaveProperty('page');
    expect(response.body.pagination).toHaveProperty('limit');
    expect(response.body.pagination).toHaveProperty('total');
    expect(response.body.pagination).toHaveProperty('totalPages');
  }
}

export async function setupTestEnvironment(): Promise<TestContext> {
  const dbManager = new TestDatabaseManager();
  const { mongoUri, redisPort } = await dbManager.setupTestDatabase();
  
  const socketManager = new TestSocketManager();
  const socketPort = await socketManager.start();

  const testUsers = new Map<string, TestUser>();

  const cleanup = async () => {
    await dbManager.teardownTestDatabase();
    await socketManager.stop();
  };

  return {
    mongoServer: dbManager['mongoServer']!,
    redisServer: dbManager['redisServer'],
    httpServer: socketManager['httpServer'],
    socketServer: socketManager.getServer(),
    testUsers,
    cleanup,
  };
}

export function createTestSuite(name: string, tests: (context: TestContext) => void): void {
  describe(name, () => {
    let testContext: TestContext;

    beforeAll(async () => {
      testContext = await setupTestEnvironment();
    });

    afterAll(async () => {
      await testContext.cleanup();
    });

    beforeEach(async () => {
      const dbManager = new TestDatabaseManager();
      await dbManager.clearTestData();
    });

    tests(testContext);
  });
}
