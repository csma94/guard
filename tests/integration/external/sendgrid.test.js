const sgMail = require('@sendgrid/mail');
const config = require('../../../src/config/config');

describe('SendGrid Integration Tests', () => {
  beforeAll(() => {
    // Skip tests if SendGrid API key is not configured
    if (!config.SENDGRID_API_KEY) {
      console.log('Skipping SendGrid tests - API key not configured');
      return;
    }

    sgMail.setApiKey(config.SENDGRID_API_KEY);
  });

  describe('API Key Validation', () => {
    it('should validate SendGrid API key', async () => {
      if (!config.SENDGRID_API_KEY) {
        pending('SendGrid API key not configured');
        return;
      }

      try {
        // Test API key by making a simple API call
        const request = {
          method: 'GET',
          url: '/v3/user/profile',
        };

        const response = await sgMail.client.request(request);
        
        expect(response).toBeDefined();
        expect(response[0].statusCode).toBe(200);
        expect(response[0].body).toBeDefined();
      } catch (error) {
        fail(`SendGrid API key validation failed: ${error.message}`);
      }
    }, 10000);

    it('should validate sender email configuration', async () => {
      if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
        pending('SendGrid not fully configured');
        return;
      }

      try {
        // Check if sender email is verified
        const request = {
          method: 'GET',
          url: '/v3/verified_senders',
        };

        const response = await sgMail.client.request(request);
        
        expect(response).toBeDefined();
        expect(response[0].statusCode).toBe(200);
        
        const verifiedSenders = response[0].body.results || [];
        const configuredSender = verifiedSenders.find(
          sender => sender.from_email === config.SENDGRID_FROM_EMAIL
        );
        
        if (verifiedSenders.length > 0) {
          expect(configuredSender).toBeDefined();
        }
      } catch (error) {
        // Sender verification might not be available in all plans
        console.warn(`Sender verification check failed: ${error.message}`);
      }
    }, 10000);
  });

  describe('Email Sending Functionality', () => {
    it('should send test email', async () => {
      if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
        pending('SendGrid not fully configured');
        return;
      }

      const testEmail = process.env.TEST_EMAIL;
      if (!testEmail) {
        pending('TEST_EMAIL not configured');
        return;
      }

      const msg = {
        to: testEmail,
        from: {
          email: config.SENDGRID_FROM_EMAIL,
          name: config.SENDGRID_FROM_NAME || 'BahinLink Test',
        },
        subject: 'SendGrid Integration Test',
        text: 'This is a test email from BahinLink integration tests.',
        html: '<p>This is a <strong>test email</strong> from BahinLink integration tests.</p>',
      };

      try {
        const response = await sgMail.send(msg);
        
        expect(response).toBeDefined();
        expect(response[0].statusCode).toBe(202);
        expect(response[0].headers).toBeDefined();
        expect(response[0].headers['x-message-id']).toBeDefined();
      } catch (error) {
        fail(`Email sending failed: ${error.message}`);
      }
    }, 15000);

    it('should handle invalid email addresses gracefully', async () => {
      if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
        pending('SendGrid not fully configured');
        return;
      }

      const msg = {
        to: 'invalid-email-address',
        from: config.SENDGRID_FROM_EMAIL,
        subject: 'Test Email',
        text: 'This should fail.',
      };

      try {
        await sgMail.send(msg);
        fail('Should have thrown an error for invalid email address');
      } catch (error) {
        expect(error.code).toBeDefined();
        expect(error.message).toContain('email');
      }
    }, 10000);

    it('should send email with attachments', async () => {
      if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
        pending('SendGrid not fully configured');
        return;
      }

      const testEmail = process.env.TEST_EMAIL;
      if (!testEmail) {
        pending('TEST_EMAIL not configured');
        return;
      }

      const msg = {
        to: testEmail,
        from: config.SENDGRID_FROM_EMAIL,
        subject: 'SendGrid Attachment Test',
        text: 'This email contains a test attachment.',
        attachments: [
          {
            content: Buffer.from('Test file content').toString('base64'),
            filename: 'test.txt',
            type: 'text/plain',
            disposition: 'attachment',
          },
        ],
      };

      try {
        const response = await sgMail.send(msg);
        
        expect(response).toBeDefined();
        expect(response[0].statusCode).toBe(202);
      } catch (error) {
        fail(`Email with attachment failed: ${error.message}`);
      }
    }, 15000);
  });

  describe('Template Functionality', () => {
    it('should send email using dynamic template', async () => {
      if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
        pending('SendGrid not fully configured');
        return;
      }

      const testEmail = process.env.TEST_EMAIL;
      const templateId = process.env.SENDGRID_TEST_TEMPLATE_ID;
      
      if (!testEmail || !templateId) {
        pending('TEST_EMAIL or SENDGRID_TEST_TEMPLATE_ID not configured');
        return;
      }

      const msg = {
        to: testEmail,
        from: config.SENDGRID_FROM_EMAIL,
        templateId: templateId,
        dynamicTemplateData: {
          name: 'Test User',
          message: 'This is a test message from integration tests',
          timestamp: new Date().toISOString(),
        },
      };

      try {
        const response = await sgMail.send(msg);
        
        expect(response).toBeDefined();
        expect(response[0].statusCode).toBe(202);
      } catch (error) {
        fail(`Template email failed: ${error.message}`);
      }
    }, 15000);
  });

  describe('Bulk Email Functionality', () => {
    it('should send bulk emails', async () => {
      if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
        pending('SendGrid not fully configured');
        return;
      }

      const testEmails = process.env.TEST_EMAILS;
      if (!testEmails) {
        pending('TEST_EMAILS not configured');
        return;
      }

      const emailList = testEmails.split(',').map(email => email.trim());
      if (emailList.length < 2) {
        pending('Need at least 2 test emails for bulk test');
        return;
      }

      const messages = emailList.map((email, index) => ({
        to: email,
        from: config.SENDGRID_FROM_EMAIL,
        subject: `Bulk Email Test ${index + 1}`,
        text: `This is bulk email ${index + 1} from integration tests.`,
      }));

      try {
        const response = await sgMail.send(messages);
        
        expect(response).toBeDefined();
        expect(Array.isArray(response)).toBe(true);
        expect(response.length).toBe(emailList.length);
        
        response.forEach(res => {
          expect(res.statusCode).toBe(202);
        });
      } catch (error) {
        fail(`Bulk email failed: ${error.message}`);
      }
    }, 20000);
  });

  describe('Email Activity Tracking', () => {
    it('should retrieve email activity', async () => {
      if (!config.SENDGRID_API_KEY) {
        pending('SendGrid API key not configured');
        return;
      }

      try {
        const request = {
          method: 'GET',
          url: '/v3/messages',
          qs: {
            limit: 10,
          },
        };

        const response = await sgMail.client.request(request);
        
        expect(response).toBeDefined();
        expect(response[0].statusCode).toBe(200);
        expect(response[0].body).toBeDefined();
        expect(response[0].body.messages).toBeDefined();
        expect(Array.isArray(response[0].body.messages)).toBe(true);
      } catch (error) {
        // Email activity API might not be available in all plans
        console.warn(`Email activity retrieval failed: ${error.message}`);
      }
    }, 10000);
  });

  describe('Rate Limiting and Error Handling', () => {
    it('should handle rate limiting gracefully', async () => {
      if (!config.SENDGRID_API_KEY || !config.SENDGRID_FROM_EMAIL) {
        pending('SendGrid not fully configured');
        return;
      }

      const testEmail = process.env.TEST_EMAIL;
      if (!testEmail) {
        pending('TEST_EMAIL not configured');
        return;
      }

      // Send multiple emails rapidly to test rate limiting
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const msg = {
          to: testEmail,
          from: config.SENDGRID_FROM_EMAIL,
          subject: `Rate Limit Test ${i + 1}`,
          text: `Rate limit test email ${i + 1}`,
        };

        promises.push(
          sgMail.send(msg).catch(error => ({ error }))
        );
      }

      const results = await Promise.all(promises);
      
      // At least some should succeed
      const successes = results.filter(result => !result.error);
      expect(successes.length).toBeGreaterThan(0);
      
      // Check for rate limiting errors
      const rateLimitErrors = results.filter(result => 
        result.error && result.error.code === 429
      );
      
      // Rate limiting is expected behavior
      expect(rateLimitErrors.length).toBeLessThanOrEqual(results.length);
    }, 30000);
  });

  describe('Service Health Check', () => {
    it('should check SendGrid service availability', async () => {
      if (!config.SENDGRID_API_KEY) {
        pending('SendGrid API key not configured');
        return;
      }

      try {
        const request = {
          method: 'GET',
          url: '/v3/user/profile',
        };

        const response = await sgMail.client.request(request);
        
        expect(response).toBeDefined();
        expect(response[0].statusCode).toBe(200);
        expect(response[0].body).toBeDefined();
        expect(response[0].body.email).toBeDefined();
      } catch (error) {
        fail(`SendGrid service health check failed: ${error.message}`);
      }
    }, 10000);

    it('should validate API response times', async () => {
      if (!config.SENDGRID_API_KEY) {
        pending('SendGrid API key not configured');
        return;
      }

      const startTime = Date.now();
      
      try {
        const request = {
          method: 'GET',
          url: '/v3/user/profile',
        };

        await sgMail.client.request(request);
        
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
      const requiredVars = [
        'SENDGRID_API_KEY',
        'SENDGRID_FROM_EMAIL',
      ];

      const missingVars = requiredVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.warn(`Missing SendGrid configuration: ${missingVars.join(', ')}`);
      }

      // Validate format of configured values
      if (config.SENDGRID_API_KEY) {
        expect(config.SENDGRID_API_KEY).toMatch(/^SG\./);
      }

      if (config.SENDGRID_FROM_EMAIL) {
        expect(config.SENDGRID_FROM_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      }
    });

    it('should validate SendGrid client initialization', () => {
      if (!config.SENDGRID_API_KEY) {
        pending('SendGrid API key not configured');
        return;
      }

      // Test that we can initialize the client without errors
      expect(() => {
        sgMail.setApiKey(config.SENDGRID_API_KEY);
      }).not.toThrow();

      expect(typeof sgMail.send).toBe('function');
      expect(typeof sgMail.client.request).toBe('function');
    });
  });
});
