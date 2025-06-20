const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * Report template management service
 */
class ReportTemplateService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Get predefined report templates
   */
  getDefaultTemplates() {
    return {
      PATROL: {
        id: 'patrol-standard',
        name: 'Standard Patrol Report',
        description: 'Standard template for routine patrol reports',
        fields: [
          {
            id: 'patrol_start_time',
            type: 'datetime',
            label: 'Patrol Start Time',
            required: true,
            order: 1,
          },
          {
            id: 'patrol_end_time',
            type: 'datetime',
            label: 'Patrol End Time',
            required: true,
            order: 2,
          },
          {
            id: 'areas_patrolled',
            type: 'multiselect',
            label: 'Areas Patrolled',
            required: true,
            options: ['Main Entrance', 'Parking Lot', 'Perimeter', 'Building Interior', 'Emergency Exits'],
            order: 3,
          },
          {
            id: 'observations',
            type: 'textarea',
            label: 'General Observations',
            required: true,
            placeholder: 'Describe any observations during the patrol...',
            order: 4,
          },
          {
            id: 'security_checks',
            type: 'checklist',
            label: 'Security Checks Completed',
            required: true,
            items: [
              'All doors and windows secured',
              'Alarm systems functioning',
              'Lighting adequate',
              'No unauthorized personnel',
              'Emergency equipment accessible',
            ],
            order: 5,
          },
          {
            id: 'weather_conditions',
            type: 'select',
            label: 'Weather Conditions',
            required: false,
            options: ['Clear', 'Cloudy', 'Rainy', 'Foggy', 'Windy', 'Snow'],
            order: 6,
          },
          {
            id: 'incidents_occurred',
            type: 'boolean',
            label: 'Any Incidents Occurred?',
            required: true,
            order: 7,
          },
          {
            id: 'incident_details',
            type: 'textarea',
            label: 'Incident Details',
            required: false,
            conditional: { field: 'incidents_occurred', value: true },
            placeholder: 'Provide detailed description of any incidents...',
            order: 8,
          },
          {
            id: 'photos_taken',
            type: 'file_upload',
            label: 'Photos/Evidence',
            required: false,
            accept: 'image/*',
            multiple: true,
            order: 9,
          },
          {
            id: 'recommendations',
            type: 'textarea',
            label: 'Recommendations',
            required: false,
            placeholder: 'Any recommendations for improving security...',
            order: 10,
          },
        ],
      },
      INCIDENT: {
        id: 'incident-standard',
        name: 'Incident Report',
        description: 'Template for reporting security incidents',
        fields: [
          {
            id: 'incident_time',
            type: 'datetime',
            label: 'Incident Date/Time',
            required: true,
            order: 1,
          },
          {
            id: 'incident_location',
            type: 'text',
            label: 'Incident Location',
            required: true,
            placeholder: 'Specific location where incident occurred',
            order: 2,
          },
          {
            id: 'incident_type',
            type: 'select',
            label: 'Incident Type',
            required: true,
            options: [
              'Theft/Burglary',
              'Vandalism',
              'Trespassing',
              'Medical Emergency',
              'Fire/Safety',
              'Suspicious Activity',
              'Equipment Malfunction',
              'Other',
            ],
            order: 3,
          },
          {
            id: 'severity_level',
            type: 'select',
            label: 'Severity Level',
            required: true,
            options: ['Low', 'Medium', 'High', 'Critical'],
            order: 4,
          },
          {
            id: 'persons_involved',
            type: 'number',
            label: 'Number of Persons Involved',
            required: true,
            min: 0,
            order: 5,
          },
          {
            id: 'incident_description',
            type: 'textarea',
            label: 'Detailed Description',
            required: true,
            placeholder: 'Provide a detailed description of what happened...',
            order: 6,
          },
          {
            id: 'immediate_actions',
            type: 'textarea',
            label: 'Immediate Actions Taken',
            required: true,
            placeholder: 'Describe actions taken immediately after the incident...',
            order: 7,
          },
          {
            id: 'authorities_notified',
            type: 'boolean',
            label: 'Authorities Notified?',
            required: true,
            order: 8,
          },
          {
            id: 'authority_details',
            type: 'textarea',
            label: 'Authority Contact Details',
            required: false,
            conditional: { field: 'authorities_notified', value: true },
            placeholder: 'Police report number, officer name, etc.',
            order: 9,
          },
          {
            id: 'witnesses',
            type: 'textarea',
            label: 'Witness Information',
            required: false,
            placeholder: 'Names and contact information of witnesses...',
            order: 10,
          },
          {
            id: 'evidence_collected',
            type: 'file_upload',
            label: 'Evidence/Photos',
            required: true,
            accept: 'image/*,video/*',
            multiple: true,
            order: 11,
          },
          {
            id: 'follow_up_required',
            type: 'boolean',
            label: 'Follow-up Required?',
            required: true,
            order: 12,
          },
          {
            id: 'follow_up_details',
            type: 'textarea',
            label: 'Follow-up Details',
            required: false,
            conditional: { field: 'follow_up_required', value: true },
            placeholder: 'Describe required follow-up actions...',
            order: 13,
          },
        ],
      },
      INSPECTION: {
        id: 'inspection-standard',
        name: 'Security Inspection Report',
        description: 'Template for routine security inspections',
        fields: [
          {
            id: 'inspection_type',
            type: 'select',
            label: 'Inspection Type',
            required: true,
            options: ['Routine', 'Scheduled Maintenance', 'Post-Incident', 'Client Requested'],
            order: 1,
          },
          {
            id: 'inspection_areas',
            type: 'multiselect',
            label: 'Areas Inspected',
            required: true,
            options: [
              'Access Control Systems',
              'CCTV Systems',
              'Alarm Systems',
              'Lighting',
              'Fencing/Barriers',
              'Emergency Equipment',
              'Communication Systems',
            ],
            order: 2,
          },
          {
            id: 'equipment_status',
            type: 'checklist',
            label: 'Equipment Status Check',
            required: true,
            items: [
              'All cameras operational',
              'Recording systems functioning',
              'Access card readers working',
              'Motion sensors active',
              'Emergency lighting functional',
              'Communication radios working',
              'Backup power systems tested',
            ],
            order: 3,
          },
          {
            id: 'deficiencies_found',
            type: 'boolean',
            label: 'Any Deficiencies Found?',
            required: true,
            order: 4,
          },
          {
            id: 'deficiency_details',
            type: 'textarea',
            label: 'Deficiency Details',
            required: false,
            conditional: { field: 'deficiencies_found', value: true },
            placeholder: 'Describe any deficiencies or issues found...',
            order: 5,
          },
          {
            id: 'corrective_actions',
            type: 'textarea',
            label: 'Corrective Actions Taken',
            required: false,
            placeholder: 'Describe any immediate corrective actions...',
            order: 6,
          },
          {
            id: 'maintenance_required',
            type: 'boolean',
            label: 'Maintenance Required?',
            required: true,
            order: 7,
          },
          {
            id: 'maintenance_details',
            type: 'textarea',
            label: 'Maintenance Requirements',
            required: false,
            conditional: { field: 'maintenance_required', value: true },
            placeholder: 'Describe required maintenance work...',
            order: 8,
          },
          {
            id: 'inspection_photos',
            type: 'file_upload',
            label: 'Inspection Photos',
            required: false,
            accept: 'image/*',
            multiple: true,
            order: 9,
          },
          {
            id: 'overall_rating',
            type: 'select',
            label: 'Overall Security Rating',
            required: true,
            options: ['Excellent', 'Good', 'Fair', 'Poor', 'Critical'],
            order: 10,
          },
        ],
      },
      MAINTENANCE: {
        id: 'maintenance-standard',
        name: 'Maintenance Report',
        description: 'Template for maintenance and equipment reports',
        fields: [
          {
            id: 'maintenance_type',
            type: 'select',
            label: 'Maintenance Type',
            required: true,
            options: ['Preventive', 'Corrective', 'Emergency', 'Upgrade'],
            order: 1,
          },
          {
            id: 'equipment_affected',
            type: 'multiselect',
            label: 'Equipment Affected',
            required: true,
            options: [
              'CCTV Cameras',
              'Access Control',
              'Alarm System',
              'Lighting',
              'Communication Equipment',
              'Vehicles',
              'Other',
            ],
            order: 2,
          },
          {
            id: 'work_performed',
            type: 'textarea',
            label: 'Work Performed',
            required: true,
            placeholder: 'Describe the maintenance work performed...',
            order: 3,
          },
          {
            id: 'parts_used',
            type: 'textarea',
            label: 'Parts/Materials Used',
            required: false,
            placeholder: 'List any parts or materials used...',
            order: 4,
          },
          {
            id: 'work_completed',
            type: 'boolean',
            label: 'Work Completed?',
            required: true,
            order: 5,
          },
          {
            id: 'outstanding_work',
            type: 'textarea',
            label: 'Outstanding Work',
            required: false,
            conditional: { field: 'work_completed', value: false },
            placeholder: 'Describe any work that remains to be completed...',
            order: 6,
          },
          {
            id: 'testing_performed',
            type: 'boolean',
            label: 'Testing Performed?',
            required: true,
            order: 7,
          },
          {
            id: 'test_results',
            type: 'textarea',
            label: 'Test Results',
            required: false,
            conditional: { field: 'testing_performed', value: true },
            placeholder: 'Describe test results and verification...',
            order: 8,
          },
          {
            id: 'next_maintenance',
            type: 'date',
            label: 'Next Scheduled Maintenance',
            required: false,
            order: 9,
          },
          {
            id: 'maintenance_photos',
            type: 'file_upload',
            label: 'Before/After Photos',
            required: false,
            accept: 'image/*',
            multiple: true,
            order: 10,
          },
        ],
      },
    };
  }

  /**
   * Create custom report template
   */
  async createCustomTemplate(templateData, createdBy) {
    try {
      const {
        name,
        description,
        reportType,
        fields,
        isPublic = false,
        clientId = null,
        siteId = null,
      } = templateData;

      // Validate template data
      this.validateTemplateFields(fields);

      const template = await this.prisma.reportTemplate.create({
        data: {
          id: uuidv4(),
          name,
          description,
          reportType,
          fields,
          isPublic,
          clientId,
          siteId,
          createdBy,
          isActive: true,
        },
      });

      logger.audit('report_template_created', {
        createdBy,
        templateId: template.id,
        name,
        reportType,
        isPublic,
      });

      return {
        success: true,
        template,
        message: 'Report template created successfully',
      };
    } catch (error) {
      logger.error('Failed to create report template:', error);
      throw error;
    }
  }

  /**
   * Apply template to report content
   */
  applyTemplate(templateId, reportData = {}) {
    const templates = this.getDefaultTemplates();
    
    // Find template by ID
    let template = null;
    for (const [type, tmpl] of Object.entries(templates)) {
      if (tmpl.id === templateId) {
        template = tmpl;
        break;
      }
    }

    if (!template) {
      throw new Error('Template not found');
    }

    // Generate structured content based on template
    const structuredContent = {
      templateId,
      templateName: template.name,
      sections: {},
      completionStatus: {},
    };

    template.fields.forEach(field => {
      const value = reportData[field.id] || null;
      
      structuredContent.sections[field.id] = {
        label: field.label,
        type: field.type,
        value,
        required: field.required,
        order: field.order,
      };

      // Track completion status
      structuredContent.completionStatus[field.id] = {
        completed: field.required ? (value !== null && value !== '') : true,
        required: field.required,
      };
    });

    // Calculate overall completion percentage
    const totalFields = template.fields.length;
    const completedFields = Object.values(structuredContent.completionStatus)
      .filter(status => status.completed).length;
    
    structuredContent.completionPercentage = Math.round((completedFields / totalFields) * 100);

    return structuredContent;
  }

  /**
   * Validate template fields
   */
  validateTemplateFields(fields) {
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new Error('Template must have at least one field');
    }

    const validTypes = [
      'text', 'textarea', 'number', 'date', 'datetime', 'boolean',
      'select', 'multiselect', 'checklist', 'file_upload', 'signature'
    ];

    fields.forEach((field, index) => {
      if (!field.id || !field.type || !field.label) {
        throw new Error(`Field ${index + 1} is missing required properties (id, type, label)`);
      }

      if (!validTypes.includes(field.type)) {
        throw new Error(`Field ${field.id} has invalid type: ${field.type}`);
      }

      if (field.type === 'select' || field.type === 'multiselect') {
        if (!field.options || !Array.isArray(field.options) || field.options.length === 0) {
          throw new Error(`Field ${field.id} of type ${field.type} must have options array`);
        }
      }

      if (field.type === 'checklist') {
        if (!field.items || !Array.isArray(field.items) || field.items.length === 0) {
          throw new Error(`Field ${field.id} of type checklist must have items array`);
        }
      }
    });
  }

  /**
   * Get available templates for a report type
   */
  async getTemplatesForReportType(reportType, filters = {}) {
    const { clientId, siteId, includePublic = true } = filters;

    // Get default templates
    const defaultTemplates = this.getDefaultTemplates();
    const templates = [];

    // Add matching default templates
    Object.values(defaultTemplates).forEach(template => {
      if (!reportType || template.id.includes(reportType.toLowerCase())) {
        templates.push({
          ...template,
          isDefault: true,
          isPublic: true,
        });
      }
    });

    // Get custom templates from database
    const where = {
      isActive: true,
      ...(reportType && { reportType }),
      OR: [
        ...(includePublic ? [{ isPublic: true }] : []),
        ...(clientId ? [{ clientId }] : []),
        ...(siteId ? [{ siteId }] : []),
      ],
    };

    const customTemplates = await this.prisma.reportTemplate.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            profile: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add custom templates
    customTemplates.forEach(template => {
      templates.push({
        ...template,
        isDefault: false,
      });
    });

    return {
      templates,
      totalCount: templates.length,
      filters: { reportType, clientId, siteId, includePublic },
    };
  }

  /**
   * Generate report from template
   */
  generateReportFromTemplate(templateId, formData) {
    const templates = this.getDefaultTemplates();
    
    // Find template
    let template = null;
    for (const [type, tmpl] of Object.entries(templates)) {
      if (tmpl.id === templateId) {
        template = tmpl;
        break;
      }
    }

    if (!template) {
      throw new Error('Template not found');
    }

    // Process form data according to template structure
    const processedContent = {};
    const validationErrors = [];

    template.fields.forEach(field => {
      const value = formData[field.id];

      // Validate required fields
      if (field.required && (value === null || value === undefined || value === '')) {
        validationErrors.push(`${field.label} is required`);
        return;
      }

      // Process value based on field type
      switch (field.type) {
        case 'number':
          if (value !== null && value !== '') {
            processedContent[field.id] = parseFloat(value);
          }
          break;
        case 'boolean':
          processedContent[field.id] = Boolean(value);
          break;
        case 'date':
        case 'datetime':
          if (value) {
            processedContent[field.id] = new Date(value);
          }
          break;
        case 'multiselect':
        case 'checklist':
          processedContent[field.id] = Array.isArray(value) ? value : [];
          break;
        default:
          processedContent[field.id] = value;
      }
    });

    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    return {
      templateId,
      templateName: template.name,
      content: processedContent,
      generatedAt: new Date(),
    };
  }
}

module.exports = ReportTemplateService;
