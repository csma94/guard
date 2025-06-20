const AnalyticsService = require('../../../src/services/analytics');

// Mock Prisma client
const mockPrisma = {
  shift: {
    count: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  report: {
    count: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  agent: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  attendance: {
    findMany: jest.fn(),
  },
};

describe('AnalyticsService', () => {
  let analyticsService;

  beforeEach(() => {
    analyticsService = new AnalyticsService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('calculateCoreMetrics', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');

    beforeEach(() => {
      // Mock Prisma responses
      mockPrisma.shift.count
        .mockResolvedValueOnce(100) // totalShifts
        .mockResolvedValueOnce(95); // completedShifts

      mockPrisma.shift.aggregate.mockResolvedValue({
        _sum: { actualHours: 800 },
      });

      mockPrisma.report.count
        .mockResolvedValueOnce(120) // totalReports
        .mockResolvedValueOnce(15); // incidentReports

      mockPrisma.shift.groupBy
        .mockResolvedValueOnce([{ agentId: '1' }, { agentId: '2' }]) // uniqueAgents
        .mockResolvedValueOnce([{ siteId: '1' }, { siteId: '2' }, { siteId: '3' }]); // uniqueSites
    });

    it('should calculate core metrics correctly', async () => {
      const result = await analyticsService.calculateCoreMetrics(startDate, endDate);

      expect(result).toEqual({
        totalShifts: 100,
        completedShifts: 95,
        completionRate: 95.0,
        totalHours: 800,
        averageHoursPerShift: 8.42,
        totalReports: 120,
        incidentReports: 15,
        incidentRate: 12.5,
        uniqueAgents: 2,
        uniqueSites: 3,
        reportsPerShift: '1.20',
      });
    });

    it('should handle zero values gracefully', async () => {
      mockPrisma.shift.count
        .mockResolvedValueOnce(0) // totalShifts
        .mockResolvedValueOnce(0); // completedShifts

      mockPrisma.shift.aggregate.mockResolvedValue({
        _sum: { actualHours: 0 },
      });

      mockPrisma.report.count
        .mockResolvedValueOnce(0) // totalReports
        .mockResolvedValueOnce(0); // incidentReports

      mockPrisma.shift.groupBy
        .mockResolvedValueOnce([]) // uniqueAgents
        .mockResolvedValueOnce([]); // uniqueSites

      const result = await analyticsService.calculateCoreMetrics(startDate, endDate);

      expect(result.completionRate).toBe(0);
      expect(result.averageHoursPerShift).toBe(0);
      expect(result.incidentRate).toBe(0);
      expect(result.reportsPerShift).toBe('0');
    });

    it('should apply filters correctly', async () => {
      const filters = { clientId: 'client-1', siteId: 'site-1' };

      await analyticsService.calculateCoreMetrics(startDate, endDate, filters);

      expect(mockPrisma.shift.count).toHaveBeenCalledWith({
        where: {
          startTime: { gte: startDate },
          endTime: { lte: endDate },
          deletedAt: null,
          site: { clientId: 'client-1' },
          siteId: 'site-1',
        },
      });
    });
  });

  describe('calculateCostAnalytics', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');

    beforeEach(() => {
      mockPrisma.shift.findMany.mockResolvedValue([
        {
          id: 'shift-1',
          agentId: 'agent-1',
          siteId: 'site-1',
          actualHours: 8,
          agent: { hourlyRate: 25 },
        },
        {
          id: 'shift-2',
          agentId: 'agent-1',
          siteId: 'site-1',
          actualHours: 10, // 2 hours overtime
          agent: { hourlyRate: 25 },
        },
        {
          id: 'shift-3',
          agentId: 'agent-2',
          siteId: 'site-2',
          actualHours: 6,
          agent: { hourlyRate: 30 },
        },
      ]);
    });

    it('should calculate cost analytics correctly', async () => {
      const result = await analyticsService.calculateCostAnalytics(startDate, endDate);

      expect(result.totalCost).toBe(755); // (8*25) + (8*25 + 2*37.5) + (6*30)
      expect(result.regularHours).toBe(22); // 8 + 8 + 6
      expect(result.overtimeHours).toBe(2); // 0 + 2 + 0
      expect(result.overtimePercentage).toBe(8); // 2/24 * 100, rounded
    });

    it('should track costs by agent and site', async () => {
      const result = await analyticsService.calculateCostAnalytics(startDate, endDate);

      expect(result.costByAgent).toHaveLength(2);
      expect(result.costBySite).toHaveLength(2);

      const agent1Cost = result.costByAgent.find(a => a.agentId === 'agent-1');
      expect(agent1Cost.hours).toBe(18);
      expect(agent1Cost.cost).toBe(475); // 8*25 + (8*25 + 2*37.5)
    });

    it('should handle missing hourly rates', async () => {
      mockPrisma.shift.findMany.mockResolvedValue([
        {
          id: 'shift-1',
          agentId: 'agent-1',
          siteId: 'site-1',
          actualHours: 8,
          agent: { hourlyRate: null },
        },
      ]);

      const result = await analyticsService.calculateCostAnalytics(startDate, endDate);

      expect(result.totalCost).toBe(200); // 8 * 25 (default rate)
    });
  });

  describe('generateOperationalAnalytics', () => {
    it('should generate comprehensive operational analytics', async () => {
      // Mock all the sub-methods
      jest.spyOn(analyticsService, 'calculateCoreMetrics').mockResolvedValue({
        totalShifts: 100,
        completedShifts: 95,
        completionRate: 95.0,
      });

      jest.spyOn(analyticsService, 'calculatePerformanceAnalytics').mockResolvedValue({
        agentPerformance: {},
        sitePerformance: {},
      });

      jest.spyOn(analyticsService, 'calculateCostAnalytics').mockResolvedValue({
        totalCost: 50000,
        overtimePercentage: 10,
      });

      jest.spyOn(analyticsService, 'calculateQualityMetrics').mockResolvedValue({
        overallQualityScore: 85,
      });

      jest.spyOn(analyticsService, 'calculateTrendAnalysis').mockResolvedValue({
        daily: [],
        weekly: [],
        monthly: [],
      });

      jest.spyOn(analyticsService, 'generateForecasting').mockResolvedValue({
        demandForecast: {},
      });

      jest.spyOn(analyticsService, 'generateBenchmarking').mockResolvedValue({
        comparisons: {},
      });

      jest.spyOn(analyticsService, 'calculateRiskAnalysis').mockResolvedValue({
        overallRiskScore: 'medium',
      });

      jest.spyOn(analyticsService, 'generateRecommendations').mockReturnValue([
        {
          category: 'performance',
          priority: 'high',
          title: 'Test Recommendation',
        },
      ]);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const result = await analyticsService.generateOperationalAnalytics({
        startDate,
        endDate,
        includeForecasting: true,
        includeBenchmarking: true,
      });

      expect(result).toHaveProperty('coreMetrics');
      expect(result).toHaveProperty('performanceAnalytics');
      expect(result).toHaveProperty('costAnalytics');
      expect(result).toHaveProperty('qualityMetrics');
      expect(result).toHaveProperty('trendAnalysis');
      expect(result).toHaveProperty('forecasting');
      expect(result).toHaveProperty('benchmarking');
      expect(result).toHaveProperty('riskAnalysis');
      expect(result).toHaveProperty('recommendations');
      expect(result.recommendations).toHaveLength(1);
    });

    it('should skip optional components when requested', async () => {
      jest.spyOn(analyticsService, 'calculateCoreMetrics').mockResolvedValue({});
      jest.spyOn(analyticsService, 'calculatePerformanceAnalytics').mockResolvedValue({});
      jest.spyOn(analyticsService, 'calculateCostAnalytics').mockResolvedValue({});
      jest.spyOn(analyticsService, 'calculateQualityMetrics').mockResolvedValue({});
      jest.spyOn(analyticsService, 'calculateTrendAnalysis').mockResolvedValue({});
      jest.spyOn(analyticsService, 'calculateRiskAnalysis').mockResolvedValue({});
      jest.spyOn(analyticsService, 'generateRecommendations').mockReturnValue([]);

      const result = await analyticsService.generateOperationalAnalytics({
        includeForecasting: false,
        includeBenchmarking: false,
      });

      expect(result.forecasting).toBeNull();
      expect(result.benchmarking).toBeNull();
    });
  });

  describe('generateRecommendations', () => {
    it('should generate performance recommendations for low completion rate', () => {
      const analyticsData = {
        coreMetrics: { completionRate: 85 },
        costAnalytics: { overtimePercentage: 10 },
        qualityMetrics: { overallQualityScore: 85 },
      };

      const recommendations = analyticsService.generateRecommendations(analyticsData);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].category).toBe('performance');
      expect(recommendations[0].title).toBe('Improve Shift Completion Rate');
      expect(recommendations[0].priority).toBe('high');
    });

    it('should generate cost recommendations for high overtime', () => {
      const analyticsData = {
        coreMetrics: { completionRate: 95 },
        costAnalytics: { overtimePercentage: 20 },
        qualityMetrics: { overallQualityScore: 85 },
      };

      const recommendations = analyticsService.generateRecommendations(analyticsData);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].category).toBe('cost');
      expect(recommendations[0].title).toBe('Reduce Overtime Costs');
    });

    it('should generate quality recommendations for low quality score', () => {
      const analyticsData = {
        coreMetrics: { completionRate: 95 },
        costAnalytics: { overtimePercentage: 10 },
        qualityMetrics: { overallQualityScore: 75 },
      };

      const recommendations = analyticsService.generateRecommendations(analyticsData);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].category).toBe('quality');
      expect(recommendations[0].title).toBe('Improve Service Quality');
    });

    it('should sort recommendations by priority', () => {
      const analyticsData = {
        coreMetrics: { completionRate: 85 },
        costAnalytics: { overtimePercentage: 20 },
        qualityMetrics: { overallQualityScore: 75 },
      };

      const recommendations = analyticsService.generateRecommendations(analyticsData);

      expect(recommendations).toHaveLength(3);
      expect(recommendations[0].priority).toBe('high');
      expect(recommendations[1].priority).toBe('high');
      expect(recommendations[2].priority).toBe('medium');
    });

    it('should return empty array when no issues found', () => {
      const analyticsData = {
        coreMetrics: { completionRate: 95 },
        costAnalytics: { overtimePercentage: 10 },
        qualityMetrics: { overallQualityScore: 85 },
      };

      const recommendations = analyticsService.generateRecommendations(analyticsData);

      expect(recommendations).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.shift.count.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        analyticsService.calculateCoreMetrics(new Date(), new Date())
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle null/undefined values in calculations', async () => {
      mockPrisma.shift.aggregate.mockResolvedValue({
        _sum: { actualHours: null },
      });

      mockPrisma.shift.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(95);

      mockPrisma.report.count
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(15);

      mockPrisma.shift.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await analyticsService.calculateCoreMetrics(new Date(), new Date());

      expect(result.totalHours).toBe(0);
      expect(result.averageHoursPerShift).toBe(0);
    });
  });
});
