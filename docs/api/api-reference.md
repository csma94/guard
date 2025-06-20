# BahinLink API Reference

## Overview

The BahinLink API is a RESTful API that provides programmatic access to all platform features. This documentation covers authentication, endpoints, request/response formats, and integration examples.

## Base URL
```
Production: https://api.bahinlink.com/api
Staging: https://staging-api.bahinlink.com/api
```

## Authentication

### JWT Token Authentication
All API requests require authentication using JWT tokens in the Authorization header:

```http
Authorization: Bearer <your-jwt-token>
```

### Getting an Access Token
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600,
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "role": "ADMIN"
    }
  }
}
```

### Token Refresh
```http
POST /auth/refresh
Authorization: Bearer <refresh-token>
```

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **Standard endpoints**: 100 requests per 15 minutes
- **Authentication endpoints**: 5 requests per minute
- **File upload endpoints**: 10 requests per minute

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Response Format

All API responses follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully",
  "timestamp": "2023-12-07T10:30:00Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "issue": "Invalid email format"
    }
  },
  "timestamp": "2023-12-07T10:30:00Z"
}
```

## Pagination

List endpoints support pagination using query parameters:

```http
GET /agents?page=1&limit=20&sort=createdAt&order=desc
```

**Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `sort`: Sort field (default: createdAt)
- `order`: Sort order (asc/desc, default: desc)

**Response:**
```json
{
  "success": true,
  "data": {
    "agents": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

## Endpoints

### Authentication

#### Login
```http
POST /auth/login
```
Authenticate user and receive access token.

#### Logout
```http
POST /auth/logout
Authorization: Bearer <token>
```
Invalidate current session.

#### Register
```http
POST /auth/register
```
Create new user account.

### Users

#### Get Users
```http
GET /users
Authorization: Bearer <token>
```
Retrieve list of users with pagination.

**Query Parameters:**
- `role`: Filter by user role
- `status`: Filter by user status
- `search`: Search by name or email

#### Get User
```http
GET /users/{id}
Authorization: Bearer <token>
```
Retrieve specific user details.

#### Create User
```http
POST /users
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newuser@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "AGENT",
  "phone": "+1234567890"
}
```

#### Update User
```http
PATCH /users/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Updated Name",
  "status": "ACTIVE"
}
```

#### Delete User
```http
DELETE /users/{id}
Authorization: Bearer <token>
```

### Agents

#### Get Agents
```http
GET /agents
Authorization: Bearer <token>
```

**Query Parameters:**
- `status`: Filter by agent status
- `siteId`: Filter by assigned site
- `certifications`: Filter by certifications

#### Get Agent
```http
GET /agents/{id}
Authorization: Bearer <token>
```

#### Create Agent
```http
POST /agents
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user-id",
  "employeeId": "EMP001",
  "hireDate": "2023-01-15",
  "certifications": ["Security License", "First Aid"],
  "emergencyContact": {
    "name": "Jane Doe",
    "phone": "+1234567890",
    "relationship": "Spouse"
  }
}
```

#### Update Agent
```http
PATCH /agents/{id}
Authorization: Bearer <token>
```

### Clients

#### Get Clients
```http
GET /clients
Authorization: Bearer <token>
```

#### Create Client
```http
POST /clients
Authorization: Bearer <token>
Content-Type: application/json

{
  "companyName": "Acme Corporation",
  "contactEmail": "contact@acme.com",
  "contactPhone": "+1234567890",
  "billingAddress": {
    "street": "123 Business St",
    "city": "Business City",
    "state": "BC",
    "zipCode": "12345",
    "country": "US"
  }
}
```

### Sites

#### Get Sites
```http
GET /sites
Authorization: Bearer <token>
```

**Query Parameters:**
- `clientId`: Filter by client
- `status`: Filter by site status
- `securityLevel`: Filter by security level

#### Create Site
```http
POST /sites
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Corporate Headquarters",
  "clientId": "client-id",
  "address": {
    "street": "456 Corporate Blvd",
    "city": "Corporate City",
    "state": "CC",
    "zipCode": "67890",
    "country": "US"
  },
  "siteType": "commercial",
  "securityLevel": "HIGH",
  "coordinates": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

### Shifts

#### Get Shifts
```http
GET /shifts
Authorization: Bearer <token>
```

**Query Parameters:**
- `agentId`: Filter by agent
- `siteId`: Filter by site
- `status`: Filter by shift status
- `startDate`: Filter by start date
- `endDate`: Filter by end date

#### Create Shift
```http
POST /shifts
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentId": "agent-id",
  "siteId": "site-id",
  "startTime": "2023-12-07T08:00:00Z",
  "endTime": "2023-12-07T16:00:00Z",
  "shiftType": "REGULAR",
  "instructions": "Standard patrol duties"
}
```

#### Start Shift
```http
POST /shifts/{id}/start
Authorization: Bearer <token>
```

#### End Shift
```http
POST /shifts/{id}/end
Authorization: Bearer <token>
```

### Incidents

#### Get Incidents
```http
GET /incidents
Authorization: Bearer <token>
```

**Query Parameters:**
- `status`: Filter by incident status
- `severity`: Filter by severity level
- `type`: Filter by incident type
- `siteId`: Filter by site
- `assignedTo`: Filter by assigned agent

#### Create Incident
```http
POST /incidents
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "SECURITY_BREACH",
  "severity": "HIGH",
  "title": "Unauthorized Access Attempt",
  "description": "Individual attempted to access restricted area",
  "location": "North entrance",
  "siteId": "site-id",
  "coordinates": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

#### Update Incident
```http
PATCH /incidents/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "IN_PROGRESS",
  "assignedTo": "agent-id",
  "notes": "Agent dispatched to location"
}
```

### Reports

#### Get Reports
```http
GET /reports
Authorization: Bearer <token>
```

#### Create Report
```http
POST /reports
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "PATROL",
  "title": "Evening Patrol Report",
  "description": "Completed routine patrol of premises",
  "siteId": "site-id",
  "location": "Main building",
  "findings": "No issues observed",
  "recommendations": "Continue regular patrols"
}
```

### Analytics

#### Dashboard Stats
```http
GET /analytics/dashboard
Authorization: Bearer <token>
```

**Query Parameters:**
- `startDate`: Start date for metrics
- `endDate`: End date for metrics

#### Site Analytics
```http
GET /analytics/sites/{id}
Authorization: Bearer <token>
```

#### Agent Performance
```http
GET /analytics/agents/{id}
Authorization: Bearer <token>
```

### Notifications

#### Get Notifications
```http
GET /notifications
Authorization: Bearer <token>
```

#### Mark as Read
```http
PATCH /notifications/{id}/read
Authorization: Bearer <token>
```

#### Send Notification
```http
POST /notifications
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "SECURITY",
  "priority": "HIGH",
  "title": "Security Alert",
  "message": "Immediate attention required",
  "recipientId": "user-id",
  "channels": ["IN_APP", "EMAIL", "SMS"]
}
```

## Webhooks

### Webhook Events
BahinLink can send webhook notifications for various events:

- `incident.created`
- `incident.updated`
- `shift.started`
- `shift.ended`
- `agent.checkin`
- `emergency.triggered`

### Webhook Payload
```json
{
  "event": "incident.created",
  "timestamp": "2023-12-07T10:30:00Z",
  "data": {
    "id": "incident-id",
    "type": "SECURITY_BREACH",
    "severity": "HIGH",
    "siteId": "site-id",
    "createdAt": "2023-12-07T10:30:00Z"
  }
}
```

### Webhook Configuration
```http
POST /webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://your-app.com/webhooks/bahinlink",
  "events": ["incident.created", "shift.started"],
  "secret": "your-webhook-secret"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `AUTHENTICATION_REQUIRED` | Missing or invalid authentication |
| `AUTHORIZATION_FAILED` | Insufficient permissions |
| `VALIDATION_ERROR` | Invalid request data |
| `RESOURCE_NOT_FOUND` | Requested resource doesn't exist |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `INTERNAL_SERVER_ERROR` | Server error |

## SDKs and Libraries

### JavaScript/Node.js
```bash
npm install @bahinlink/api-client
```

```javascript
import { BahinLinkClient } from '@bahinlink/api-client';

const client = new BahinLinkClient({
  apiKey: 'your-api-key',
  baseURL: 'https://api.bahinlink.com/api'
});

// Get agents
const agents = await client.agents.list();

// Create incident
const incident = await client.incidents.create({
  type: 'SECURITY_BREACH',
  severity: 'HIGH',
  title: 'Security Alert',
  siteId: 'site-id'
});
```

### Python
```bash
pip install bahinlink-api
```

```python
from bahinlink import BahinLinkClient

client = BahinLinkClient(
    api_key='your-api-key',
    base_url='https://api.bahinlink.com/api'
)

# Get agents
agents = client.agents.list()

# Create incident
incident = client.incidents.create({
    'type': 'SECURITY_BREACH',
    'severity': 'HIGH',
    'title': 'Security Alert',
    'site_id': 'site-id'
})
```

## Testing

### Postman Collection
Download our Postman collection for easy API testing:
[BahinLink API Collection](https://api.bahinlink.com/postman/collection.json)

### Test Environment
Use our sandbox environment for testing:
```
Base URL: https://sandbox-api.bahinlink.com/api
Test API Key: test_sk_1234567890abcdef
```

## Support

For API support and questions:
- **Documentation**: https://docs.bahinlink.com
- **Support Email**: api-support@bahinlink.com
- **Developer Forum**: https://community.bahinlink.com
- **Status Page**: https://status.bahinlink.com

---

Last updated: December 7, 2023
