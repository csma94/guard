import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystemRole: boolean;
  hierarchy: number; // Higher number = more privileged
  inheritsFrom?: string[]; // Role inheritance
}

export interface AccessContext {
  userId: string;
  userRole: string;
  resource: string;
  action: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  timestamp: Date;
}

export interface AccessResult {
  granted: boolean;
  reason?: string;
  conditions?: Record<string, any>;
  auditLog: {
    userId: string;
    resource: string;
    action: string;
    granted: boolean;
    timestamp: Date;
    reason?: string;
  };
}

class RBACService {
  private roles: Map<string, Role> = new Map();
  private permissions: Map<string, Permission> = new Map();
  private userRoles: Map<string, string[]> = new Map();
  private accessCache: Map<string, { result: boolean; expiry: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.initializeSystemRoles();
    this.initializeCleanupTasks();
  }

  private initializeSystemRoles(): void {
    // Define system permissions
    const permissions = [
      // User Management
      { id: 'users.create', name: 'Create Users', resource: 'users', action: 'create' },
      { id: 'users.read', name: 'Read Users', resource: 'users', action: 'read' },
      { id: 'users.update', name: 'Update Users', resource: 'users', action: 'update' },
      { id: 'users.delete', name: 'Delete Users', resource: 'users', action: 'delete' },
      
      // Agent Management
      { id: 'agents.create', name: 'Create Agents', resource: 'agents', action: 'create' },
      { id: 'agents.read', name: 'Read Agents', resource: 'agents', action: 'read' },
      { id: 'agents.update', name: 'Update Agents', resource: 'agents', action: 'update' },
      { id: 'agents.delete', name: 'Delete Agents', resource: 'agents', action: 'delete' },
      { id: 'agents.assign', name: 'Assign Agents', resource: 'agents', action: 'assign' },
      
      // Shift Management
      { id: 'shifts.create', name: 'Create Shifts', resource: 'shifts', action: 'create' },
      { id: 'shifts.read', name: 'Read Shifts', resource: 'shifts', action: 'read' },
      { id: 'shifts.update', name: 'Update Shifts', resource: 'shifts', action: 'update' },
      { id: 'shifts.delete', name: 'Delete Shifts', resource: 'shifts', action: 'delete' },
      { id: 'shifts.approve', name: 'Approve Shifts', resource: 'shifts', action: 'approve' },
      
      // Report Management
      { id: 'reports.create', name: 'Create Reports', resource: 'reports', action: 'create' },
      { id: 'reports.read', name: 'Read Reports', resource: 'reports', action: 'read' },
      { id: 'reports.update', name: 'Update Reports', resource: 'reports', action: 'update' },
      { id: 'reports.delete', name: 'Delete Reports', resource: 'reports', action: 'delete' },
      { id: 'reports.approve', name: 'Approve Reports', resource: 'reports', action: 'approve' },
      
      // Site Management
      { id: 'sites.create', name: 'Create Sites', resource: 'sites', action: 'create' },
      { id: 'sites.read', name: 'Read Sites', resource: 'sites', action: 'read' },
      { id: 'sites.update', name: 'Update Sites', resource: 'sites', action: 'update' },
      { id: 'sites.delete', name: 'Delete Sites', resource: 'sites', action: 'delete' },
      
      // Client Management
      { id: 'clients.create', name: 'Create Clients', resource: 'clients', action: 'create' },
      { id: 'clients.read', name: 'Read Clients', resource: 'clients', action: 'read' },
      { id: 'clients.update', name: 'Update Clients', resource: 'clients', action: 'update' },
      { id: 'clients.delete', name: 'Delete Clients', resource: 'clients', action: 'delete' },
      
      // Analytics & Reporting
      { id: 'analytics.read', name: 'Read Analytics', resource: 'analytics', action: 'read' },
      { id: 'analytics.export', name: 'Export Analytics', resource: 'analytics', action: 'export' },
      
      // System Administration
      { id: 'system.configure', name: 'Configure System', resource: 'system', action: 'configure' },
      { id: 'system.audit', name: 'Access Audit Logs', resource: 'system', action: 'audit' },
      { id: 'system.backup', name: 'Backup System', resource: 'system', action: 'backup' },
      
      // Emergency Management
      { id: 'emergency.respond', name: 'Respond to Emergencies', resource: 'emergency', action: 'respond' },
      { id: 'emergency.escalate', name: 'Escalate Emergencies', resource: 'emergency', action: 'escalate' },
    ];

    // Store permissions
    permissions.forEach(perm => {
      this.permissions.set(perm.id, {
        ...perm,
        description: perm.name,
      } as Permission);
    });

    // Define system roles
    const systemRoles: Role[] = [
      {
        id: 'super_admin',
        name: 'Super Administrator',
        description: 'Full system access with all permissions',
        permissions: Array.from(this.permissions.values()),
        isSystemRole: true,
        hierarchy: 100,
      },
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Administrative access with most permissions',
        permissions: Array.from(this.permissions.values()).filter(p => 
          !p.id.startsWith('system.') || p.id === 'system.audit'
        ),
        isSystemRole: true,
        hierarchy: 90,
      },
      {
        id: 'supervisor',
        name: 'Supervisor',
        description: 'Supervisory access for managing agents and operations',
        permissions: Array.from(this.permissions.values()).filter(p => 
          p.resource === 'agents' || 
          p.resource === 'shifts' || 
          p.resource === 'reports' ||
          p.resource === 'emergency' ||
          (p.resource === 'analytics' && p.action === 'read')
        ),
        isSystemRole: true,
        hierarchy: 70,
      },
      {
        id: 'agent',
        name: 'Security Agent',
        description: 'Basic agent access for field operations',
        permissions: Array.from(this.permissions.values()).filter(p => 
          (p.resource === 'shifts' && ['read', 'update'].includes(p.action)) ||
          (p.resource === 'reports' && ['create', 'read', 'update'].includes(p.action)) ||
          (p.resource === 'emergency' && p.action === 'respond')
        ),
        isSystemRole: true,
        hierarchy: 50,
      },
      {
        id: 'client',
        name: 'Client',
        description: 'Client access for viewing reports and monitoring',
        permissions: Array.from(this.permissions.values()).filter(p => 
          (p.resource === 'reports' && p.action === 'read') ||
          (p.resource === 'sites' && p.action === 'read') ||
          (p.resource === 'analytics' && p.action === 'read')
        ),
        isSystemRole: true,
        hierarchy: 30,
      },
      {
        id: 'viewer',
        name: 'Viewer',
        description: 'Read-only access to basic information',
        permissions: Array.from(this.permissions.values()).filter(p => 
          p.action === 'read' && !p.resource.startsWith('system')
        ),
        isSystemRole: true,
        hierarchy: 10,
      },
    ];

    // Store roles
    systemRoles.forEach(role => {
      this.roles.set(role.id, role);
    });

    logger.info('RBAC system initialized with system roles and permissions');
  }

  private initializeCleanupTasks(): void {
    // Clean up access cache every 10 minutes
    setInterval(() => {
      this.cleanupAccessCache();
    }, 10 * 60 * 1000);
  }

  public async checkAccess(context: AccessContext): Promise<AccessResult> {
    try {
      const cacheKey = this.generateCacheKey(context);
      const cached = this.accessCache.get(cacheKey);
      
      if (cached && cached.expiry > Date.now()) {
        return {
          granted: cached.result,
          reason: cached.result ? 'Access granted (cached)' : 'Access denied (cached)',
          auditLog: this.createAuditLog(context, cached.result, 'Cached result'),
        };
      }

      // Get user roles
      const userRoles = await this.getUserRoles(context.userId);
      if (userRoles.length === 0) {
        const result = this.createAccessResult(context, false, 'No roles assigned to user');
        this.cacheAccessResult(cacheKey, false);
        return result;
      }

      // Check permissions for each role
      let hasPermission = false;
      let grantingRole: string | null = null;

      for (const roleId of userRoles) {
        const role = this.roles.get(roleId);
        if (!role) continue;

        const rolePermission = await this.checkRolePermission(role, context);
        if (rolePermission) {
          hasPermission = true;
          grantingRole = role.name;
          break;
        }
      }

      // Additional context-based checks
      if (hasPermission) {
        hasPermission = await this.checkContextualConditions(context, userRoles);
      }

      const reason = hasPermission 
        ? `Access granted via role: ${grantingRole}`
        : 'Insufficient permissions';

      const result = this.createAccessResult(context, hasPermission, reason);
      this.cacheAccessResult(cacheKey, hasPermission);

      return result;

    } catch (error) {
      logger.error('Access check error:', error);
      return this.createAccessResult(context, false, 'Access check failed');
    }
  }

  public async assignRole(userId: string, roleId: string): Promise<boolean> {
    try {
      const role = this.roles.get(roleId);
      if (!role) {
        throw new Error(`Role ${roleId} not found`);
      }

      const currentRoles = await this.getUserRoles(userId);
      if (!currentRoles.includes(roleId)) {
        currentRoles.push(roleId);
        this.userRoles.set(userId, currentRoles);
        
        // Persist to database
        await this.persistUserRoles(userId, currentRoles);
        
        // Clear cache for this user
        this.clearUserCache(userId);
        
        logger.info(`Role ${roleId} assigned to user ${userId}`);
      }

      return true;

    } catch (error) {
      logger.error('Role assignment error:', error);
      return false;
    }
  }

  public async revokeRole(userId: string, roleId: string): Promise<boolean> {
    try {
      const currentRoles = await this.getUserRoles(userId);
      const updatedRoles = currentRoles.filter(r => r !== roleId);
      
      this.userRoles.set(userId, updatedRoles);
      
      // Persist to database
      await this.persistUserRoles(userId, updatedRoles);
      
      // Clear cache for this user
      this.clearUserCache(userId);
      
      logger.info(`Role ${roleId} revoked from user ${userId}`);
      return true;

    } catch (error) {
      logger.error('Role revocation error:', error);
      return false;
    }
  }

  public async createCustomRole(role: Omit<Role, 'id' | 'isSystemRole'>): Promise<string> {
    try {
      const roleId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newRole: Role = {
        ...role,
        id: roleId,
        isSystemRole: false,
      };

      this.roles.set(roleId, newRole);
      
      // Persist to database
      await this.persistRole(newRole);
      
      logger.info(`Custom role created: ${roleId}`);
      return roleId;

    } catch (error) {
      logger.error('Custom role creation error:', error);
      throw error;
    }
  }

  public async updateRole(roleId: string, updates: Partial<Role>): Promise<boolean> {
    try {
      const role = this.roles.get(roleId);
      if (!role) {
        throw new Error(`Role ${roleId} not found`);
      }

      if (role.isSystemRole) {
        throw new Error('Cannot modify system roles');
      }

      const updatedRole = { ...role, ...updates, id: roleId };
      this.roles.set(roleId, updatedRole);
      
      // Persist to database
      await this.persistRole(updatedRole);
      
      // Clear cache for all users with this role
      this.clearRoleCache(roleId);
      
      logger.info(`Role updated: ${roleId}`);
      return true;

    } catch (error) {
      logger.error('Role update error:', error);
      return false;
    }
  }

  public getRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  public getPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }

  public async getUserPermissions(userId: string): Promise<Permission[]> {
    const userRoles = await this.getUserRoles(userId);
    const permissions = new Set<Permission>();

    for (const roleId of userRoles) {
      const role = this.roles.get(roleId);
      if (role) {
        role.permissions.forEach(perm => permissions.add(perm));
      }
    }

    return Array.from(permissions);
  }

  private async checkRolePermission(role: Role, context: AccessContext): Promise<boolean> {
    return role.permissions.some(permission => 
      permission.resource === context.resource && 
      permission.action === context.action
    );
  }

  private async checkContextualConditions(context: AccessContext, userRoles: string[]): Promise<boolean> {
    // Implement additional contextual checks
    // For example: time-based access, IP restrictions, resource ownership, etc.
    
    // Check if user can only access their own resources
    if (context.resourceId && context.metadata?.ownerId) {
      if (context.metadata.ownerId !== context.userId) {
        // Check if user has elevated permissions
        const hasElevatedRole = userRoles.some(roleId => {
          const role = this.roles.get(roleId);
          return role && role.hierarchy >= 70; // Supervisor level or above
        });
        
        if (!hasElevatedRole) {
          return false;
        }
      }
    }

    return true;
  }

  private async getUserRoles(userId: string): Promise<string[]> {
    let roles = this.userRoles.get(userId);
    
    if (!roles) {
      // Load from database
      roles = await this.loadUserRolesFromDB(userId);
      this.userRoles.set(userId, roles);
    }
    
    return roles;
  }

  private generateCacheKey(context: AccessContext): string {
    return `access:${context.userId}:${context.resource}:${context.action}:${context.resourceId || 'all'}`;
  }

  private cacheAccessResult(cacheKey: string, granted: boolean): void {
    this.accessCache.set(cacheKey, {
      result: granted,
      expiry: Date.now() + this.cacheTimeout,
    });
  }

  private createAccessResult(context: AccessContext, granted: boolean, reason: string): AccessResult {
    return {
      granted,
      reason,
      auditLog: this.createAuditLog(context, granted, reason),
    };
  }

  private createAuditLog(context: AccessContext, granted: boolean, reason: string) {
    return {
      userId: context.userId,
      resource: context.resource,
      action: context.action,
      granted,
      timestamp: context.timestamp,
      reason,
    };
  }

  private cleanupAccessCache(): void {
    const now = Date.now();
    for (const [key, value] of this.accessCache.entries()) {
      if (value.expiry <= now) {
        this.accessCache.delete(key);
      }
    }
  }

  private clearUserCache(userId: string): void {
    for (const key of this.accessCache.keys()) {
      if (key.startsWith(`access:${userId}:`)) {
        this.accessCache.delete(key);
      }
    }
  }

  private clearRoleCache(roleId: string): void {
    // Clear cache for all users with this role
    this.accessCache.clear(); // Simple approach - clear all cache
  }

  // These methods would be implemented to interact with your database
  private async loadUserRolesFromDB(userId: string): Promise<string[]> {
    // Implementation depends on your database
    return [];
  }

  private async persistUserRoles(userId: string, roles: string[]): Promise<void> {
    // Implementation depends on your database
  }

  private async persistRole(role: Role): Promise<void> {
    // Implementation depends on your database
  }
}

export default RBACService;
