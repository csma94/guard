import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
} from '@mui/material';

interface User {
  id?: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string;
  isActive: boolean;
}

interface UserFormProps {
  open?: boolean;
  onClose?: () => void;
  onSubmit: (user: User) => void;
  user?: User | null;
  loading?: boolean;
  // Additional props for compatibility
  initialData?: User;
  onCancel?: () => void;
  isEdit?: boolean;
}

const UserForm: React.FC<UserFormProps> = ({
  open = true,
  onClose,
  onSubmit,
  user = null,
  loading = false,
  initialData,
  onCancel,
  isEdit,
}) => {
  // Use initialData if provided, otherwise use user
  const userData = initialData || user;
  const [formData, setFormData] = useState<User>({
    email: userData?.email || '',
    username: userData?.username || '',
    firstName: userData?.firstName || '',
    lastName: userData?.lastName || '',
    role: userData?.role || 'AGENT',
    phone: userData?.phone || '',
    isActive: userData?.isActive ?? true,
  });

  const handleChange = (field: keyof User) => (event: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(formData);
  };

  const isEditing = isEdit || !!userData?.id;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {isEditing ? 'Edit User' : 'Create New User'}
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  value={formData.firstName}
                  onChange={handleChange('firstName')}
                  required
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  value={formData.lastName}
                  onChange={handleChange('lastName')}
                  required
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange('email')}
                  required
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Username"
                  value={formData.username}
                  onChange={handleChange('username')}
                  required
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Phone"
                  value={formData.phone}
                  onChange={handleChange('phone')}
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Role</InputLabel>
                  <Select
                    value={formData.role}
                    onChange={handleChange('role')}
                    label="Role"
                    required
                  >
                    <MenuItem value="ADMIN">Admin</MenuItem>
                    <MenuItem value="SUPERVISOR">Supervisor</MenuItem>
                    <MenuItem value="AGENT">Agent</MenuItem>
                    <MenuItem value="CLIENT">Client</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={formData.isActive ? 'active' : 'inactive'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      isActive: e.target.value === 'active'
                    }))}
                    label="Status"
                  >
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={onCancel || onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default UserForm;
