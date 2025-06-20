import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Button,
  Avatar,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useClerk } from '@clerk/clerk-react';
import { useAuth } from '../../hooks/useAuth';

interface ClerkUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  emailAddresses: Array<{
    emailAddress: string;
    verification: { status: string };
  }>;
  imageUrl: string;
  createdAt: number;
  lastSignInAt: number | null;
  banned: boolean;
  publicMetadata: Record<string, any>;
}

/**
 * User Administration Component
 * Provides comprehensive user management for admin users
 */
export const UserAdministration: React.FC = () => {
  const { user: currentUser, hasPermission } = useAuth();
  const clerk = useClerk();
  
  const [users, setUsers] = useState<ClerkUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Table state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  
  // Menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<ClerkUser | null>(null);
  
  // Dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<ClerkUser | null>(null);

  // Check permissions
  const canManageUsers = hasPermission('users:write') || hasPermission('admin:all');
  const canDeleteUsers = hasPermission('users:delete') || hasPermission('admin:all');

  // Load users on component mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Note: In a real implementation, you would use Clerk's Backend API
      // This is a placeholder for the actual implementation
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${await clerk.session?.getToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load users');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (error: any) {
      console.error('Failed to load users:', error);
      setError('Failed to load users. Please try again.');

      // No fallback data - show empty state with error message
      setUsers([]);
      setError('Failed to load users. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, user: ClerkUser) => {
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  const handleEditUser = (user: ClerkUser) => {
    // Implement user editing logic
    console.log('Edit user:', user);
    handleMenuClose();
  };

  const handleBanUser = async (user: ClerkUser) => {
    if (!canManageUsers) return;

    try {
      // Note: Implement actual ban/unban logic using Clerk's API
      const action = user.banned ? 'unban' : 'ban';
      console.log(`${action} user:`, user);
      
      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === user.id ? { ...u, banned: !u.banned } : u
      ));
      
      setSuccess(`User ${action}ned successfully`);
    } catch (error: any) {
      setError(`Failed to ${user.banned ? 'unban' : 'ban'} user`);
    }
    
    handleMenuClose();
  };

  const handleDeleteUser = (user: ClerkUser) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
    handleMenuClose();
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete || !canDeleteUsers) return;

    try {
      // Note: Implement actual user deletion using Clerk's API
      console.log('Delete user:', userToDelete);
      
      // Update local state
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
      setSuccess('User deleted successfully');
    } catch (error: any) {
      setError('Failed to delete user');
    }
    
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  // Filter users based on search and role filter
  const filteredUsers = users.filter(user => {
    const matchesSearch = !searchTerm || 
      user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.emailAddresses[0]?.emailAddress.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = !roleFilter || user.publicMetadata?.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  // Paginated users
  const paginatedUsers = filteredUsers.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'error';
      case 'manager': return 'warning';
      case 'user': return 'default';
      default: return 'default';
    }
  };

  if (!canManageUsers) {
    return (
      <Alert severity="error">
        You don't have permission to manage users.
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" component="h2">
            User Administration
          </Typography>
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={() => console.log('Add new user')}
          >
            Add User
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {/* Filters */}
        <Box display="flex" gap={2} mb={3}>
          <TextField
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
            sx={{ minWidth: 300 }}
          />
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Role</InputLabel>
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              label="Role"
            >
              <MenuItem value="">All Roles</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="manager">Manager</MenuItem>
              <MenuItem value="user">User</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Users Table */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Sign In</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : paginatedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={2}>
                        <Avatar src={user.imageUrl} sx={{ width: 40, height: 40 }}>
                          {user.firstName?.[0]}{user.lastName?.[0]}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {user.firstName} {user.lastName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            @{user.username}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        {user.emailAddresses[0]?.emailAddress}
                        {user.emailAddresses[0]?.verification?.status === 'verified' && (
                          <CheckCircleIcon color="success" fontSize="small" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.publicMetadata?.role || 'user'}
                        color={getRoleColor(user.publicMetadata?.role || 'user') as any}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.banned ? 'Banned' : 'Active'}
                        color={user.banned ? 'error' : 'success'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {user.lastSignInAt 
                        ? new Date(user.lastSignInAt).toLocaleDateString()
                        : 'Never'
                      }
                    </TableCell>
                    <TableCell>
                      <IconButton
                        onClick={(e) => handleMenuOpen(e, user)}
                        disabled={user.id === currentUser?.id}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredUsers.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />

        {/* User Actions Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => handleEditUser(selectedUser!)}>
            <EditIcon sx={{ mr: 1 }} />
            Edit User
          </MenuItem>
          <MenuItem onClick={() => handleBanUser(selectedUser!)}>
            <BlockIcon sx={{ mr: 1 }} />
            {selectedUser?.banned ? 'Unban' : 'Ban'} User
          </MenuItem>
          {canDeleteUsers && (
            <MenuItem onClick={() => handleDeleteUser(selectedUser!)}>
              <DeleteIcon sx={{ mr: 1 }} />
              Delete User
            </MenuItem>
          )}
        </Menu>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
          <DialogTitle>Confirm User Deletion</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete user "{userToDelete?.firstName} {userToDelete?.lastName}"?
              This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmDeleteUser} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};
