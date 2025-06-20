# Database Schema Design: BahinLink

**Version:** 1.0  
**Date:** December 17, 2024  
**Document Type:** Database Schema Design  
**Project:** BahinLink Workforce Management Solution  

## Table of Contents

1. [Database Overview](#1-database-overview)
2. [Entity Relationship Diagram](#2-entity-relationship-diagram)
3. [Core Tables](#3-core-tables)
4. [Operational Tables](#4-operational-tables)
5. [Audit and Logging Tables](#5-audit-and-logging-tables)
6. [Indexes and Performance](#6-indexes-and-performance)
7. [Data Migration Plan](#7-data-migration-plan)
8. [Backup and Recovery](#8-backup-and-recovery)

## 1. Database Overview

### 1.1 Database Technology

**Primary Database:** PostgreSQL 14+  
**Rationale:** 
- ACID compliance for data integrity
- JSON/JSONB support for flexible data structures
- PostGIS extension for geospatial operations
- Excellent performance and scalability
- Strong community support and ecosystem

### 1.2 Database Design Principles

- **Normalization**: 3NF with selective denormalization for performance
- **Data Integrity**: Foreign key constraints and check constraints
- **Audit Trail**: Complete audit logging for all critical operations
- **Soft Deletes**: Logical deletion for data recovery and compliance
- **Timestamps**: Created/updated timestamps on all tables
- **UUID Primary Keys**: For security and distributed system compatibility

### 1.3 Naming Conventions

- **Tables**: Snake_case, plural nouns (e.g., `users`, `shift_assignments`)
- **Columns**: Snake_case (e.g., `first_name`, `created_at`)
- **Indexes**: `idx_tablename_columnname` or `idx_tablename_purpose`
- **Foreign Keys**: `fk_tablename_referenced_table`
- **Constraints**: `chk_tablename_constraint_name`

## 2. Entity Relationship Diagram

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    Users    │    │   Clients   │    │    Sites    │
│             │    │             │    │             │
│ id (PK)     │    │ id (PK)     │    │ id (PK)     │
│ username    │    │ company_name│    │ client_id   │
│ role        │    │ contact_info│    │ name        │
│ profile     │    │ settings    │    │ address     │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       │                  └──────────────────┘
       │
┌──────┴──────┐    ┌─────────────┐    ┌─────────────┐
│   Agents    │    │   Shifts    │    │  Reports    │
│             │    │             │    │             │
│ user_id(FK) │    │ id (PK)     │    │ id (PK)     │
│ employee_id │    │ site_id(FK) │    │ shift_id(FK)│
│ skills      │    │ agent_id(FK)│    │ type        │
│ certs       │    │ start_time  │    │ content     │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       └──────────────────┘                  │
                                             │
┌─────────────┐    ┌─────────────┐    ┌──────┴──────┐
│ Attendance  │    │ Locations   │    │ Media Files │
│             │    │             │    │             │
│ id (PK)     │    │ id (PK)     │    │ id (PK)     │
│ shift_id(FK)│    │ agent_id(FK)│    │ report_id   │
│ clock_in    │    │ coordinates │    │ file_path   │
│ clock_out   │    │ timestamp   │    │ file_type   │
└─────────────┘    └─────────────┘    └─────────────┘
```

## 3. Core Tables

### 3.1 Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    status user_status DEFAULT 'active',
    profile JSONB NOT NULL DEFAULT '{}',
    preferences JSONB NOT NULL DEFAULT '{}',
    last_login_at TIMESTAMP WITH TIME ZONE,
    password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'agent', 'client');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending');
```

### 3.2 Agents Table

```sql
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    hire_date DATE NOT NULL,
    employment_status agent_status DEFAULT 'active',
    skills TEXT[] DEFAULT '{}',
    certifications JSONB DEFAULT '[]',
    emergency_contact JSONB,
    performance_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TYPE agent_status AS ENUM ('active', 'inactive', 'on_leave', 'terminated');
```

### 3.3 Clients Table

```sql
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    contact_person JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    contract_details JSONB,
    service_level VARCHAR(50) DEFAULT 'standard',
    status client_status DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TYPE client_status AS ENUM ('active', 'inactive', 'suspended', 'terminated');
```

### 3.4 Sites Table

```sql
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    name VARCHAR(255) NOT NULL,
    address JSONB NOT NULL,
    coordinates POINT NOT NULL,
    geofence_radius INTEGER DEFAULT 100, -- meters
    geofence_coordinates POLYGON,
    qr_code VARCHAR(255) UNIQUE,
    site_type VARCHAR(50) DEFAULT 'commercial',
    access_instructions TEXT,
    emergency_contacts JSONB DEFAULT '[]',
    equipment_list JSONB DEFAULT '[]',
    status site_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TYPE site_status AS ENUM ('active', 'inactive', 'maintenance', 'closed');
```

## 4. Operational Tables

### 4.1 Shifts Table

```sql
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id),
    agent_id UUID REFERENCES agents(id),
    supervisor_id UUID REFERENCES users(id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    shift_type shift_type DEFAULT 'regular',
    status shift_status DEFAULT 'scheduled',
    requirements JSONB DEFAULT '{}',
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TYPE shift_type AS ENUM ('regular', 'overtime', 'emergency', 'training');
CREATE TYPE shift_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
```

### 4.2 Attendance Table

```sql
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id),
    agent_id UUID NOT NULL REFERENCES agents(id),
    clock_in_time TIMESTAMP WITH TIME ZONE,
    clock_out_time TIMESTAMP WITH TIME ZONE,
    clock_in_location POINT,
    clock_out_location POINT,
    clock_in_method attendance_method,
    clock_out_method attendance_method,
    qr_code_scanned VARCHAR(255),
    total_hours DECIMAL(5,2),
    overtime_hours DECIMAL(5,2) DEFAULT 0,
    break_duration INTEGER DEFAULT 0, -- minutes
    status attendance_status DEFAULT 'clocked_in',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TYPE attendance_method AS ENUM ('gps', 'qr_code', 'manual', 'nfc');
CREATE TYPE attendance_status AS ENUM ('clocked_in', 'on_break', 'clocked_out', 'incomplete');
```

### 4.3 Location Tracking Table

```sql
CREATE TABLE location_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id),
    shift_id UUID REFERENCES shifts(id),
    coordinates POINT NOT NULL,
    accuracy DECIMAL(8,2),
    altitude DECIMAL(10,2),
    speed DECIMAL(8,2),
    heading DECIMAL(5,2),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    battery_level INTEGER,
    is_mock_location BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4.4 Reports Table

```sql
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES shifts(id),
    site_id UUID NOT NULL REFERENCES sites(id),
    agent_id UUID NOT NULL REFERENCES agents(id),
    report_type report_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    content JSONB NOT NULL,
    observations TEXT,
    incidents JSONB DEFAULT '[]',
    weather_conditions VARCHAR(100),
    equipment_status TEXT,
    status report_status DEFAULT 'draft',
    submitted_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_notes TEXT,
    client_signature JSONB,
    requires_followup BOOLEAN DEFAULT FALSE,
    priority report_priority DEFAULT 'normal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TYPE report_type AS ENUM ('patrol', 'incident', 'inspection', 'maintenance', 'emergency');
CREATE TYPE report_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'archived');
CREATE TYPE report_priority AS ENUM ('low', 'normal', 'high', 'critical');
```

### 4.5 Media Files Table

```sql
CREATE TABLE media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id),
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_type media_type NOT NULL,
    description TEXT,
    location POINT,
    timestamp TIMESTAMP WITH TIME ZONE,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TYPE media_type AS ENUM ('image', 'video', 'audio', 'document');
```

## 5. Audit and Logging Tables

### 5.1 Audit Log Table

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 5.2 Notifications Table

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES users(id),
    sender_id UUID REFERENCES users(id),
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    channels notification_channel[] DEFAULT '{}',
    status notification_status DEFAULT 'pending',
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TYPE notification_type AS ENUM ('info', 'warning', 'urgent', 'emergency', 'system');
CREATE TYPE notification_channel AS ENUM ('push', 'email', 'sms', 'in_app');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'read');
```

### 5.3 Messages Table

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id),
    recipient_id UUID NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    message_type message_type DEFAULT 'text',
    media_id UUID REFERENCES media_files(id),
    priority message_priority DEFAULT 'normal',
    status message_status DEFAULT 'sent',
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'location', 'file');
CREATE TYPE message_priority AS ENUM ('normal', 'high', 'urgent');
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read', 'failed');
```

### 5.4 Client Requests Table

```sql
CREATE TABLE client_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    site_id UUID NOT NULL REFERENCES sites(id),
    request_type request_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority request_priority DEFAULT 'medium',
    status request_status DEFAULT 'open',
    contact_person JSONB NOT NULL,
    preferred_response_time TIMESTAMP WITH TIME ZONE,
    assigned_to UUID REFERENCES users(id),
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TYPE request_type AS ENUM ('additional_patrol', 'emergency_response', 'maintenance', 'consultation', 'other');
CREATE TYPE request_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE request_status AS ENUM ('open', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled');
```

## 6. Indexes and Performance

### 6.1 Primary Indexes

```sql
-- Users table indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- Agents table indexes
CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_employee_id ON agents(employee_id);
CREATE INDEX idx_agents_status ON agents(employment_status);

-- Shifts table indexes
CREATE INDEX idx_shifts_site_id ON shifts(site_id);
CREATE INDEX idx_shifts_agent_id ON shifts(agent_id);
CREATE INDEX idx_shifts_start_time ON shifts(start_time);
CREATE INDEX idx_shifts_status ON shifts(status);
CREATE INDEX idx_shifts_date_range ON shifts(start_time, end_time);

-- Location tracking indexes
CREATE INDEX idx_location_agent_id ON location_tracking(agent_id);
CREATE INDEX idx_location_timestamp ON location_tracking(timestamp);
CREATE INDEX idx_location_shift_id ON location_tracking(shift_id);
CREATE INDEX idx_location_coordinates ON location_tracking USING GIST(coordinates);

-- Reports table indexes
CREATE INDEX idx_reports_shift_id ON reports(shift_id);
CREATE INDEX idx_reports_agent_id ON reports(agent_id);
CREATE INDEX idx_reports_site_id ON reports(site_id);
CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_submitted_at ON reports(submitted_at);
```

### 6.2 Composite Indexes

```sql
-- Performance optimization indexes
CREATE INDEX idx_shifts_agent_date ON shifts(agent_id, start_time);
CREATE INDEX idx_attendance_shift_agent ON attendance(shift_id, agent_id);
CREATE INDEX idx_location_agent_time ON location_tracking(agent_id, timestamp);
CREATE INDEX idx_reports_site_date ON reports(site_id, created_at);
CREATE INDEX idx_notifications_recipient_status ON notifications(recipient_id, status);
```

### 6.3 Geospatial Indexes

```sql
-- PostGIS extension for geospatial operations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Geospatial indexes
CREATE INDEX idx_sites_coordinates ON sites USING GIST(coordinates);
CREATE INDEX idx_sites_geofence ON sites USING GIST(geofence_coordinates);
CREATE INDEX idx_attendance_clock_in_location ON attendance USING GIST(clock_in_location);
CREATE INDEX idx_attendance_clock_out_location ON attendance USING GIST(clock_out_location);
```

## 7. Data Migration Plan

### 7.1 Migration Strategy

**Phase 1: Core Schema Setup**
1. Create database and enable extensions
2. Create custom types (ENUMs)
3. Create core tables (users, clients, sites)
4. Set up basic indexes and constraints

**Phase 2: Operational Tables**
1. Create agents and shifts tables
2. Create attendance and location tracking
3. Create reports and media files tables
4. Set up foreign key constraints

**Phase 3: Communication & Audit**
1. Create notifications and messages tables
2. Create audit logs and client requests
3. Set up performance indexes
4. Create database functions and triggers

### 7.2 Migration Scripts

```sql
-- Migration script template
BEGIN;

-- Version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(20) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migration content here
-- ...

-- Record migration
INSERT INTO schema_migrations (version) VALUES ('001_initial_schema');

COMMIT;
```

### 7.3 Data Seeding

```sql
-- Default admin user
INSERT INTO users (username, email, password_hash, role, profile) VALUES
('admin', 'admin@bahinlink.com', '$2b$12$...', 'admin',
 '{"first_name": "System", "last_name": "Administrator"}');

-- Default system settings
-- Sample data for development/testing
```

## 8. Backup and Recovery

### 8.1 Backup Strategy

**Daily Backups:**
- Full database backup at 2 AM UTC
- Transaction log backup every 15 minutes
- Retention: 30 days for daily, 7 days for transaction logs

**Weekly Backups:**
- Full backup with compression
- Retention: 12 weeks

**Monthly Backups:**
- Archive backup for long-term storage
- Retention: 7 years (compliance requirement)

### 8.2 Recovery Procedures

**Point-in-Time Recovery:**
```bash
# Restore from backup
pg_restore -d bahinlink_recovery backup_file.dump

# Apply transaction logs for point-in-time recovery
pg_waldump wal_files/
```

**Disaster Recovery:**
- RTO (Recovery Time Objective): 4 hours
- RPO (Recovery Point Objective): 15 minutes
- Automated failover to standby database
- Geographic backup replication

---

**Document Approval:**
- Database Administrator: [Signature Required]
- Backend Lead: [Signature Required]
- Security Officer: [Signature Required]

**Next Steps:**
1. Review and approve database schema
2. Set up development database environment
3. Create migration scripts
4. Implement backup procedures
