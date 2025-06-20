const BusinessIntelligenceService = require('../../../src/services/businessIntelligence');

// Mock Prisma client
const mockPrisma = {
  shift: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  report: {
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  clientRequest: {
    findMany: jest.fn(),
  },
  agent: {
    findMany: jest.fn(),
  },
  site: {
    findMany: jest.fn(),
  },
};

describe('BusinessIntelligenceService', () => {
  let biService;

  beforeEach(() => {
    biService = new BusinessIntelligenceService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('calculateServiceLevelMetrics', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const filters = { clientId: 'client-1' };

    beforeEach(() => {
      mockPrisma.shift.aggregate
        .mockResolvedValueOnce({ _sum: { scheduledHours: 1000 } }) // Total required hours
        .mockResolvedValueOnce({ _sum: { actualHours: 950 } }); // Actual worked hours

      mockPrisma.report.findMany
        .mockResolvedValueOnce([
          { createdAt: new Date(), metadata: { responseTime: 10 } },
          { createdAt: new Date(), metadata: { responseTime: 15 } },
        ]) // Incident reports
        .mockResolvedValueOnce([
          { createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-02') },
          { createdAt: new Date('2024-01-03'), updatedAt: new Date('2024-01-03') },
        ]); // Resolved reports
    });

    it('should calculate service level metrics correctly', async () => {
      const result = await biService.calculateServiceLevelMetrics(startDate, endDate, filters);

      expect(result).toEqual({
        availability: 95,
        responseTime: 12.5,
        resolutionTime: expect.any(Number),
        slaCompliance: 95,
      });

      expect(mockPrisma.shift.aggregate).toHaveBeenCalledTimes(2);
      expect(mockPrisma.report.findMany).toHaveBeenCalledTimes(2);
    });

    it('should handle zero scheduled hours', async () => {
      mockPrisma.shift.aggregate
        .mockResolvedValueOnce({ _sum: { scheduledHours: 0 } })
        .mockResolvedValueOnce({ _sum: { actualHours: 0 } });

      const result = await biService.calculateServiceLevelMetrics(startDate, endDate, filters);

      expect(result.availability).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.shift.aggregate.mockRejectedValue(new Error('Database error'));

      const result = await biService.calculateServiceLevelMetrics(startDate, endDate, filters);

      expect(result).toEqual({
        availability: 0,
        responseTime: 0,
        resolutionTime: 0,
        slaCompliance: 0,
      });
    });
  });

  describe('calculateQualityMetrics', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const filters = { clientId: 'client-1' };

    beforeEach(() => {
      mockPrisma.report.groupBy.mockResolvedValue([
        { status: 'APPROVED', _count: { id: 80 } },
        { status: 'REJECTED', _count: { id: 20 } },
      ]);

      mockPrisma.clientRequest.findMany.mockResolvedValue([
        { metadata: { satisfaction: 4.5 } },
        { metadata: { satisfaction: 4.0 } },
        { metadata: { satisfaction: 4.2 } },
      ]);

      mockPrisma.shift.count.mockResolvedValue(100);
      mockPrisma.report.count.mockResolvedValue(5);
    });

    it('should calculate quality metrics correctly', async () => {
      const result = await biService.calculateQualityMetrics(startDate, endDate, filters);

      expect(result).toEqual({
        overallQuality: expect.any(Number),
        reportAccuracy: 80,
        clientSatisfaction: 4.23,
        defectRate: 5,
      });

      expect(mockPrisma.report.groupBy).toHaveBeenCalled();
      expect(mockPrisma.clientRequest.findMany).toHaveBeenCalled();
    });

    it('should handle no reports', async () => {
      mockPrisma.report.groupBy.mockResolvedValue([]);

      const result = await biService.calculateQualityMetrics(startDate, endDate, filters);

      expect(result.reportAccuracy).toBe(0);
    });
  });

  describe('calculateEfficiencyMetrics', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const filters = { clientId: 'client-1' };

    beforeEach(() => {
      mockPrisma.shift.aggregate
        .mockResolvedValueOnce({ _sum: { scheduledHours: 1000 } })
        .mockResolvedValueOnce({ _sum: { actualHours: 900 } });

      mockPrisma.report.count.mockResolvedValue(45);

      mockPrisma.shift.findMany.mockResolvedValue([
        {
          scheduledEndTime: new Date('2024-01-01T17:00:00'),
          actualEndTime: new Date('2024-01-01T17:00:00'),
        },
        {
          scheduledEndTime: new Date('2024-01-02T17:00:00'),
          actualEndTime: new Date('2024-01-02T18:00:00'),
        },
      ]);

      // Mock cost and revenue calculations
      biService.calculateTotalCosts = jest.fn().mockResolvedValue(45000);
      biService.calculateTotalRevenue = jest.fn().mockResolvedValue(60000);
    });

    it('should calculate efficiency metrics correctly', async () => {
      const result = await biService.calculateEfficiencyMetrics(startDate, endDate, filters);

      expect(result).toEqual({
        resourceUtilization: 90,
        productivityIndex: 0.05,
        costEfficiency: 25,
        timeEfficiency: 50,
      });
    });
  });

  describe('calculateResourceUtilization', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const filters = { clientId: 'client-1' };

    beforeEach(() => {
      mockPrisma.agent.findMany.mockResolvedValue([
        {
          shifts: [
            { scheduledHours: 40, actualHours: 38 },
            { scheduledHours: 40, actualHours: 40 },
          ],
        },
        {
          shifts: [
            { scheduledHours: 40, actualHours: 35 },
          ],
        },
      ]);

      mockPrisma.report.count
        .mockResolvedValueOnce(2) // Equipment reports
        .mockResolvedValueOnce(10); // Total equipment checks

      mockPrisma.site.findMany.mockResolvedValue([
        {
          shifts: [
            { actualHours: 40 },
            { actualHours: 35 },
          ],
        },
      ]);

      biService.calculateAverageUtilization = jest.fn()
        .mockReturnValueOnce(90) // Agent utilization
        .mockReturnValueOnce(75); // Facility utilization
    });

    it('should calculate resource utilization correctly', async () => {
      const result = await biService.calculateResourceUtilization(startDate, endDate, filters);

      expect(result).toEqual({
        agentUtilization: 90,
        equipmentUtilization: 80,
        facilityUtilization: 75,
        overallUtilization: 81.67,
      });
    });
  });

  describe('helper methods', () => {
    describe('calculateTotalCosts', () => {
      it('should calculate total costs correctly', async () => {
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-01-31');
        const filters = { clientId: 'client-1' };

        mockPrisma.shift.findMany.mockResolvedValue([
          {
            actualHours: 40,
            agent: { hourlyRate: 30 },
          },
          {
            actualHours: 35,
            agent: { hourlyRate: null },
          },
        ]);

        const result = await biService.calculateTotalCosts(startDate, endDate, filters);

        expect(result).toBe(2075); // (40 * 30) + (35 * 25)
      });
    });

    describe('calculateTotalRevenue', () => {
      it('should calculate total revenue correctly', async () => {
        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-01-31');
        const filters = { clientId: 'client-1' };

        mockPrisma.shift.findMany.mockResolvedValue([
          {
            actualHours: 40,
            site: {
              client: { metadata: { billingRate: 45 } },
            },
          },
          {
            actualHours: 35,
            site: {
              client: { metadata: null },
            },
          },
        ]);

        const result = await biService.calculateTotalRevenue(startDate, endDate, filters);

        expect(result).toBe(3025); // (40 * 45) + (35 * 35)
      });
    });

    describe('calculateAverageUtilization', () => {
      it('should calculate average utilization correctly', () => {
        const utilizationData = [
          { scheduled: 100, actual: 90 },
          { scheduled: 80, actual: 80 },
          { scheduled: 120, actual: 100 },
        ];

        const result = biService.calculateAverageUtilization(utilizationData);

        expect(result).toBeCloseTo(88.33, 2);
      });

      it('should handle empty data', () => {
        const result = biService.calculateAverageUtilization([]);
        expect(result).toBe(0);
      });

      it('should handle zero scheduled hours', () => {
        const utilizationData = [
          { scheduled: 0, actual: 10 },
          { scheduled: 100, actual: 90 },
        ];

        const result = biService.calculateAverageUtilization(utilizationData);

        expect(result).toBe(45); // (0 + 90) / 2
      });
    });
  });
});
