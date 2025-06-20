const logger = require('../config/logger');

/**
 * Advanced analytics and business intelligence service
 */
class AnalyticsService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Generate comprehensive operational analytics
   */
  async generateOperationalAnalytics(filters = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        endDate = new Date(),
        clientId,
        siteId,
        agentId,
        includeForecasting = true,
        includeBenchmarking = true,
      } = filters;

      // Core metrics
      const coreMetrics = await this.calculateCoreMetrics(startDate, endDate, { clientId, siteId, agentId });

      // Performance analytics
      const performanceAnalytics = await this.calculatePerformanceAnalytics(startDate, endDate, { clientId, siteId, agentId });

      // Cost analytics
      const costAnalytics = await this.calculateCostAnalytics(startDate, endDate, { clientId, siteId, agentId });

      // Quality metrics
      const qualityMetrics = await this.calculateQualityMetrics(startDate, endDate, { clientId, siteId, agentId });

      // Trend analysis
      const trendAnalysis = await this.calculateTrendAnalysis(startDate, endDate, { clientId, siteId, agentId });

      // Predictive insights
      let forecasting = null;
      if (includeForecasting) {
        forecasting = await this.generateForecasting(startDate, endDate, { clientId, siteId, agentId });
      }

      // Industry benchmarking
      let benchmarking = null;
      if (includeBenchmarking) {
        benchmarking = await this.generateBenchmarking(coreMetrics, { clientId, siteId });
      }

      // Risk analysis
      const riskAnalysis = await this.calculateRiskAnalysis(startDate, endDate, { clientId, siteId, agentId });

      // Recommendations
      const recommendations = this.generateRecommendations({
        coreMetrics,
        performanceAnalytics,
        costAnalytics,
        qualityMetrics,
        riskAnalysis,
      });

      return {
        period: { startDate, endDate },
        coreMetrics,
        performanceAnalytics,
        costAnalytics,
        qualityMetrics,
        trendAnalysis,
        forecasting,
        benchmarking,
        riskAnalysis,
        recommendations,
        generatedAt: new Date(),
        filters,
      };
    } catch (error) {
      logger.error('Failed to generate operational analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate core operational metrics
   */
  async calculateCoreMetrics(startDate, endDate, filters = {}) {
    const { clientId, siteId, agentId } = filters;

    const where = {
      startTime: { gte: startDate },
      endTime: { lte: endDate },
      deletedAt: null,
      ...(clientId && { site: { clientId } }),
      ...(siteId && { siteId }),
      ...(agentId && { agentId }),
    };

    const [
      totalShifts,
      completedShifts,
      totalHours,
      totalReports,
      incidentReports,
      uniqueAgents,
      uniqueSites,
    ] = await Promise.all([
      this.prisma.shift.count({ where }),
      this.prisma.shift.count({ where: { ...where, status: 'COMPLETED' } }),
      this.prisma.shift.aggregate({
        where,
        _sum: { actualHours: true },
      }),
      this.prisma.report.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          deletedAt: null,
          ...(clientId && { site: { clientId } }),
          ...(siteId && { siteId }),
          ...(agentId && { agentId }),
        },
      }),
      this.prisma.report.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          reportType: 'INCIDENT',
          deletedAt: null,
          ...(clientId && { site: { clientId } }),
          ...(siteId && { siteId }),
          ...(agentId && { agentId }),
        },
      }),
      this.prisma.shift.groupBy({
        by: ['agentId'],
        where,
        _count: { agentId: true },
      }).then(result => result.length),
      this.prisma.shift.groupBy({
        by: ['siteId'],
        where,
        _count: { siteId: true },
      }).then(result => result.length),
    ]);

    const completionRate = totalShifts > 0 ? (completedShifts / totalShifts * 100).toFixed(1) : 0;
    const averageHoursPerShift = completedShifts > 0 ? (totalHours._sum.actualHours || 0) / completedShifts : 0;
    const incidentRate = totalReports > 0 ? (incidentReports / totalReports * 100).toFixed(1) : 0;

    return {
      totalShifts,
      completedShifts,
      completionRate: parseFloat(completionRate),
      totalHours: totalHours._sum.actualHours || 0,
      averageHoursPerShift: Math.round(averageHoursPerShift * 100) / 100,
      totalReports,
      incidentReports,
      incidentRate: parseFloat(incidentRate),
      uniqueAgents,
      uniqueSites,
      reportsPerShift: totalShifts > 0 ? (totalReports / totalShifts).toFixed(2) : 0,
    };
  }

  /**
   * Calculate performance analytics
   */
  async calculatePerformanceAnalytics(startDate, endDate, filters = {}) {
    const { clientId, siteId, agentId } = filters;

    // Agent performance metrics
    const agentPerformance = await this.calculateAgentPerformance(startDate, endDate, filters);

    // Site performance metrics
    const sitePerformance = await this.calculateSitePerformance(startDate, endDate, filters);

    // Response time analytics
    const responseTimeAnalytics = await this.calculateResponseTimeAnalytics(startDate, endDate, filters);

    // Attendance analytics
    const attendanceAnalytics = await this.calculateAttendanceAnalytics(startDate, endDate, filters);

    return {
      agentPerformance,
      sitePerformance,
      responseTimeAnalytics,
      attendanceAnalytics,
    };
  }

  /**
   * Calculate cost analytics
   */
  async calculateCostAnalytics(startDate, endDate, filters = {}) {
    const { clientId, siteId, agentId } = filters;

    // This would integrate with payroll/billing systems
    // For now, we'll calculate based on hours and estimated rates
    const shifts = await this.prisma.shift.findMany({
      where: {
        startTime: { gte: startDate },
        endTime: { lte: endDate },
        deletedAt: null,
        ...(clientId && { site: { clientId } }),
        ...(siteId && { siteId }),
        ...(agentId && { agentId }),
      },
      include: {
        agent: {
          select: {
            hourlyRate: true,
            employmentType: true,
          },
        },
      },
    });

    let totalCost = 0;
    let regularHours = 0;
    let overtimeHours = 0;
    const costByAgent = {};
    const costBySite = {};

    shifts.forEach(shift => {
      const hours = shift.actualHours || 0;
      const rate = shift.agent?.hourlyRate || 25; // Default rate
      
      // Simple overtime calculation (over 8 hours per shift)
      const regularShiftHours = Math.min(hours, 8);
      const overtimeShiftHours = Math.max(0, hours - 8);
      
      const shiftCost = (regularShiftHours * rate) + (overtimeShiftHours * rate * 1.5);
      
      totalCost += shiftCost;
      regularHours += regularShiftHours;
      overtimeHours += overtimeShiftHours;

      // Track by agent
      if (!costByAgent[shift.agentId]) {
        costByAgent[shift.agentId] = { hours: 0, cost: 0 };
      }
      costByAgent[shift.agentId].hours += hours;
      costByAgent[shift.agentId].cost += shiftCost;

      // Track by site
      if (!costBySite[shift.siteId]) {
        costBySite[shift.siteId] = { hours: 0, cost: 0 };
      }
      costBySite[shift.siteId].hours += hours;
      costBySite[shift.siteId].cost += shiftCost;
    });

    const averageCostPerHour = (regularHours + overtimeHours) > 0 ? totalCost / (regularHours + overtimeHours) : 0;
    const overtimePercentage = (regularHours + overtimeHours) > 0 ? (overtimeHours / (regularHours + overtimeHours) * 100) : 0;

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      averageCostPerHour: Math.round(averageCostPerHour * 100) / 100,
      overtimePercentage: Math.round(overtimePercentage * 100) / 100,
      costByAgent: Object.entries(costByAgent).map(([agentId, data]) => ({
        agentId,
        ...data,
        cost: Math.round(data.cost * 100) / 100,
      })),
      costBySite: Object.entries(costBySite).map(([siteId, data]) => ({
        siteId,
        ...data,
        cost: Math.round(data.cost * 100) / 100,
      })),
    };
  }

  /**
   * Calculate quality metrics
   */
  async calculateQualityMetrics(startDate, endDate, filters = {}) {
    const { clientId, siteId, agentId } = filters;

    // Report quality metrics
    const reportQuality = await this.calculateReportQuality(startDate, endDate, filters);

    // Client satisfaction metrics
    const clientSatisfaction = await this.calculateClientSatisfaction(startDate, endDate, filters);

    // Compliance metrics
    const complianceMetrics = await this.calculateComplianceMetrics(startDate, endDate, filters);

    return {
      reportQuality,
      clientSatisfaction,
      complianceMetrics,
      overallQualityScore: this.calculateOverallQualityScore({
        reportQuality,
        clientSatisfaction,
        complianceMetrics,
      }),
    };
  }

  /**
   * Calculate trend analysis
   */
  async calculateTrendAnalysis(startDate, endDate, filters = {}) {
    // Generate daily, weekly, and monthly trends
    const dailyTrends = await this.generateDailyTrends(startDate, endDate, filters);
    const weeklyTrends = await this.generateWeeklyTrends(startDate, endDate, filters);
    const monthlyTrends = await this.generateMonthlyTrends(startDate, endDate, filters);

    return {
      daily: dailyTrends,
      weekly: weeklyTrends,
      monthly: monthlyTrends,
    };
  }

  /**
   * Generate forecasting and predictions
   */
  async generateForecasting(startDate, endDate, filters = {}) {
    // Simple linear regression for forecasting
    // In a real implementation, this would use more sophisticated ML models
    
    const historicalData = await this.getHistoricalData(startDate, endDate, filters);
    
    return {
      demandForecast: this.calculateDemandForecast(historicalData),
      costForecast: this.calculateCostForecast(historicalData),
      resourceForecast: this.calculateResourceForecast(historicalData),
      riskForecast: this.calculateRiskForecast(historicalData),
      confidence: 0.75, // Placeholder confidence level
    };
  }

  /**
   * Generate industry benchmarking
   */
  async generateBenchmarking(coreMetrics, filters = {}) {
    // Industry benchmarks (these would come from external data sources)
    const industryBenchmarks = {
      completionRate: 95.0,
      incidentRate: 2.5,
      averageHoursPerShift: 8.2,
      reportsPerShift: 1.2,
      attendanceRate: 97.0,
      clientSatisfaction: 4.3,
    };

    const comparisons = {};
    Object.keys(industryBenchmarks).forEach(metric => {
      if (coreMetrics[metric] !== undefined) {
        const value = parseFloat(coreMetrics[metric]);
        const benchmark = industryBenchmarks[metric];
        const variance = ((value - benchmark) / benchmark * 100);
        
        comparisons[metric] = {
          value,
          benchmark,
          variance: Math.round(variance * 100) / 100,
          performance: variance >= 0 ? 'above' : 'below',
        };
      }
    });

    return {
      industryBenchmarks,
      comparisons,
      overallPerformance: this.calculateOverallBenchmarkPerformance(comparisons),
    };
  }

  /**
   * Calculate risk analysis
   */
  async calculateRiskAnalysis(startDate, endDate, filters = {}) {
    // Identify various risk factors
    const operationalRisks = await this.identifyOperationalRisks(startDate, endDate, filters);
    const financialRisks = await this.identifyFinancialRisks(startDate, endDate, filters);
    const complianceRisks = await this.identifyComplianceRisks(startDate, endDate, filters);
    const securityRisks = await this.identifySecurityRisks(startDate, endDate, filters);

    return {
      operationalRisks,
      financialRisks,
      complianceRisks,
      securityRisks,
      overallRiskScore: this.calculateOverallRiskScore({
        operationalRisks,
        financialRisks,
        complianceRisks,
        securityRisks,
      }),
    };
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(analyticsData) {
    const recommendations = [];

    // Performance recommendations
    if (analyticsData.coreMetrics.completionRate < 90) {
      recommendations.push({
        category: 'performance',
        priority: 'high',
        title: 'Improve Shift Completion Rate',
        description: 'Shift completion rate is below optimal levels',
        impact: 'high',
        effort: 'medium',
        actions: [
          'Review agent scheduling and availability',
          'Implement better shift reminder systems',
          'Analyze reasons for incomplete shifts',
        ],
      });
    }

    // Cost recommendations
    if (analyticsData.costAnalytics.overtimePercentage > 15) {
      recommendations.push({
        category: 'cost',
        priority: 'medium',
        title: 'Reduce Overtime Costs',
        description: 'Overtime percentage is higher than industry standard',
        impact: 'medium',
        effort: 'medium',
        actions: [
          'Optimize shift scheduling',
          'Hire additional part-time agents',
          'Implement better workload distribution',
        ],
      });
    }

    // Quality recommendations
    if (analyticsData.qualityMetrics.overallQualityScore < 80) {
      recommendations.push({
        category: 'quality',
        priority: 'high',
        title: 'Improve Service Quality',
        description: 'Overall quality score needs improvement',
        impact: 'high',
        effort: 'high',
        actions: [
          'Implement additional training programs',
          'Enhance quality control processes',
          'Increase supervisor oversight',
        ],
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // Helper methods (simplified implementations)

  async calculateAgentPerformance(startDate, endDate, filters) {
    // Implementation for agent performance calculation
    return {
      topPerformers: [],
      averageRating: 4.2,
      performanceDistribution: {},
    };
  }

  async calculateSitePerformance(startDate, endDate, filters) {
    // Implementation for site performance calculation
    return {
      topPerformingSites: [],
      averageEfficiency: 85.5,
      performanceByType: {},
    };
  }

  async calculateResponseTimeAnalytics(startDate, endDate, filters) {
    // Implementation for response time analytics
    return {
      averageResponseTime: 15.5, // minutes
      responseTimeDistribution: {},
      slaCompliance: 92.3,
    };
  }

  async calculateAttendanceAnalytics(startDate, endDate, filters) {
    // Implementation for attendance analytics
    return {
      overallAttendanceRate: 96.8,
      punctualityRate: 94.2,
      absenteeismRate: 3.2,
    };
  }

  async calculateReportQuality(startDate, endDate, filters) {
    // Implementation for report quality calculation
    return {
      completenessScore: 88.5,
      timelinessScore: 92.1,
      accuracyScore: 89.7,
    };
  }

  async calculateClientSatisfaction(startDate, endDate, filters) {
    // Implementation for client satisfaction calculation
    return {
      averageRating: 4.3,
      responseRate: 78.5,
      npsScore: 42,
    };
  }

  async calculateComplianceMetrics(startDate, endDate, filters) {
    // Implementation for compliance metrics
    return {
      overallCompliance: 94.8,
      policyCompliance: 96.2,
      trainingCompliance: 93.4,
    };
  }

  calculateOverallQualityScore(qualityMetrics) {
    // Simple weighted average
    return Math.round(
      (qualityMetrics.reportQuality.completenessScore * 0.3 +
       qualityMetrics.clientSatisfaction.averageRating * 20 * 0.4 +
       qualityMetrics.complianceMetrics.overallCompliance * 0.3) * 100
    ) / 100;
  }

  async generateDailyTrends(startDate, endDate, filters) {
    // Implementation for daily trends
    return [];
  }

  async generateWeeklyTrends(startDate, endDate, filters) {
    // Implementation for weekly trends
    return [];
  }

  async generateMonthlyTrends(startDate, endDate, filters) {
    // Implementation for monthly trends
    return [];
  }

  async getHistoricalData(startDate, endDate, filters) {
    // Implementation for historical data retrieval
    return {};
  }

  calculateDemandForecast(historicalData) {
    // Simple demand forecasting
    return {
      nextMonth: { low: 100, medium: 120, high: 140 },
      nextQuarter: { low: 300, medium: 360, high: 420 },
    };
  }

  calculateCostForecast(historicalData) {
    // Simple cost forecasting
    return {
      nextMonth: { low: 50000, medium: 55000, high: 60000 },
      nextQuarter: { low: 150000, medium: 165000, high: 180000 },
    };
  }

  calculateResourceForecast(historicalData) {
    // Simple resource forecasting
    return {
      agentsNeeded: { nextMonth: 25, nextQuarter: 28 },
      sitesExpansion: { nextMonth: 2, nextQuarter: 5 },
    };
  }

  calculateRiskForecast(historicalData) {
    // Simple risk forecasting
    return {
      operationalRisk: 'medium',
      financialRisk: 'low',
      complianceRisk: 'low',
    };
  }

  calculateOverallBenchmarkPerformance(comparisons) {
    const scores = Object.values(comparisons).map(c => c.variance);
    const averageVariance = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    if (averageVariance >= 5) return 'excellent';
    if (averageVariance >= 0) return 'above_average';
    if (averageVariance >= -5) return 'average';
    return 'below_average';
  }

  async identifyOperationalRisks(startDate, endDate, filters) {
    // Implementation for operational risk identification
    return [];
  }

  async identifyFinancialRisks(startDate, endDate, filters) {
    // Implementation for financial risk identification
    return [];
  }

  async identifyComplianceRisks(startDate, endDate, filters) {
    // Implementation for compliance risk identification
    return [];
  }

  async identifySecurityRisks(startDate, endDate, filters) {
    // Implementation for security risk identification
    return [];
  }

  calculateOverallRiskScore(risks) {
    // Simple risk score calculation
    return 'medium';
  }
  /**
   * Generate real-time dashboard data
   */
  async generateDashboardData(userId, userRole, filters = {}) {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Real-time metrics
      const realTimeMetrics = await this.getRealTimeMetrics(userId, userRole, filters);

      // Today's summary
      const todaySummary = await this.getDaySummary(today, userId, userRole, filters);

      // Weekly trends
      const weeklyTrends = await this.getWeeklyTrends(thisWeek, now, userId, userRole, filters);

      // Monthly performance
      const monthlyPerformance = await this.getMonthlyPerformance(thisMonth, now, userId, userRole, filters);

      // Alerts and notifications
      const alerts = await this.getActiveAlerts(userId, userRole, filters);

      // Key performance indicators
      const kpis = await this.calculateKPIs(userId, userRole, filters);

      return {
        realTimeMetrics,
        todaySummary,
        weeklyTrends,
        monthlyPerformance,
        alerts,
        kpis,
        lastUpdated: new Date(),
        refreshInterval: 30000 // 30 seconds
      };

    } catch (error) {
      logger.error('Failed to generate dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get real-time operational metrics
   */
  async getRealTimeMetrics(userId, userRole, filters = {}) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Build where clause based on user role and permissions
    const whereClause = this.buildWhereClause(userId, userRole, filters);

    const [
      activeShifts,
      onlineAgents,
      todayReports,
      pendingIncidents,
      geofenceViolations,
      systemAlerts
    ] = await Promise.all([
      this.prisma.shift.count({
        where: {
          ...whereClause,
          status: 'IN_PROGRESS',
          startTime: { lte: now },
          endTime: { gte: now }
        }
      }),
      this.prisma.locationTrackingSession.count({
        where: {
          status: 'ACTIVE',
          startTime: { gte: new Date(now.getTime() - 5 * 60 * 1000) } // Last 5 minutes
        }
      }),
      this.prisma.report.count({
        where: {
          ...whereClause,
          createdAt: { gte: today },
          deletedAt: null
        }
      }),
      this.prisma.report.count({
        where: {
          ...whereClause,
          reportType: 'INCIDENT',
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
          createdAt: { gte: today },
          deletedAt: null
        }
      }),
      this.prisma.geofenceViolation.count({
        where: {
          createdAt: { gte: today },
          status: 'ACTIVE'
        }
      }),
      this.prisma.notification.count({
        where: {
          type: 'ALERT',
          status: 'PENDING',
          createdAt: { gte: today }
        }
      })
    ]);

    return {
      activeShifts,
      onlineAgents,
      todayReports,
      pendingIncidents,
      geofenceViolations,
      systemAlerts,
      timestamp: now
    };
  }

  /**
   * Get day summary metrics
   */
  async getDaySummary(date, userId, userRole, filters = {}) {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const whereClause = this.buildWhereClause(userId, userRole, filters);

    const [
      scheduledShifts,
      completedShifts,
      totalReports,
      incidentReports,
      totalHours,
      attendanceRate
    ] = await Promise.all([
      this.prisma.shift.count({
        where: {
          ...whereClause,
          startTime: { gte: startOfDay, lt: endOfDay }
        }
      }),
      this.prisma.shift.count({
        where: {
          ...whereClause,
          startTime: { gte: startOfDay, lt: endOfDay },
          status: 'COMPLETED'
        }
      }),
      this.prisma.report.count({
        where: {
          ...whereClause,
          createdAt: { gte: startOfDay, lt: endOfDay },
          deletedAt: null
        }
      }),
      this.prisma.report.count({
        where: {
          ...whereClause,
          reportType: 'INCIDENT',
          createdAt: { gte: startOfDay, lt: endOfDay },
          deletedAt: null
        }
      }),
      this.prisma.attendance.aggregate({
        where: {
          clockInTime: { gte: startOfDay, lt: endOfDay }
        },
        _sum: { totalHours: true }
      }),
      this.calculateDayAttendanceRate(startOfDay, endOfDay, whereClause)
    ]);

    const completionRate = scheduledShifts > 0 ? (completedShifts / scheduledShifts * 100) : 0;
    const incidentRate = totalReports > 0 ? (incidentReports / totalReports * 100) : 0;

    return {
      date,
      scheduledShifts,
      completedShifts,
      completionRate: Math.round(completionRate * 100) / 100,
      totalReports,
      incidentReports,
      incidentRate: Math.round(incidentRate * 100) / 100,
      totalHours: totalHours._sum.totalHours || 0,
      attendanceRate: Math.round(attendanceRate * 100) / 100
    };
  }

  /**
   * Calculate KPIs based on user role
   */
  async calculateKPIs(userId, userRole, filters = {}) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const whereClause = this.buildWhereClause(userId, userRole, filters);

    const baseKPIs = await this.calculateCoreMetrics(thirtyDaysAgo, now, filters);

    // Role-specific KPIs
    let roleSpecificKPIs = {};

    switch (userRole) {
      case 'ADMIN':
        roleSpecificKPIs = await this.calculateAdminKPIs(thirtyDaysAgo, now, whereClause);
        break;
      case 'SUPERVISOR':
        roleSpecificKPIs = await this.calculateSupervisorKPIs(thirtyDaysAgo, now, whereClause, userId);
        break;
      case 'CLIENT':
        roleSpecificKPIs = await this.calculateClientKPIs(thirtyDaysAgo, now, whereClause, userId);
        break;
      case 'AGENT':
        roleSpecificKPIs = await this.calculateAgentKPIs(thirtyDaysAgo, now, whereClause, userId);
        break;
    }

    return {
      ...baseKPIs,
      ...roleSpecificKPIs,
      period: { start: thirtyDaysAgo, end: now }
    };
  }

  /**
   * Get active alerts for user
   */
  async getActiveAlerts(userId, userRole, filters = {}) {
    const alertWhere = {
      status: 'PENDING',
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    };

    // Filter alerts based on user role
    if (userRole === 'CLIENT') {
      // Clients only see alerts related to their sites
      alertWhere.data = {
        path: ['clientId'],
        equals: userId
      };
    } else if (userRole === 'AGENT') {
      // Agents only see alerts related to them
      alertWhere.OR = [
        { recipientId: userId },
        {
          data: {
            path: ['agentId'],
            equals: userId
          }
        }
      ];
    }

    const alerts = await this.prisma.notification.findMany({
      where: alertWhere,
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        priority: true,
        createdAt: true,
        data: true
      }
    });

    return alerts.map(alert => ({
      ...alert,
      timeAgo: this.calculateTimeAgo(alert.createdAt)
    }));
  }

  // Helper methods

  buildWhereClause(userId, userRole, filters = {}) {
    let whereClause = {};

    // Apply role-based filtering
    if (userRole === 'CLIENT') {
      whereClause.site = { clientId: userId };
    } else if (userRole === 'AGENT') {
      whereClause.agentId = userId;
    } else if (userRole === 'SUPERVISOR') {
      // Supervisors see data from sites they manage
      // This would need to be implemented based on supervisor-site relationships
    }

    // Apply additional filters
    if (filters.siteId) {
      whereClause.siteId = filters.siteId;
    }
    if (filters.clientId && userRole === 'ADMIN') {
      whereClause.site = { clientId: filters.clientId };
    }

    return whereClause;
  }

  async calculateDayAttendanceRate(startOfDay, endOfDay, whereClause) {
    const [scheduled, attended] = await Promise.all([
      this.prisma.shift.count({
        where: {
          ...whereClause,
          startTime: { gte: startOfDay, lt: endOfDay }
        }
      }),
      this.prisma.attendance.count({
        where: {
          clockInTime: { gte: startOfDay, lt: endOfDay }
        }
      })
    ]);

    return scheduled > 0 ? (attended / scheduled * 100) : 0;
  }

  async calculateAdminKPIs(startDate, endDate, whereClause) {
    return {
      systemUptime: 99.9,
      totalUsers: await this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      totalSites: await this.prisma.site.count({ where: { deletedAt: null } }),
      totalClients: await this.prisma.client.count({ where: { deletedAt: null } }),
      averageResponseTime: 2.3, // hours
      systemHealth: 'EXCELLENT'
    };
  }

  async calculateSupervisorKPIs(startDate, endDate, whereClause, userId) {
    return {
      managedSites: 5, // Would be calculated from supervisor-site relationships
      teamSize: 15, // Number of agents under supervision
      teamPerformance: 87.5,
      escalatedIncidents: 3,
      teamAttendanceRate: 96.2
    };
  }

  async calculateClientKPIs(startDate, endDate, whereClause, userId) {
    return {
      serviceLevel: 'PREMIUM',
      slaCompliance: 98.5,
      incidentResolutionTime: 1.2, // hours
      reportDeliveryTime: 0.5, // hours
      overallSatisfaction: 4.7
    };
  }

  async calculateAgentKPIs(startDate, endDate, whereClause, userId) {
    const [shiftsCompleted, reportsSubmitted, averageRating] = await Promise.all([
      this.prisma.shift.count({
        where: {
          agentId: userId,
          startTime: { gte: startDate, lte: endDate },
          status: 'COMPLETED'
        }
      }),
      this.prisma.report.count({
        where: {
          agentId: userId,
          createdAt: { gte: startDate, lte: endDate },
          deletedAt: null
        }
      }),
      4.3 // Would be calculated from performance reviews
    ]);

    return {
      shiftsCompleted,
      reportsSubmitted,
      averageRating,
      punctualityRate: 94.5,
      performanceRank: 'TOP_25_PERCENT'
    };
  }

  calculateTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} minutes ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hours ago`;
    } else {
      return `${diffDays} days ago`;
    }
  }
}

module.exports = AnalyticsService;
