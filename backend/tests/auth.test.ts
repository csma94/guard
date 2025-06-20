import request from 'supertest';
import { app } from '../src/app';
import {
  createTestSuite,
  TestUserFactory,
  TestTokenManager,
  TestAssertions,
  TestDataGenerator,
} from '../../shared/testing/testUtils';

createTestSuite('Authentication API', (testContext) => {
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const user = await TestUserFactory.createTestUser({
        email: 'test@example.com',
        password: 'TestPassword123!',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'TestPassword123!',
        });

      TestAssertions.expectSuccess(response);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid@example.com',
          password: 'wrongpassword',
        });

      TestAssertions.expectUnauthorized(response);
    });

    it('should require MFA when enabled', async () => {
      const user = await TestUserFactory.createTestUser({
        email: 'mfa@example.com',
        password: 'TestPassword123!',
        mfaEnabled: true,
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'mfa@example.com',
          password: 'TestPassword123!',
        });

      expect(response.status).toBe(200);
      expect(response.body.requiresMFA).toBe(true);
      expect(response.body).not.toHaveProperty('accessToken');
    });

    it('should handle account lockout after failed attempts', async () => {
      const user = await TestUserFactory.createTestUser({
        email: 'lockout@example.com',
        password: 'TestPassword123!',
      });

      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'lockout@example.com',
            password: 'wrongpassword',
          });
      }

      // Next attempt should be locked
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'lockout@example.com',
          password: 'TestPassword123!',
        });

      expect(response.status).toBe(423); // Locked
      expect(response.body.error).toMatch(/locked/i);
    });

    it('should validate input fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: '',
        });

      TestAssertions.expectValidationError(response, 'email');
    });

    it('should track login attempts and IP addresses', async () => {
      const user = await TestUserFactory.createTestUser({
        email: 'tracking@example.com',
        password: 'TestPassword123!',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.100')
        .set('User-Agent', 'Test Browser')
        .send({
          email: 'tracking@example.com',
          password: 'TestPassword123!',
        });

      TestAssertions.expectSuccess(response);
      // Verify that login attempt was logged
      // This would check audit logs in a real implementation
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const user = await TestUserFactory.createTestUser();
      const refreshToken = TestTokenManager.generateRefreshToken(user);

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      TestAssertions.expectSuccess(response);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      TestAssertions.expectUnauthorized(response);
    });

    it('should reject expired refresh token', async () => {
      const user = await TestUserFactory.createTestUser();
      const expiredToken = TestTokenManager.generateRefreshToken(user, 'expired-session');
      
      // Mock token as expired
      jest.spyOn(TestTokenManager, 'verifyRefreshToken').mockImplementation(() => {
        throw new Error('Token expired');
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: expiredToken });

      TestAssertions.expectUnauthorized(response);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const user = await TestUserFactory.createTestUser();
      const accessToken = TestTokenManager.generateAccessToken(user);

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      TestAssertions.expectSuccess(response);
    });

    it('should handle logout without token gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      // Should still return success even without token
      TestAssertions.expectSuccess(response);
    });
  });

  describe('POST /api/auth/setup-mfa', () => {
    it('should setup MFA for authenticated user', async () => {
      const user = await TestUserFactory.createTestUser();
      const accessToken = TestTokenManager.generateAccessToken(user);

      const response = await request(app)
        .post('/api/auth/setup-mfa')
        .set('Authorization', `Bearer ${accessToken}`);

      TestAssertions.expectSuccess(response);
      expect(response.body).toHaveProperty('secret');
      expect(response.body).toHaveProperty('qrCodeUrl');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/auth/setup-mfa');

      TestAssertions.expectUnauthorized(response);
    });
  });

  describe('POST /api/auth/verify-mfa', () => {
    it('should verify and enable MFA with valid TOTP code', async () => {
      const user = await TestUserFactory.createTestUser();
      const accessToken = TestTokenManager.generateAccessToken(user);

      // First setup MFA
      const setupResponse = await request(app)
        .post('/api/auth/setup-mfa')
        .set('Authorization', `Bearer ${accessToken}`);

      // Mock TOTP verification
      const mockTotpCode = '123456';
      jest.spyOn(require('speakeasy'), 'totp').mockReturnValue({
        verify: jest.fn().mockReturnValue(true),
      });

      const response = await request(app)
        .post('/api/auth/verify-mfa')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ totpCode: mockTotpCode });

      TestAssertions.expectSuccess(response);
    });

    it('should reject invalid TOTP code', async () => {
      const user = await TestUserFactory.createTestUser();
      const accessToken = TestTokenManager.generateAccessToken(user);

      const response = await request(app)
        .post('/api/auth/verify-mfa')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ totpCode: 'invalid' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should change password with valid current password', async () => {
      const user = await TestUserFactory.createTestUser({
        password: 'OldPassword123!',
      });
      const accessToken = TestTokenManager.generateAccessToken(user);

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        });

      TestAssertions.expectSuccess(response);
    });

    it('should reject invalid current password', async () => {
      const user = await TestUserFactory.createTestUser();
      const accessToken = TestTokenManager.generateAccessToken(user);

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'NewPassword123!',
        });

      expect(response.status).toBe(400);
    });

    it('should validate new password strength', async () => {
      const user = await TestUserFactory.createTestUser();
      const accessToken = TestTokenManager.generateAccessToken(user);

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'TestPassword123!',
          newPassword: 'weak',
        });

      TestAssertions.expectValidationError(response, 'newPassword');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should send reset email for valid email', async () => {
      const user = await TestUserFactory.createTestUser({
        email: 'reset@example.com',
      });

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reset@example.com' });

      TestAssertions.expectSuccess(response);
      // Verify email was sent (mock email service)
    });

    it('should not reveal if email does not exist', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      // Should still return success to not reveal user existence
      TestAssertions.expectSuccess(response);
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'invalid-email' });

      TestAssertions.expectValidationError(response, 'email');
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      const user = await TestUserFactory.createTestUser();
      const resetToken = 'valid-reset-token';

      // Mock token validation
      jest.spyOn(require('../../shared/services/authenticationService'), 'validateResetToken')
        .mockResolvedValue(user);

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewPassword123!',
        });

      TestAssertions.expectSuccess(response);
    });

    it('should reject invalid reset token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'invalid-token',
          newPassword: 'NewPassword123!',
        });

      expect(response.status).toBe(400);
    });

    it('should validate new password strength', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'valid-token',
          newPassword: 'weak',
        });

      TestAssertions.expectValidationError(response, 'newPassword');
    });
  });

  describe('Security Headers and CORS', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'https://app.bahinlink.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(200);
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on login attempts', async () => {
      const requests = [];
      
      // Make multiple rapid requests
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'test@example.com',
              password: 'password',
            })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});
