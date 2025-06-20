# BahinLink API Documentation

## Overview

The BahinLink API is a comprehensive RESTful API for security workforce management. It provides endpoints for authentication, user management, shift scheduling, reporting, analytics, and real-time tracking.

## Base URL

```
Production: https://api.bahinlink.com
Development: http://localhost:3001/api
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Authentication Endpoints

#### POST /auth/login
Authenticate a user and receive access tokens.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "string",
  "refreshToken": "string",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "role": "ADMIN|SUPERVISOR|AGENT|CLIENT",
    "profile": {
      "firstName": "string",
      "lastName": "string",
      "phoneNumber": "string"
    }
  }
}
```

#### POST /auth/refresh
Refresh an expired access token.

**Request Body:**
```json
{
  "refreshToken": "string"
}
```

#### GET /auth/me
Get current user information.

**Response:**
```json
{
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "role": "string",
    "profile": {},
    "agent": {} // If user is an agent
  }
}
```

## User Management

### GET /users
Get list of users (Admin only).

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `role` (string): Filter by role
- `search` (string): Search by username or email

### POST /users
Create a new user (Admin only).

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "ADMIN|SUPERVISOR|AGENT|CLIENT",
  "profile": {
    "firstName": "string",
    "lastName": "string",
    "phoneNumber": "string"
  }
}
```

### PUT /users/:id
Update user information.

### DELETE /users/:id
Delete a user (Admin only).

## Agent Management

### GET /agents
Get list of agents.

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `status` (string): Filter by employment status
- `skills` (array): Filter by skills

### POST /agents
Create a new agent.

**Request Body:**
```json
{
  "userId": "string",
  "employeeId": "string",
  "employmentStatus": "ACTIVE|INACTIVE|TERMINATED",
  "employmentType": "FULL_TIME|PART_TIME|CONTRACT",
  "skills": ["string"],
  "hourlyRate": "number",
  "certifications": ["string"]
}
```

### GET /agents/:id
Get agent details.

### PUT /agents/:id
Update agent information.

## Shift Management

### GET /shifts
Get list of shifts.

**Query Parameters:**
- `startDate` (ISO date): Filter by start date
- `endDate` (ISO date): Filter by end date
- `agentId` (string): Filter by agent
- `siteId` (string): Filter by site
- `status` (string): Filter by status

### POST /shifts
Create a new shift.

**Request Body:**
```json
{
  "siteId": "string",
  "agentId": "string",
  "startTime": "ISO date",
  "endTime": "ISO date",
  "shiftType": "REGULAR|OVERTIME|EMERGENCY",
  "requirements": {
    "skills": ["string"],
    "certifications": ["string"]
  },
  "notes": "string"
}
```

### GET /shifts/:id
Get shift details.

### PUT /shifts/:id
Update shift information.

### PATCH /shifts/:id/status
Update shift status.

**Request Body:**
```json
{
  "status": "SCHEDULED|CONFIRMED|IN_PROGRESS|COMPLETED|CANCELLED",
  "metadata": {}
}
```

### GET /shifts/my-shifts
Get shifts for the authenticated agent.

### GET /shifts/current
Get current active shift for the authenticated agent.

## Attendance Management

### POST /attendance/clock-in
Clock in for a shift.

**Request Body:**
```json
{
  "shiftId": "string",
  "location": {
    "latitude": "number",
    "longitude": "number"
  }
}
```

### POST /attendance/clock-out
Clock out from a shift.

**Request Body:**
```json
{
  "attendanceId": "string",
  "location": {
    "latitude": "number",
    "longitude": "number"
  }
}
```

### GET /attendance
Get attendance records.

## Reporting

### GET /reports
Get list of reports.

**Query Parameters:**
- `startDate` (ISO date): Filter by creation date
- `endDate` (ISO date): Filter by creation date
- `reportType` (string): Filter by report type
- `status` (string): Filter by status
- `agentId` (string): Filter by agent
- `siteId` (string): Filter by site

### POST /reports
Create a new report.

**Request Body:**
```json
{
  "shiftId": "string",
  "siteId": "string",
  "reportType": "PATROL|INCIDENT|INSPECTION|MAINTENANCE|EMERGENCY",
  "title": "string",
  "content": {},
  "observations": "string",
  "incidents": [],
  "weatherConditions": "string",
  "equipmentStatus": "string",
  "priority": "LOW|NORMAL|HIGH|CRITICAL"
}
```

### GET /reports/:id
Get report details.

### PUT /reports/:id
Update report.

### POST /reports/:id/submit
Submit report for review.

### POST /reports/:id/review
Review and approve/reject report (Supervisor/Admin only).

**Request Body:**
```json
{
  "action": "APPROVE|REJECT|REQUEST_CHANGES",
  "reviewerNotes": "string",
  "clientApprovalRequired": "boolean"
}
```

### POST /reports/:id/signature
Process client signature.

**Request Body:**
```json
{
  "clientSignature": "string",
  "clientFeedback": "string",
  "clientApproval": "boolean"
}
```

### GET /reports/analytics
Get report analytics.

### GET /reports/templates
Get report templates.

## Site Management

### GET /sites
Get list of sites.

### POST /sites
Create a new site.

**Request Body:**
```json
{
  "name": "string",
  "address": "string",
  "coordinates": "string",
  "clientId": "string",
  "contactInfo": {},
  "requirements": {},
  "operatingHours": {},
  "status": "ACTIVE|INACTIVE"
}
```

### GET /sites/:id
Get site details.

### PUT /sites/:id
Update site information.

## Location Tracking

### POST /locations
Submit location update.

**Request Body:**
```json
{
  "latitude": "number",
  "longitude": "number",
  "accuracy": "number",
  "altitude": "number",
  "speed": "number",
  "heading": "number",
  "timestamp": "ISO date",
  "shiftId": "string",
  "batteryLevel": "number"
}
```

### GET /locations/agent/:agentId
Get location history for an agent.

### POST /locations/geofence/validate
Validate geofence compliance.

**Request Body:**
```json
{
  "latitude": "number",
  "longitude": "number",
  "siteId": "string"
}
```

## Analytics

### GET /analytics/operational
Get operational analytics.

**Query Parameters:**
- `startDate` (ISO date): Analysis start date
- `endDate` (ISO date): Analysis end date
- `clientId` (string): Filter by client
- `siteId` (string): Filter by site
- `includeForecasting` (boolean): Include forecasting data
- `includeBenchmarking` (boolean): Include benchmarking data

### GET /analytics/performance
Get performance analytics.

### GET /analytics/financial
Get financial analytics (Admin/Supervisor only).

### GET /analytics/trends
Get trend analysis.

### GET /analytics/dashboard
Get analytics dashboard data.

## Scheduling

### GET /scheduling/conflicts
Get scheduling conflicts.

### POST /scheduling/generate
Generate optimal schedule.

**Request Body:**
```json
{
  "startDate": "ISO date",
  "endDate": "ISO date",
  "constraints": {},
  "preferences": {},
  "optimization": "COST|COVERAGE|SATISFACTION"
}
```

### POST /scheduling/auto-assign
Auto-assign agents to shifts.

### GET /scheduling/analytics/workforce
Get workforce analytics.

### GET /scheduling/recommendations
Get scheduling recommendations.

## Workforce Management

### GET /workforce/capacity
Get workforce capacity analysis.

### POST /workforce/allocation/optimize
Optimize workforce allocation.

### GET /workforce/forecast
Get workforce demand forecast.

### GET /workforce/performance
Get workforce performance insights.

### GET /workforce/dashboard
Get workforce management dashboard.

## Mobile API

### GET /mobile/dashboard
Get mobile-optimized dashboard data.

### GET /mobile/shifts/current
Get current shift for mobile app.

### GET /mobile/shifts/my-shifts
Get agent shifts for mobile app.

### GET /mobile/reports/templates
Get mobile-optimized report templates.

### POST /mobile/sync
Sync offline data.

**Request Body:**
```json
{
  "locationUpdates": [],
  "reports": [],
  "attendance": [],
  "lastSyncTime": "ISO date"
}
```

## Client Portal

### GET /clients/dashboard
Get client dashboard data.

### GET /clients/realtime-status
Get real-time status updates.

### GET /clients/sites
Get client sites.

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE",
  "details": "Additional error details"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `500` - Internal Server Error

## Rate Limiting

API requests are rate limited:
- 1000 requests per hour for authenticated users
- 100 requests per hour for unauthenticated requests

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)

**Response:**
```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## WebSocket Events

Real-time events are available via WebSocket connection at `/socket.io`.

### Events

- `shift_update` - Shift status changes
- `report_update` - Report status changes
- `location_update` - Agent location updates
- `notification` - New notifications
- `dashboard_update` - Dashboard data updates

### Authentication

WebSocket connections require authentication:
```javascript
const socket = io('ws://localhost:3001', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

## SDKs and Libraries

Official SDKs are available for:
- JavaScript/Node.js
- React Native
- Python
- PHP

## Support

For API support, contact:
- Email: api-support@bahinlink.com
- Documentation: https://docs.bahinlink.com
- Status Page: https://status.bahinlink.com
