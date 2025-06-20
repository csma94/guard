import React, { useState } from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Box,
  Typography,
  IconButton,
  useTheme,
  useMediaQuery,
  Avatar,
  Chip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Security as SecurityIcon,
  Schedule as ScheduleIcon,
  LocationOn as LocationIcon,
  Assessment as ReportsIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  Business as BusinessIcon,
  Assignment as AssignmentIcon,
  Notifications as NotificationsIcon,
  Group as ClientIcon,
  Phone as CommunicationIcon,
  AccountBalance as BillingIcon,
  ExpandLess,
  ExpandMore,
  Close as CloseIcon,
  AdminPanelSettings as AdminIcon,
  Gavel as ComplianceIcon,
  Extension as IntegrationIcon,
  MonitorHeart as MonitoringIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { UserButton } from '@clerk/clerk-react';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  variant?: 'permanent' | 'persistent' | 'temporary';
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: MenuItem[];
  roles?: string[];
  badge?: string | number;
}

const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <DashboardIcon />,
    path: '/dashboard',
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: <MonitoringIcon />,
    children: [
      {
        id: 'live-tracking',
        label: 'Live Agent Tracking',
        icon: <LocationIcon />,
        path: '/operations/tracking',
      },
      {
        id: 'shift-management',
        label: 'Shift Management',
        icon: <ScheduleIcon />,
        path: '/operations/shifts',
      },
      {
        id: 'incident-response',
        label: 'Incident Response',
        icon: <SecurityIcon />,
        path: '/operations/incidents',
      },
      {
        id: 'communication',
        label: 'Communication Center',
        icon: <CommunicationIcon />,
        path: '/operations/communication',
      },
    ],
  },
  {
    id: 'workforce',
    label: 'Workforce Management',
    icon: <PeopleIcon />,
    children: [
      {
        id: 'agents',
        label: 'Agent Management',
        icon: <PeopleIcon />,
        path: '/workforce/agents',
      },
      {
        id: 'scheduling',
        label: 'Shift Scheduling',
        icon: <ScheduleIcon />,
        path: '/workforce/scheduling',
      },
      {
        id: 'performance',
        label: 'Performance Tracking',
        icon: <AnalyticsIcon />,
        path: '/workforce/performance',
      },
      {
        id: 'training',
        label: 'Training & Certification',
        icon: <AssignmentIcon />,
        path: '/workforce/training',
      },
    ],
  },
  {
    id: 'sites',
    label: 'Site Management',
    icon: <BusinessIcon />,
    children: [
      {
        id: 'sites-overview',
        label: 'Sites Overview',
        icon: <BusinessIcon />,
        path: '/sites/overview',
      },
      {
        id: 'geofencing',
        label: 'Geofencing',
        icon: <LocationIcon />,
        path: '/sites/geofencing',
      },
      {
        id: 'site-security',
        label: 'Site Security',
        icon: <SecurityIcon />,
        path: '/sites/security',
      },
    ],
  },
  {
    id: 'clients',
    label: 'Client Management',
    icon: <ClientIcon />,
    children: [
      {
        id: 'client-overview',
        label: 'Client Overview',
        icon: <ClientIcon />,
        path: '/clients/overview',
      },
      {
        id: 'contracts',
        label: 'Contracts & SLAs',
        icon: <AssignmentIcon />,
        path: '/clients/contracts',
      },
      {
        id: 'client-portal',
        label: 'Client Portal Access',
        icon: <SecurityIcon />,
        path: '/clients/portal',
      },
      {
        id: 'billing',
        label: 'Billing & Invoicing',
        icon: <BillingIcon />,
        path: '/clients/billing',
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    icon: <ReportsIcon />,
    children: [
      {
        id: 'incident-reports',
        label: 'Incident Reports',
        icon: <SecurityIcon />,
        path: '/reports/incidents',
      },
      {
        id: 'patrol-reports',
        label: 'Patrol Reports',
        icon: <LocationIcon />,
        path: '/reports/patrols',
      },
      {
        id: 'analytics-dashboard',
        label: 'Analytics Dashboard',
        icon: <AnalyticsIcon />,
        path: '/reports/analytics',
      },
      {
        id: 'custom-reports',
        label: 'Custom Reports',
        icon: <ReportsIcon />,
        path: '/reports/custom',
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: <AdminIcon />,
    roles: ['ADMIN', 'SUPERVISOR'],
    children: [
      {
        id: 'user-management',
        label: 'User Management',
        icon: <PeopleIcon />,
        path: '/admin/users',
      },
      {
        id: 'system-settings',
        label: 'System Settings',
        icon: <SettingsIcon />,
        path: '/admin/settings',
      },
      {
        id: 'security-settings',
        label: 'Security Settings',
        icon: <SecurityIcon />,
        path: '/admin/security',
      },
      {
        id: 'audit-logs',
        label: 'Audit Logs',
        icon: <AssignmentIcon />,
        path: '/admin/audit',
      },
      {
        id: 'compliance',
        label: 'Compliance Management',
        icon: <ComplianceIcon />,
        path: '/admin/compliance',
      },
      {
        id: 'integrations',
        label: 'Integrations',
        icon: <IntegrationIcon />,
        path: '/admin/integrations',
      },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <NotificationsIcon />,
    path: '/notifications',
    badge: 5,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <SettingsIcon />,
    path: '/settings',
  },
];

const Sidebar: React.FC<SidebarProps> = ({ open, onClose, variant = 'temporary' }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role } = useAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [expandedItems, setExpandedItems] = useState<string[]>(['dashboard']);

  const handleItemClick = (item: MenuItem) => {
    if (item.children) {
      const isExpanded = expandedItems.includes(item.id);
      if (isExpanded) {
        setExpandedItems(expandedItems.filter(id => id !== item.id));
      } else {
        setExpandedItems([...expandedItems, item.id]);
      }
    } else if (item.path) {
      navigate(item.path);
      if (isMobile) {
        onClose();
      }
    }
  };

  const isItemActive = (path: string) => {
    return location.pathname === path;
  };

  const hasPermission = (item: MenuItem) => {
    if (!item.roles) return true;
    return item.roles.includes((role as string) || 'USER');
  };

  const renderMenuItem = (item: MenuItem, level = 0) => {
    if (!hasPermission(item)) return null;

    const isExpanded = expandedItems.includes(item.id);
    const isActive = item.path ? isItemActive(item.path) : false;

    return (
      <React.Fragment key={item.id}>
        <ListItem disablePadding sx={{ pl: level * 2 }}>
          <ListItemButton
            onClick={() => handleItemClick(item)}
            selected={isActive}
            sx={{
              minHeight: 48,
              borderRadius: 1,
              mx: 1,
              '&.Mui-selected': {
                backgroundColor: theme.palette.primary.main,
                color: theme.palette.primary.contrastText,
                '&:hover': {
                  backgroundColor: theme.palette.primary.dark,
                },
                '& .MuiListItemIcon-root': {
                  color: theme.palette.primary.contrastText,
                },
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 40,
                color: isActive ? 'inherit' : theme.palette.text.secondary,
              }}
            >
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 400,
              }}
            />
            {item.badge && (
              <Chip
                label={item.badge}
                size="small"
                color="error"
                sx={{ height: 20, fontSize: '0.75rem' }}
              />
            )}
            {item.children && (
              isExpanded ? <ExpandLess /> : <ExpandMore />
            )}
          </ListItemButton>
        </ListItem>
        {item.children && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {item.children.map(child => renderMenuItem(child, level + 1))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar
              sx={{
                width: 40,
                height: 40,
                bgcolor: theme.palette.primary.main,
                fontSize: '1.2rem',
                fontWeight: 'bold',
              }}
            >
              B
            </Avatar>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 'bold', lineHeight: 1 }}>
                BahinLink
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Security Management
              </Typography>
            </Box>
          </Box>
          {isMobile && (
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* User Info */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box display="flex" alignItems="center" gap={2}>
          <Box flex={1} display="flex" alignItems="center" gap={2}>
            <Avatar
              src={user?.imageUrl}
              sx={{ width: 32, height: 32 }}
            >
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {user?.firstName} {user?.lastName}
              </Typography>
              <Chip
                label={(role as string) || 'User'}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            </Box>
          </Box>
          <UserButton
            appearance={{
              elements: {
                avatarBox: {
                  width: '32px',
                  height: '32px',
                }
              }
            }}
          />
        </Box>
      </Box>

      {/* Navigation Menu */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        <List>
          {menuItems.map(item => renderMenuItem(item))}
        </List>
      </Box>

      {/* Footer */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" align="center" display="block">
          BahinLink v1.0.0
        </Typography>
        <Typography variant="caption" color="text.secondary" align="center" display="block">
          © 2024 Bahin SARL
        </Typography>
      </Box>
    </Box>
  );

  const drawerWidth = 280;

  return (
    <Drawer
      variant={variant}
      open={open}
      onClose={onClose}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          borderRight: 1,
          borderColor: 'divider',
        },
      }}
      ModalProps={{
        keepMounted: true, // Better open performance on mobile
      }}
    >
      {drawerContent}
    </Drawer>
  );
};

export default Sidebar;
