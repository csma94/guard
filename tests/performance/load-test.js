import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users
    { duration: '5m', target: 10 }, // Stay at 10 users
    { duration: '2m', target: 20 }, // Ramp up to 20 users
    { duration: '5m', target: 20 }, // Stay at 20 users
    { duration: '2m', target: 50 }, // Ramp up to 50 users
    { duration: '5m', target: 50 }, // Stay at 50 users
    { duration: '2m', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.1'],    // Error rate must be below 10%
    errors: ['rate<0.1'],             // Custom error rate must be below 10%
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3001';

// Test data
const testUsers = [
  { username: 'testadmin', password: 'testpassword123', role: 'ADMIN' },
  { username: 'testsupervisor', password: 'testpassword123', role: 'SUPERVISOR' },
  { username: 'testagent1', password: 'testpassword123', role: 'AGENT' },
  { username: 'testagent2', password: 'testpassword123', role: 'AGENT' },
];

let authTokens = {};

export function setup() {
  // Authenticate test users and get tokens
  const tokens = {};
  
  testUsers.forEach(user => {
    const loginResponse = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      username: user.username,
      password: user.password,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (loginResponse.status === 200) {
      const body = JSON.parse(loginResponse.body);
      tokens[user.role] = body.token;
    }
  });
  
  return tokens;
}

export default function(data) {
  authTokens = data;
  
  // Test scenarios with different weights
  const scenarios = [
    { weight: 30, test: testDashboardEndpoints },
    { weight: 25, test: testUserManagement },
    { weight: 20, test: testShiftManagement },
    { weight: 15, test: testReportManagement },
    { weight: 10, test: testAnalyticsEndpoints },
  ];
  
  // Select scenario based on weight
  const random = Math.random() * 100;
  let cumulativeWeight = 0;
  
  for (const scenario of scenarios) {
    cumulativeWeight += scenario.weight;
    if (random <= cumulativeWeight) {
      scenario.test();
      break;
    }
  }
  
  sleep(1); // Think time between requests
}

function testDashboardEndpoints() {
  const token = getRandomToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Test dashboard data endpoint
  const dashboardResponse = http.get(`${BASE_URL}/api/dashboard`, { headers });
  
  const success = check(dashboardResponse, {
    'dashboard status is 200': (r) => r.status === 200,
    'dashboard response time < 500ms': (r) => r.timings.duration < 500,
    'dashboard has metrics': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.metrics !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  responseTime.add(dashboardResponse.timings.duration);
  
  // Test real-time status
  const statusResponse = http.get(`${BASE_URL}/api/dashboard/status`, { headers });
  
  check(statusResponse, {
    'status endpoint is 200': (r) => r.status === 200,
    'status response time < 300ms': (r) => r.timings.duration < 300,
  });
}

function testUserManagement() {
  const token = authTokens.ADMIN || authTokens.SUPERVISOR;
  if (!token) return;
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Test users list endpoint
  const usersResponse = http.get(`${BASE_URL}/api/users?page=1&limit=20`, { headers });
  
  const success = check(usersResponse, {
    'users list status is 200': (r) => r.status === 200,
    'users list response time < 400ms': (r) => r.timings.duration < 400,
    'users list has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.users);
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  responseTime.add(usersResponse.timings.duration);
  
  // Test user search
  const searchResponse = http.get(`${BASE_URL}/api/users?search=test`, { headers });
  
  check(searchResponse, {
    'user search status is 200': (r) => r.status === 200,
    'user search response time < 400ms': (r) => r.timings.duration < 400,
  });
}

function testShiftManagement() {
  const token = getRandomToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Test shifts list endpoint
  const shiftsResponse = http.get(`${BASE_URL}/api/shifts?page=1&limit=20`, { headers });
  
  const success = check(shiftsResponse, {
    'shifts list status is 200': (r) => r.status === 200,
    'shifts list response time < 400ms': (r) => r.timings.duration < 400,
    'shifts list has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.shifts);
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  responseTime.add(shiftsResponse.timings.duration);
  
  // Test shift filtering
  const today = new Date().toISOString().split('T')[0];
  const filterResponse = http.get(`${BASE_URL}/api/shifts?startDate=${today}`, { headers });
  
  check(filterResponse, {
    'shift filter status is 200': (r) => r.status === 200,
    'shift filter response time < 500ms': (r) => r.timings.duration < 500,
  });
}

function testReportManagement() {
  const token = getRandomToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Test reports list endpoint
  const reportsResponse = http.get(`${BASE_URL}/api/reports?page=1&limit=20`, { headers });
  
  const success = check(reportsResponse, {
    'reports list status is 200': (r) => r.status === 200,
    'reports list response time < 400ms': (r) => r.timings.duration < 400,
    'reports list has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.reports);
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  responseTime.add(reportsResponse.timings.duration);
  
  // Test report templates
  const templatesResponse = http.get(`${BASE_URL}/api/reports/templates`, { headers });
  
  check(templatesResponse, {
    'report templates status is 200': (r) => r.status === 200,
    'report templates response time < 300ms': (r) => r.timings.duration < 300,
  });
}

function testAnalyticsEndpoints() {
  const token = authTokens.ADMIN || authTokens.SUPERVISOR;
  if (!token) return;
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Test operational analytics
  const analyticsResponse = http.get(`${BASE_URL}/api/analytics/operational`, { headers });
  
  const success = check(analyticsResponse, {
    'analytics status is 200': (r) => r.status === 200,
    'analytics response time < 1000ms': (r) => r.timings.duration < 1000,
    'analytics has core metrics': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.coreMetrics !== undefined;
      } catch {
        return false;
      }
    },
  });
  
  errorRate.add(!success);
  responseTime.add(analyticsResponse.timings.duration);
  
  // Test performance analytics
  const performanceResponse = http.get(`${BASE_URL}/api/analytics/performance`, { headers });
  
  check(performanceResponse, {
    'performance analytics status is 200': (r) => r.status === 200,
    'performance analytics response time < 800ms': (r) => r.timings.duration < 800,
  });
}

function getRandomToken() {
  const tokens = Object.values(authTokens).filter(token => token);
  return tokens[Math.floor(Math.random() * tokens.length)];
}

export function teardown(data) {
  // Cleanup if needed
  console.log('Load test completed');
}
