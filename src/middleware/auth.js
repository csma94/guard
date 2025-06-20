const { clerkClient } = require('@clerk/backend');
const { ApiError } = require('./errorHandler');
const logger = require('../config/logger');

/**
 * Validate API key middleware
 */
const validateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      throw new ApiError(401, 'API key required');
    }

    const prisma = req.app.locals.prisma;
    const cache = req.app.locals.cache;

    // Check cache first for performance
    const cacheKey = `api_key:${apiKey}`;
    let keyData = await cache.get(cacheKey);

    if (!keyData) {
      // Query database for API key
      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: {
          key: apiKey,
          status: 'ACTIVE'
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
              status: true
            }
          }
        }
      });

      if (!apiKeyRecord) {
        throw new ApiError(401, 'Invalid API key');
      }

      // Check if API key is expired
      if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
        throw new ApiError(401, 'API key expired');
      }

      // Check rate limiting
      if (apiKeyRecord.rateLimit) {
        const rateLimitKey = `rate_limit:${apiKey}:${Math.floor(Date.now() / 60000)}`; // Per minute
        const currentUsage = await cache.get(rateLimitKey) || 0;

        if (currentUsage >= apiKeyRecord.rateLimit) {
          throw new ApiError(429, 'API rate limit exceeded');
        }

        // Increment usage counter
        await cache.set(rateLimitKey, currentUsage + 1, 60); // 1 minute TTL
      }

      keyData = {
        id: apiKeyRecord.id,
        name: apiKeyRecord.name,
        permissions: apiKeyRecord.permissions,
        user: apiKeyRecord.user,
        lastUsedAt: apiKeyRecord.lastUsedAt
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, keyData, 300);

      // Update last used timestamp (async, don't wait)
      prisma.apiKey.update({
        where: { id: apiKeyRecord.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 }
        }
      }).catch(error => {
        logger.error('Failed to update API key usage:', error);
      });
    }

    // Check user status
    if (keyData.user.status !== 'ACTIVE') {
      throw new ApiError(401, 'User account is not active');
    }

    // Attach API key info to request
    req.apiKey = keyData;
    req.user = keyData.user;

    // Log API key usage
    logger.info('API key validated', {
      apiKeyId: keyData.id,
      apiKeyName: keyData.name,
      userId: keyData.user.id,
      username: keyData.user.username,
      endpoint: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }

    logger.error('API key validation failed:', error);
    next(new ApiError(500, 'API key validation failed'));
  }
};

/**
 * Authenticate Clerk token middleware
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Access token required');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify Clerk session token
    const sessionClaims = await clerkClient.verifyToken(token);

    if (!sessionClaims || !sessionClaims.sub) {
      throw new ApiError(401, 'Invalid token');
    }

    // Get user from Clerk
    const clerkUser = await clerkClient.users.getUser(sessionClaims.sub);

    if (!clerkUser) {
      throw new ApiError(401, 'User not found');
    }

    // Create user object compatible with existing code
    const user = {
      id: clerkUser.id,
      username: clerkUser.username || clerkUser.emailAddresses[0]?.emailAddress?.split('@')[0],
      email: clerkUser.emailAddresses[0]?.emailAddress,
      role: clerkUser.publicMetadata?.role || 'USER',
      status: 'ACTIVE', // Clerk users are active by default
      profile: {
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
      },
      clerkUser: clerkUser, // Store full Clerk user for reference
    };

    // Add user to request object
    req.user = user;
    req.token = token;
    req.sessionClaims = sessionClaims;

    // Log authentication event
    logger.info('Clerk token validated', {
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    next();
  } catch (error) {
    // Log failed authentication
    logger.warn('Clerk token validation failed', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(401, 'Authentication failed'));
    }
  }
};

/**
 * Authorize user roles middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    
    if (!roles.includes(req.user.role)) {
      logger.authz('access_denied', req.user.id, req.originalUrl, {
        allowed: false,
        requiredRoles: roles,
        userRole: req.user.role,
      });
      
      return next(new ApiError(403, 'Insufficient permissions'));
    }
    
    logger.authz('access_granted', req.user.id, req.originalUrl, {
      allowed: true,
      userRole: req.user.role,
    });
    
    next();
  };
};

/**
 * Check if user owns resource or has admin/supervisor role
 */
const authorizeOwnerOrRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    
    // Allow if user has required role
    if (roles.includes(req.user.role)) {
      return next();
    }
    
    // Allow if user owns the resource (check userId parameter)
    const resourceUserId = req.params.userId || req.params.id;
    if (resourceUserId && resourceUserId === req.user.id) {
      return next();
    }
    
    // For agents, check if they own the agent resource
    if (req.user.role === 'AGENT' && req.user.agent) {
      const agentId = req.params.agentId;
      if (agentId && agentId === req.user.agent.id) {
        return next();
      }
    }
    
    logger.authz('access_denied', req.user.id, req.originalUrl, {
      allowed: false,
      reason: 'not_owner_or_insufficient_role',
      requiredRoles: roles,
      userRole: req.user.role,
    });
    
    return next(new ApiError(403, 'Access denied'));
  };
};

/**
 * Check if user can access client data
 */
const authorizeClientAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    
    // Admin and supervisor can access all client data
    if (['ADMIN', 'SUPERVISOR'].includes(req.user.role)) {
      return next();
    }
    
    // Client users can only access their own data
    if (req.user.role === 'CLIENT') {
      const clientId = req.params.clientId;

      if (!clientId) {
        return next(new ApiError(400, 'Client ID required'));
      }

      // Check if user belongs to this client
      const prisma = req.app.locals.prisma;
      const clientUser = await prisma.user.findFirst({
        where: {
          id: req.user.id,
          role: 'CLIENT',
          client: {
            id: clientId
          }
        },
        include: {
          client: {
            select: {
              id: true,
              companyName: true
            }
          }
        }
      });

      if (!clientUser || !clientUser.client) {
        logger.authz('client_access_denied', req.user.id, clientId, {
          allowed: false,
          reason: 'user_not_associated_with_client',
          userRole: req.user.role
        });
        return next(new ApiError(403, 'Access denied to client data'));
      }

      // Add client info to request for downstream use
      req.clientAccess = {
        clientId: clientUser.client.id,
        companyName: clientUser.client.companyName
      };
    }
    
    // Agents cannot access client data directly
    if (req.user.role === 'AGENT') {
      return next(new ApiError(403, 'Agents cannot access client data'));
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user can access site data
 */
const authorizeSiteAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    
    // Admin can access all sites
    if (req.user.role === 'ADMIN') {
      return next();
    }
    
    const siteId = req.params.siteId || req.body.siteId;
    
    if (!siteId) {
      return next(new ApiError(400, 'Site ID required'));
    }
    
    const prisma = req.app.locals.prisma;
    
    // Get site information
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        clientId: true,
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });
    
    if (!site) {
      return next(new ApiError(404, 'Site not found'));
    }
    
    // Supervisor can access sites they supervise
    if (req.user.role === 'SUPERVISOR') {
      // Check if supervisor has shifts at this site
      const supervisorShift = await prisma.shift.findFirst({
        where: {
          siteId: siteId,
          supervisorId: req.user.id,
        },
      });
      
      if (supervisorShift) {
        return next();
      }
    }
    
    // Agent can access sites where they have shifts
    if (req.user.role === 'AGENT' && req.user.agent) {
      const agentShift = await prisma.shift.findFirst({
        where: {
          siteId: siteId,
          agentId: req.user.agent.id,
        },
      });
      
      if (agentShift) {
        return next();
      }
    }
    
    // Client can access their own sites
    if (req.user.role === 'CLIENT') {
      // Check if user belongs to the client that owns this site
      const userClient = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          client: {
            select: { id: true }
          }
        }
      });

      if (!userClient?.client || userClient.client.id !== site.clientId) {
        logger.authz('site_access_denied', req.user.id, siteId, {
          allowed: false,
          reason: 'client_user_not_associated_with_site_client',
          userRole: req.user.role,
          userClientId: userClient?.client?.id,
          siteClientId: site.clientId
        });
        return next(new ApiError(403, 'Access denied to site'));
      }

      return next();
    }
    
    logger.authz('site_access_denied', req.user.id, siteId, {
      allowed: false,
      userRole: req.user.role,
      siteId: siteId,
    });
    
    return next(new ApiError(403, 'Access denied to site'));
  } catch (error) {
    next(error);
  }
};

/**
 * Optional Clerk authentication middleware
 * Adds user to request if token is provided, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // No token provided, continue without user
    }

    const token = authHeader.substring(7);

    // Verify Clerk session token
    const sessionClaims = await clerkClient.verifyToken(token);

    if (sessionClaims && sessionClaims.sub) {
      // Get user from Clerk
      const clerkUser = await clerkClient.users.getUser(sessionClaims.sub);

      if (clerkUser) {
        // Create user object compatible with existing code
        const user = {
          id: clerkUser.id,
          username: clerkUser.username || clerkUser.emailAddresses[0]?.emailAddress?.split('@')[0],
          email: clerkUser.emailAddresses[0]?.emailAddress,
          role: clerkUser.publicMetadata?.role || 'USER',
          status: 'ACTIVE',
          profile: {
            firstName: clerkUser.firstName,
            lastName: clerkUser.lastName,
          },
          clerkUser: clerkUser,
        };

        req.user = user;
        req.token = token;
        req.sessionClaims = sessionClaims;
      }
    }

    next();
  } catch (error) {
    // If token is invalid, continue without user
    next();
  }
};

module.exports = {
  validateApiKey,
  authenticate,
  authorize,
  authorizeOwnerOrRole,
  authorizeClientAccess,
  authorizeSiteAccess,
  optionalAuth,
};
