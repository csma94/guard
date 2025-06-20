import React, { useState, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Divider,
  Grid,
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Edit as SignIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import SignatureCanvas from 'react-signature-canvas';

import { useAuth } from '../hooks/useAuth';
import { reportsAPI } from '../services/api';

interface ReportSignatureProps {
  report: any;
  onSignatureComplete: (signatureData: any) => void;
  disabled?: boolean;
}

const ReportSignature: React.FC<ReportSignatureProps> = ({
  report,
  onSignatureComplete,
  disabled = false,
}) => {
  const { user } = useAuth();
  const signatureRef = useRef<SignatureCanvas>(null);
  
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [approved, setApproved] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [signedBy, setSignedBy] = useState(user?.profile?.firstName && user?.profile?.lastName 
    ? `${user.profile.firstName} ${user.profile.lastName}` 
    : user?.username || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenSignature = (approvalStatus: boolean) => {
    setApproved(approvalStatus);
    setSignatureDialogOpen(true);
    setError(null);
  };

  const handleClearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear();
    }
  };

  const handleSubmitSignature = async () => {
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      setError('Please provide your signature');
      return;
    }

    if (!signedBy.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const signatureData = signatureRef.current.toDataURL();
      
      const submissionData = {
        signature: signatureData,
        signedBy: signedBy.trim(),
        feedback: feedback.trim(),
        approved,
        timestamp: new Date().toISOString(),
      };

      await reportsAPI.submitClientSignature(report.id, submissionData);
      
      onSignatureComplete(submissionData);
      setSignatureDialogOpen(false);
    } catch (error: any) {
      setError(error.message || 'Failed to submit signature');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setSignatureDialogOpen(false);
    setError(null);
    if (signatureRef.current) {
      signatureRef.current.clear();
    }
  };

  // If already signed, show signature status
  if (report.clientSignature) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Client Signature
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            {report.clientSignature.approved ? (
              <ApproveIcon color="success" sx={{ mr: 1 }} />
            ) : (
              <RejectIcon color="error" sx={{ mr: 1 }} />
            )}
            <Typography variant="body1" fontWeight="bold">
              Report {report.clientSignature.approved ? 'Approved' : 'Rejected'}
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Signed by:
              </Typography>
              <Typography variant="body1">
                {report.clientSignature.signedBy}
              </Typography>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Signed on:
              </Typography>
              <Typography variant="body1">
                {new Date(report.clientSignature.signedAt).toLocaleString()}
              </Typography>
            </Grid>
          </Grid>

          {report.clientSignature.feedback && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Feedback:
              </Typography>
              <Typography variant="body1">
                {report.clientSignature.feedback}
              </Typography>
            </Box>
          )}

          <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Digital Signature:
            </Typography>
            <img 
              src={report.clientSignature.signature} 
              alt="Client Signature"
              style={{ maxWidth: '200px', maxHeight: '100px', border: '1px solid #ccc' }}
            />
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Show signature interface
  return (
    <>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Client Review & Signature
          </Typography>
          
          <Typography variant="body2" color="text.secondary" paragraph>
            Please review the report and provide your digital signature to approve or reject it.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
            <Button
              variant="contained"
              color="success"
              startIcon={<ApproveIcon />}
              onClick={() => handleOpenSignature(true)}
              disabled={disabled}
              fullWidth
            >
              Approve Report
            </Button>
            
            <Button
              variant="contained"
              color="error"
              startIcon={<RejectIcon />}
              onClick={() => handleOpenSignature(false)}
              disabled={disabled}
              fullWidth
            >
              Reject Report
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Signature Dialog */}
      <Dialog 
        open={signatureDialogOpen} 
        onClose={handleCancel}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {approved ? (
              <ApproveIcon color="success" sx={{ mr: 1 }} />
            ) : (
              <RejectIcon color="error" sx={{ mr: 1 }} />
            )}
            {approved ? 'Approve' : 'Reject'} Report
          </Box>
        </DialogTitle>
        
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" paragraph>
            Report: {report.title}
          </Typography>
          
          <Typography variant="body2" color="text.secondary" paragraph>
            Site: {report.site?.name}
          </Typography>

          <TextField
            fullWidth
            label="Your Name"
            value={signedBy}
            onChange={(e) => setSignedBy(e.target.value)}
            margin="normal"
            required
          />

          <TextField
            fullWidth
            label={approved ? "Comments (Optional)" : "Reason for Rejection"}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            margin="normal"
            multiline
            rows={3}
            placeholder={approved 
              ? "Any additional comments about the report..." 
              : "Please explain why you are rejecting this report..."
            }
          />

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" gutterBottom>
            Digital Signature
          </Typography>
          
          <Typography variant="body2" color="text.secondary" paragraph>
            Please sign in the box below to {approved ? 'approve' : 'reject'} this report.
          </Typography>

          <Box sx={{ 
            border: 2, 
            borderColor: 'divider', 
            borderRadius: 1,
            p: 1,
            mb: 2,
          }}>
            <SignatureCanvas
              ref={signatureRef}
              canvasProps={{
                width: 500,
                height: 200,
                className: 'signature-canvas',
                style: { width: '100%', height: '200px' }
              }}
              backgroundColor="white"
            />
          </Box>

          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClearSignature}
            size="small"
          >
            Clear Signature
          </Button>

          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Legal Notice:</strong> By providing your digital signature, you acknowledge that you have reviewed this security report and {approved ? 'approve' : 'reject'} its contents. This digital signature has the same legal effect as a handwritten signature.
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitSignature}
            variant="contained"
            color={approved ? 'success' : 'error'}
            disabled={isSubmitting}
            startIcon={<SignIcon />}
          >
            {isSubmitting ? 'Submitting...' : `${approved ? 'Approve' : 'Reject'} & Sign`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ReportSignature;
