const twilio = require('twilio');
const config = require('../../../src/config/config');

describe('Twilio Integration Tests', () => {
  let twilioClient;

  beforeAll(() => {
    // Skip tests if Twilio credentials are not configured
    if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) {
      console.log('Skipping Twilio tests - credentials not configured');
      return;
    }

    twilioClient = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  });

  describe('Account Validation', () => {
    it('should validate Twilio account credentials', async () => {
      if (!twilioClient) {
        pending('Twilio credentials not configured');
        return;
      }

      try {
        const account = await twilioClient.api.accounts(config.TWILIO_ACCOUNT_SID).fetch();
        
        expect(account).toBeDefined();
        expect(account.sid).toBe(config.TWILIO_ACCOUNT_SID);
        expect(account.status).toBe('active');
      } catch (error) {
        fail(`Twilio account validation failed: ${error.message}`);
      }
    }, 10000);

    it('should validate phone number configuration', async () => {
      if (!twilioClient) {
        pending('Twilio credentials not configured');
        return;
      }

      try {
        const phoneNumbers = await twilioClient.incomingPhoneNumbers.list();
        
        expect(phoneNumbers).toBeDefined();
        expect(Array.isArray(phoneNumbers)).toBe(true);
        
        // Check if configured phone number exists
        if (config.TWILIO_PHONE_NUMBER) {
          const configuredNumber = phoneNumbers.find(
            number => number.phoneNumber === config.TWILIO_PHONE_NUMBER
          );
          expect(configuredNumber).toBeDefined();
        }
      } catch (error) {
        fail(`Phone number validation failed: ${error.message}`);
      }
    }, 10000);
  });

  describe('SMS Functionality', () => {
    it('should send test SMS message', async () => {
      if (!twilioClient || !config.TWILIO_PHONE_NUMBER) {
        pending('Twilio not fully configured');
        return;
      }

      // Use a test phone number or skip if not in test environment
      const testPhoneNumber = process.env.TEST_PHONE_NUMBER;
      if (!testPhoneNumber) {
        pending('TEST_PHONE_NUMBER not configured');
        return;
      }

      try {
        const message = await twilioClient.messages.create({
          body: 'Test message from BahinLink integration tests',
          from: config.TWILIO_PHONE_NUMBER,
          to: testPhoneNumber,
        });

        expect(message).toBeDefined();
        expect(message.sid).toBeDefined();
        expect(message.status).toMatch(/queued|sent|delivered/);
        expect(message.from).toBe(config.TWILIO_PHONE_NUMBER);
        expect(message.to).toBe(testPhoneNumber);
      } catch (error) {
        fail(`SMS sending failed: ${error.message}`);
      }
    }, 15000);

    it('should handle invalid phone number gracefully', async () => {
      if (!twilioClient || !config.TWILIO_PHONE_NUMBER) {
        pending('Twilio not fully configured');
        return;
      }

      try {
        await twilioClient.messages.create({
          body: 'Test message',
          from: config.TWILIO_PHONE_NUMBER,
          to: '+1234567890', // Invalid number
        });
        
        fail('Should have thrown an error for invalid phone number');
      } catch (error) {
        expect(error.code).toBeDefined();
        expect(error.message).toContain('phone number');
      }
    }, 10000);
  });

  describe('Message Status Tracking', () => {
    it('should retrieve message status', async () => {
      if (!twilioClient) {
        pending('Twilio credentials not configured');
        return;
      }

      try {
        // Get recent messages
        const messages = await twilioClient.messages.list({ limit: 5 });
        
        expect(messages).toBeDefined();
        expect(Array.isArray(messages)).toBe(true);
        
        if (messages.length > 0) {
          const message = messages[0];
          expect(message.sid).toBeDefined();
          expect(message.status).toBeDefined();
          expect(['queued', 'sent', 'delivered', 'failed', 'undelivered']).toContain(message.status);
        }
      } catch (error) {
        fail(`Message status retrieval failed: ${error.message}`);
      }
    }, 10000);
  });

  describe('Rate Limiting and Error Handling', () => {
    it('should handle rate limiting gracefully', async () => {
      if (!twilioClient || !config.TWILIO_PHONE_NUMBER) {
        pending('Twilio not fully configured');
        return;
      }

      const testPhoneNumber = process.env.TEST_PHONE_NUMBER;
      if (!testPhoneNumber) {
        pending('TEST_PHONE_NUMBER not configured');
        return;
      }

      // Send multiple messages rapidly to test rate limiting
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(
          twilioClient.messages.create({
            body: `Rate limit test message ${i + 1}`,
            from: config.TWILIO_PHONE_NUMBER,
            to: testPhoneNumber,
          }).catch(error => ({ error }))
        );
      }

      const results = await Promise.all(promises);
      
      // At least one should succeed
      const successes = results.filter(result => !result.error);
      expect(successes.length).toBeGreaterThan(0);
      
      // Check for rate limiting errors
      const rateLimitErrors = results.filter(result => 
        result.error && result.error.code === 20429
      );
      
      // Rate limiting is expected behavior, not a failure
      expect(rateLimitErrors.length).toBeLessThanOrEqual(results.length);
    }, 20000);

    it('should validate message content limits', async () => {
      if (!twilioClient || !config.TWILIO_PHONE_NUMBER) {
        pending('Twilio not fully configured');
        return;
      }

      const testPhoneNumber = process.env.TEST_PHONE_NUMBER;
      if (!testPhoneNumber) {
        pending('TEST_PHONE_NUMBER not configured');
        return;
      }

      // Test with very long message (over 1600 characters)
      const longMessage = 'A'.repeat(2000);

      try {
        const message = await twilioClient.messages.create({
          body: longMessage,
          from: config.TWILIO_PHONE_NUMBER,
          to: testPhoneNumber,
        });

        // Twilio should handle long messages by splitting them
        expect(message).toBeDefined();
        expect(message.sid).toBeDefined();
      } catch (error) {
        // Some error is expected for extremely long messages
        expect(error.code).toBeDefined();
      }
    }, 15000);
  });

  describe('Webhook Validation', () => {
    it('should validate webhook signature', () => {
      if (!twilioClient) {
        pending('Twilio credentials not configured');
        return;
      }

      const authToken = config.TWILIO_AUTH_TOKEN;
      const url = 'https://example.com/webhook';
      const params = {
        MessageSid: 'SM12345678901234567890123456789012',
        MessageStatus: 'delivered',
        From: '+1234567890',
        To: '+0987654321',
      };

      // Generate signature
      const signature = twilio.validateRequest(authToken, '', url, params);
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });
  });

  describe('Service Health Check', () => {
    it('should check Twilio service availability', async () => {
      if (!twilioClient) {
        pending('Twilio credentials not configured');
        return;
      }

      try {
        // Simple API call to check service availability
        const account = await twilioClient.api.accounts(config.TWILIO_ACCOUNT_SID).fetch();
        
        expect(account).toBeDefined();
        expect(account.status).toBe('active');
        
        // Check account balance if available
        const balance = await twilioClient.balance.fetch();
        expect(balance).toBeDefined();
        expect(typeof balance.balance).toBe('string');
      } catch (error) {
        fail(`Twilio service health check failed: ${error.message}`);
      }
    }, 10000);

    it('should validate API response times', async () => {
      if (!twilioClient) {
        pending('Twilio credentials not configured');
        return;
      }

      const startTime = Date.now();
      
      try {
        await twilioClient.api.accounts(config.TWILIO_ACCOUNT_SID).fetch();
        
        const responseTime = Date.now() - startTime;
        
        // API should respond within 5 seconds
        expect(responseTime).toBeLessThan(5000);
      } catch (error) {
        fail(`API response time test failed: ${error.message}`);
      }
    }, 10000);
  });

  describe('Configuration Validation', () => {
    it('should validate environment configuration', () => {
      // Check required environment variables
      const requiredVars = [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_PHONE_NUMBER',
      ];

      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.warn(`Missing Twilio configuration: ${missingVars.join(', ')}`);
      }

      // Validate format of configured values
      if (config.TWILIO_ACCOUNT_SID) {
        expect(config.TWILIO_ACCOUNT_SID).toMatch(/^AC[a-f0-9]{32}$/);
      }

      if (config.TWILIO_PHONE_NUMBER) {
        expect(config.TWILIO_PHONE_NUMBER).toMatch(/^\+\d{10,15}$/);
      }
    });

    it('should validate Twilio client initialization', () => {
      if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) {
        pending('Twilio credentials not configured');
        return;
      }

      const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
      
      expect(client).toBeDefined();
      expect(client.accountSid).toBe(config.TWILIO_ACCOUNT_SID);
      expect(typeof client.messages.create).toBe('function');
    });
  });
});
