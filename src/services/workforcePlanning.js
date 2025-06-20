const logger = require('../config/logger');

/**
 * Advanced workforce planning and capacity management service
 */
class WorkforcePlanningService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Calculate workforce capacity and demand
   */
  async calculateWorkforceCapacity(startDate, endDate, filters = {}) {
    try {
      const { siteId, skillRequirements = [], includeProjections = true } = filters;

      // Get all active agents
      const agents = await this.prisma.agent.findMany({
        where: {
          employmentStatus: 'ACTIVE',
          deletedAt: null,
          ...(skillRequirements.length > 0 && {
            skills: { hasSome: skillRequirements },
          }),
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: true,
              preferences: true,
            },
          },
          shifts: {
            where: {
              startTime: { gte: startDate },
              endTime: { lte: endDate },
              status: { notIn: ['CANCELLED'] },
              deletedAt: null,
              ...(siteId && { siteId }),
            },
          },
        },
      });

      // Calculate capacity metrics
      const capacity = this.calculateCapacityMetrics(agents, startDate, endDate);

      // Get demand data
      const demand = await this.calculateDemand(startDate, endDate, siteId);

      // Calculate utilization
      const utilization = this.calculateUtilization(capacity, demand);

      // Generate projections if requested
      let projections = null;
      if (includeProjections) {
        projections = await this.generateCapacityProjections(capacity, demand, endDate);
      }

      return {
        period: { startDate, endDate },
        capacity,
        demand,
        utilization,
        projections,
        recommendations: this.generateCapacityRecommendations(capacity, demand, utilization),
        calculatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to calculate workforce capacity:', error);
      throw error;
    }
  }

  /**
   * Optimize workforce allocation across sites
   */
  async optimizeWorkforceAllocation(criteria = {}) {
    try {
      const {
        startDate = new Date(),
        endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        prioritizeCoverage = true,
        minimizeCosts = true,
        respectPreferences = true,
        balanceWorkload = true,
      } = criteria;

      // Get all sites with their requirements
      const sites = await this.prisma.site.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: {
          shifts: {
            where: {
              startTime: { gte: startDate },
              endTime: { lte: endDate },
              deletedAt: null,
            },
            include: {
              agent: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      profile: true,
                    },
                  },
                },
              },
            },
          },
          client: {
            select: {
              id: true,
              companyName: true,
              serviceLevel: true,
            },
          },
        },
      });

      // Get available agents
      const agents = await this.getAvailableAgents(startDate, endDate);

      // Calculate current allocation
      const currentAllocation = this.analyzeCurrentAllocation(sites, agents);

      // Generate optimization recommendations
      const optimizations = this.generateAllocationOptimizations(
        sites,
        agents,
        currentAllocation,
        {
          prioritizeCoverage,
          minimizeCosts,
          respectPreferences,
          balanceWorkload,
        }
      );

      return {
        period: { startDate, endDate },
        currentAllocation,
        optimizations,
        potentialSavings: this.calculatePotentialSavings(optimizations),
        implementationPlan: this.createImplementationPlan(optimizations),
        criteria,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to optimize workforce allocation:', error);
      throw error;
    }
  }

  /**
   * Forecast workforce needs based on historical data and trends
   */
  async forecastWorkforceNeeds(forecastPeriod = 90) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - forecastPeriod * 24 * 60 * 60 * 1000);
      const futureDate = new Date(endDate.getTime() + forecastPeriod * 24 * 60 * 60 * 1000);

      // Get historical data
      const historicalData = await this.getHistoricalWorkforceData(startDate, endDate);

      // Analyze trends
      const trends = this.analyzeTrends(historicalData);

      // Generate forecasts
      const forecasts = this.generateForecasts(trends, futureDate);

      // Identify capacity gaps
      const capacityGaps = await this.identifyCapacityGaps(forecasts);

      // Generate hiring recommendations
      const hiringRecommendations = this.generateHiringRecommendations(capacityGaps);

      return {
        forecastPeriod,
        historicalPeriod: { startDate, endDate },
        forecastPeriod: { startDate: endDate, endDate: futureDate },
        trends,
        forecasts,
        capacityGaps,
        hiringRecommendations,
        confidence: this.calculateForecastConfidence(historicalData),
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to forecast workforce needs:', error);
      throw error;
    }
  }

  /**
   * Generate workforce performance insights
   */
  async generatePerformanceInsights(startDate, endDate) {
    try {
      // Get performance data
      const performanceData = await this.getPerformanceData(startDate, endDate);

      // Calculate key metrics
      const metrics = this.calculatePerformanceMetrics(performanceData);

      // Identify top performers
      const topPerformers = this.identifyTopPerformers(performanceData);

      // Identify improvement opportunities
      const improvements = this.identifyImprovementOpportunities(performanceData);

      // Generate training recommendations
      const trainingRecommendations = this.generateTrainingRecommendations(performanceData);

      return {
        period: { startDate, endDate },
        metrics,
        topPerformers,
        improvements,
        trainingRecommendations,
        benchmarks: this.calculateBenchmarks(metrics),
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to generate performance insights:', error);
      throw error;
    }
  }

  // Helper methods

  calculateCapacityMetrics(agents, startDate, endDate) {
    const totalHours = (endDate - startDate) / (1000 * 60 * 60);
    const totalAgents = agents.length;
    const maxCapacityHours = totalAgents * totalHours;

    let scheduledHours = 0;
    let availableHours = 0;

    agents.forEach(agent => {
      const agentScheduledHours = agent.shifts.reduce((total, shift) => {
        return total + (shift.endTime - shift.startTime) / (1000 * 60 * 60);
      }, 0);

      scheduledHours += agentScheduledHours;
      availableHours += Math.max(0, totalHours - agentScheduledHours);
    });

    return {
      totalAgents,
      maxCapacityHours: Math.round(maxCapacityHours),
      scheduledHours: Math.round(scheduledHours),
      availableHours: Math.round(availableHours),
      utilizationRate: maxCapacityHours > 0 ? (scheduledHours / maxCapacityHours * 100).toFixed(1) : 0,
      availabilityRate: maxCapacityHours > 0 ? (availableHours / maxCapacityHours * 100).toFixed(1) : 0,
    };
  }

  async calculateDemand(startDate, endDate, siteId = null) {
    const where = {
      startTime: { gte: startDate },
      endTime: { lte: endDate },
      deletedAt: null,
      ...(siteId && { siteId }),
    };

    const [totalShifts, unassignedShifts, totalHours] = await Promise.all([
      this.prisma.shift.count({ where }),
      this.prisma.shift.count({ where: { ...where, agentId: null } }),
      this.prisma.shift.aggregate({
        where,
        _sum: {
          actualHours: true,
        },
      }),
    ]);

    const demandHours = await this.prisma.shift.findMany({
      where,
      select: {
        startTime: true,
        endTime: true,
      },
    });

    const calculatedHours = demandHours.reduce((total, shift) => {
      return total + (shift.endTime - shift.startTime) / (1000 * 60 * 60);
    }, 0);

    return {
      totalShifts,
      unassignedShifts,
      assignedShifts: totalShifts - unassignedShifts,
      demandHours: Math.round(calculatedHours),
      actualHours: Math.round(totalHours._sum.actualHours || 0),
      fulfillmentRate: totalShifts > 0 ? ((totalShifts - unassignedShifts) / totalShifts * 100).toFixed(1) : 0,
    };
  }

  calculateUtilization(capacity, demand) {
    const overallUtilization = capacity.maxCapacityHours > 0 ? 
      (demand.demandHours / capacity.maxCapacityHours * 100).toFixed(1) : 0;

    const efficiency = demand.demandHours > 0 ? 
      (demand.actualHours / demand.demandHours * 100).toFixed(1) : 0;

    return {
      overallUtilization,
      efficiency,
      capacityGap: Math.max(0, demand.demandHours - capacity.maxCapacityHours),
      surplusCapacity: Math.max(0, capacity.maxCapacityHours - demand.demandHours),
      status: this.determineUtilizationStatus(overallUtilization),
    };
  }

  determineUtilizationStatus(utilization) {
    if (utilization < 60) return 'underutilized';
    if (utilization < 80) return 'optimal';
    if (utilization < 95) return 'high';
    return 'overutilized';
  }

  async generateCapacityProjections(capacity, demand, currentEndDate) {
    // Simple linear projection based on current trends
    const projectionPeriods = [30, 60, 90]; // days
    const projections = [];

    for (const days of projectionPeriods) {
      const projectionDate = new Date(currentEndDate.getTime() + days * 24 * 60 * 60 * 1000);
      
      // Simple growth assumption (could be enhanced with ML models)
      const growthRate = 1.02; // 2% growth assumption
      const projectedDemand = Math.round(demand.demandHours * Math.pow(growthRate, days / 30));
      
      projections.push({
        period: days,
        projectionDate,
        projectedDemand,
        currentCapacity: capacity.maxCapacityHours,
        capacityGap: Math.max(0, projectedDemand - capacity.maxCapacityHours),
        recommendedHiring: Math.ceil(Math.max(0, projectedDemand - capacity.maxCapacityHours) / 160), // Assuming 160 hours/month per agent
      });
    }

    return projections;
  }

  generateCapacityRecommendations(capacity, demand, utilization) {
    const recommendations = [];

    if (utilization.status === 'underutilized') {
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Optimize Agent Allocation',
        description: 'Current workforce is underutilized. Consider redistributing agents or reducing capacity.',
        impact: 'cost_reduction',
      });
    }

    if (utilization.status === 'overutilized') {
      recommendations.push({
        type: 'capacity_increase',
        priority: 'high',
        title: 'Increase Workforce Capacity',
        description: 'Current demand exceeds capacity. Consider hiring additional agents.',
        impact: 'service_improvement',
      });
    }

    if (demand.unassignedShifts > 0) {
      recommendations.push({
        type: 'assignment',
        priority: 'high',
        title: 'Assign Unassigned Shifts',
        description: `${demand.unassignedShifts} shifts are currently unassigned.`,
        impact: 'service_improvement',
      });
    }

    return recommendations;
  }

  async getAvailableAgents(startDate, endDate) {
    return await this.prisma.agent.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profile: true,
            preferences: true,
          },
        },
        shifts: {
          where: {
            startTime: { gte: startDate },
            endTime: { lte: endDate },
            deletedAt: null,
          },
        },
      },
    });
  }

  analyzeCurrentAllocation(sites, agents) {
    // Analyze how agents are currently allocated across sites
    const allocation = {
      totalSites: sites.length,
      totalAgents: agents.length,
      siteAllocation: {},
      agentWorkload: {},
    };

    sites.forEach(site => {
      const siteAgents = new Set();
      let totalHours = 0;

      site.shifts.forEach(shift => {
        if (shift.agentId) {
          siteAgents.add(shift.agentId);
          totalHours += (shift.endTime - shift.startTime) / (1000 * 60 * 60);
        }
      });

      allocation.siteAllocation[site.id] = {
        siteName: site.name,
        assignedAgents: siteAgents.size,
        totalHours: Math.round(totalHours),
        shiftsCount: site.shifts.length,
        coverage: site.shifts.filter(s => s.agentId).length / site.shifts.length,
      };
    });

    return allocation;
  }

  generateAllocationOptimizations(sites, agents, currentAllocation, criteria) {
    // Generate optimization recommendations
    const optimizations = [];

    // This would contain complex optimization logic
    // For now, return placeholder recommendations

    optimizations.push({
      type: 'reallocation',
      priority: 'medium',
      title: 'Balance Agent Workload',
      description: 'Redistribute agents to balance workload across sites',
      estimatedSavings: 15000, // USD per month
      implementation: 'gradual',
    });

    return optimizations;
  }

  calculatePotentialSavings(optimizations) {
    return optimizations.reduce((total, opt) => total + (opt.estimatedSavings || 0), 0);
  }

  createImplementationPlan(optimizations) {
    return {
      phases: [
        {
          phase: 1,
          duration: '2 weeks',
          actions: ['Analyze current assignments', 'Identify optimization opportunities'],
        },
        {
          phase: 2,
          duration: '4 weeks',
          actions: ['Implement gradual reallocation', 'Monitor performance metrics'],
        },
        {
          phase: 3,
          duration: '2 weeks',
          actions: ['Evaluate results', 'Fine-tune allocations'],
        },
      ],
      totalDuration: '8 weeks',
      estimatedEffort: '40 hours',
    };
  }

  async getHistoricalWorkforceData(startDate, endDate) {
    // Get historical workforce utilization data
    return {
      shifts: await this.prisma.shift.count({
        where: {
          startTime: { gte: startDate },
          endTime: { lte: endDate },
          deletedAt: null,
        },
      }),
      agents: await this.prisma.agent.count({
        where: {
          employmentStatus: 'ACTIVE',
          deletedAt: null,
        },
      }),
      // Additional historical metrics would be calculated here
    };
  }

  analyzeTrends(historicalData) {
    // Analyze trends in the historical data
    return {
      demandTrend: 'increasing', // This would be calculated from actual data
      capacityTrend: 'stable',
      utilizationTrend: 'improving',
    };
  }

  async generateForecasts(trends, futureDate) {
    try {
      // Calculate historical demand patterns
      const historicalData = await this.getHistoricalDemandData();

      // Apply trend analysis for forecasting
      const seasonalFactors = this.calculateSeasonalFactors(historicalData);
      const growthRate = this.calculateGrowthRate(trends);

      // Generate demand forecast scenarios
      const baseDemand = this.calculateBaseDemand(historicalData);
      const seasonalAdjustment = this.getSeasonalAdjustment(futureDate, seasonalFactors);

      const demandForecast = {
        low: Math.round(baseDemand * (1 + growthRate * 0.5) * seasonalAdjustment * 0.9),
        medium: Math.round(baseDemand * (1 + growthRate) * seasonalAdjustment),
        high: Math.round(baseDemand * (1 + growthRate * 1.5) * seasonalAdjustment * 1.1),
      };

      // Calculate capacity needs based on demand
      const currentCapacity = await this.getCurrentCapacity();
      const capacityNeeds = {
        current: currentCapacity,
        projected: demandForecast.medium,
        gap: Math.max(0, demandForecast.medium - currentCapacity),
      };

      return {
        demandForecast,
        capacityNeeds,
        confidence: this.calculateForecastConfidence(trends),
        factors: this.identifyKeyFactors(trends),
      };
    } catch (error) {
      logger.error('Failed to generate forecasts:', error);
      return {
        demandForecast: { low: 0, medium: 0, high: 0 },
        capacityNeeds: { current: 0, projected: 0, gap: 0 },
        confidence: 0,
        factors: [],
      };
    }
  }

  async identifyCapacityGaps(forecasts) {
    try {
      const gaps = [];
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
      const currentYear = new Date().getFullYear();

      for (let i = 0; i < 4; i++) {
        const quarter = quarters[i];
        const quarterStart = new Date(currentYear, i * 3, 1);
        const quarterEnd = new Date(currentYear, (i + 1) * 3, 0);

        // Calculate projected demand for this quarter
        const quarterDemand = await this.calculateQuarterDemand(quarterStart, quarterEnd);
        const quarterCapacity = await this.calculateQuarterCapacity(quarterStart, quarterEnd);

        const gap = Math.max(0, quarterDemand - quarterCapacity);

        if (gap > 0) {
          gaps.push({
            period: `${quarter} ${currentYear}`,
            gap: Math.round(gap),
            severity: this.calculateGapSeverity(gap, quarterCapacity),
            recommendation: this.generateGapRecommendation(gap),
            quarterStart,
            quarterEnd,
          });
        }
      }

      return gaps;
    } catch (error) {
      logger.error('Failed to identify capacity gaps:', error);
      return [];
    }
  }

  generateHiringRecommendations(capacityGaps) {
    try {
      return capacityGaps.map(gap => {
        const hoursPerAgent = 160; // Standard hours per month per agent
        const recommendedHires = Math.ceil(gap.gap / hoursPerAgent);

        // Determine required skills based on gap analysis
        const skills = this.determineRequiredSkills(gap);

        return {
          period: gap.period,
          recommendedHires,
          skills,
          urgency: gap.severity,
          timeline: this.calculateHiringTimeline(gap.severity),
          estimatedCost: this.calculateHiringCost(recommendedHires),
          trainingRequired: this.calculateTrainingRequirements(recommendedHires, skills),
        };
      });
    } catch (error) {
      logger.error('Failed to generate hiring recommendations:', error);
      return [];
    }
  }

  calculateForecastConfidence(historicalData) {
    // Calculate confidence level of forecasts
    return {
      overall: 0.75,
      factors: ['Limited historical data', 'Seasonal variations'],
    };
  }

  async getPerformanceData(startDate, endDate) {
    // Get agent performance data
    return await this.prisma.agent.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
        shifts: {
          where: {
            startTime: { gte: startDate },
            endTime: { lte: endDate },
            status: 'COMPLETED',
            deletedAt: null,
          },
          include: {
            attendance: true,
            reports: true,
          },
        },
      },
    });
  }

  calculatePerformanceMetrics(performanceData) {
    // Calculate various performance metrics
    return {
      averageShiftsPerAgent: 0,
      averageHoursPerAgent: 0,
      attendanceRate: 0,
      reportCompletionRate: 0,
    };
  }

  identifyTopPerformers(performanceData) {
    // Identify top performing agents
    return [];
  }

  identifyImprovementOpportunities(performanceData) {
    // Identify areas for improvement
    return [];
  }

  generateTrainingRecommendations(performanceData) {
    // Generate training recommendations
    return [];
  }

  calculateBenchmarks(metrics) {
    // Calculate industry benchmarks
    return {
      industryAverage: {
        utilizationRate: 75,
        attendanceRate: 95,
        reportCompletionRate: 90,
      },
    };
  }
  // Helper methods for workforce planning calculations

  async getHistoricalDemandData() {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const historicalShifts = await this.prisma.shift.findMany({
        where: {
          startTime: { gte: sixMonthsAgo },
          status: 'COMPLETED',
        },
        select: {
          startTime: true,
          actualHours: true,
          scheduledHours: true,
          siteId: true,
        },
        orderBy: {
          startTime: 'asc',
        },
      });

      // Group by month for trend analysis
      const monthlyData = {};
      historicalShifts.forEach(shift => {
        const monthKey = `${shift.startTime.getFullYear()}-${shift.startTime.getMonth()}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { totalHours: 0, shiftCount: 0 };
        }
        monthlyData[monthKey].totalHours += shift.actualHours || shift.scheduledHours || 0;
        monthlyData[monthKey].shiftCount += 1;
      });

      return monthlyData;
    } catch (error) {
      logger.error('Failed to get historical demand data:', error);
      return {};
    }
  }

  calculateSeasonalFactors(historicalData) {
    const monthlyAverages = {};
    const months = Object.keys(historicalData);

    // Calculate average demand by month
    for (let month = 0; month < 12; month++) {
      const monthData = months.filter(key => key.endsWith(`-${month}`));
      const totalHours = monthData.reduce((sum, key) => sum + historicalData[key].totalHours, 0);
      const avgHours = monthData.length > 0 ? totalHours / monthData.length : 0;
      monthlyAverages[month] = avgHours;
    }

    // Calculate overall average
    const overallAverage = Object.values(monthlyAverages).reduce((sum, val) => sum + val, 0) / 12;

    // Calculate seasonal factors
    const seasonalFactors = {};
    for (let month = 0; month < 12; month++) {
      seasonalFactors[month] = overallAverage > 0 ? monthlyAverages[month] / overallAverage : 1;
    }

    return seasonalFactors;
  }

  calculateGrowthRate(trends) {
    if (!trends || trends.length < 2) return 0;

    // Calculate compound growth rate
    const firstValue = trends[0].value;
    const lastValue = trends[trends.length - 1].value;
    const periods = trends.length - 1;

    if (firstValue <= 0) return 0;

    return Math.pow(lastValue / firstValue, 1 / periods) - 1;
  }

  calculateBaseDemand(historicalData) {
    const values = Object.values(historicalData);
    if (values.length === 0) return 0;

    const totalHours = values.reduce((sum, data) => sum + data.totalHours, 0);
    return totalHours / values.length;
  }

  getSeasonalAdjustment(futureDate, seasonalFactors) {
    const month = futureDate.getMonth();
    return seasonalFactors[month] || 1;
  }

  async getCurrentCapacity() {
    try {
      const activeAgents = await this.prisma.agent.count({
        where: {
          status: 'ACTIVE',
        },
      });

      // Assume 160 hours per month per agent
      return activeAgents * 160;
    } catch (error) {
      logger.error('Failed to get current capacity:', error);
      return 0;
    }
  }

  calculateForecastConfidence(trends) {
    if (!trends || trends.length < 3) return 0.5;

    // Calculate variance in trends
    const values = trends.map(t => t.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);

    // Lower variance = higher confidence
    const coefficientOfVariation = mean > 0 ? standardDeviation / mean : 1;
    return Math.max(0.1, Math.min(0.9, 1 - coefficientOfVariation));
  }

  identifyKeyFactors(trends) {
    const factors = [];

    if (trends && trends.length > 0) {
      const latestTrend = trends[trends.length - 1];

      if (latestTrend.value > trends[0].value) {
        factors.push('Growing demand');
      } else {
        factors.push('Declining demand');
      }

      // Add seasonal factors
      factors.push('Seasonal variations');
      factors.push('Market conditions');
    }

    return factors;
  }

  async calculateQuarterDemand(quarterStart, quarterEnd) {
    try {
      const quarterShifts = await this.prisma.shift.aggregate({
        where: {
          startTime: { gte: quarterStart, lte: quarterEnd },
        },
        _sum: { scheduledHours: true },
      });

      return quarterShifts._sum.scheduledHours || 0;
    } catch (error) {
      logger.error('Failed to calculate quarter demand:', error);
      return 0;
    }
  }

  async calculateQuarterCapacity(quarterStart, quarterEnd) {
    try {
      const daysInQuarter = Math.ceil((quarterEnd - quarterStart) / (1000 * 60 * 60 * 24));
      const activeAgents = await this.prisma.agent.count({
        where: { status: 'ACTIVE' },
      });

      // Assume 8 hours per day per agent
      return activeAgents * 8 * daysInQuarter;
    } catch (error) {
      logger.error('Failed to calculate quarter capacity:', error);
      return 0;
    }
  }

  calculateGapSeverity(gap, capacity) {
    const gapPercentage = capacity > 0 ? (gap / capacity) * 100 : 0;

    if (gapPercentage > 25) return 'high';
    if (gapPercentage > 10) return 'medium';
    return 'low';
  }

  generateGapRecommendation(gap) {
    const hoursPerAgent = 160;
    const agentsNeeded = Math.ceil(gap / hoursPerAgent);

    if (agentsNeeded === 1) {
      return 'Hire 1 additional agent';
    }
    return `Hire ${agentsNeeded} additional agents`;
  }

  determineRequiredSkills(gap) {
    // Basic skill requirements - could be enhanced with ML
    const baseSkills = ['Security Operations', 'Customer Service'];

    if (gap.severity === 'high') {
      baseSkills.push('Emergency Response', 'Leadership');
    }

    return baseSkills;
  }

  calculateHiringTimeline(severity) {
    switch (severity) {
      case 'high': return '2-4 weeks';
      case 'medium': return '4-8 weeks';
      default: return '8-12 weeks';
    }
  }

  calculateHiringCost(numberOfHires) {
    const costPerHire = 5000; // Average cost including recruitment, training, etc.
    return numberOfHires * costPerHire;
  }

  calculateTrainingRequirements(numberOfHires, skills) {
    const trainingHoursPerSkill = 8;
    const totalTrainingHours = numberOfHires * skills.length * trainingHoursPerSkill;

    return {
      totalHours: totalTrainingHours,
      estimatedDuration: `${Math.ceil(totalTrainingHours / 40)} weeks`,
      skills: skills,
    };
  }
}

module.exports = WorkforcePlanningService;
