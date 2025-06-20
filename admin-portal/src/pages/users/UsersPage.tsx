import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  MenuItem,
  Grid,
  Chip,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { RootState, AppDispatch } from '../../store';
import { fetchUsers, deleteUser, createUser, updateUser } from '../../store/slices/usersSlice';
import UserForm from '../../components/forms/UserForm';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const UsersPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  
  const {
    users,
    isLoading,
    error,
    pagination,
  } = useSelector((state: RootState) => state.users);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 25,
  });

  useEffect(() => {
    loadUsers();
  }, [paginationModel, searchTerm, roleFilter, statusFilter]);

  const loadUsers = () => {
    dispatch(fetchUsers({
      page: paginationModel.page + 1,
      limit: paginationModel.pageSize,
      search: searchTerm,
      role: roleFilter,
      status: statusFilter,
    }));
  };

  const handleCreateUser = async (userData: any) => {
    try {
      await dispatch(createUser(userData)).unwrap();
      setCreateDialogOpen(false);
      loadUsers();
    } catch (error) {
      console.error('Failed to create user:', error);
    }
  };

  const handleEditUser = async (userData: any) => {
    try {
      await dispatch(updateUser({ id: selectedUser.id, ...userData })).unwrap();
      setEditDialogOpen(false);
      setSelectedUser(null);
      loadUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  const handleDeleteUser = async () => {
    try {
      await dispatch(deleteUser(selectedUser.id)).unwrap();
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      loadUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'error';
      case 'SUPERVISOR': return 'warning';
      case 'AGENT': return 'primary';
      case 'CLIENT': return 'secondary';
      default: return 'default';
    }
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'success' : 'default';
  };

  const columns: GridColDef[] = [
    {
      field: 'avatar',
      headerName: '',
      width: 60,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Avatar
          src={params.row.profile?.avatar}
          sx={{ width: 32, height: 32 }}
        >
          {params.row.profile?.firstName?.[0] || params.row.username[0]}
        </Avatar>
      ),
    },
    {
      field: 'username',
      headerName: 'Username',
      width: 150,
      renderCell: (params) => (
        <Box>
          <Typography variant="body2" fontWeight="medium">
            {params.value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {params.row.email}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'fullName',
      headerName: 'Full Name',
      width: 200,
      valueGetter: (params) => 
        `${params.row.profile?.firstName || ''} ${params.row.profile?.lastName || ''}`.trim() || 'N/A',
    },
    {
      field: 'role',
      headerName: 'Role',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.value}
          color={getRoleColor(params.value)}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'isActive',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value ? 'Active' : 'Inactive'}
          color={getStatusColor(params.value)}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'lastLogin',
      headerName: 'Last Login',
      width: 150,
      valueFormatter: (params) => 
        params.value ? new Date(params.value).toLocaleDateString() : 'Never',
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 120,
      valueFormatter: (params) => new Date(params.value).toLocaleDateString(),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 120,
      getActions: (params) => [
        <GridActionsCellItem
          icon={
            <Tooltip title="View Details">
              <EditIcon />
            </Tooltip>
          }
          label="View"
          onClick={() => navigate(`/users/${params.id}`)}
        />,
        <GridActionsCellItem
          icon={
            <Tooltip title="Edit User">
              <EditIcon />
            </Tooltip>
          }
          label="Edit"
          onClick={() => {
            setSelectedUser(params.row);
            setEditDialogOpen(true);
          }}
        />,
        <GridActionsCellItem
          icon={
            <Tooltip title="Delete User">
              <DeleteIcon />
            </Tooltip>
          }
          label="Delete"
          onClick={() => {
            setSelectedUser(params.row);
            setDeleteDialogOpen(true);
          }}
          showInMenu
        />,
      ],
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            User Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage system users, roles, and permissions
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadUsers}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => {/* Export functionality */}}
          >
            Export
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Add User
          </Button>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={3} md={2}>
              <TextField
                fullWidth
                select
                label="Role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <MenuItem value="">All Roles</MenuItem>
                <MenuItem value="ADMIN">Admin</MenuItem>
                <MenuItem value="SUPERVISOR">Supervisor</MenuItem>
                <MenuItem value="AGENT">Agent</MenuItem>
                <MenuItem value="CLIENT">Client</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={3} md={2}>
              <TextField
                fullWidth
                select
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">All Status</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Data Grid */}
      <Card>
        <DataGrid
          rows={users}
          columns={columns}
          loading={isLoading}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 25, 50, 100]}
          rowCount={pagination?.total || 0}
          paginationMode="server"
          disableRowSelectionOnClick
          autoHeight
          sx={{ border: 'none' }}
        />
      </Card>

      {/* Create User Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create New User</DialogTitle>
        <DialogContent>
          <UserForm
            onSubmit={handleCreateUser}
            onCancel={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <UserForm
            initialData={selectedUser}
            onSubmit={handleEditUser}
            onCancel={() => setEditDialogOpen(false)}
            isEdit
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteUser}
        title="Delete User"
        message={`Are you sure you want to delete user "${selectedUser?.username}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
      />
    </Box>
  );
};

export default UsersPage;
