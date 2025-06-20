const express = require('express');
const { query, validationResult } = require('express-validator');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, authorize } = require('../middleware/auth');
const APIIntegrationService = require('../services/apiIntegration');
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /integration/endpoints:
 *   get:
 *     summary: Get API endpoints catalog
 *     description: Get comprehensive catalog of all available API endpoints
 *     tags: [Integration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API endpoints catalog retrieved successfully
 */
router.get('/endpoints',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const integrationService = new APIIntegrationService(req.app, req.app.locals.prisma);
    const catalog = await integrationService.scanAPIEndpoints();

    res.json({
      success: true,
      catalog
    });
  })
);

/**
 * @swagger
 * /integration/validate:
 *   get:
 *     summary: Validate API completeness
 *     description: Validate that all required API endpoints are implemented
 *     tags: [Integration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API validation completed
 */
router.get('/validate',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const integrationService = new APIIntegrationService(req.app, req.app.locals.prisma);
    const validation = await integrationService.validateAPICompleteness();

    res.json({
      success: true,
      validation
    });
  })
);

/**
 * @swagger
 * /integration/mobile/compatibility:
 *   get:
 *     summary: Test mobile app compatibility
 *     description: Test compatibility with mobile app requirements
 *     tags: [Integration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mobile compatibility test completed
 */
router.get('/mobile/compatibility',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const integrationService = new APIIntegrationService(req.app, req.app.locals.prisma);
    const compatibility = await integrationService.testMobileCompatibility();

    res.json({
      success: true,
      compatibility
    });
  })
);

/**
 * @swagger
 * /integration/health:
 *   get:
 *     summary: Test endpoint health
 *     description: Test the health and availability of API endpoints
 *     tags: [Integration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Endpoint health test completed
 */
router.get('/health',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const integrationService = new APIIntegrationService(req.app, req.app.locals.prisma);
    const health = await integrationService.testEndpointHealth();

    res.json({
      success: true,
      health
    });
  })
);

/**
 * @swagger
 * /integration/report:
 *   get:
 *     summary: Generate integration report
 *     description: Generate comprehensive integration and API completeness report
 *     tags: [Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, html]
 *           default: json
 *     responses:
 *       200:
 *         description: Integration report generated successfully
 */
router.get('/report',
  authenticate,
  authorize('ADMIN'),
  [
    query('format').optional().isIn(['json', 'html']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, 'Validation failed', true, JSON.stringify(errors.array()));
    }

    const { format = 'json' } = req.query;
    const integrationService = new APIIntegrationService(req.app, req.app.locals.prisma);
    const report = await integrationService.generateIntegrationReport();

    // Log report generation
    logger.audit('integration_report_generated', {
      generatedBy: req.user.id,
      format,
      timestamp: new Date()
    });

    if (format === 'html') {
      // Generate HTML report
      const htmlReport = generateHTMLReport(report);
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlReport);
    } else {
      res.json({
        success: true,
        report
      });
    }
  })
);

/**
 * @swagger
 * /integration/documentation:
 *   get:
 *     summary: Generate API documentation
 *     description: Generate OpenAPI/Swagger documentation for all endpoints
 *     tags: [Integration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API documentation generated successfully
 */
router.get('/documentation',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const integrationService = new APIIntegrationService(req.app, req.app.locals.prisma);
    const documentation = await integrationService.generateAPIDocumentation();

    res.json({
      success: true,
      documentation
    });
  })
);

/**
 * @swagger
 * /integration/status:
 *   get:
 *     summary: Get integration status
 *     description: Get overall integration status and health summary
 *     tags: [Integration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Integration status retrieved successfully
 */
router.get('/status',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const integrationService = new APIIntegrationService(req.app, req.app.locals.prisma);
    
    const [
      validation,
      compatibility,
      health,
      integrationValidation
    ] = await Promise.all([
      integrationService.validateAPICompleteness(),
      integrationService.testMobileCompatibility(),
      integrationService.testEndpointHealth(),
      integrationService.validateIntegrations()
    ]);

    const status = {
      overall: 'UNKNOWN',
      components: {
        apiCompleteness: {
          status: validation.coverage >= 95 ? 'EXCELLENT' : 
                 validation.coverage >= 80 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
          coverage: validation.coverage,
          missing: validation.missing.length
        },
        mobileCompatibility: {
          status: compatibility.overallScore >= 90 ? 'EXCELLENT' : 
                 compatibility.overallScore >= 75 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
          score: compatibility.overallScore,
          failed: compatibility.failed
        },
        endpointHealth: {
          status: health.overallHealth,
          successRate: (health.passed / health.totalTests) * 100,
          failed: health.failed
        },
        integrations: {
          status: integrationValidation.overallStatus,
          validationRate: (integrationValidation.validated / integrationValidation.totalIntegrations) * 100,
          failed: integrationValidation.failed
        }
      },
      lastChecked: new Date()
    };

    // Calculate overall status
    const scores = [
      validation.coverage,
      compatibility.overallScore,
      (health.passed / health.totalTests) * 100,
      (integrationValidation.validated / integrationValidation.totalIntegrations) * 100
    ];

    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    if (averageScore >= 90) {
      status.overall = 'EXCELLENT';
    } else if (averageScore >= 75) {
      status.overall = 'GOOD';
    } else if (averageScore >= 60) {
      status.overall = 'WARNING';
    } else {
      status.overall = 'CRITICAL';
    }

    res.json({
      success: true,
      status
    });
  })
);

/**
 * Generate HTML report
 */
function generateHTMLReport(report) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BahinLink API Integration Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .status-excellent { background: #d4edda; border-color: #c3e6cb; }
        .status-good { background: #fff3cd; border-color: #ffeaa7; }
        .status-warning { background: #f8d7da; border-color: #f5c6cb; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f8f9fa; border-radius: 3px; }
        .recommendations { background: #e9ecef; padding: 15px; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>BahinLink API Integration Report</h1>
        <p>Generated on: ${report.generatedAt}</p>
    </div>

    <div class="section">
        <h2>Summary</h2>
        <div class="metric">
            <strong>API Completeness:</strong> ${report.summary.apiCompleteness.coverage.toFixed(1)}%
            <span class="status-${report.summary.apiCompleteness.status.toLowerCase()}">${report.summary.apiCompleteness.status}</span>
        </div>
        <div class="metric">
            <strong>Mobile Compatibility:</strong> ${report.summary.mobileCompatibility.score.toFixed(1)}%
            <span class="status-${report.summary.mobileCompatibility.status.toLowerCase()}">${report.summary.mobileCompatibility.status}</span>
        </div>
        <div class="metric">
            <strong>Endpoint Health:</strong> ${report.summary.endpointHealth.status}
        </div>
        <div class="metric">
            <strong>Integration Validation:</strong> ${report.summary.integrationValidation.status}
        </div>
    </div>

    <div class="section">
        <h2>API Completeness Details</h2>
        <p><strong>Coverage:</strong> ${report.details.apiCompleteness.coverage.toFixed(1)}% (${report.details.apiCompleteness.implemented.length}/${report.details.apiCompleteness.totalRequired})</p>
        
        ${report.details.apiCompleteness.missing.length > 0 ? `
        <h3>Missing Endpoints</h3>
        <table>
            <tr><th>Method</th><th>Path</th><th>Module</th><th>Priority</th></tr>
            ${report.details.apiCompleteness.missing.map(endpoint => `
                <tr>
                    <td>${endpoint.method}</td>
                    <td>${endpoint.path}</td>
                    <td>${endpoint.module}</td>
                    <td>${endpoint.priority}</td>
                </tr>
            `).join('')}
        </table>
        ` : '<p>✅ All required endpoints are implemented!</p>'}
    </div>

    <div class="section">
        <h2>Mobile Compatibility</h2>
        <p><strong>Overall Score:</strong> ${report.details.mobileCompatibility.overallScore.toFixed(1)}%</p>
        <p><strong>Tests Passed:</strong> ${report.details.mobileCompatibility.passed}/${report.details.mobileCompatibility.requirements}</p>
        
        <h3>Test Results</h3>
        <table>
            <tr><th>Test</th><th>Status</th><th>Score</th></tr>
            ${report.details.mobileCompatibility.tests.map(test => `
                <tr>
                    <td>${test.name}</td>
                    <td>${test.passed ? '✅ PASS' : '❌ FAIL'}</td>
                    <td>${test.score}%</td>
                </tr>
            `).join('')}
        </table>
    </div>

    <div class="section">
        <h2>Endpoint Health</h2>
        <p><strong>Overall Health:</strong> ${report.details.endpointHealth.overallHealth}</p>
        <p><strong>Success Rate:</strong> ${((report.details.endpointHealth.passed / report.details.endpointHealth.totalTests) * 100).toFixed(1)}%</p>
        
        <h3>Health Test Results</h3>
        <table>
            <tr><th>Endpoint</th><th>Method</th><th>Status</th><th>Response Time</th></tr>
            ${report.details.endpointHealth.tests.map(test => `
                <tr>
                    <td>${test.endpoint}</td>
                    <td>${test.method}</td>
                    <td>${test.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}</td>
                    <td>${test.responseTime}ms</td>
                </tr>
            `).join('')}
        </table>
    </div>

    ${report.recommendations.length > 0 ? `
    <div class="section recommendations">
        <h2>Recommendations</h2>
        ${report.recommendations.map(rec => `
            <div style="margin: 10px 0; padding: 10px; border-left: 4px solid #007bff;">
                <strong>${rec.title}</strong> (${rec.priority} Priority)
                <p>${rec.description}</p>
                <p><em>Action:</em> ${rec.action}</p>
            </div>
        `).join('')}
    </div>
    ` : ''}

    <div class="section">
        <p><em>Report generated by BahinLink API Integration Service</em></p>
    </div>
</body>
</html>
  `;
}

module.exports = router;
