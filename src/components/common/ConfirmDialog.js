import React from 'react';
import styles from './ConfirmDialog.module.css';

const ConfirmDialog = ({ 
  title, 
  message, 
  confirmText = '确认', 
  cancelText = '取消', 
  onConfirm, 
  onCancel, 
  isDestructive = false 
}) => {
  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            {isDestructive && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '8px', verticalAlign: 'middle'}}>
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            )}
            {title || '确认操作'}
          </h3>
        </div>
        
        <div className={styles.body}>
          <p className={styles.message}>{message}</p>
        </div>
        
        <div className={styles.footer}>
          <button 
            className={`${styles.btn} ${styles.btnCancel}`}
            onClick={handleCancel}
          >
            {cancelText}
          </button>
          <button 
            className={`${styles.btn} ${
              isDestructive ? styles.btnDanger : styles.btnPrimary
            }`}
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

