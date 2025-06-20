import { test, expect, Page } from '@playwright/test';

class ShiftWorkflowPage {
  constructor(private page: Page) {}

  async navigateToShifts() {
    await this.page.goto('/shifts');
    await this.page.waitForLoadState('networkidle');
  }

  async createShift(shiftData: {
    agentName: string;
    siteName: string;
    startTime: string;
    endTime: string;
  }) {
    await this.page.click('[data-testid="create-shift-button"]');
    await this.page.waitForSelector('[data-testid="shift-form"]');

    // Fill shift form
    await this.page.selectOption('[data-testid="agent-select"]', { label: shiftData.agentName });
    await this.page.selectOption('[data-testid="site-select"]', { label: shiftData.siteName });
    await this.page.fill('[data-testid="start-time-input"]', shiftData.startTime);
    await this.page.fill('[data-testid="end-time-input"]', shiftData.endTime);

    // Submit form
    await this.page.click('[data-testid="submit-shift-button"]');
    await this.page.waitForSelector('[data-testid="success-message"]');
  }

  async checkInToShift(shiftId: string) {
    await this.page.click(`[data-testid="shift-${shiftId}"] [data-testid="check-in-button"]`);
    
    // Handle geolocation permission
    await this.page.context().grantPermissions(['geolocation']);
    
    // Confirm check-in
    await this.page.click('[data-testid="confirm-check-in"]');
    await this.page.waitForSelector('[data-testid="check-in-success"]');
  }

  async checkOutOfShift(shiftId: string) {
    await this.page.click(`[data-testid="shift-${shiftId}"] [data-testid="check-out-button"]`);
    
    // Confirm check-out
    await this.page.click('[data-testid="confirm-check-out"]');
    await this.page.waitForSelector('[data-testid="check-out-success"]');
  }

  async createReport(reportData: {
    title: string;
    type: string;
    content: string;
  }) {
    await this.page.click('[data-testid="create-report-button"]');
    await this.page.waitForSelector('[data-testid="report-form"]');

    await this.page.fill('[data-testid="report-title"]', reportData.title);
    await this.page.selectOption('[data-testid="report-type"]', reportData.type);
    await this.page.fill('[data-testid="report-content"]', reportData.content);

    await this.page.click('[data-testid="submit-report-button"]');
    await this.page.waitForSelector('[data-testid="report-success"]');
  }

  async verifyShiftStatus(shiftId: string, expectedStatus: string) {
    const statusElement = await this.page.locator(`[data-testid="shift-${shiftId}"] [data-testid="shift-status"]`);
    await expect(statusElement).toHaveText(expectedStatus);
  }
}

class AuthenticationPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.goto('/login');
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    await this.page.click('[data-testid="login-button"]');
    await this.page.waitForURL('/dashboard');
  }

  async logout() {
    await this.page.click('[data-testid="user-menu"]');
    await this.page.click('[data-testid="logout-button"]');
    await this.page.waitForURL('/login');
  }
}

test.describe('Complete Shift Workflow', () => {
  let authPage: AuthenticationPage;
  let shiftPage: ShiftWorkflowPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthenticationPage(page);
    shiftPage = new ShiftWorkflowPage(page);
  });

  test('Admin creates shift, agent completes workflow', async ({ page, context }) => {
    // Create a new browser context for admin
    const adminContext = await context.browser()?.newContext();
    const adminPage = adminContext ? await adminContext.newPage() : page;
    const adminAuth = new AuthenticationPage(adminPage);
    const adminShift = new ShiftWorkflowPage(adminPage);

    // Admin login
    await adminAuth.login('admin@bahinlink.com', 'AdminPassword123!');

    // Navigate to shifts and create new shift
    await adminShift.navigateToShifts();
    await adminShift.createShift({
      agentName: 'John Doe',
      siteName: 'Downtown Office',
      startTime: '09:00',
      endTime: '17:00',
    });

    // Get the created shift ID
    const shiftElement = await adminPage.locator('[data-testid^="shift-"]').first();
    const shiftId = await shiftElement.getAttribute('data-testid')?.replace('shift-', '') || '';

    // Verify shift is created
    await adminShift.verifyShiftStatus(shiftId, 'Scheduled');

    // Admin logout
    await adminAuth.logout();
    await adminContext?.close();

    // Agent login
    await authPage.login('agent@bahinlink.com', 'AgentPassword123!');

    // Navigate to shifts
    await shiftPage.navigateToShifts();

    // Check in to shift
    await shiftPage.checkInToShift(shiftId);
    await shiftPage.verifyShiftStatus(shiftId, 'In Progress');

    // Create a patrol report
    await shiftPage.createReport({
      title: 'Hourly Patrol Report',
      type: 'patrol',
      content: 'All areas checked, no incidents reported.',
    });

    // Check out of shift
    await shiftPage.checkOutOfShift(shiftId);
    await shiftPage.verifyShiftStatus(shiftId, 'Completed');

    // Verify shift completion time
    const completionTime = await page.locator(`[data-testid="shift-${shiftId}"] [data-testid="completion-time"]`);
    await expect(completionTime).toBeVisible();
  });

  test('Agent handles emergency during shift', async ({ page }) => {
    // Agent login
    await authPage.login('agent@bahinlink.com', 'AgentPassword123!');

    // Navigate to active shift
    await shiftPage.navigateToShifts();
    
    // Assume there's an active shift
    const activeShiftId = 'active-shift-id';
    
    // Trigger emergency alert
    await page.click('[data-testid="emergency-button"]');
    await page.waitForSelector('[data-testid="emergency-form"]');

    // Fill emergency details
    await page.selectOption('[data-testid="emergency-type"]', 'medical');
    await page.fill('[data-testid="emergency-description"]', 'Medical emergency - person unconscious');
    
    // Submit emergency alert
    await page.click('[data-testid="submit-emergency"]');
    await page.waitForSelector('[data-testid="emergency-sent"]');

    // Verify emergency alert is sent
    const alertConfirmation = await page.locator('[data-testid="emergency-confirmation"]');
    await expect(alertConfirmation).toContainText('Emergency alert sent');

    // Verify emergency appears in alerts list
    await page.goto('/alerts');
    const emergencyAlert = await page.locator('[data-testid="emergency-alert"]').first();
    await expect(emergencyAlert).toContainText('Medical emergency');
  });

  test('Real-time shift updates between users', async ({ page, context }) => {
    // Create two browser contexts for real-time testing
    const supervisorContext = await context.browser()?.newContext();
    const agentContext = await context.browser()?.newContext();
    
    if (!supervisorContext || !agentContext) return;

    const supervisorPage = await supervisorContext.newPage();
    const agentPage = await agentContext.newPage();

    // Supervisor login
    const supervisorAuth = new AuthenticationPage(supervisorPage);
    await supervisorAuth.login('supervisor@bahinlink.com', 'SupervisorPassword123!');

    // Agent login
    const agentAuth = new AuthenticationPage(agentPage);
    await agentAuth.login('agent@bahinlink.com', 'AgentPassword123!');

    // Both navigate to shifts
    await supervisorPage.goto('/shifts');
    await agentPage.goto('/shifts');

    // Agent checks in to shift
    const agentShift = new ShiftWorkflowPage(agentPage);
    const shiftId = 'test-shift-id';
    await agentShift.checkInToShift(shiftId);

    // Verify supervisor sees real-time update
    await supervisorPage.waitForTimeout(2000); // Allow for real-time update
    const supervisorShiftStatus = await supervisorPage.locator(`[data-testid="shift-${shiftId}"] [data-testid="shift-status"]`);
    await expect(supervisorShiftStatus).toHaveText('In Progress');

    // Agent updates location
    await agentPage.click('[data-testid="update-location-button"]');
    
    // Verify supervisor sees location update
    await supervisorPage.waitForTimeout(2000);
    const locationUpdate = await supervisorPage.locator('[data-testid="location-update"]');
    await expect(locationUpdate).toBeVisible();

    // Cleanup
    await supervisorContext.close();
    await agentContext.close();
  });

  test('Shift scheduling conflict detection', async ({ page }) => {
    // Admin login
    await authPage.login('admin@bahinlink.com', 'AdminPassword123!');

    // Navigate to shifts
    await shiftPage.navigateToShifts();

    // Create first shift
    await shiftPage.createShift({
      agentName: 'John Doe',
      siteName: 'Downtown Office',
      startTime: '09:00',
      endTime: '17:00',
    });

    // Try to create overlapping shift
    await page.click('[data-testid="create-shift-button"]');
    await page.waitForSelector('[data-testid="shift-form"]');

    await page.selectOption('[data-testid="agent-select"]', { label: 'John Doe' });
    await page.selectOption('[data-testid="site-select"]', { label: 'Downtown Office' });
    await page.fill('[data-testid="start-time-input"]', '15:00');
    await page.fill('[data-testid="end-time-input"]', '23:00');

    await page.click('[data-testid="submit-shift-button"]');

    // Verify conflict detection
    const conflictMessage = await page.locator('[data-testid="conflict-error"]');
    await expect(conflictMessage).toContainText('Schedule conflict detected');

    // Verify conflict details are shown
    const conflictDetails = await page.locator('[data-testid="conflict-details"]');
    await expect(conflictDetails).toBeVisible();
  });

  test('Mobile app shift management', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Agent login on mobile
    await authPage.login('agent@bahinlink.com', 'AgentPassword123!');

    // Navigate to mobile shifts view
    await page.goto('/mobile/shifts');

    // Verify mobile layout
    const mobileShiftCard = await page.locator('[data-testid="mobile-shift-card"]').first();
    await expect(mobileShiftCard).toBeVisible();

    // Test swipe gestures for shift actions
    const shiftCard = await page.locator('[data-testid="shift-card"]').first();
    await shiftCard.hover();
    
    // Simulate swipe right for check-in
    await page.mouse.down();
    await page.mouse.move(100, 0);
    await page.mouse.up();

    // Verify check-in action appears
    const checkInAction = await page.locator('[data-testid="swipe-check-in"]');
    await expect(checkInAction).toBeVisible();

    // Test pull-to-refresh
    await page.mouse.move(200, 100);
    await page.mouse.down();
    await page.mouse.move(200, 200);
    await page.mouse.up();

    // Verify refresh indicator
    const refreshIndicator = await page.locator('[data-testid="refresh-indicator"]');
    await expect(refreshIndicator).toBeVisible();
  });

  test('Offline functionality and sync', async ({ page, context }) => {
    // Agent login
    await authPage.login('agent@bahinlink.com', 'AgentPassword123!');

    // Navigate to shifts
    await shiftPage.navigateToShifts();

    // Go offline
    await context.setOffline(true);

    // Try to check in while offline
    const shiftId = 'test-shift-id';
    await page.click(`[data-testid="shift-${shiftId}"] [data-testid="check-in-button"]`);

    // Verify offline message
    const offlineMessage = await page.locator('[data-testid="offline-message"]');
    await expect(offlineMessage).toContainText('Action saved for sync');

    // Create report while offline
    await shiftPage.createReport({
      title: 'Offline Report',
      type: 'incident',
      content: 'Report created while offline',
    });

    // Verify offline indicator
    const offlineIndicator = await page.locator('[data-testid="offline-indicator"]');
    await expect(offlineIndicator).toBeVisible();

    // Go back online
    await context.setOffline(false);

    // Wait for sync
    await page.waitForTimeout(3000);

    // Verify sync completion
    const syncSuccess = await page.locator('[data-testid="sync-success"]');
    await expect(syncSuccess).toBeVisible();

    // Verify data was synced
    await shiftPage.verifyShiftStatus(shiftId, 'In Progress');
  });

  test('Performance under load', async ({ page }) => {
    // Admin login
    await authPage.login('admin@bahinlink.com', 'AdminPassword123!');

    // Navigate to shifts with large dataset
    await page.goto('/shifts?limit=1000');

    // Measure page load time
    const startTime = Date.now();
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Verify reasonable load time (under 3 seconds)
    expect(loadTime).toBeLessThan(3000);

    // Test scrolling performance with large list
    const shiftsList = await page.locator('[data-testid="shifts-list"]');
    await expect(shiftsList).toBeVisible();

    // Scroll through list and measure performance
    const scrollStartTime = Date.now();
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(100);
    }
    const scrollTime = Date.now() - scrollStartTime;

    // Verify smooth scrolling (under 2 seconds for 10 scrolls)
    expect(scrollTime).toBeLessThan(2000);

    // Test search performance
    const searchStartTime = Date.now();
    await page.fill('[data-testid="search-input"]', 'test search query');
    await page.waitForSelector('[data-testid="search-results"]');
    const searchTime = Date.now() - searchStartTime;

    // Verify fast search (under 1 second)
    expect(searchTime).toBeLessThan(1000);
  });
});

test.describe('Security and Access Control', () => {
  test('Role-based access control', async ({ page }) => {
    // Test agent access restrictions
    const authPage = new AuthenticationPage(page);
    await authPage.login('agent@bahinlink.com', 'AgentPassword123!');

    // Try to access admin-only features
    await page.goto('/admin/users');
    
    // Verify access denied
    const accessDenied = await page.locator('[data-testid="access-denied"]');
    await expect(accessDenied).toBeVisible();

    // Verify redirect to appropriate page
    await expect(page).toHaveURL('/dashboard');
  });

  test('Session timeout and security', async ({ page }) => {
    const authPage = new AuthenticationPage(page);
    await authPage.login('agent@bahinlink.com', 'AgentPassword123!');

    // Simulate session timeout
    await page.evaluate(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    });

    // Try to access protected resource
    await page.goto('/shifts');

    // Verify redirect to login
    await expect(page).toHaveURL('/login');

    // Verify session timeout message
    const timeoutMessage = await page.locator('[data-testid="session-timeout"]');
    await expect(timeoutMessage).toBeVisible();
  });
});
