import { PrismaClient } from '@prisma/client';
import { integrationService } from './integrationService';

const prisma = new PrismaClient();

export interface AdvancedAnalyticsQuery {
  metrics: string[];
  dimensions: string[];
  filters: Record<string, any>;
  dateRange: {
    start: Date;
    end: Date;
  };
  groupBy?: string[];
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
}

export interface PredictiveModel {
  id: string;
  name: string;
  type: 'DEMAND_FORECASTING' | 'INCIDENT_PREDICTION' | 'RESOURCE_OPTIMIZATION' | 'RISK_ASSESSMENT';
  algorithm: string;
  accuracy: number;
  lastTrained: Date;
  isActive: boolean;
  parameters: Record<string, any>;
}

export class AdvancedAnalyticsService {
  private static instance: AdvancedAnalyticsService;
  private models: Map<string, PredictiveModel> = new Map();

  private constructor() {
    this.initializeModels();
  }

  public static getInstance(): AdvancedAnalyticsService {
    if (!AdvancedAnalyticsService.instance) {
      AdvancedAnalyticsService.instance = new AdvancedAnalyticsService();
    }
    return AdvancedAnalyticsService.instance;
  }

  private async initializeModels() {
    // Initialize predictive models
    const models: PredictiveModel[] = [
      {
        id: 'demand_forecast',
        name: 'Security Demand Forecasting',
        type: 'DEMAND_FORECASTING',
        algorithm: 'ARIMA',
        accuracy: 0.85,
        lastTrained: new Date(),
        isActive: true,
        parameters: {
          seasonality: 'weekly',
          lookAhead: 30,
          confidence: 0.95,
        },
      },
      {
        id: 'incident_predictor',
        name: 'Incident Risk Predictor',
        type: 'INCIDENT_PREDICTION',
        algorithm: 'Random Forest',
        accuracy: 0.78,
        lastTrained: new Date(),
        isActive: true,
        parameters: {
          features: ['time_of_day', 'weather', 'historical_incidents', 'site_type'],
          threshold: 0.7,
        },
      },
      {
        id: 'resource_optimizer',
        name: 'Resource Allocation Optimizer',
        type: 'RESOURCE_OPTIMIZATION',
        algorithm: 'Linear Programming',
        accuracy: 0.92,
        lastTrained: new Date(),
        isActive: true,
        parameters: {
          constraints: ['budget', 'availability', 'skills'],
          objective: 'minimize_cost',
        },
      },
    ];

    for (const model of models) {
      this.models.set(model.id, model);
    }
  }

  // Advanced Query Engine
  public async executeAdvancedQuery(query: AdvancedAnalyticsQuery): Promise<any> {
    try {
      const { metrics, dimensions, filters, dateRange, groupBy, orderBy, limit, offset } = query;

      // Build dynamic SQL query based on parameters
      let sqlQuery = this.buildDynamicQuery(metrics, dimensions, filters, dateRange, groupBy, orderBy);
      
      if (limit) {
        sqlQuery += ` LIMIT ${limit}`;
      }
      
      if (offset) {
        sqlQuery += ` OFFSET ${offset}`;
      }

      const result = await prisma.$queryRawUnsafe(sqlQuery);
      
      return {
        data: result,
        metadata: {
          query: sqlQuery,
          executionTime: Date.now(),
          rowCount: Array.isArray(result) ? result.length : 1,
        },
      };
    } catch (error) {
      console.error('Advanced query execution failed:', error);
      throw new Error('Failed to execute advanced analytics query');
    }
  }

  private buildDynamicQuery(
    metrics: string[],
    dimensions: string[],
    filters: Record<string, any>,
    dateRange: { start: Date; end: Date },
    groupBy?: string[],
    orderBy?: { field: string; direction: 'asc' | 'desc' }[]
  ): string {
    // This is a simplified example - in production, you'd use a proper query builder
    const selectClause = [...metrics, ...dimensions].join(', ');
    const fromClause = this.determineTableFromMetrics(metrics);
    const whereClause = this.buildWhereClause(filters, dateRange);
    const groupByClause = groupBy && groupBy.length > 0 ? `GROUP BY ${groupBy.join(', ')}` : '';
    const orderByClause = orderBy && orderBy.length > 0 
      ? `ORDER BY ${orderBy.map(o => `${o.field} ${o.direction.toUpperCase()}`).join(', ')}`
      : '';

    return `SELECT ${selectClause} FROM ${fromClause} ${whereClause} ${groupByClause} ${orderByClause}`.trim();
  }

  private determineTableFromMetrics(metrics: string[]): string {
    // Determine which tables to join based on requested metrics
    const tables = new Set<string>();
    
    for (const metric of metrics) {
      if (metric.includes('shift') || metric.includes('agent')) {
        tables.add('Shift');
      }
      if (metric.includes('incident')) {
        tables.add('Incident');
      }
      if (metric.includes('site')) {
        tables.add('Site');
      }
      if (metric.includes('client')) {
        tables.add('Client');
      }
    }

    // Build JOIN clauses
    const tableArray = Array.from(tables);
    if (tableArray.length === 1) {
      return `"${tableArray[0]}"`;
    }

    // For multiple tables, create appropriate JOINs
    let query = `"${tableArray[0]}"`;
    for (let i = 1; i < tableArray.length; i++) {
      query += ` LEFT JOIN "${tableArray[i]}" ON /* appropriate join condition */`;
    }

    return query;
  }

  private buildWhereClause(filters: Record<string, any>, dateRange: { start: Date; end: Date }): string {
    const conditions: string[] = [];

    // Add date range filter
    conditions.push(`"createdAt" >= '${dateRange.start.toISOString()}'`);
    conditions.push(`"createdAt" <= '${dateRange.end.toISOString()}'`);

    // Add custom filters
    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        conditions.push(`"${key}" IN (${value.map(v => `'${v}'`).join(', ')})`);
      } else if (typeof value === 'string') {
        conditions.push(`"${key}" = '${value}'`);
      } else {
        conditions.push(`"${key}" = ${value}`);
      }
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  }

  // Predictive Analytics
  public async generateForecast(modelId: string, parameters: Record<string, any>): Promise<any> {
    const model = this.models.get(modelId);
    if (!model || !model.isActive) {
      throw new Error(`Model ${modelId} not found or inactive`);
    }

    switch (model.type) {
      case 'DEMAND_FORECASTING':
        return this.generateDemandForecast(parameters);
      case 'INCIDENT_PREDICTION':
        return this.generateIncidentPrediction(parameters);
      case 'RESOURCE_OPTIMIZATION':
        return this.generateResourceOptimization(parameters);
      default:
        throw new Error(`Unsupported model type: ${model.type}`);
    }
  }

  private async generateDemandForecast(parameters: Record<string, any>): Promise<any> {
    // Simplified demand forecasting logic
    const historicalData = await this.getHistoricalDemandData(parameters);
    
    // Apply ARIMA model (simplified)
    const forecast = this.applyARIMAModel(historicalData, parameters);
    
    return {
      modelId: 'demand_forecast',
      forecast,
      confidence: 0.85,
      generatedAt: new Date(),
      parameters,
    };
  }

  private async generateIncidentPrediction(parameters: Record<string, any>): Promise<any> {
    // Get historical incident data
    const incidents = await prisma.incident.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
        },
      },
      include: {
        site: true,
      },
    });

    // Apply machine learning model (simplified)
    const predictions = this.applyIncidentPredictionModel(incidents, parameters);

    return {
      modelId: 'incident_predictor',
      predictions,
      accuracy: 0.78,
      generatedAt: new Date(),
      parameters,
    };
  }

  private async generateResourceOptimization(parameters: Record<string, any>): Promise<any> {
    // Get current resource allocation
    const agents = await prisma.agent.findMany({
      where: { status: 'ACTIVE' },
      include: {
        user: true,
        shifts: {
          where: {
            startTime: {
              gte: new Date(),
            },
          },
        },
      },
    });

    const sites = await prisma.site.findMany({
      where: { status: 'ACTIVE' },
    });

    // Apply optimization algorithm
    const optimization = this.applyResourceOptimization(agents, sites, parameters);

    return {
      modelId: 'resource_optimizer',
      optimization,
      efficiency: 0.92,
      generatedAt: new Date(),
      parameters,
    };
  }

  // Simplified ML model implementations
  private applyARIMAModel(data: any[], parameters: Record<string, any>): any {
    // Simplified ARIMA implementation
    const trend = this.calculateTrend(data);
    const seasonality = this.calculateSeasonality(data, parameters.seasonality);
    
    const forecast = [];
    const lookAhead = parameters.lookAhead || 30;
    
    for (let i = 0; i < lookAhead; i++) {
      const value = trend + seasonality[i % seasonality.length] + Math.random() * 0.1;
      forecast.push({
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
        value: Math.max(0, value),
        confidence: parameters.confidence || 0.95,
      });
    }

    return forecast;
  }

  private applyIncidentPredictionModel(incidents: any[], parameters: Record<string, any>): any {
    // Simplified incident prediction
    const siteRiskScores = new Map<string, number>();
    
    // Calculate risk scores based on historical data
    for (const incident of incidents) {
      const siteId = incident.siteId;
      const currentScore = siteRiskScores.get(siteId) || 0;
      siteRiskScores.set(siteId, currentScore + this.getIncidentWeight(incident));
    }

    const predictions = [];
    for (const [siteId, riskScore] of siteRiskScores.entries()) {
      if (riskScore > (parameters.threshold || 0.7)) {
        predictions.push({
          siteId,
          riskScore,
          predictedIncidentType: this.predictIncidentType(incidents.filter(i => i.siteId === siteId)),
          timeWindow: '24h',
          confidence: Math.min(0.95, riskScore),
        });
      }
    }

    return predictions;
  }

  private applyResourceOptimization(agents: any[], sites: any[], parameters: Record<string, any>): any {
    // Simplified resource optimization
    const optimization = {
      recommendations: [],
      costSavings: 0,
      efficiencyGain: 0,
    };

    // Calculate optimal agent allocation
    for (const site of sites) {
      const requiredAgents = this.calculateRequiredAgents(site);
      const currentAgents = agents.filter(a => 
        a.shifts.some((s: any) => s.siteId === site.id)
      ).length;

      if (currentAgents !== requiredAgents) {
        optimization.recommendations.push({
          siteId: site.id,
          siteName: site.name,
          currentAgents,
          recommendedAgents: requiredAgents,
          action: currentAgents > requiredAgents ? 'REDUCE' : 'INCREASE',
          impact: Math.abs(currentAgents - requiredAgents),
        });
      }
    }

    return optimization;
  }

  // Utility methods
  private async getHistoricalDemandData(parameters: Record<string, any>): Promise<any[]> {
    const shifts = await prisma.shift.findMany({
      where: {
        startTime: {
          gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last year
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // Group by day and count
    const dailyDemand = new Map<string, number>();
    for (const shift of shifts) {
      const date = shift.startTime.toISOString().split('T')[0];
      dailyDemand.set(date, (dailyDemand.get(date) || 0) + 1);
    }

    return Array.from(dailyDemand.entries()).map(([date, count]) => ({
      date: new Date(date),
      value: count,
    }));
  }

  private calculateTrend(data: any[]): number {
    if (data.length < 2) return 0;
    
    const firstValue = data[0].value;
    const lastValue = data[data.length - 1].value;
    return (lastValue - firstValue) / data.length;
  }

  private calculateSeasonality(data: any[], period: string): number[] {
    const periodLength = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 365;
    const seasonality = new Array(periodLength).fill(0);
    
    for (let i = 0; i < data.length; i++) {
      const index = i % periodLength;
      seasonality[index] += data[i].value;
    }

    // Normalize
    const cycles = Math.floor(data.length / periodLength);
    return seasonality.map(value => value / Math.max(1, cycles));
  }

  private getIncidentWeight(incident: any): number {
    const severityWeights = {
      'LOW': 0.1,
      'MEDIUM': 0.3,
      'HIGH': 0.6,
      'CRITICAL': 1.0,
    };
    return severityWeights[incident.severity as keyof typeof severityWeights] || 0.1;
  }

  private predictIncidentType(siteIncidents: any[]): string {
    const typeCounts = new Map<string, number>();
    for (const incident of siteIncidents) {
      typeCounts.set(incident.type, (typeCounts.get(incident.type) || 0) + 1);
    }

    let maxType = 'SECURITY_BREACH';
    let maxCount = 0;
    for (const [type, count] of typeCounts.entries()) {
      if (count > maxCount) {
        maxType = type;
        maxCount = count;
      }
    }

    return maxType;
  }

  private calculateRequiredAgents(site: any): number {
    // Simplified calculation based on site size and risk level
    const baseAgents = Math.ceil(site.size / 1000); // 1 agent per 1000 sq ft
    const riskMultiplier = site.riskLevel === 'HIGH' ? 1.5 : site.riskLevel === 'MEDIUM' ? 1.2 : 1.0;
    return Math.max(1, Math.ceil(baseAgents * riskMultiplier));
  }

  // Real-time Analytics
  public async getRealtimeMetrics(): Promise<any> {
    const [activeShifts, openIncidents, todayReports] = await Promise.all([
      prisma.shift.count({
        where: {
          status: 'IN_PROGRESS',
        },
      }),
      prisma.incident.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
      }),
      prisma.report.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      activeShifts,
      openIncidents,
      todayReports,
      timestamp: new Date(),
    };
  }

  // Export analytics data
  public async exportAnalytics(format: 'CSV' | 'PDF' | 'EXCEL', query: AdvancedAnalyticsQuery): Promise<Buffer> {
    const data = await this.executeAdvancedQuery(query);
    
    switch (format) {
      case 'CSV':
        return this.exportToCSV(data);
      case 'PDF':
        return this.exportToPDF(data);
      case 'EXCEL':
        return this.exportToExcel(data);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private async exportToCSV(data: any): Promise<Buffer> {
    // Simplified CSV export
    const csv = this.convertToCSV(data.data);
    return Buffer.from(csv, 'utf-8');
  }

  private async exportToPDF(data: any): Promise<Buffer> {
    // Simplified PDF export - in production, use a library like puppeteer or pdfkit
    const content = JSON.stringify(data, null, 2);
    return Buffer.from(content, 'utf-8');
  }

  private async exportToExcel(data: any): Promise<Buffer> {
    // Simplified Excel export - in production, use a library like exceljs
    const content = JSON.stringify(data, null, 2);
    return Buffer.from(content, 'utf-8');
  }

  private convertToCSV(data: any[]): string {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        return typeof value === 'string' ? `"${value}"` : value;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }
}

export const advancedAnalyticsService = AdvancedAnalyticsService.getInstance();
