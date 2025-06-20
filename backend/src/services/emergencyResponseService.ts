import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { notificationService } from './notificationService';
import { integrationService } from './integrationService';
import { geofencingService } from './geofencingService';

const prisma = new PrismaClient();

export interface EmergencyAlert {
  id: string;
  type: 'PANIC_BUTTON' | 'MEDICAL' | 'FIRE' | 'SECURITY_BREACH' | 'NATURAL_DISASTER' | 'EVACUATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESPONDING' | 'RESOLVED' | 'FALSE_ALARM';
  triggeredBy: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  siteId: string;
  description: string;
  timestamp: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  responseTime?: number;
  metadata?: Record<string, any>;
}

export interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  priority: number;
  isActive: boolean;
  availabilitySchedule?: Record<string, any>;
}

export interface EmergencyProcedure {
  id: string;
  alertType: string;
  severity: string;
  steps: EmergencyStep[];
  estimatedDuration: number;
  requiredPersonnel: string[];
  equipment: string[];
  isActive: boolean;
}

export interface EmergencyStep {
  id: string;
  order: number;
  title: string;
  description: string;
  assignedRole?: string;
  estimatedDuration: number;
  isRequired: boolean;
  dependencies?: string[];
}

export interface EmergencyResponse {
  id: string;
  alertId: string;
  procedureId: string;
  status: 'INITIATED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED';
  startedAt: Date;
  completedAt?: Date;
  steps: EmergencyResponseStep[];
  personnel: string[];
  notes?: string;
}

export interface EmergencyResponseStep {
  stepId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  assignedTo?: string;
  startedAt?: Date;
  completedAt?: Date;
  notes?: string;
}

export class EmergencyResponseService extends EventEmitter {
  private static instance: EmergencyResponseService;
  private activeAlerts: Map<string, EmergencyAlert> = new Map();
  private emergencyContacts: Map<string, EmergencyContact> = new Map();
  private procedures: Map<string, EmergencyProcedure> = new Map();

  private constructor() {
    super();
    this.initializeEmergencySystem();
  }

  public static getInstance(): EmergencyResponseService {
    if (!EmergencyResponseService.instance) {
      EmergencyResponseService.instance = new EmergencyResponseService();
    }
    return EmergencyResponseService.instance;
  }

  private async initializeEmergencySystem() {
    try {
      // Load emergency contacts
      const contacts = await prisma.emergencyContact.findMany({
        where: { isActive: true },
        orderBy: { priority: 'asc' },
      });

      for (const contact of contacts) {
        this.emergencyContacts.set(contact.id, {
          id: contact.id,
          name: contact.name,
          role: contact.role,
          phone: contact.phone,
          email: contact.email,
          priority: contact.priority,
          isActive: contact.isActive,
          availabilitySchedule: contact.availabilitySchedule as Record<string, any>,
        });
      }

      // Load emergency procedures
      const procedures = await prisma.emergencyProcedure.findMany({
        where: { isActive: true },
        include: { steps: true },
      });

      for (const procedure of procedures) {
        this.procedures.set(procedure.id, {
          id: procedure.id,
          alertType: procedure.alertType,
          severity: procedure.severity,
          steps: procedure.steps.map(step => ({
            id: step.id,
            order: step.order,
            title: step.title,
            description: step.description,
            assignedRole: step.assignedRole,
            estimatedDuration: step.estimatedDuration,
            isRequired: step.isRequired,
            dependencies: step.dependencies as string[],
          })),
          estimatedDuration: procedure.estimatedDuration,
          requiredPersonnel: procedure.requiredPersonnel as string[],
          equipment: procedure.equipment as string[],
          isActive: procedure.isActive,
        });
      }

      console.log(`Emergency system initialized with ${contacts.length} contacts and ${procedures.length} procedures`);
    } catch (error) {
      console.error('Failed to initialize emergency system:', error);
    }
  }

  // Emergency alert management
  public async triggerEmergencyAlert(alertData: Omit<EmergencyAlert, 'id' | 'timestamp' | 'status'>): Promise<string> {
    try {
      const alert: EmergencyAlert = {
        ...alertData,
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        status: 'ACTIVE',
      };

      // Store in database
      await prisma.emergencyAlert.create({
        data: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          status: alert.status,
          triggeredBy: alert.triggeredBy,
          latitude: alert.location.latitude,
          longitude: alert.location.longitude,
          address: alert.location.address,
          siteId: alert.siteId,
          description: alert.description,
          timestamp: alert.timestamp,
          metadata: alert.metadata,
        },
      });

      // Store in memory for quick access
      this.activeAlerts.set(alert.id, alert);

      // Initiate emergency response
      await this.initiateEmergencyResponse(alert);

      this.emit('emergency.triggered', alert);
      return alert.id;
    } catch (error) {
      console.error('Failed to trigger emergency alert:', error);
      throw new Error('Failed to trigger emergency alert');
    }
  }

  private async initiateEmergencyResponse(alert: EmergencyAlert): Promise<void> {
    // Find appropriate procedure
    const procedure = this.findProcedureForAlert(alert);
    if (!procedure) {
      console.warn(`No procedure found for alert type ${alert.type} with severity ${alert.severity}`);
      return;
    }

    // Create emergency response
    const response: EmergencyResponse = {
      id: `response-${alert.id}`,
      alertId: alert.id,
      procedureId: procedure.id,
      status: 'INITIATED',
      startedAt: new Date(),
      steps: procedure.steps.map(step => ({
        stepId: step.id,
        status: 'PENDING',
      })),
      personnel: [],
    };

    // Store response
    await prisma.emergencyResponse.create({
      data: {
        id: response.id,
        alertId: response.alertId,
        procedureId: response.procedureId,
        status: response.status,
        startedAt: response.startedAt,
        steps: response.steps,
        personnel: response.personnel,
      },
    });

    // Execute immediate actions
    await this.executeImmediateActions(alert, procedure);

    // Notify emergency contacts
    await this.notifyEmergencyContacts(alert);

    // Notify relevant personnel
    await this.notifyRelevantPersonnel(alert, procedure);

    // Start automated procedures
    await this.startAutomatedProcedures(alert, response);
  }

  private findProcedureForAlert(alert: EmergencyAlert): EmergencyProcedure | undefined {
    for (const procedure of this.procedures.values()) {
      if (procedure.alertType === alert.type && procedure.severity === alert.severity) {
        return procedure;
      }
    }

    // Fallback to generic procedure for alert type
    for (const procedure of this.procedures.values()) {
      if (procedure.alertType === alert.type) {
        return procedure;
      }
    }

    return undefined;
  }

  private async executeImmediateActions(alert: EmergencyAlert, procedure: EmergencyProcedure): Promise<void> {
    // Immediate actions based on alert type
    switch (alert.type) {
      case 'PANIC_BUTTON':
        await this.handlePanicButton(alert);
        break;
      case 'FIRE':
        await this.handleFireAlert(alert);
        break;
      case 'SECURITY_BREACH':
        await this.handleSecurityBreach(alert);
        break;
      case 'MEDICAL':
        await this.handleMedicalEmergency(alert);
        break;
      case 'EVACUATION':
        await this.handleEvacuation(alert);
        break;
    }

    // Log immediate actions
    await prisma.auditLog.create({
      data: {
        action: 'EMERGENCY_IMMEDIATE_ACTIONS',
        entityType: 'EMERGENCY_ALERT',
        entityId: alert.id,
        userId: alert.triggeredBy,
        details: {
          alertType: alert.type,
          severity: alert.severity,
          procedureId: procedure.id,
        },
        timestamp: new Date(),
      },
    });
  }

  private async handlePanicButton(alert: EmergencyAlert): Promise<void> {
    // Immediate response for panic button
    await this.dispatchSecurityTeam(alert);
    await this.notifyLocalAuthorities(alert);
    await this.activateLocationTracking(alert.triggeredBy);
  }

  private async handleFireAlert(alert: EmergencyAlert): Promise<void> {
    // Fire emergency response
    await this.notifyFireDepartment(alert);
    await this.activateEvacuationProcedures(alert);
    await this.disableElevators(alert.siteId);
  }

  private async handleSecurityBreach(alert: EmergencyAlert): Promise<void> {
    // Security breach response
    await this.lockdownFacility(alert.siteId);
    await this.dispatchSecurityTeam(alert);
    await this.activateSecurityCameras(alert.siteId);
  }

  private async handleMedicalEmergency(alert: EmergencyAlert): Promise<void> {
    // Medical emergency response
    await this.notifyEMS(alert);
    await this.dispatchFirstAidTeam(alert);
    await this.prepareEvacuationRoute(alert);
  }

  private async handleEvacuation(alert: EmergencyAlert): Promise<void> {
    // Evacuation procedures
    await this.activateEvacuationAlarms(alert.siteId);
    await this.notifyAllPersonnel(alert);
    await this.coordinateEvacuation(alert);
  }

  private async notifyEmergencyContacts(alert: EmergencyAlert): Promise<void> {
    const contacts = Array.from(this.emergencyContacts.values())
      .filter(contact => this.isContactAvailable(contact))
      .sort((a, b) => a.priority - b.priority);

    for (const contact of contacts) {
      try {
        // Send SMS
        await integrationService.sendSMS(
          contact.phone,
          `EMERGENCY ALERT: ${alert.type} at ${alert.location.address || 'Unknown location'}. Severity: ${alert.severity}. Alert ID: ${alert.id}`
        );

        // Send email
        await integrationService.sendEmail(
          contact.email,
          `Emergency Alert - ${alert.type}`,
          this.generateEmergencyEmailContent(alert, contact),
          true
        );

        // Log notification
        await prisma.emergencyNotification.create({
          data: {
            alertId: alert.id,
            contactId: contact.id,
            method: 'SMS_EMAIL',
            status: 'SENT',
            sentAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`Failed to notify emergency contact ${contact.name}:`, error);
      }
    }
  }

  private async notifyRelevantPersonnel(alert: EmergencyAlert, procedure: EmergencyProcedure): Promise<void> {
    // Notify on-duty personnel
    const onDutyAgents = await prisma.agent.findMany({
      where: {
        status: 'ACTIVE',
        shifts: {
          some: {
            status: 'IN_PROGRESS',
            siteId: alert.siteId,
          },
        },
      },
      include: { user: true },
    });

    for (const agent of onDutyAgents) {
      await notificationService.sendNotification({
        type: 'SECURITY',
        priority: 'CRITICAL',
        title: `EMERGENCY: ${alert.type}`,
        message: `Emergency alert triggered at your location. Follow emergency procedures immediately.`,
        recipientId: agent.userId,
        channels: ['IN_APP', 'PUSH', 'SMS'],
        metadata: {
          alertId: alert.id,
          alertType: alert.type,
          severity: alert.severity,
          procedureId: procedure.id,
        },
      });
    }

    // Notify supervisors and managers
    await notificationService.sendBulkNotification({
      type: 'SECURITY',
      priority: 'CRITICAL',
      title: `EMERGENCY ALERT: ${alert.type}`,
      message: `Emergency situation requires immediate attention. Alert ID: ${alert.id}`,
      recipientRole: 'SUPERVISOR',
      channels: ['IN_APP', 'EMAIL', 'SMS', 'PUSH'],
      metadata: {
        alertId: alert.id,
        alertType: alert.type,
        severity: alert.severity,
      },
    });
  }

  private async startAutomatedProcedures(alert: EmergencyAlert, response: EmergencyResponse): Promise<void> {
    // Start executing procedure steps
    const procedure = this.procedures.get(response.procedureId);
    if (!procedure) return;

    // Execute steps in order
    for (const step of procedure.steps.sort((a, b) => a.order - b.order)) {
      if (step.isRequired) {
        await this.executeEmergencyStep(response.id, step, alert);
      }
    }
  }

  private async executeEmergencyStep(responseId: string, step: EmergencyStep, alert: EmergencyAlert): Promise<void> {
    try {
      // Update step status
      await prisma.emergencyResponse.update({
        where: { id: responseId },
        data: {
          steps: {
            updateMany: {
              where: { stepId: step.id },
              data: {
                status: 'IN_PROGRESS',
                startedAt: new Date(),
              },
            },
          },
        },
      });

      // Execute step based on type
      await this.performStepAction(step, alert);

      // Mark step as completed
      await prisma.emergencyResponse.update({
        where: { id: responseId },
        data: {
          steps: {
            updateMany: {
              where: { stepId: step.id },
              data: {
                status: 'COMPLETED',
                completedAt: new Date(),
              },
            },
          },
        },
      });
    } catch (error) {
      console.error(`Failed to execute emergency step ${step.id}:`, error);
      
      // Mark step as failed
      await prisma.emergencyResponse.update({
        where: { id: responseId },
        data: {
          steps: {
            updateMany: {
              where: { stepId: step.id },
              data: {
                status: 'SKIPPED',
                notes: `Failed: ${error.message}`,
              },
            },
          },
        },
      });
    }
  }

  private async performStepAction(step: EmergencyStep, alert: EmergencyAlert): Promise<void> {
    // Perform specific actions based on step description
    if (step.title.toLowerCase().includes('notify')) {
      await this.performNotificationStep(step, alert);
    } else if (step.title.toLowerCase().includes('dispatch')) {
      await this.performDispatchStep(step, alert);
    } else if (step.title.toLowerCase().includes('secure')) {
      await this.performSecurityStep(step, alert);
    } else if (step.title.toLowerCase().includes('evacuate')) {
      await this.performEvacuationStep(step, alert);
    }
  }

  // Alert management
  public async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    await prisma.emergencyAlert.update({
      where: { id: alertId },
      data: {
        status: alert.status,
        acknowledgedBy: alert.acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt,
      },
    });

    this.emit('emergency.acknowledged', alert);
  }

  public async resolveAlert(alertId: string, resolvedBy: string, notes?: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    alert.status = 'RESOLVED';
    alert.resolvedBy = resolvedBy;
    alert.resolvedAt = new Date();
    
    if (alert.acknowledgedAt) {
      alert.responseTime = (alert.resolvedAt.getTime() - alert.acknowledgedAt.getTime()) / 1000;
    }

    await prisma.emergencyAlert.update({
      where: { id: alertId },
      data: {
        status: alert.status,
        resolvedBy: alert.resolvedBy,
        resolvedAt: alert.resolvedAt,
        responseTime: alert.responseTime,
        notes,
      },
    });

    // Remove from active alerts
    this.activeAlerts.delete(alertId);

    this.emit('emergency.resolved', alert);
  }

  // Utility methods
  private isContactAvailable(contact: EmergencyContact): boolean {
    if (!contact.availabilitySchedule) return true;
    
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();
    
    const schedule = contact.availabilitySchedule[dayOfWeek.toString()];
    if (!schedule) return false;
    
    return hour >= schedule.start && hour <= schedule.end;
  }

  private generateEmergencyEmailContent(alert: EmergencyAlert, contact: EmergencyContact): string {
    return `
      <h2>Emergency Alert Notification</h2>
      <p><strong>Alert Type:</strong> ${alert.type}</p>
      <p><strong>Severity:</strong> ${alert.severity}</p>
      <p><strong>Location:</strong> ${alert.location.address || `${alert.location.latitude}, ${alert.location.longitude}`}</p>
      <p><strong>Description:</strong> ${alert.description}</p>
      <p><strong>Triggered At:</strong> ${alert.timestamp.toLocaleString()}</p>
      <p><strong>Alert ID:</strong> ${alert.id}</p>
      
      <h3>Immediate Actions Required:</h3>
      <ul>
        <li>Acknowledge this alert immediately</li>
        <li>Contact emergency services if not already done</li>
        <li>Follow established emergency procedures</li>
        <li>Coordinate with on-site personnel</li>
      </ul>
      
      <p>This is an automated emergency notification. Please respond immediately.</p>
    `;
  }

  // Specific emergency actions (simplified implementations)
  private async dispatchSecurityTeam(alert: EmergencyAlert): Promise<void> {
    console.log(`Dispatching security team to ${alert.location.address}`);
  }

  private async notifyLocalAuthorities(alert: EmergencyAlert): Promise<void> {
    console.log(`Notifying local authorities about ${alert.type}`);
  }

  private async activateLocationTracking(agentId: string): Promise<void> {
    console.log(`Activating enhanced location tracking for agent ${agentId}`);
  }

  private async notifyFireDepartment(alert: EmergencyAlert): Promise<void> {
    console.log(`Notifying fire department about fire at ${alert.location.address}`);
  }

  private async activateEvacuationProcedures(alert: EmergencyAlert): Promise<void> {
    console.log(`Activating evacuation procedures for site ${alert.siteId}`);
  }

  private async disableElevators(siteId: string): Promise<void> {
    console.log(`Disabling elevators at site ${siteId}`);
  }

  private async lockdownFacility(siteId: string): Promise<void> {
    console.log(`Initiating lockdown procedures for site ${siteId}`);
  }

  private async activateSecurityCameras(siteId: string): Promise<void> {
    console.log(`Activating all security cameras at site ${siteId}`);
  }

  private async notifyEMS(alert: EmergencyAlert): Promise<void> {
    console.log(`Notifying EMS about medical emergency at ${alert.location.address}`);
  }

  private async dispatchFirstAidTeam(alert: EmergencyAlert): Promise<void> {
    console.log(`Dispatching first aid team to ${alert.location.address}`);
  }

  private async prepareEvacuationRoute(alert: EmergencyAlert): Promise<void> {
    console.log(`Preparing evacuation route from ${alert.location.address}`);
  }

  private async activateEvacuationAlarms(siteId: string): Promise<void> {
    console.log(`Activating evacuation alarms at site ${siteId}`);
  }

  private async notifyAllPersonnel(alert: EmergencyAlert): Promise<void> {
    console.log(`Notifying all personnel about evacuation at site ${alert.siteId}`);
  }

  private async coordinateEvacuation(alert: EmergencyAlert): Promise<void> {
    console.log(`Coordinating evacuation procedures for site ${alert.siteId}`);
  }

  private async performNotificationStep(step: EmergencyStep, alert: EmergencyAlert): Promise<void> {
    console.log(`Performing notification step: ${step.title}`);
  }

  private async performDispatchStep(step: EmergencyStep, alert: EmergencyAlert): Promise<void> {
    console.log(`Performing dispatch step: ${step.title}`);
  }

  private async performSecurityStep(step: EmergencyStep, alert: EmergencyAlert): Promise<void> {
    console.log(`Performing security step: ${step.title}`);
  }

  private async performEvacuationStep(step: EmergencyStep, alert: EmergencyAlert): Promise<void> {
    console.log(`Performing evacuation step: ${step.title}`);
  }

  // Analytics and reporting
  public async getEmergencyAnalytics(dateRange: { start: Date; end: Date }): Promise<any> {
    const alerts = await prisma.emergencyAlert.findMany({
      where: {
        timestamp: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
    });

    return {
      totalAlerts: alerts.length,
      alertsByType: this.groupBy(alerts, 'type'),
      alertsBySeverity: this.groupBy(alerts, 'severity'),
      alertsByStatus: this.groupBy(alerts, 'status'),
      averageResponseTime: this.calculateAverageResponseTime(alerts),
      falseAlarms: alerts.filter(a => a.status === 'FALSE_ALARM').length,
    };
  }

  private groupBy(array: any[], key: string): Record<string, number> {
    return array.reduce((result, item) => {
      const group = item[key];
      result[group] = (result[group] || 0) + 1;
      return result;
    }, {});
  }

  private calculateAverageResponseTime(alerts: any[]): number {
    const resolvedAlerts = alerts.filter(a => a.responseTime);
    if (resolvedAlerts.length === 0) return 0;
    
    const totalTime = resolvedAlerts.reduce((sum, alert) => sum + alert.responseTime, 0);
    return totalTime / resolvedAlerts.length;
  }
}

export const emergencyResponseService = EmergencyResponseService.getInstance();
