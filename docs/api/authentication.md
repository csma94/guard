# Authentication API

## Overview

The BahinLink API uses JWT (JSON Web Tokens) for authentication and authorization. All API endpoints require authentication unless explicitly stated otherwise.

## Authentication Flow

### 1. Login

**Endpoint:** `POST /api/auth/login`

**Description:** Authenticate a user and receive access and refresh tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "rememberMe": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "username": "johndoe",
      "role": "admin",
      "permissions": ["users.read", "users.write", "shifts.read"],
      "profile": {
        "firstName": "John",
        "lastName": "Doe",
        "avatar": "https://cdn.bahinlink.com/avatars/user-uuid.jpg"
      }
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresIn": 900,
      "tokenType": "Bearer"
    }
  }
}
```

**Error Responses:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "details": {}
  }
}
```

### 2. Refresh Token

**Endpoint:** `POST /api/auth/refresh`

**Description:** Refresh an expired access token using a valid refresh token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

### 3. Logout

**Endpoint:** `POST /api/auth/logout`

**Description:** Invalidate the current session and tokens.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

### 4. Password Reset

**Endpoint:** `POST /api/auth/forgot-password`

**Description:** Request a password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

**Endpoint:** `POST /api/auth/reset-password`

**Description:** Reset password using a reset token.

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

## Authorization

### Using Access Tokens

Include the access token in the Authorization header for all authenticated requests:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Validation

**Endpoint:** `GET /api/auth/me`

**Description:** Validate the current token and get user information.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "username": "johndoe",
      "role": "admin",
      "permissions": ["users.read", "users.write", "shifts.read"],
      "profile": {
        "firstName": "John",
        "lastName": "Doe",
        "avatar": "https://cdn.bahinlink.com/avatars/user-uuid.jpg"
      },
      "lastLoginAt": "2024-01-01T12:00:00Z",
      "isActive": true
    }
  }
}
```

## Role-Based Access Control (RBAC)

### Roles

- **Super Admin**: Full system access
- **Admin**: Organization-wide access
- **Supervisor**: Team and site management
- **Agent**: Field operations access
- **Client**: Read-only access to assigned data

### Permissions

Permissions are granular and follow the pattern: `resource.action`

**User Management:**
- `users.read` - View users
- `users.write` - Create/update users
- `users.delete` - Delete users

**Shift Management:**
- `shifts.read` - View shifts
- `shifts.write` - Create/update shifts
- `shifts.delete` - Delete shifts
- `shifts.assign` - Assign shifts to agents

**Site Management:**
- `sites.read` - View sites
- `sites.write` - Create/update sites
- `sites.delete` - Delete sites

**Report Management:**
- `reports.read` - View reports
- `reports.write` - Create/update reports
- `reports.delete` - Delete reports

**Analytics:**
- `analytics.read` - View analytics
- `analytics.export` - Export analytics data

### Permission Checking

The API automatically checks permissions for each endpoint. If a user lacks the required permission, a 403 Forbidden response is returned:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "You don't have permission to access this resource",
    "details": {
      "required": "users.write",
      "current": ["users.read", "shifts.read"]
    }
  }
}
```

## Multi-Factor Authentication (MFA)

### Enable MFA

**Endpoint:** `POST /api/auth/mfa/enable`

**Description:** Enable MFA for the current user.

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "secret": "JBSWY3DPEHPK3PXP",
    "backupCodes": [
      "12345678",
      "87654321",
      "11223344"
    ]
  }
}
```

### Verify MFA Setup

**Endpoint:** `POST /api/auth/mfa/verify-setup`

**Description:** Verify MFA setup with a TOTP code.

**Request Body:**
```json
{
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "MFA enabled successfully"
}
```

### MFA Login

When MFA is enabled, the login process requires an additional step:

**Step 1:** Login with email/password (returns `mfaRequired: true`)
**Step 2:** Provide MFA code

**Endpoint:** `POST /api/auth/mfa/verify`

**Request Body:**
```json
{
  "sessionToken": "temp-session-token",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { /* user object */ },
    "tokens": { /* tokens object */ }
  }
}
```

## Security Features

### Rate Limiting

Authentication endpoints are rate-limited to prevent brute force attacks:

- Login: 5 attempts per 15 minutes per IP
- Password reset: 3 attempts per hour per email
- MFA verification: 5 attempts per 5 minutes per session

### Session Management

- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Sessions are invalidated on logout
- Concurrent session limits can be configured

### Security Headers

All authentication responses include security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_CREDENTIALS` | Invalid email or password |
| `ACCOUNT_LOCKED` | Account is locked due to failed attempts |
| `ACCOUNT_DISABLED` | Account is disabled |
| `TOKEN_EXPIRED` | Access token has expired |
| `TOKEN_INVALID` | Token is malformed or invalid |
| `REFRESH_TOKEN_EXPIRED` | Refresh token has expired |
| `MFA_REQUIRED` | MFA verification required |
| `MFA_INVALID` | Invalid MFA code |
| `RATE_LIMITED` | Too many requests |
| `INSUFFICIENT_PERMISSIONS` | User lacks required permissions |

## SDK Examples

### JavaScript/TypeScript

```typescript
import { BahinLinkAPI } from '@bahinlink/sdk';

const api = new BahinLinkAPI({
  baseURL: 'https://api.bahinlink.com',
  apiKey: 'your-api-key'
});

// Login
const { user, tokens } = await api.auth.login({
  email: 'user@example.com',
  password: 'password123'
});

// Set token for subsequent requests
api.setAccessToken(tokens.accessToken);

// Get current user
const currentUser = await api.auth.me();
```

### cURL Examples

```bash
# Login
curl -X POST https://api.bahinlink.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Get current user
curl -X GET https://api.bahinlink.com/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Refresh token
curl -X POST https://api.bahinlink.com/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```
