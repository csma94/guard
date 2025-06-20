const WorkforcePlanningService = require('../../../src/services/workforcePlanning');

// Mock Prisma client
const mockPrisma = {
  agent: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  shift: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  site: {
    findMany: jest.fn(),
  },
};

describe('WorkforcePlanningService', () => {
  let workforceService;

  beforeEach(() => {
    workforceService = new WorkforcePlanningService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('calculateWorkforceCapacity', () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');
    const siteId = 'site-1';

    beforeEach(() => {
      mockPrisma.agent.findMany.mockResolvedValue([
        {
          id: 'agent-1',
          maxHoursPerWeek: 40,
          skills: ['Security', 'Customer Service'],
          shifts: [
            { scheduledHours: 40, actualHours: 38 },
            { scheduledHours: 40, actualHours: 40 },
          ],
        },
        {
          id: 'agent-2',
          maxHoursPerWeek: 35,
          skills: ['Security'],
          shifts: [
            { scheduledHours: 35, actualHours: 35 },
          ],
        },
      ]);

      workforceService.calculateDemand = jest.fn().mockResolvedValue({
        demandHours: 150,
        peakDemand: 180,
        averageDemand: 140,
      });

      workforceService.calculateUtilization = jest.fn().mockReturnValue({
        currentUtilization: 85,
        optimalUtilization: 90,
        utilizationGap: 5,
      });

      workforceService.generateCapacityProjections = jest.fn().mockResolvedValue([
        {
          period: 30,
          projectedDemand: 160,
          currentCapacity: 150,
          capacityGap: 10,
        },
      ]);

      workforceService.generateCapacityRecommendations = jest.fn().mockReturnValue([
        {
          type: 'hiring',
          recommendation: 'Hire 1 additional agent',
          priority: 'medium',
        },
      ]);
    });

    it('should calculate workforce capacity correctly', async () => {
      const result = await workforceService.calculateWorkforceCapacity(
        startDate,
        endDate,
        siteId,
        true
      );

      expect(result).toEqual({
        period: { startDate, endDate },
        capacity: expect.any(Object),
        demand: expect.any(Object),
        utilization: expect.any(Object),
        projections: expect.any(Array),
        recommendations: expect.any(Array),
        calculatedAt: expect.any(Date),
      });

      expect(mockPrisma.agent.findMany).toHaveBeenCalled();
      expect(workforceService.calculateDemand).toHaveBeenCalledWith(startDate, endDate, siteId);
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.agent.findMany.mockRejectedValue(new Error('Database error'));

      await expect(
        workforceService.calculateWorkforceCapacity(startDate, endDate, siteId)
      ).rejects.toThrow('Database error');
    });
  });

  describe('generateForecasts', () => {
    const trends = [
      { period: '2024-01', value: 100 },
      { period: '2024-02', value: 110 },
      { period: '2024-03', value: 120 },
    ];
    const futureDate = new Date('2024-06-01');

    beforeEach(() => {
      workforceService.getHistoricalDemandData = jest.fn().mockResolvedValue({
        '2024-0': { totalHours: 1000, shiftCount: 50 },
        '2024-1': { totalHours: 1100, shiftCount: 55 },
        '2024-2': { totalHours: 1200, shiftCount: 60 },
      });

      workforceService.calculateSeasonalFactors = jest.fn().mockReturnValue({
        0: 1.0, 1: 1.1, 2: 1.2, 3: 1.0, 4: 0.9, 5: 1.0,
        6: 1.1, 7: 1.2, 8: 1.0, 9: 0.9, 10: 1.0, 11: 1.1,
      });

      workforceService.calculateGrowthRate = jest.fn().mockReturnValue(0.1);
      workforceService.calculateBaseDemand = jest.fn().mockReturnValue(1100);
      workforceService.getSeasonalAdjustment = jest.fn().mockReturnValue(1.0);
      workforceService.getCurrentCapacity = jest.fn().mockResolvedValue(1000);
      workforceService.calculateForecastConfidence = jest.fn().mockReturnValue(0.85);
      workforceService.identifyKeyFactors = jest.fn().mockReturnValue(['Growing demand', 'Seasonal variations']);
    });

    it('should generate forecasts correctly', async () => {
      const result = await workforceService.generateForecasts(trends, futureDate);

      expect(result).toEqual({
        demandForecast: {
          low: expect.any(Number),
          medium: expect.any(Number),
          high: expect.any(Number),
        },
        capacityNeeds: {
          current: 1000,
          projected: expect.any(Number),
          gap: expect.any(Number),
        },
        confidence: 0.85,
        factors: ['Growing demand', 'Seasonal variations'],
      });

      expect(workforceService.getHistoricalDemandData).toHaveBeenCalled();
      expect(workforceService.calculateGrowthRate).toHaveBeenCalledWith(trends);
    });

    it('should handle errors gracefully', async () => {
      workforceService.getHistoricalDemandData.mockRejectedValue(new Error('Data error'));

      const result = await workforceService.generateForecasts(trends, futureDate);

      expect(result).toEqual({
        demandForecast: { low: 0, medium: 0, high: 0 },
        capacityNeeds: { current: 0, projected: 0, gap: 0 },
        confidence: 0,
        factors: [],
      });
    });
  });

  describe('identifyCapacityGaps', () => {
    const forecasts = {
      demandForecast: { low: 900, medium: 1000, high: 1100 },
      capacityNeeds: { current: 800, projected: 1000, gap: 200 },
    };

    beforeEach(() => {
      workforceService.calculateQuarterDemand = jest.fn()
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(1100)
        .mockResolvedValueOnce(1200)
        .mockResolvedValueOnce(1000);

      workforceService.calculateQuarterCapacity = jest.fn()
        .mockResolvedValueOnce(900)
        .mockResolvedValueOnce(950)
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(1100);

      workforceService.calculateGapSeverity = jest.fn()
        .mockReturnValueOnce('medium')
        .mockReturnValueOnce('medium')
        .mockReturnValueOnce('high');

      workforceService.generateGapRecommendation = jest.fn()
        .mockReturnValueOnce('Hire 1 additional agent')
        .mockReturnValueOnce('Hire 2 additional agents')
        .mockReturnValueOnce('Hire 3 additional agents');
    });

    it('should identify capacity gaps correctly', async () => {
      const result = await workforceService.identifyCapacityGaps(forecasts);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        period: expect.stringContaining('Q1'),
        gap: 100,
        severity: 'medium',
        recommendation: 'Hire 1 additional agent',
        quarterStart: expect.any(Date),
        quarterEnd: expect.any(Date),
      });
    });

    it('should handle errors gracefully', async () => {
      workforceService.calculateQuarterDemand.mockRejectedValue(new Error('Calculation error'));

      const result = await workforceService.identifyCapacityGaps(forecasts);

      expect(result).toEqual([]);
    });
  });

  describe('generateHiringRecommendations', () => {
    const capacityGaps = [
      {
        period: 'Q1 2024',
        gap: 160,
        severity: 'medium',
        quarterStart: new Date('2024-01-01'),
        quarterEnd: new Date('2024-03-31'),
      },
      {
        period: 'Q2 2024',
        gap: 320,
        severity: 'high',
        quarterStart: new Date('2024-04-01'),
        quarterEnd: new Date('2024-06-30'),
      },
    ];

    beforeEach(() => {
      workforceService.determineRequiredSkills = jest.fn()
        .mockReturnValueOnce(['Security Operations', 'Customer Service'])
        .mockReturnValueOnce(['Security Operations', 'Customer Service', 'Emergency Response', 'Leadership']);

      workforceService.calculateHiringTimeline = jest.fn()
        .mockReturnValueOnce('4-8 weeks')
        .mockReturnValueOnce('2-4 weeks');

      workforceService.calculateHiringCost = jest.fn()
        .mockReturnValueOnce(5000)
        .mockReturnValueOnce(10000);

      workforceService.calculateTrainingRequirements = jest.fn()
        .mockReturnValueOnce({
          totalHours: 16,
          estimatedDuration: '1 weeks',
          skills: ['Security Operations', 'Customer Service'],
        })
        .mockReturnValueOnce({
          totalHours: 64,
          estimatedDuration: '2 weeks',
          skills: ['Security Operations', 'Customer Service', 'Emergency Response', 'Leadership'],
        });
    });

    it('should generate hiring recommendations correctly', () => {
      const result = workforceService.generateHiringRecommendations(capacityGaps);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        period: 'Q1 2024',
        recommendedHires: 1,
        skills: ['Security Operations', 'Customer Service'],
        urgency: 'medium',
        timeline: '4-8 weeks',
        estimatedCost: 5000,
        trainingRequired: {
          totalHours: 16,
          estimatedDuration: '1 weeks',
          skills: ['Security Operations', 'Customer Service'],
        },
      });

      expect(result[1]).toEqual({
        period: 'Q2 2024',
        recommendedHires: 2,
        skills: ['Security Operations', 'Customer Service', 'Emergency Response', 'Leadership'],
        urgency: 'high',
        timeline: '2-4 weeks',
        estimatedCost: 10000,
        trainingRequired: {
          totalHours: 64,
          estimatedDuration: '2 weeks',
          skills: ['Security Operations', 'Customer Service', 'Emergency Response', 'Leadership'],
        },
      });
    });

    it('should handle errors gracefully', () => {
      workforceService.determineRequiredSkills.mockImplementation(() => {
        throw new Error('Skills calculation error');
      });

      const result = workforceService.generateHiringRecommendations(capacityGaps);

      expect(result).toEqual([]);
    });
  });

  describe('helper methods', () => {
    describe('calculateGrowthRate', () => {
      it('should calculate growth rate correctly', () => {
        const trends = [
          { value: 100 },
          { value: 110 },
          { value: 121 },
        ];

        const result = workforceService.calculateGrowthRate(trends);

        expect(result).toBeCloseTo(0.1, 2);
      });

      it('should handle insufficient data', () => {
        const trends = [{ value: 100 }];

        const result = workforceService.calculateGrowthRate(trends);

        expect(result).toBe(0);
      });

      it('should handle zero first value', () => {
        const trends = [
          { value: 0 },
          { value: 100 },
        ];

        const result = workforceService.calculateGrowthRate(trends);

        expect(result).toBe(0);
      });
    });

    describe('calculateGapSeverity', () => {
      it('should classify high severity correctly', () => {
        const result = workforceService.calculateGapSeverity(300, 1000);
        expect(result).toBe('high');
      });

      it('should classify medium severity correctly', () => {
        const result = workforceService.calculateGapSeverity(150, 1000);
        expect(result).toBe('medium');
      });

      it('should classify low severity correctly', () => {
        const result = workforceService.calculateGapSeverity(50, 1000);
        expect(result).toBe('low');
      });

      it('should handle zero capacity', () => {
        const result = workforceService.calculateGapSeverity(100, 0);
        expect(result).toBe('low');
      });
    });

    describe('determineRequiredSkills', () => {
      it('should return basic skills for low/medium severity', () => {
        const gap = { severity: 'medium' };
        const result = workforceService.determineRequiredSkills(gap);

        expect(result).toEqual(['Security Operations', 'Customer Service']);
      });

      it('should return enhanced skills for high severity', () => {
        const gap = { severity: 'high' };
        const result = workforceService.determineRequiredSkills(gap);

        expect(result).toEqual(['Security Operations', 'Customer Service', 'Emergency Response', 'Leadership']);
      });
    });

    describe('calculateHiringTimeline', () => {
      it('should return correct timeline for high severity', () => {
        const result = workforceService.calculateHiringTimeline('high');
        expect(result).toBe('2-4 weeks');
      });

      it('should return correct timeline for medium severity', () => {
        const result = workforceService.calculateHiringTimeline('medium');
        expect(result).toBe('4-8 weeks');
      });

      it('should return correct timeline for low severity', () => {
        const result = workforceService.calculateHiringTimeline('low');
        expect(result).toBe('8-12 weeks');
      });
    });
  });
});
