# Clerk Dashboard Setup Guide

## 1. Create Clerk Account and Application

### Step 1: Sign up for Clerk
1. Go to [https://clerk.com](https://clerk.com)
2. Click "Sign Up" and create your account
3. Verify your email address

### Step 2: Create New Application
1. In the Clerk Dashboard, click "Create Application"
2. Application Name: `BahinLink Admin Portal`
3. Select authentication methods:
   - ✅ Email
   - ✅ Password
   - ✅ Google (optional)
   - ✅ GitHub (optional)

## 2. Configure Application Settings

### Development Instance Configuration
1. **Allowed Origins:**
   - `http://localhost:3001`
   - `http://127.0.0.1:3001`

2. **Redirect URLs:**
   - Sign-in redirect: `http://localhost:3001/dashboard`
   - Sign-up redirect: `http://localhost:3001/dashboard`
   - Sign-out redirect: `http://localhost:3001/sign-in`

### Production Instance Configuration
1. **Allowed Origins:**
   - `https://admin.bahinlink.com`
   - `https://bahinlink.com`

2. **Redirect URLs:**
   - Sign-in redirect: `https://admin.bahinlink.com/dashboard`
   - Sign-up redirect: `https://admin.bahinlink.com/dashboard`
   - Sign-out redirect: `https://admin.bahinlink.com/sign-in`

## 3. Enable Organizations Feature

1. Go to "Organizations" in the sidebar
2. Enable "Organizations" feature
3. Configure organization settings:
   - ✅ Allow users to create organizations
   - ✅ Allow users to join organizations
   - ✅ Enable organization invitations

## 4. Configure Session Settings

1. Go to "Sessions" in the sidebar
2. Set session timeout: `24 hours`
3. Enable "Multi-session" if needed
4. Configure session token settings:
   - Token lifetime: `1 hour`
   - Refresh token lifetime: `30 days`

## 5. Set Up Roles and Permissions

1. Go to "Roles & Permissions"
2. Create the following roles:
   - **Super Admin**: Full system access
   - **Admin**: Administrative access
   - **Manager**: Site and agent management
   - **User**: Basic access

3. Configure permissions for each role:
   - `users:read`, `users:write`, `users:delete`
   - `sites:read`, `sites:write`, `sites:delete`
   - `agents:read`, `agents:write`, `agents:delete`
   - `reports:read`, `reports:write`
   - `analytics:read`

## 6. Get API Keys

### Development Keys
1. Go to "API Keys" in the sidebar
2. Copy the **Publishable Key** (starts with `pk_test_`)
3. Update `.env` file:
   ```
   REACT_APP_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
   ```

### Production Keys
1. Switch to Production instance
2. Copy the **Publishable Key** (starts with `pk_live_`)
3. Update `.env.production` file:
   ```
   REACT_APP_CLERK_PUBLISHABLE_KEY=pk_live_your_key_here
   ```

## 7. Configure Webhooks (Optional for now)

1. Go to "Webhooks" in the sidebar
2. Add webhook endpoint: `https://api.bahinlink.com/webhooks/clerk`
3. Select events:
   - `user.created`
   - `user.updated`
   - `user.deleted`
   - `organization.membership.created`
   - `organization.membership.deleted`

## 8. Test Configuration

1. Start the development server: `npm start`
2. Navigate to `http://localhost:3001`
3. Test sign-up and sign-in flows
4. Verify user creation in Clerk Dashboard

## Notes

- The current `.env` file contains a placeholder key
- Replace with your actual Clerk publishable key
- Keep secret keys secure and never commit them to version control
- Use environment-specific keys for development and production
