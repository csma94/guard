import { PrismaClient } from '@prisma/client';
import { integrationService } from './integrationService';

const prisma = new PrismaClient();

export interface AnalyticsQuery {
  metrics: string[];
  dimensions: string[];
  filters: Record<string, any>;
  dateRange: {
    start: Date;
    end: Date;
  };
  groupBy?: string;
  orderBy?: string;
  limit?: number;
}

export interface KPIDefinition {
  id: string;
  name: string;
  description: string;
  formula: string;
  target: number;
  unit: string;
  category: string;
  isActive: boolean;
}

export class AnalyticsService {
  private static instance: AnalyticsService;
  private kpiDefinitions: Map<string, KPIDefinition> = new Map();

  private constructor() {
    this.initializeKPIs();
  }

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  private async initializeKPIs() {
    // Define standard KPIs
    const standardKPIs: KPIDefinition[] = [
      {
        id: 'agent_utilization',
        name: 'Agent Utilization Rate',
        description: 'Percentage of time agents are actively working',
        formula: '(total_work_hours / total_scheduled_hours) * 100',
        target: 85,
        unit: '%',
        category: 'workforce',
        isActive: true,
      },
      {
        id: 'incident_response_time',
        name: 'Average Incident Response Time',
        description: 'Average time to respond to incidents',
        formula: 'AVG(response_time_minutes)',
        target: 15,
        unit: 'minutes',
        category: 'security',
        isActive: true,
      },
      {
        id: 'client_satisfaction',
        name: 'Client Satisfaction Score',
        description: 'Average client satisfaction rating',
        formula: 'AVG(satisfaction_rating)',
        target: 4.5,
        unit: 'rating',
        category: 'quality',
        isActive: true,
      },
      {
        id: 'patrol_completion_rate',
        name: 'Patrol Completion Rate',
        description: 'Percentage of scheduled patrols completed',
        formula: '(completed_patrols / scheduled_patrols) * 100',
        target: 95,
        unit: '%',
        category: 'operations',
        isActive: true,
      },
      {
        id: 'revenue_per_client',
        name: 'Revenue Per Client',
        description: 'Average monthly revenue per client',
        formula: 'total_revenue / active_clients',
        target: 5000,
        unit: 'USD',
        category: 'financial',
        isActive: true,
      },
    ];

    for (const kpi of standardKPIs) {
      this.kpiDefinitions.set(kpi.id, kpi);
    }
  }

  // Calculate KPI values
  public async calculateKPI(kpiId: string, dateRange: { start: Date; end: Date }): Promise<any> {
    const kpi = this.kpiDefinitions.get(kpiId);
    if (!kpi) {
      throw new Error(`KPI not found: ${kpiId}`);
    }

    switch (kpiId) {
      case 'agent_utilization':
        return this.calculateAgentUtilization(dateRange);
      case 'incident_response_time':
        return this.calculateIncidentResponseTime(dateRange);
      case 'client_satisfaction':
        return this.calculateClientSatisfaction(dateRange);
      case 'patrol_completion_rate':
        return this.calculatePatrolCompletionRate(dateRange);
      case 'revenue_per_client':
        return this.calculateRevenuePerClient(dateRange);
      default:
        throw new Error(`KPI calculation not implemented: ${kpiId}`);
    }
  }

  private async calculateAgentUtilization(dateRange: { start: Date; end: Date }) {
    const shifts = await prisma.shift.findMany({
      where: {
        startTime: { gte: dateRange.start },
        endTime: { lte: dateRange.end },
        status: 'COMPLETED',
      },
      select: {
        startTime: true,
        endTime: true,
        breakDuration: true,
      },
    });

    const totalScheduledHours = shifts.reduce((sum, shift) => {
      const duration = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
      return sum + duration;
    }, 0);

    const totalWorkHours = shifts.reduce((sum, shift) => {
      const duration = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60 * 60);
      const breakHours = (shift.breakDuration || 0) / 60;
      return sum + (duration - breakHours);
    }, 0);

    const utilization = totalScheduledHours > 0 ? (totalWorkHours / totalScheduledHours) * 100 : 0;

    return {
      value: Math.round(utilization * 100) / 100,
      target: 85,
      status: utilization >= 85 ? 'good' : utilization >= 70 ? 'warning' : 'poor',
      trend: await this.calculateTrend('agent_utilization', dateRange),
    };
  }

  private async calculateIncidentResponseTime(dateRange: { start: Date; end: Date }) {
    const incidents = await prisma.incident.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        responseTime: { not: null },
      },
      select: {
        responseTime: true,
      },
    });

    const avgResponseTime = incidents.length > 0
      ? incidents.reduce((sum, incident) => sum + (incident.responseTime || 0), 0) / incidents.length
      : 0;

    return {
      value: Math.round(avgResponseTime * 100) / 100,
      target: 15,
      status: avgResponseTime <= 15 ? 'good' : avgResponseTime <= 30 ? 'warning' : 'poor',
      trend: await this.calculateTrend('incident_response_time', dateRange),
    };
  }

  private async calculateClientSatisfaction(dateRange: { start: Date; end: Date }) {
    const feedback = await prisma.clientFeedback.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        rating: { not: null },
      },
      select: {
        rating: true,
      },
    });

    const avgRating = feedback.length > 0
      ? feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / feedback.length
      : 0;

    return {
      value: Math.round(avgRating * 100) / 100,
      target: 4.5,
      status: avgRating >= 4.5 ? 'good' : avgRating >= 4.0 ? 'warning' : 'poor',
      trend: await this.calculateTrend('client_satisfaction', dateRange),
    };
  }

  private async calculatePatrolCompletionRate(dateRange: { start: Date; end: Date }) {
    const patrols = await prisma.patrol.findMany({
      where: {
        scheduledDate: { gte: dateRange.start, lte: dateRange.end },
      },
      select: {
        status: true,
      },
    });

    const totalPatrols = patrols.length;
    const completedPatrols = patrols.filter(p => p.status === 'COMPLETED').length;
    const completionRate = totalPatrols > 0 ? (completedPatrols / totalPatrols) * 100 : 0;

    return {
      value: Math.round(completionRate * 100) / 100,
      target: 95,
      status: completionRate >= 95 ? 'good' : completionRate >= 85 ? 'warning' : 'poor',
      trend: await this.calculateTrend('patrol_completion_rate', dateRange),
    };
  }

  private async calculateRevenuePerClient(dateRange: { start: Date; end: Date }) {
    const [revenue, clientCount] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          issueDate: { gte: dateRange.start, lte: dateRange.end },
          status: 'PAID',
        },
        _sum: {
          totalAmount: true,
        },
      }),
      prisma.client.count({
        where: {
          status: 'ACTIVE',
        },
      }),
    ]);

    const totalRevenue = revenue._sum.totalAmount || 0;
    const revenuePerClient = clientCount > 0 ? totalRevenue / clientCount : 0;

    return {
      value: Math.round(revenuePerClient * 100) / 100,
      target: 5000,
      status: revenuePerClient >= 5000 ? 'good' : revenuePerClient >= 3000 ? 'warning' : 'poor',
      trend: await this.calculateTrend('revenue_per_client', dateRange),
    };
  }

  private async calculateTrend(kpiId: string, currentRange: { start: Date; end: Date }) {
    // Calculate previous period for comparison
    const periodLength = currentRange.end.getTime() - currentRange.start.getTime();
    const previousRange = {
      start: new Date(currentRange.start.getTime() - periodLength),
      end: currentRange.start,
    };

    const [currentValue, previousValue] = await Promise.all([
      this.calculateKPI(kpiId, currentRange),
      this.calculateKPI(kpiId, previousRange),
    ]);

    const change = currentValue.value - previousValue.value;
    const percentChange = previousValue.value > 0 ? (change / previousValue.value) * 100 : 0;

    return {
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      change: Math.round(change * 100) / 100,
      percentChange: Math.round(percentChange * 100) / 100,
    };
  }

  // Generate comprehensive analytics report
  public async generateAnalyticsReport(dateRange: { start: Date; end: Date }) {
    const [
      kpiResults,
      operationalMetrics,
      financialMetrics,
      performanceMetrics,
      insights,
    ] = await Promise.all([
      this.calculateAllKPIs(dateRange),
      this.getOperationalMetrics(dateRange),
      this.getFinancialMetrics(dateRange),
      this.getPerformanceMetrics(dateRange),
      this.generateInsights(dateRange),
    ]);

    return {
      overview: {
        dateRange,
        generatedAt: new Date(),
        totalAgents: await this.getTotalAgents(),
        activeSites: await this.getActiveSites(),
        monthlyRevenue: financialMetrics.totalRevenue,
        satisfactionScore: kpiResults.find(k => k.id === 'client_satisfaction')?.value || 0,
      },
      kpis: kpiResults,
      operationalMetrics,
      financialMetrics,
      performanceMetrics,
      insights,
    };
  }

  private async calculateAllKPIs(dateRange: { start: Date; end: Date }) {
    const kpiIds = Array.from(this.kpiDefinitions.keys());
    const results = await Promise.all(
      kpiIds.map(async (id) => {
        const kpi = this.kpiDefinitions.get(id)!;
        const result = await this.calculateKPI(id, dateRange);
        return {
          id,
          name: kpi.name,
          ...result,
        };
      })
    );
    return results;
  }

  private async getOperationalMetrics(dateRange: { start: Date; end: Date }) {
    const [shifts, patrols, incidents, reports] = await Promise.all([
      prisma.shift.count({
        where: {
          startTime: { gte: dateRange.start, lte: dateRange.end },
          status: 'COMPLETED',
        },
      }),
      prisma.patrol.count({
        where: {
          scheduledDate: { gte: dateRange.start, lte: dateRange.end },
          status: 'COMPLETED',
        },
      }),
      prisma.incident.count({
        where: {
          createdAt: { gte: dateRange.start, lte: dateRange.end },
        },
      }),
      prisma.report.count({
        where: {
          createdAt: { gte: dateRange.start, lte: dateRange.end },
        },
      }),
    ]);

    const totalHours = await prisma.shift.aggregate({
      where: {
        startTime: { gte: dateRange.start, lte: dateRange.end },
        status: 'COMPLETED',
      },
      _sum: {
        duration: true,
      },
    });

    return {
      shiftsCompleted: shifts,
      hoursWorked: Math.round((totalHours._sum.duration || 0) / 60),
      patrolsCompleted: patrols,
      incidentsResolved: incidents,
      reportsSubmitted: reports,
      attendanceRate: await this.calculateAttendanceRate(dateRange),
    };
  }

  private async getFinancialMetrics(dateRange: { start: Date; end: Date }) {
    const [revenue, expenses, invoices] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          issueDate: { gte: dateRange.start, lte: dateRange.end },
          status: 'PAID',
        },
        _sum: {
          totalAmount: true,
        },
      }),
      prisma.expense.aggregate({
        where: {
          date: { gte: dateRange.start, lte: dateRange.end },
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.invoice.findMany({
        where: {
          issueDate: { gte: dateRange.start, lte: dateRange.end },
        },
        select: {
          status: true,
          totalAmount: true,
        },
      }),
    ]);

    const totalRevenue = revenue._sum.totalAmount || 0;
    const totalExpenses = expenses._sum.amount || 0;
    const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0;

    const clientRetention = await this.calculateClientRetention(dateRange);
    const growthRate = await this.calculateGrowthRate(dateRange);

    return {
      totalRevenue,
      totalExpenses,
      profitMargin: Math.round(profitMargin * 100) / 100,
      clientRetention: Math.round(clientRetention * 100) / 100,
      growthRate: Math.round(growthRate * 100) / 100,
      outstandingAmount: invoices
        .filter(i => i.status === 'SENT' || i.status === 'OVERDUE')
        .reduce((sum, i) => sum + i.totalAmount, 0),
    };
  }

  private async getPerformanceMetrics(dateRange: { start: Date; end: Date }) {
    const [agentPerformance, clientSatisfaction, incidentResponseTime, complianceRate] = await Promise.all([
      this.calculateAverageAgentPerformance(dateRange),
      this.calculateKPI('client_satisfaction', dateRange),
      this.calculateKPI('incident_response_time', dateRange),
      this.calculateComplianceRate(dateRange),
    ]);

    return {
      agentPerformance: agentPerformance.value,
      clientSatisfaction: clientSatisfaction.value,
      incidentResponseTime: incidentResponseTime.value,
      complianceRate: complianceRate.value,
    };
  }

  private async generateInsights(dateRange: { start: Date; end: Date }) {
    const insights = [];

    // Analyze trends and generate insights
    const kpis = await this.calculateAllKPIs(dateRange);
    
    for (const kpi of kpis) {
      if (kpi.status === 'poor') {
        insights.push({
          id: `kpi_${kpi.id}_poor`,
          type: 'WARNING',
          priority: 'HIGH',
          title: `${kpi.name} Below Target`,
          description: `${kpi.name} is currently at ${kpi.value}${this.kpiDefinitions.get(kpi.id)?.unit}, which is below the target of ${kpi.target}${this.kpiDefinitions.get(kpi.id)?.unit}.`,
          impact: 'Performance may be impacted',
          recommendation: this.getKPIRecommendation(kpi.id),
        });
      }
    }

    // Add more insights based on data patterns
    const additionalInsights = await this.analyzeDataPatterns(dateRange);
    insights.push(...additionalInsights);

    return insights;
  }

  private getKPIRecommendation(kpiId: string): string {
    const recommendations = {
      agent_utilization: 'Consider optimizing shift schedules and reducing idle time',
      incident_response_time: 'Review response procedures and consider additional training',
      client_satisfaction: 'Conduct client feedback sessions and improve service quality',
      patrol_completion_rate: 'Review patrol schedules and address resource constraints',
      revenue_per_client: 'Explore upselling opportunities and improve client retention',
    };
    return recommendations[kpiId as keyof typeof recommendations] || 'Review and optimize processes';
  }

  private async analyzeDataPatterns(dateRange: { start: Date; end: Date }) {
    const insights = [];

    // Analyze incident patterns
    const incidents = await prisma.incident.groupBy({
      by: ['type'],
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      _count: {
        id: true,
      },
    });

    const topIncidentType = incidents.sort((a, b) => b._count.id - a._count.id)[0];
    if (topIncidentType && topIncidentType._count.id > 5) {
      insights.push({
        id: 'incident_pattern',
        type: 'INSIGHT',
        priority: 'MEDIUM',
        title: 'Incident Pattern Detected',
        description: `${topIncidentType.type} incidents are occurring frequently (${topIncidentType._count.id} times).`,
        impact: 'May indicate systemic issues',
        recommendation: 'Investigate root causes and implement preventive measures',
      });
    }

    return insights;
  }

  // Helper methods
  private async getTotalAgents(): Promise<number> {
    return prisma.agent.count({ where: { status: 'ACTIVE' } });
  }

  private async getActiveSites(): Promise<number> {
    return prisma.site.count({ where: { status: 'ACTIVE' } });
  }

  private async calculateAttendanceRate(dateRange: { start: Date; end: Date }): Promise<number> {
    const [scheduled, attended] = await Promise.all([
      prisma.shift.count({
        where: {
          startTime: { gte: dateRange.start, lte: dateRange.end },
        },
      }),
      prisma.shift.count({
        where: {
          startTime: { gte: dateRange.start, lte: dateRange.end },
          status: { in: ['COMPLETED', 'IN_PROGRESS'] },
        },
      }),
    ]);

    return scheduled > 0 ? (attended / scheduled) * 100 : 0;
  }

  private async calculateClientRetention(dateRange: { start: Date; end: Date }): Promise<number> {
    // Implementation for client retention calculation
    return 85; // Placeholder
  }

  private async calculateGrowthRate(dateRange: { start: Date; end: Date }): Promise<number> {
    // Implementation for growth rate calculation
    return 12; // Placeholder
  }

  private async calculateAverageAgentPerformance(dateRange: { start: Date; end: Date }) {
    // Implementation for agent performance calculation
    return { value: 87 }; // Placeholder
  }

  private async calculateComplianceRate(dateRange: { start: Date; end: Date }) {
    // Implementation for compliance rate calculation
    return { value: 92 }; // Placeholder
  }

  // Export analytics data
  public async exportAnalytics(format: 'CSV' | 'PDF' | 'EXCEL', dateRange: { start: Date; end: Date }) {
    const report = await this.generateAnalyticsReport(dateRange);
    
    // Send analytics event
    await integrationService.sendAnalyticsEvent('report.exported', {
      format,
      dateRange,
      reportType: 'analytics',
    });

    return report;
  }
}

export const analyticsService = AnalyticsService.getInstance();
