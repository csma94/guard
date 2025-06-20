# API Specification Document: BahinLink

**Version:** 1.0  
**Date:** December 17, 2024  
**Document Type:** API Specification  
**Project:** BahinLink Workforce Management Solution  

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Authentication](#2-authentication)
3. [Common Patterns](#3-common-patterns)
4. [User Management APIs](#4-user-management-apis)
5. [Location & Tracking APIs](#5-location--tracking-apis)
6. [Scheduling APIs](#6-scheduling-apis)
7. [Reporting APIs](#7-reporting-apis)
8. [Communication APIs](#8-communication-apis)
9. [Client Portal APIs](#9-client-portal-apis)
10. [Error Handling](#10-error-handling)

## 1. API Overview

### 1.1 Base Information

**Base URL:** `https://api.bahinlink.com/v1`  
**Protocol:** HTTPS only  
**Content Type:** `application/json`  
**Authentication:** JWT Bearer tokens  

### 1.2 API Design Principles

- **RESTful Design**: Standard HTTP methods and status codes
- **Consistent Naming**: Snake_case for JSON fields, kebab-case for URLs
- **Versioning**: URL-based versioning (/v1/, /v2/)
- **Pagination**: Cursor-based pagination for large datasets
- **Rate Limiting**: 1000 requests per hour per user
- **Idempotency**: POST/PUT operations support idempotency keys

### 1.3 Common HTTP Status Codes

- `200 OK`: Successful GET, PUT, PATCH
- `201 Created`: Successful POST
- `204 No Content`: Successful DELETE
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict
- `422 Unprocessable Entity`: Validation errors
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

## 2. Authentication

### 2.1 Authentication Flow

**Login Endpoint:**
```http
POST /auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string",
  "device_id": "string",
  "device_type": "android|web"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 1800,
  "user": {
    "id": "uuid",
    "username": "string",
    "role": "admin|supervisor|agent|client",
    "profile": {
      "first_name": "string",
      "last_name": "string",
      "email": "string",
      "phone": "string"
    }
  }
}
```

### 2.2 Token Refresh

**Refresh Token Endpoint:**
```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "string"
}
```

### 2.3 Two-Factor Authentication

**Enable 2FA:**
```http
POST /auth/2fa/enable
Authorization: Bearer {access_token}

{
  "method": "sms|email",
  "contact": "string"
}
```

**Verify 2FA:**
```http
POST /auth/2fa/verify
Authorization: Bearer {access_token}

{
  "code": "string",
  "remember_device": boolean
}
```

### 2.4 Authorization Headers

All authenticated requests must include:
```http
Authorization: Bearer {access_token}
```

## 3. Common Patterns

### 3.1 Pagination

**Request Parameters:**
- `limit`: Number of items per page (default: 20, max: 100)
- `cursor`: Pagination cursor for next page

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "has_next": boolean,
    "next_cursor": "string|null",
    "total_count": integer
  }
}
```

### 3.2 Filtering and Sorting

**Query Parameters:**
- `filter[field]`: Filter by field value
- `sort`: Sort field (prefix with `-` for descending)
- `search`: Full-text search query

**Example:**
```http
GET /users?filter[role]=agent&sort=-created_at&search=john&limit=10
```

### 3.3 Error Response Format

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {
      "field_errors": {
        "field_name": ["error message"]
      }
    },
    "request_id": "uuid"
  }
}
```

## 4. User Management APIs

### 4.1 User CRUD Operations

**Get Current User:**
```http
GET /users/me
Authorization: Bearer {access_token}
```

**Update User Profile:**
```http
PATCH /users/me
Authorization: Bearer {access_token}

{
  "first_name": "string",
  "last_name": "string",
  "email": "string",
  "phone": "string",
  "preferences": {
    "notifications": {
      "push_enabled": boolean,
      "email_enabled": boolean,
      "sms_enabled": boolean
    },
    "language": "en|fr",
    "timezone": "string"
  }
}
```

**List Users (Admin/Supervisor only):**
```http
GET /users
Authorization: Bearer {access_token}
```

**Create User (Admin only):**
```http
POST /users
Authorization: Bearer {access_token}

{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "admin|supervisor|agent|client",
  "profile": {
    "first_name": "string",
    "last_name": "string",
    "phone": "string"
  },
  "agent_details": {
    "employee_id": "string",
    "certifications": ["string"],
    "skills": ["string"],
    "hire_date": "date"
  }
}
```

### 4.2 Agent Management

**Get Agent Details:**
```http
GET /agents/{agent_id}
Authorization: Bearer {access_token}
```

**Update Agent Status:**
```http
PATCH /agents/{agent_id}/status
Authorization: Bearer {access_token}

{
  "status": "active|inactive|on_leave",
  "reason": "string",
  "effective_date": "datetime"
}
```

**Get Agent Performance:**
```http
GET /agents/{agent_id}/performance
Authorization: Bearer {access_token}
```

## 5. Location & Tracking APIs

### 5.1 Location Updates

**Submit Location Update:**
```http
POST /locations
Authorization: Bearer {access_token}

{
  "latitude": number,
  "longitude": number,
  "accuracy": number,
  "timestamp": "datetime",
  "battery_level": number,
  "is_mock_location": boolean
}
```

**Get Agent Locations (Supervisor/Admin):**
```http
GET /locations/agents
Authorization: Bearer {access_token}
```

### 5.2 Geofencing

**Get Site Geofences:**
```http
GET /sites/{site_id}/geofences
Authorization: Bearer {access_token}
```

**Check Geofence Status:**
```http
POST /geofences/check
Authorization: Bearer {access_token}

{
  "latitude": number,
  "longitude": number,
  "site_id": "uuid"
}
```

### 5.3 Clock In/Out

**Clock In:**
```http
POST /attendance/clock-in
Authorization: Bearer {access_token}

{
  "shift_id": "uuid",
  "location": {
    "latitude": number,
    "longitude": number,
    "accuracy": number
  },
  "qr_code": "string",
  "timestamp": "datetime"
}
```

**Clock Out:**
```http
POST /attendance/clock-out
Authorization: Bearer {access_token}

{
  "shift_id": "uuid",
  "location": {
    "latitude": number,
    "longitude": number,
    "accuracy": number
  },
  "timestamp": "datetime"
}
```

## 6. Scheduling APIs

### 6.1 Shift Management

**Get Agent Schedule:**
```http
GET /schedules/me
Authorization: Bearer {access_token}
```

**Get All Schedules (Admin/Supervisor):**
```http
GET /schedules
Authorization: Bearer {access_token}
```

**Create Shift (Admin/Supervisor):**
```http
POST /shifts
Authorization: Bearer {access_token}

{
  "site_id": "uuid",
  "agent_id": "uuid",
  "start_time": "datetime",
  "end_time": "datetime",
  "shift_type": "regular|overtime|emergency",
  "requirements": {
    "skills": ["string"],
    "certifications": ["string"]
  },
  "notes": "string"
}
```

**Update Shift:**
```http
PATCH /shifts/{shift_id}
Authorization: Bearer {access_token}

{
  "start_time": "datetime",
  "end_time": "datetime",
  "agent_id": "uuid",
  "status": "scheduled|confirmed|cancelled",
  "notes": "string"
}
```

### 6.2 Shift Assignments

**Accept Shift Assignment:**
```http
POST /shifts/{shift_id}/accept
Authorization: Bearer {access_token}

{
  "confirmation_notes": "string"
}
```

**Request Shift Change:**
```http
POST /shifts/{shift_id}/change-request
Authorization: Bearer {access_token}

{
  "reason": "string",
  "proposed_agent_id": "uuid",
  "notes": "string"
}
```

## 7. Reporting APIs

### 7.1 Report Creation

**Create Patrol Report:**
```http
POST /reports/patrol
Authorization: Bearer {access_token}

{
  "shift_id": "uuid",
  "site_id": "uuid",
  "report_type": "patrol|incident|inspection",
  "timestamp": "datetime",
  "observations": "string",
  "incidents": [
    {
      "type": "security|maintenance|safety|other",
      "description": "string",
      "severity": "low|medium|high|critical",
      "location": {
        "latitude": number,
        "longitude": number,
        "description": "string"
      }
    }
  ],
  "media_files": ["uuid"],
  "weather_conditions": "string",
  "equipment_status": "string"
}
```

**Create Incident Report:**
```http
POST /reports/incident
Authorization: Bearer {access_token}

{
  "shift_id": "uuid",
  "site_id": "uuid",
  "incident_type": "theft|vandalism|trespassing|emergency|other",
  "severity": "low|medium|high|critical",
  "description": "string",
  "location": {
    "latitude": number,
    "longitude": number,
    "description": "string"
  },
  "timestamp": "datetime",
  "people_involved": [
    {
      "name": "string",
      "role": "witness|suspect|victim|other",
      "contact": "string",
      "description": "string"
    }
  ],
  "actions_taken": "string",
  "media_files": ["uuid"],
  "requires_followup": boolean,
  "police_notified": boolean,
  "client_notified": boolean
}
```

### 7.2 Report Management

**Get Reports:**
```http
GET /reports
Authorization: Bearer {access_token}
```

**Get Report Details:**
```http
GET /reports/{report_id}
Authorization: Bearer {access_token}
```

**Update Report Status (Supervisor/Admin):**
```http
PATCH /reports/{report_id}/status
Authorization: Bearer {access_token}

{
  "status": "draft|submitted|under_review|approved|rejected",
  "reviewer_notes": "string",
  "client_signature": {
    "signature_data": "base64_string",
    "signed_by": "string",
    "signed_at": "datetime"
  }
}
```

### 7.3 Media Management

**Upload Media File:**
```http
POST /media/upload
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

{
  "file": "binary",
  "type": "image|video|document",
  "description": "string",
  "location": {
    "latitude": number,
    "longitude": number
  },
  "timestamp": "datetime"
}
```

**Get Media File:**
```http
GET /media/{media_id}
Authorization: Bearer {access_token}
```

## 8. Communication APIs

### 8.1 Notifications

**Get Notifications:**
```http
GET /notifications
Authorization: Bearer {access_token}
```

**Mark Notification as Read:**
```http
PATCH /notifications/{notification_id}/read
Authorization: Bearer {access_token}
```

**Send Notification (Admin/Supervisor):**
```http
POST /notifications
Authorization: Bearer {access_token}

{
  "recipients": ["uuid"],
  "type": "info|warning|urgent|emergency",
  "title": "string",
  "message": "string",
  "channels": ["push", "email", "sms"],
  "scheduled_at": "datetime"
}
```

### 8.2 Messaging

**Send Message:**
```http
POST /messages
Authorization: Bearer {access_token}

{
  "recipient_id": "uuid",
  "message": "string",
  "type": "text|image|location",
  "media_id": "uuid",
  "priority": "normal|high|urgent"
}
```

**Get Message History:**
```http
GET /messages/conversations/{user_id}
Authorization: Bearer {access_token}
```

### 8.3 Emergency Alerts

**Send SOS Alert:**
```http
POST /emergency/sos
Authorization: Bearer {access_token}

{
  "location": {
    "latitude": number,
    "longitude": number,
    "accuracy": number
  },
  "emergency_type": "medical|security|fire|other",
  "description": "string",
  "timestamp": "datetime"
}
```

## 9. Client Portal APIs

### 9.1 Client Dashboard

**Get Client Sites:**
```http
GET /client/sites
Authorization: Bearer {access_token}
```

**Get Site Status:**
```http
GET /client/sites/{site_id}/status
Authorization: Bearer {access_token}
```

**Get Site Reports:**
```http
GET /client/sites/{site_id}/reports
Authorization: Bearer {access_token}
```

### 9.2 Client Requests

**Submit Service Request:**
```http
POST /client/requests
Authorization: Bearer {access_token}

{
  "site_id": "uuid",
  "request_type": "additional_patrol|emergency_response|maintenance|other",
  "priority": "low|medium|high|urgent",
  "description": "string",
  "preferred_response_time": "datetime",
  "contact_person": {
    "name": "string",
    "phone": "string",
    "email": "string"
  }
}
```

**Report Client Incident:**
```http
POST /client/incidents
Authorization: Bearer {access_token}

{
  "site_id": "uuid",
  "incident_type": "security|maintenance|safety|other",
  "description": "string",
  "location": "string",
  "timestamp": "datetime",
  "urgency": "low|medium|high|critical",
  "contact_person": {
    "name": "string",
    "phone": "string"
  }
}
```

## 10. Error Handling

### 10.1 Standard Error Codes

**Authentication Errors:**
- `AUTH_001`: Invalid credentials
- `AUTH_002`: Token expired
- `AUTH_003`: Token invalid
- `AUTH_004`: 2FA required
- `AUTH_005`: Account locked

**Authorization Errors:**
- `AUTHZ_001`: Insufficient permissions
- `AUTHZ_002`: Resource access denied
- `AUTHZ_003`: Role not authorized

**Validation Errors:**
- `VAL_001`: Required field missing
- `VAL_002`: Invalid field format
- `VAL_003`: Field value out of range
- `VAL_004`: Duplicate value

**Business Logic Errors:**
- `BIZ_001`: Shift overlap detected
- `BIZ_002`: Agent not available
- `BIZ_003`: Geofence violation
- `BIZ_004`: Report already submitted

### 10.2 Rate Limiting

**Headers:**
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

**Rate Limit Exceeded Response:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "retry_after": 3600
  }
}
```

---

**Document Approval:**
- Backend Lead: [Signature Required]
- Mobile Lead: [Signature Required]
- QA Lead: [Signature Required]

**Next Steps:**
1. Review and approve API specification
2. Generate API documentation with examples
3. Set up API testing framework
4. Begin backend implementation
