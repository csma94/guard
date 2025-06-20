import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';

export interface AnalyticsQuery {
  id: string;
  name: string;
  description: string;
  query: string;
  parameters: Record<string, any>;
  cacheKey?: string;
  cacheTTL?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsResult {
  queryId: string;
  data: any[];
  metadata: {
    totalRows: number;
    executionTime: number;
    cacheHit: boolean;
    generatedAt: Date;
  };
  aggregations?: Record<string, number>;
  trends?: Array<{
    period: string;
    value: number;
    change: number;
    changePercent: number;
  }>;
}

export interface KPIDefinition {
  id: string;
  name: string;
  description: string;
  formula: string;
  target: number;
  unit: string;
  category: 'operational' | 'financial' | 'quality' | 'safety';
  frequency: 'real-time' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  dependencies: string[];
  thresholds: {
    critical: number;
    warning: number;
    good: number;
    excellent: number;
  };
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  widgets: Array<{
    id: string;
    type: 'chart' | 'metric' | 'table' | 'map' | 'gauge';
    title: string;
    queryId: string;
    configuration: Record<string, any>;
    position: { x: number; y: number; width: number; height: number };
  }>;
  filters: Array<{
    id: string;
    name: string;
    type: 'date' | 'select' | 'multiselect' | 'text';
    options?: string[];
    defaultValue?: any;
  }>;
  permissions: {
    viewRoles: string[];
    editRoles: string[];
  };
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

class AnalyticsEngine {
  private queries: Map<string, AnalyticsQuery> = new Map();
  private kpis: Map<string, KPIDefinition> = new Map();
  private dashboards: Map<string, Dashboard> = new Map();
  private queryCache: Map<string, { result: AnalyticsResult; expiry: number }> = new Map();

  constructor() {
    this.initializeDefaultQueries();
    this.initializeDefaultKPIs();
    this.startCacheCleanup();
  }

  private initializeDefaultQueries(): void {
    const defaultQueries: AnalyticsQuery[] = [
      {
        id: 'shifts_by_status',
        name: 'Shifts by Status',
        description: 'Count of shifts grouped by status',
        query: `
          SELECT status, COUNT(*) as count
          FROM shifts
          WHERE created_at >= :startDate AND created_at <= :endDate
          GROUP BY status
          ORDER BY count DESC
        `,
        parameters: { startDate: null, endDate: null },
        cacheKey: 'shifts_by_status',
        cacheTTL: 300, // 5 minutes
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'agent_performance',
        name: 'Agent Performance Metrics',
        description: 'Performance metrics for agents including completion rates and quality scores',
        query: `
          SELECT 
            a.id as agent_id,
            u.username,
            COUNT(s.id) as total_shifts,
            COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_shifts,
            AVG(s.quality_score) as avg_quality_score,
            AVG(EXTRACT(EPOCH FROM (s.actual_end_time - s.actual_start_time))/3600) as avg_shift_duration
          FROM agents a
          JOIN users u ON a.user_id = u.id
          LEFT JOIN shifts s ON a.id = s.agent_id
          WHERE s.created_at >= :startDate AND s.created_at <= :endDate
          GROUP BY a.id, u.username
          ORDER BY avg_quality_score DESC
        `,
        parameters: { startDate: null, endDate: null },
        cacheKey: 'agent_performance',
        cacheTTL: 600, // 10 minutes
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'incident_trends',
        name: 'Incident Trends',
        description: 'Incident reports over time with severity breakdown',
        query: `
          SELECT 
            DATE_TRUNC('day', created_at) as date,
            priority,
            COUNT(*) as incident_count
          FROM reports
          WHERE type = 'incident' 
            AND created_at >= :startDate 
            AND created_at <= :endDate
          GROUP BY DATE_TRUNC('day', created_at), priority
          ORDER BY date, priority
        `,
        parameters: { startDate: null, endDate: null },
        cacheKey: 'incident_trends',
        cacheTTL: 900, // 15 minutes
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'site_utilization',
        name: 'Site Utilization',
        description: 'Site coverage and utilization metrics',
        query: `
          SELECT 
            st.id as site_id,
            st.name as site_name,
            COUNT(s.id) as total_shifts,
            SUM(EXTRACT(EPOCH FROM (s.actual_end_time - s.actual_start_time))/3600) as total_hours,
            AVG(s.quality_score) as avg_quality_score,
            COUNT(r.id) as total_reports
          FROM sites st
          LEFT JOIN shifts s ON st.id = s.site_id
          LEFT JOIN reports r ON st.id = r.site_id
          WHERE s.created_at >= :startDate AND s.created_at <= :endDate
          GROUP BY st.id, st.name
          ORDER BY total_hours DESC
        `,
        parameters: { startDate: null, endDate: null },
        cacheKey: 'site_utilization',
        cacheTTL: 1800, // 30 minutes
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    defaultQueries.forEach(query => {
      this.queries.set(query.id, query);
    });
  }

  private initializeDefaultKPIs(): void {
    const defaultKPIs: KPIDefinition[] = [
      {
        id: 'shift_completion_rate',
        name: 'Shift Completion Rate',
        description: 'Percentage of shifts completed successfully',
        formula: '(completed_shifts / total_shifts) * 100',
        target: 95,
        unit: '%',
        category: 'operational',
        frequency: 'daily',
        dependencies: ['shifts_by_status'],
        thresholds: {
          critical: 80,
          warning: 85,
          good: 90,
          excellent: 95,
        },
      },
      {
        id: 'average_response_time',
        name: 'Average Emergency Response Time',
        description: 'Average time to respond to emergency alerts',
        formula: 'AVG(response_time_minutes)',
        target: 5,
        unit: 'minutes',
        category: 'safety',
        frequency: 'real-time',
        dependencies: ['emergency_responses'],
        thresholds: {
          critical: 15,
          warning: 10,
          good: 7,
          excellent: 5,
        },
      },
      {
        id: 'agent_utilization',
        name: 'Agent Utilization Rate',
        description: 'Percentage of available agent hours utilized',
        formula: '(worked_hours / available_hours) * 100',
        target: 85,
        unit: '%',
        category: 'operational',
        frequency: 'daily',
        dependencies: ['agent_performance'],
        thresholds: {
          critical: 60,
          warning: 70,
          good: 80,
          excellent: 85,
        },
      },
      {
        id: 'incident_resolution_rate',
        name: 'Incident Resolution Rate',
        description: 'Percentage of incidents resolved within SLA',
        formula: '(resolved_within_sla / total_incidents) * 100',
        target: 90,
        unit: '%',
        category: 'quality',
        frequency: 'daily',
        dependencies: ['incident_trends'],
        thresholds: {
          critical: 70,
          warning: 80,
          good: 85,
          excellent: 90,
        },
      },
    ];

    defaultKPIs.forEach(kpi => {
      this.kpis.set(kpi.id, kpi);
    });
  }

  public async executeQuery(
    queryId: string,
    parameters: Record<string, any> = {},
    useCache: boolean = true
  ): Promise<AnalyticsResult> {
    try {
      const query = this.queries.get(queryId);
      if (!query) {
        throw new Error(`Query not found: ${queryId}`);
      }

      // Check cache first
      if (useCache && query.cacheKey) {
        const cached = await this.getCachedResult(query.cacheKey, parameters);
        if (cached) {
          return cached;
        }
      }

      const startTime = Date.now();

      // Execute query with parameters
      const data = await this.executeRawQuery(query.query, { ...query.parameters, ...parameters });

      const executionTime = Date.now() - startTime;

      // Calculate aggregations
      const aggregations = this.calculateAggregations(data);

      // Calculate trends if applicable
      const trends = this.calculateTrends(data);

      const result: AnalyticsResult = {
        queryId,
        data,
        metadata: {
          totalRows: data.length,
          executionTime,
          cacheHit: false,
          generatedAt: new Date(),
        },
        aggregations,
        trends,
      };

      // Cache result
      if (query.cacheKey && query.cacheTTL) {
        await this.cacheResult(query.cacheKey, parameters, result, query.cacheTTL);
      }

      logger.info(`Analytics query executed: ${queryId}, rows: ${data.length}, time: ${executionTime}ms`);
      return result;

    } catch (error) {
      logger.error(`Analytics query failed: ${queryId}`, error);
      throw error;
    }
  }

  public async calculateKPI(kpiId: string, parameters: Record<string, any> = {}): Promise<{
    value: number;
    target: number;
    status: 'critical' | 'warning' | 'good' | 'excellent';
    trend: 'up' | 'down' | 'stable';
    previousValue?: number;
  }> {
    try {
      const kpi = this.kpis.get(kpiId);
      if (!kpi) {
        throw new Error(`KPI not found: ${kpiId}`);
      }

      // Execute dependent queries
      const dependencyResults = await Promise.all(
        kpi.dependencies.map(dep => this.executeQuery(dep, parameters))
      );

      // Calculate KPI value based on formula
      const value = await this.evaluateKPIFormula(kpi.formula, dependencyResults);

      // Determine status based on thresholds
      const status = this.getKPIStatus(value, kpi.thresholds);

      // Calculate trend (compare with previous period)
      const previousValue = await this.getPreviousKPIValue(kpiId, parameters);
      const trend = this.calculateKPITrend(value, previousValue);

      return {
        value,
        target: kpi.target,
        status,
        trend,
        previousValue,
      };

    } catch (error) {
      logger.error(`KPI calculation failed: ${kpiId}`, error);
      throw error;
    }
  }

  public async createDashboard(dashboard: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const dashboardId = `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newDashboard: Dashboard = {
        ...dashboard,
        id: dashboardId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.dashboards.set(dashboardId, newDashboard);
      
      // Store in database
      await this.storeDashboard(newDashboard);

      logger.info(`Dashboard created: ${dashboardId}`);
      return dashboardId;

    } catch (error) {
      logger.error('Dashboard creation failed:', error);
      throw error;
    }
  }

  public async generateReport(
    dashboardId: string,
    parameters: Record<string, any> = {},
    format: 'json' | 'pdf' | 'excel' = 'json'
  ): Promise<Buffer | object> {
    try {
      const dashboard = this.dashboards.get(dashboardId);
      if (!dashboard) {
        throw new Error(`Dashboard not found: ${dashboardId}`);
      }

      // Execute all widget queries
      const widgetResults = await Promise.all(
        dashboard.widgets.map(async widget => {
          const result = await this.executeQuery(widget.queryId, parameters);
          return {
            widget,
            result,
          };
        })
      );

      const reportData = {
        dashboard,
        widgets: widgetResults,
        parameters,
        generatedAt: new Date(),
      };

      switch (format) {
        case 'json':
          return reportData;
        case 'pdf':
          return await this.generatePDFReport(reportData);
        case 'excel':
          return await this.generateExcelReport(reportData);
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

    } catch (error) {
      logger.error('Report generation failed:', error);
      throw error;
    }
  }

  public async getRealtimeMetrics(): Promise<Record<string, any>> {
    try {
      const realtimeKPIs = Array.from(this.kpis.values())
        .filter(kpi => kpi.frequency === 'real-time');

      const metrics = await Promise.all(
        realtimeKPIs.map(async kpi => {
          const result = await this.calculateKPI(kpi.id);
          return { [kpi.id]: result };
        })
      );

      return Object.assign({}, ...metrics);

    } catch (error) {
      logger.error('Real-time metrics failed:', error);
      throw error;
    }
  }

  // Private helper methods
  private async executeRawQuery(query: string, parameters: Record<string, any>): Promise<any[]> {
    // This would execute the actual database query
    // Implementation depends on your database setup
    return [];
  }

  private calculateAggregations(data: any[]): Record<string, number> {
    if (data.length === 0) return {};

    const aggregations: Record<string, number> = {};
    const numericFields = this.getNumericFields(data[0]);

    numericFields.forEach(field => {
      const values = data.map(row => row[field]).filter(val => typeof val === 'number');
      if (values.length > 0) {
        aggregations[`${field}_sum`] = values.reduce((sum, val) => sum + val, 0);
        aggregations[`${field}_avg`] = aggregations[`${field}_sum`] / values.length;
        aggregations[`${field}_min`] = Math.min(...values);
        aggregations[`${field}_max`] = Math.max(...values);
      }
    });

    return aggregations;
  }

  private calculateTrends(data: any[]): Array<{ period: string; value: number; change: number; changePercent: number }> {
    // Implementation for trend calculation
    return [];
  }

  private getNumericFields(row: any): string[] {
    return Object.keys(row).filter(key => typeof row[key] === 'number');
  }

  private async getCachedResult(cacheKey: string, parameters: Record<string, any>): Promise<AnalyticsResult | null> {
    try {
      const key = `analytics:${cacheKey}:${JSON.stringify(parameters)}`;
      const cached = await redisClient.get(key);
      
      if (cached) {
        const result = JSON.parse(cached);
        result.metadata.cacheHit = true;
        return result;
      }
    } catch (error) {
      logger.error('Cache retrieval failed:', error);
    }
    
    return null;
  }

  private async cacheResult(
    cacheKey: string,
    parameters: Record<string, any>,
    result: AnalyticsResult,
    ttl: number
  ): Promise<void> {
    try {
      const key = `analytics:${cacheKey}:${JSON.stringify(parameters)}`;
      await redisClient.setex(key, ttl, JSON.stringify(result));
    } catch (error) {
      logger.error('Cache storage failed:', error);
    }
  }

  private async evaluateKPIFormula(formula: string, dependencyResults: AnalyticsResult[]): Promise<number> {
    // Implementation for KPI formula evaluation
    // This would parse and evaluate the formula using the dependency results
    return 0;
  }

  private getKPIStatus(value: number, thresholds: KPIDefinition['thresholds']): 'critical' | 'warning' | 'good' | 'excellent' {
    if (value >= thresholds.excellent) return 'excellent';
    if (value >= thresholds.good) return 'good';
    if (value >= thresholds.warning) return 'warning';
    return 'critical';
  }

  private async getPreviousKPIValue(kpiId: string, parameters: Record<string, any>): Promise<number | undefined> {
    // Implementation to get previous period KPI value
    return undefined;
  }

  private calculateKPITrend(current: number, previous?: number): 'up' | 'down' | 'stable' {
    if (!previous) return 'stable';
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'up' : 'down';
  }

  private async storeDashboard(dashboard: Dashboard): Promise<void> {
    // Store dashboard in database
  }

  private async generatePDFReport(reportData: any): Promise<Buffer> {
    // Generate PDF report
    return Buffer.from('PDF report content');
  }

  private async generateExcelReport(reportData: any): Promise<Buffer> {
    // Generate Excel report
    return Buffer.from('Excel report content');
  }

  private startCacheCleanup(): void {
    // Clean up expired cache entries every hour
    setInterval(() => {
      this.cleanupCache();
    }, 60 * 60 * 1000);
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.queryCache.entries()) {
      if (value.expiry <= now) {
        this.queryCache.delete(key);
      }
    }
  }
}

export default AnalyticsEngine;
