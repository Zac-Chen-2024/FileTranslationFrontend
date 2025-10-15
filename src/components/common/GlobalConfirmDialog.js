import React from 'react';
import { useApp } from '../../contexts/AppContext';
import ConfirmDialog from './ConfirmDialog';

const GlobalConfirmDialog = () => {
  const { state, actions } = useApp();
  const { confirmDialog } = state;

  if (!confirmDialog.isOpen) {
    return null;
  }

  const handleConfirm = async () => {
    if (confirmDialog.onConfirm) {
      await confirmDialog.onConfirm();
    }
    actions.closeConfirmDialog();
  };

  const handleCancel = () => {
    if (confirmDialog.onCancel) {
      confirmDialog.onCancel();
    }
    actions.closeConfirmDialog();
  };

  return (
    <ConfirmDialog
      title={confirmDialog.title}
      message={confirmDialog.message}
      confirmText={confirmDialog.confirmText}
      cancelText={confirmDialog.cancelText}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isDestructive={confirmDialog.type === 'danger'}
    />
  );
};

export default GlobalConfirmDialog;