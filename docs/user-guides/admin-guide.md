# Admin Portal User Guide

## Overview

The BahinLink Admin Portal is a comprehensive web-based interface designed for administrators and supervisors to manage all aspects of the security workforce management system. This guide covers the key features and workflows available in the admin portal.

## Getting Started

### Accessing the Admin Portal

1. Navigate to `https://admin.bahinlink.com`
2. Enter your email and password
3. Complete MFA verification if enabled
4. You'll be redirected to the dashboard

### Dashboard Overview

The dashboard provides a real-time overview of your security operations:

- **Active Shifts**: Current shifts in progress
- **Agent Status**: Real-time agent locations and status
- **Recent Incidents**: Latest incident reports
- **Key Metrics**: Performance indicators and statistics
- **Alerts**: System notifications and emergency alerts

## User Management

### Creating Users

1. Navigate to **Users** → **Add User**
2. Fill in the required information:
   - **Personal Details**: Name, email, phone
   - **Role Assignment**: Select appropriate role
   - **Permissions**: Configure specific permissions
   - **Profile Settings**: Upload avatar, set preferences
3. Click **Create User**
4. The user will receive an email with login instructions

### Managing User Roles

**Available Roles:**
- **Super Admin**: Full system access
- **Admin**: Organization-wide management
- **Supervisor**: Team and site oversight
- **Agent**: Field operations
- **Client**: Read-only access to assigned data

**Role Assignment:**
1. Go to **Users** → Select user
2. Click **Edit** → **Role & Permissions**
3. Select new role from dropdown
4. Adjust specific permissions if needed
5. Save changes

### User Permissions

Permissions are granular and can be customized:

- **User Management**: Create, edit, delete users
- **Shift Management**: Schedule, assign, modify shifts
- **Site Management**: Add, configure, manage sites
- **Report Access**: View, create, export reports
- **Analytics**: Access to business intelligence
- **System Settings**: Configure system parameters

## Agent Management

### Adding Agents

1. Navigate to **Agents** → **Add Agent**
2. Complete the agent profile:
   - **Personal Information**: Name, contact details
   - **Employment Details**: Employee ID, hire date
   - **Certifications**: Security licenses, training
   - **Skills**: Specializations and capabilities
   - **Equipment**: Assigned devices and tools
3. Upload required documents
4. Set availability and scheduling preferences
5. Save the agent profile

### Agent Tracking

**Real-time Location:**
- View agent locations on interactive map
- Monitor movement patterns and routes
- Set up geofencing alerts
- Track check-in/out times

**Performance Monitoring:**
- Shift completion rates
- Response times to incidents
- Quality scores and ratings
- Training completion status

### Agent Scheduling

**Creating Schedules:**
1. Go to **Scheduling** → **Create Schedule**
2. Select time period (daily, weekly, monthly)
3. Assign agents to shifts
4. Set shift parameters:
   - Start/end times
   - Site assignments
   - Special instructions
   - Required skills/certifications

**Conflict Resolution:**
- System automatically detects scheduling conflicts
- Suggests alternative assignments
- Allows manual override with justification
- Sends notifications to affected parties

## Site Management

### Adding Sites

1. Navigate to **Sites** → **Add Site**
2. Enter site information:
   - **Basic Details**: Name, address, contact
   - **Location**: GPS coordinates, map integration
   - **Client Assignment**: Link to client account
   - **Security Requirements**: Access levels, protocols
   - **Operating Hours**: Service schedules
3. Configure site-specific settings:
   - Geofencing boundaries
   - Check-in requirements
   - Emergency procedures
   - Reporting templates

### Site Configuration

**Geofencing:**
- Draw boundaries on interactive map
- Set entry/exit alerts
- Configure tolerance zones
- Monitor compliance

**Access Control:**
- Define security levels
- Set entry requirements
- Configure visitor management
- Integrate with access systems

**Emergency Procedures:**
- Create emergency response plans
- Define escalation procedures
- Set up automated alerts
- Configure emergency contacts

## Shift Management

### Creating Shifts

1. Go to **Shifts** → **Create Shift**
2. Fill in shift details:
   - **Date & Time**: Start/end times
   - **Site Assignment**: Select location
   - **Agent Assignment**: Choose qualified agent
   - **Shift Type**: Regular, overtime, emergency
   - **Special Instructions**: Site-specific requirements

### Shift Monitoring

**Real-time Tracking:**
- Monitor active shifts on dashboard
- Track agent check-in/out status
- View real-time locations
- Receive automated alerts

**Shift Analytics:**
- Completion rates by agent/site
- Average response times
- Overtime analysis
- Cost tracking

### Bulk Operations

**Bulk Shift Creation:**
1. Navigate to **Shifts** → **Bulk Create**
2. Upload CSV template or use wizard
3. Review and validate assignments
4. Resolve any conflicts
5. Confirm bulk creation

**Schedule Templates:**
- Create recurring shift patterns
- Apply templates to multiple sites
- Automate routine scheduling
- Maintain consistency

## Incident Management

### Incident Dashboard

View and manage all incident reports:
- **Active Incidents**: Ongoing situations
- **Recent Reports**: Latest submissions
- **Priority Queue**: High-priority incidents
- **Resolution Status**: Tracking progress

### Incident Response

**Immediate Actions:**
1. Review incident details
2. Assess severity and priority
3. Assign response team
4. Initiate emergency procedures if needed
5. Monitor resolution progress

**Follow-up Procedures:**
- Document actions taken
- Update incident status
- Notify relevant parties
- Schedule follow-up reviews
- Generate incident reports

### Incident Analytics

- Incident frequency by site/time
- Response time analysis
- Resolution effectiveness
- Trend identification
- Preventive recommendations

## Reporting & Analytics

### Standard Reports

**Operational Reports:**
- Shift completion summaries
- Agent performance metrics
- Site coverage analysis
- Incident statistics

**Financial Reports:**
- Labor cost analysis
- Overtime tracking
- Client billing summaries
- Budget variance reports

**Compliance Reports:**
- Training compliance
- Certification tracking
- Audit trail reports
- Regulatory compliance

### Custom Reports

1. Navigate to **Reports** → **Custom Reports**
2. Select data sources and metrics
3. Configure filters and parameters
4. Choose visualization type
5. Schedule automated generation
6. Set up distribution lists

### Business Intelligence

**Dashboard Creation:**
- Drag-and-drop interface
- Real-time data visualization
- Interactive charts and graphs
- Customizable layouts

**Key Performance Indicators:**
- Define custom KPIs
- Set targets and thresholds
- Monitor performance trends
- Receive automated alerts

## Client Management

### Client Accounts

**Adding Clients:**
1. Go to **Clients** → **Add Client**
2. Enter client information:
   - Company details
   - Contact information
   - Service agreements
   - Billing preferences
3. Configure access permissions
4. Set up client portal access

**Client Portal Management:**
- Configure visible data
- Set up custom branding
- Manage user access
- Monitor usage analytics

### Service Level Agreements

**SLA Configuration:**
- Define service standards
- Set response time requirements
- Configure quality metrics
- Establish reporting schedules

**SLA Monitoring:**
- Track performance against SLAs
- Generate compliance reports
- Identify improvement areas
- Automate client notifications

## System Administration

### System Settings

**General Configuration:**
- Company information
- Time zones and localization
- Email templates
- Notification preferences

**Security Settings:**
- Password policies
- Session management
- MFA requirements
- Access controls

**Integration Settings:**
- Third-party API configurations
- Webhook endpoints
- Data synchronization
- External system connections

### User Activity Monitoring

**Audit Logs:**
- User login/logout tracking
- Data modification history
- Permission changes
- System access patterns

**Security Monitoring:**
- Failed login attempts
- Suspicious activity detection
- Data access patterns
- Compliance violations

### Backup & Recovery

**Data Backup:**
- Automated daily backups
- Manual backup initiation
- Backup verification
- Retention policy management

**Disaster Recovery:**
- Recovery procedures
- Data restoration
- System failover
- Business continuity planning

## Mobile App Management

### App Configuration

**Settings Management:**
- Feature toggles
- Update policies
- Offline capabilities
- Synchronization settings

**Device Management:**
- Device registration
- Remote configuration
- Security policies
- App distribution

### Push Notifications

**Notification Types:**
- Shift assignments
- Emergency alerts
- System updates
- Custom messages

**Targeting:**
- Role-based targeting
- Location-based alerts
- Individual messaging
- Broadcast notifications

## Best Practices

### Daily Operations

1. **Morning Review**: Check overnight incidents and shift completions
2. **Real-time Monitoring**: Monitor active shifts and agent locations
3. **Incident Response**: Address any active incidents promptly
4. **Schedule Management**: Review and adjust upcoming schedules
5. **Performance Review**: Check key metrics and KPIs

### Weekly Tasks

1. **Performance Analysis**: Review weekly performance reports
2. **Schedule Planning**: Plan upcoming week's schedules
3. **Training Review**: Check agent training compliance
4. **Client Communication**: Send weekly reports to clients
5. **System Maintenance**: Review system health and updates

### Monthly Activities

1. **Comprehensive Reporting**: Generate monthly performance reports
2. **Budget Review**: Analyze costs and budget variance
3. **SLA Assessment**: Review SLA compliance and performance
4. **Strategic Planning**: Plan improvements and optimizations
5. **System Updates**: Apply system updates and new features

## Troubleshooting

### Common Issues

**Login Problems:**
- Verify credentials
- Check MFA settings
- Clear browser cache
- Contact system administrator

**Performance Issues:**
- Check internet connection
- Clear browser cache
- Disable browser extensions
- Try different browser

**Data Synchronization:**
- Verify network connectivity
- Check system status
- Refresh data manually
- Contact technical support

### Getting Help

**Support Channels:**
- In-app help system
- Email: support@bahinlink.com
- Phone: 1-800-BAHINLINK
- Live chat (business hours)

**Documentation:**
- User guides and tutorials
- Video training materials
- FAQ and knowledge base
- API documentation

---

For additional assistance or advanced configuration, please contact our support team at support@bahinlink.com.
