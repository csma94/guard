# Security Requirements: BahinLink

**Version:** 1.0  
**Date:** December 17, 2024  
**Document Type:** Security Requirements Specification  
**Project:** BahinLink Workforce Management Solution  

## Table of Contents

1. [Security Overview](#1-security-overview)
2. [Authentication Mechanisms](#2-authentication-mechanisms)
3. [Authorization and Access Control](#3-authorization-and-access-control)
4. [Data Protection and Encryption](#4-data-protection-and-encryption)
5. [GDPR Compliance](#5-gdpr-compliance)
6. [Mobile Security](#6-mobile-security)
7. [API Security](#7-api-security)
8. [Infrastructure Security](#8-infrastructure-security)
9. [Security Monitoring](#9-security-monitoring)
10. [Incident Response](#10-incident-response)

## 1. Security Overview

### 1.1 Security Objectives

**Primary Security Goals:**
- Protect sensitive personal and business data
- Ensure secure authentication and authorization
- Maintain data integrity and availability
- Comply with GDPR and privacy regulations
- Prevent unauthorized access and data breaches
- Secure communication channels and data transmission

**Security Principles:**
- **Defense in Depth**: Multiple layers of security controls
- **Least Privilege**: Minimum necessary access rights
- **Zero Trust**: Verify every access request
- **Privacy by Design**: Built-in privacy protection
- **Secure by Default**: Secure configuration out of the box

### 1.2 Threat Model

**Identified Threats:**
- Unauthorized access to user accounts
- Data interception during transmission
- Mobile device theft or loss
- SQL injection and code injection attacks
- Cross-site scripting (XSS) attacks
- Denial of service (DoS) attacks
- Insider threats and privilege escalation
- Data breaches and privacy violations

**Risk Assessment:**
- **High Risk**: User authentication, location data, personal information
- **Medium Risk**: Business data, reports, communication logs
- **Low Risk**: Public information, system metadata

## 2. Authentication Mechanisms

### 2.1 Primary Authentication

**Username and Password:**
- Minimum password requirements: 8 characters, mixed case, numbers, symbols
- Password complexity validation on client and server
- Secure password hashing using bcrypt with salt (cost factor 12+)
- Password history to prevent reuse of last 5 passwords
- Account lockout after 5 failed attempts (15-minute lockout)

**Password Policy Implementation:**
```javascript
const passwordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  preventCommonPasswords: true,
  preventUserInfoInPassword: true,
  historyCount: 5,
  maxAge: 90 // days
};
```

### 2.2 Multi-Factor Authentication (2FA)

**SMS-Based 2FA:**
- 6-digit numeric codes with 5-minute expiration
- Rate limiting: maximum 3 attempts per 15 minutes
- Secure random number generation
- SMS delivery through trusted gateway (Twilio)

**Email-Based 2FA:**
- Alternative to SMS for users without mobile access
- Secure email templates with expiration warnings
- Email verification for account recovery

**Implementation Requirements:**
- 2FA mandatory for admin and supervisor roles
- Optional but recommended for agents and clients
- Backup codes for account recovery (10 single-use codes)
- Device trust for 30 days after successful 2FA

### 2.3 Session Management

**JWT Token Security:**
```javascript
const jwtConfig = {
  accessToken: {
    expiresIn: '15m',
    algorithm: 'HS256',
    issuer: 'bahinlink-api',
    audience: 'bahinlink-clients'
  },
  refreshToken: {
    expiresIn: '7d',
    algorithm: 'HS256',
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  }
};
```

**Session Security Measures:**
- Short-lived access tokens (15 minutes)
- Secure refresh token rotation
- Token blacklisting for logout
- Automatic token refresh before expiration
- Session invalidation on password change

## 3. Authorization and Access Control

### 3.1 Role-Based Access Control (RBAC)

**User Roles and Permissions:**

**Administrator:**
- Full system access and configuration
- User management (create, update, delete, suspend)
- Site and client management
- System settings and feature toggles
- Audit log access and reporting
- Security configuration management

**Supervisor:**
- Agent monitoring and management
- Report review and approval
- Schedule management for assigned teams
- Communication with agents and clients
- Incident response and escalation
- Limited user management (agents only)

**Agent:**
- Personal schedule and shift access
- Clock in/out functionality
- Report creation and submission
- Location sharing during shifts
- Communication with supervisors
- Personal profile management

**Client:**
- Site-specific data access only
- Real-time agent status for their sites
- Report viewing for their locations
- Service request submission
- Incident reporting for their sites
- Limited communication with assigned personnel

### 3.2 Data Access Controls

**Horizontal Access Control:**
- Agents can only access their own data and assigned shifts
- Clients can only access data related to their sites
- Supervisors can only access data for their assigned teams
- Cross-tenant data isolation enforced at database level

**Vertical Access Control:**
- Role-based feature access restrictions
- API endpoint authorization middleware
- Database row-level security policies
- Field-level access control for sensitive data

**Implementation Example:**
```javascript
// Authorization middleware
const authorize = (roles, permissions = []) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    const userPermissions = req.user.permissions;
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    
    if (permissions.length > 0) {
      const hasPermission = permissions.some(p => userPermissions.includes(p));
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }
    
    next();
  };
};
```

## 4. Data Protection and Encryption

### 4.1 Encryption at Rest

**Database Encryption:**
- PostgreSQL Transparent Data Encryption (TDE)
- AES-256 encryption for sensitive columns
- Encrypted database backups
- Secure key management with AWS KMS or HashiCorp Vault

**File Storage Encryption:**
- Server-side encryption for S3 buckets (AES-256)
- Client-side encryption for highly sensitive files
- Encrypted local storage on mobile devices
- Secure key rotation policies

**Sensitive Data Fields:**
```sql
-- Encrypted columns for PII data
CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email_encrypted BYTEA, -- Encrypted email
    phone_encrypted BYTEA, -- Encrypted phone
    profile_encrypted JSONB, -- Encrypted profile data
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 Encryption in Transit

**TLS Configuration:**
- TLS 1.2 minimum, TLS 1.3 preferred
- Strong cipher suites only
- Perfect Forward Secrecy (PFS)
- HTTP Strict Transport Security (HSTS)
- Certificate pinning for mobile apps

**API Communication:**
- All API endpoints require HTTPS
- WebSocket connections use WSS (secure WebSocket)
- Certificate validation on client side
- Man-in-the-middle attack prevention

### 4.3 Key Management

**Encryption Key Hierarchy:**
```
Master Key (HSM/KMS)
├── Database Encryption Key
├── Application Encryption Key
├── File Storage Encryption Key
└── Communication Encryption Key
```

**Key Rotation Policy:**
- Master keys: Annual rotation
- Database keys: Bi-annual rotation
- Application keys: Quarterly rotation
- Session keys: Per-session generation

## 5. GDPR Compliance

### 5.1 Data Protection Principles

**Lawfulness, Fairness, and Transparency:**
- Clear privacy policy and data usage disclosure
- Explicit consent for data collection and processing
- Transparent data handling procedures
- Regular privacy impact assessments

**Purpose Limitation:**
- Data collected only for specified, legitimate purposes
- No secondary use without additional consent
- Clear data retention policies
- Regular data usage audits

**Data Minimization:**
- Collect only necessary data for business purposes
- Regular review of data collection practices
- Automated data cleanup procedures
- Privacy-preserving analytics where possible

### 5.2 Individual Rights Implementation

**Right to Access:**
```javascript
// Data export functionality
app.get('/api/users/me/data-export', authenticate, async (req, res) => {
  const userId = req.user.id;
  
  const userData = await exportUserData(userId);
  const exportFile = await generateDataExport(userData);
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=user-data.json');
  res.send(exportFile);
});
```

**Right to Rectification:**
- User profile update functionality
- Data correction request workflow
- Audit trail for data modifications
- Notification of data changes to relevant parties

**Right to Erasure (Right to be Forgotten):**
```javascript
// Data deletion with cascade handling
const deleteUserData = async (userId) => {
  await db.transaction(async (trx) => {
    // Anonymize reports instead of deleting (business requirement)
    await trx('reports').where('agent_id', userId).update({
      agent_id: null,
      anonymized: true,
      anonymized_at: new Date()
    });
    
    // Delete personal data
    await trx('user_profiles').where('user_id', userId).del();
    await trx('location_tracking').where('agent_id', userId).del();
    await trx('users').where('id', userId).update({
      deleted_at: new Date(),
      email: null,
      phone: null,
      personal_data: null
    });
  });
};
```

**Right to Data Portability:**
- Standardized data export format (JSON)
- API endpoints for data retrieval
- Secure data transfer mechanisms
- Compatible data formats for import to other systems

### 5.3 Consent Management

**Consent Collection:**
- Granular consent for different data types
- Clear opt-in mechanisms (no pre-checked boxes)
- Consent versioning and tracking
- Easy consent withdrawal process

**Consent Records:**
```javascript
const consentSchema = {
  userId: 'UUID',
  consentType: 'location_tracking|communication|analytics|marketing',
  granted: 'boolean',
  timestamp: 'datetime',
  version: 'string',
  ipAddress: 'string',
  userAgent: 'string'
};
```

### 5.4 Data Retention and Deletion

**Retention Policies:**
- User account data: 7 years after account closure
- Location tracking data: 2 years after collection
- Communication logs: 3 years after creation
- Audit logs: 7 years for compliance
- Backup data: 30 days for operational backups

**Automated Deletion:**
```javascript
// Scheduled data cleanup job
const dataCleanupJob = cron.schedule('0 2 * * *', async () => {
  // Delete expired location data
  await db('location_tracking')
    .where('created_at', '<', moment().subtract(2, 'years'))
    .del();
  
  // Anonymize old communication logs
  await db('messages')
    .where('created_at', '<', moment().subtract(3, 'years'))
    .update({
      message: '[DELETED]',
      anonymized: true
    });
});
```

## 6. Mobile Security

### 6.1 Mobile Application Security

**Code Protection:**
- Code obfuscation for release builds
- Anti-tampering mechanisms
- Root/jailbreak detection
- Certificate pinning for API communication
- Runtime Application Self-Protection (RASP)

**Data Storage Security:**
```javascript
// Secure storage implementation
import { SecureStore } from 'expo-secure-store';

const secureStorage = {
  async setItem(key, value) {
    await SecureStore.setItemAsync(key, value, {
      keychainService: 'bahinlink-keychain',
      encrypt: true,
      requireAuthentication: true
    });
  },

  async getItem(key) {
    return await SecureStore.getItemAsync(key, {
      keychainService: 'bahinlink-keychain',
      requireAuthentication: true
    });
  }
};
```

**Local Database Encryption:**
- SQLite database encryption using SQLCipher
- Encrypted local storage for offline data
- Secure key derivation from user credentials
- Automatic data wipe on multiple failed attempts

### 6.2 Device Security

**Device Trust Verification:**
- Device fingerprinting for anomaly detection
- Trusted device registration
- Suspicious device activity monitoring
- Remote device wipe capabilities

**Biometric Authentication:**
```javascript
// Biometric authentication implementation
import * as LocalAuthentication from 'expo-local-authentication';

const authenticateWithBiometrics = async () => {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (hasHardware && isEnrolled) {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to access BahinLink',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: false
    });

    return result.success;
  }

  return false;
};
```

### 6.3 Location Security

**GPS Data Protection:**
- Location data encryption before transmission
- Geofence validation on server side
- location detection and prevention
- Location data retention policies

**Privacy Controls:**
- Location sharing only during active shifts
- Granular location permissions
- Location history access controls
- Emergency location override capabilities

## 7. API Security

### 7.1 Input Validation and Sanitization

**Request Validation:**
```javascript
const { body, validationResult } = require('express-validator');

const validateUserInput = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  body('phone').isMobilePhone(),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
```

**SQL Injection Prevention:**
- Parameterized queries for all database operations
- ORM/query builder usage (Knex.js, Prisma)
- Input sanitization and validation
- Database user privilege restrictions

**XSS Prevention:**
- Content Security Policy (CSP) headers
- Input sanitization for user-generated content
- Output encoding for dynamic content
- Secure cookie configuration

### 7.2 Rate Limiting and DDoS Protection

**API Rate Limiting:**
```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // limit each IP to 5 login attempts per windowMs
  skipSuccessfulRequests: true,
});
```

**DDoS Protection:**
- CloudFlare or AWS Shield for network-level protection
- Application-level rate limiting
- Request size limitations
- Connection throttling

### 7.3 API Security Headers

**Security Headers Configuration:**
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

## 8. Infrastructure Security

### 8.1 Network Security

**Firewall Configuration:**
- Default deny all incoming traffic
- Whitelist specific ports and IP ranges
- VPC with private subnets for application servers
- Network segmentation for different tiers
- Intrusion detection and prevention systems

**VPN and Remote Access:**
- VPN required for administrative access
- Multi-factor authentication for VPN
- Bastion hosts for secure server access
- Audit logging for all remote connections

### 8.2 Server Security

**Operating System Hardening:**
- Regular security updates and patches
- Minimal service installation
- Secure SSH configuration
- File system permissions and access controls
- System monitoring and intrusion detection

**Container Security:**
```dockerfile
# Security-focused Dockerfile
FROM node:18-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=nodejs:nodejs . .

# Remove unnecessary packages
RUN apk del --purge wget curl

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000
CMD ["node", "server.js"]
```

### 8.3 Database Security

**PostgreSQL Security Configuration:**
```sql
-- Database security settings
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';

-- Create restricted database user
CREATE ROLE bahinlink_app WITH LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE bahinlink TO bahinlink_app;
GRANT USAGE ON SCHEMA public TO bahinlink_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bahinlink_app;

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON users FOR ALL TO bahinlink_app
  USING (id = current_setting('app.current_user_id')::uuid);
```

## 9. Security Monitoring

### 9.1 Security Event Logging

**Audit Log Requirements:**
- All authentication attempts (success/failure)
- Authorization failures and privilege escalations
- Data access and modification events
- Administrative actions and configuration changes
- Security-relevant system events

**Log Format:**
```json
{
  "timestamp": "2024-12-17T10:30:00Z",
  "event_type": "authentication",
  "user_id": "uuid",
  "ip_address": "192.168.1.100",
  "user_agent": "BahinLink Mobile/1.0",
  "action": "login_attempt",
  "result": "success",
  "details": {
    "method": "password",
    "2fa_used": true,
    "device_trusted": false
  },
  "risk_score": 2
}
```

### 9.2 Intrusion Detection

**Anomaly Detection:**
- Unusual login patterns and locations
- Abnormal data access patterns
- Suspicious API usage
- Failed authentication clustering
- Privilege escalation attempts

**Automated Response:**
```javascript
const securityMonitor = {
  async detectAnomalies(event) {
    const riskScore = await calculateRiskScore(event);

    if (riskScore > 8) {
      await this.triggerHighRiskAlert(event);
      await this.temporaryAccountLock(event.user_id);
    } else if (riskScore > 5) {
      await this.requireAdditionalAuth(event.user_id);
      await this.notifySecurityTeam(event);
    }

    await this.logSecurityEvent(event, riskScore);
  }
};
```

### 9.3 Security Metrics and KPIs

**Security Metrics:**
- Authentication failure rate
- Account lockout frequency
- Suspicious activity detection rate
- Security incident response time
- Vulnerability remediation time
- Compliance audit results

**Alerting Thresholds:**
- Failed login attempts: >10 per minute per IP
- Account lockouts: >5 per hour system-wide
- Privilege escalation attempts: Any occurrence
- Data export requests: >3 per day per user
- API rate limit violations: >100 per hour per IP

## 10. Incident Response

### 10.1 Security Incident Classification

**Severity Levels:**

**Critical (P1):**
- Data breach or unauthorized data access
- System compromise or malware infection
- Complete service unavailability
- Successful privilege escalation

**High (P2):**
- Attempted data breach
- Partial system compromise
- Significant service degradation
- Multiple failed security controls

**Medium (P3):**
- Security policy violations
- Minor service disruptions
- Suspicious but unconfirmed activity
- Single security control failure

**Low (P4):**
- Security awareness issues
- Minor policy violations
- Informational security events

### 10.2 Incident Response Procedures

**Immediate Response (0-1 hour):**
1. Incident detection and initial assessment
2. Incident classification and severity assignment
3. Incident response team activation
4. Initial containment measures
5. Stakeholder notification (if required)

**Short-term Response (1-24 hours):**
1. Detailed incident investigation
2. Evidence collection and preservation
3. Complete containment and eradication
4. System recovery and restoration
5. Continuous monitoring for recurrence

**Long-term Response (1-30 days):**
1. Root cause analysis
2. Security control improvements
3. Process and procedure updates
4. Staff training and awareness
5. Incident documentation and lessons learned

### 10.3 Communication Plan

**Internal Communication:**
- Security team: Immediate notification
- Technical team: Within 30 minutes
- Management: Within 1 hour for P1/P2 incidents
- Legal team: Within 2 hours for data breaches

**External Communication:**
- Customers: Within 24 hours for service impact
- Regulators: Within 72 hours for GDPR breaches
- Law enforcement: As required by incident type
- Media: Through designated spokesperson only

---

**Document Approval:**
- Security Officer: [Signature Required]
- Privacy Officer: [Signature Required]
- Technical Lead: [Signature Required]
- Legal Counsel: [Signature Required]

**Next Steps:**
1. Implement security controls and measures
2. Conduct security testing and validation
3. Establish monitoring and alerting systems
4. Train staff on security procedures
5. Schedule regular security assessments
