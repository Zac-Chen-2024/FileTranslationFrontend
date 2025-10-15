import React from 'react';
import styles from './Modal.module.css';

const ExportConfirmModal = ({ isOpen, onClose, onConfirm, confirmedCount, unconfirmedCount, clientName }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className={styles.header}>
          <h3 className={styles.title}>确认导出</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.body}>
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            {/* 导出图标 */}
            <div style={{ 
              fontSize: '3rem', 
              color: 'var(--primary-blue)',
              marginBottom: '1rem' 
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
            </div>

            {/* 导出信息 */}
            <h4 style={{ 
              fontSize: '1.25rem', 
              marginBottom: '0.5rem',
              color: 'var(--neutral-800)'
            }}>
              导出 {clientName} 的翻译文件
            </h4>

            <p style={{ 
              fontSize: '1.1rem', 
              color: 'var(--neutral-700)',
              marginBottom: '1rem'
            }}>
              即将导出 <strong>{confirmedCount}</strong> 个已确认的文件
            </p>

            {unconfirmedCount > 0 && (
              <div style={{
                backgroundColor: '#FEF3C7',
                border: '1px solid #F59E0B',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginTop: '1rem',
                textAlign: 'left'
              }}>
                <p style={{ 
                  margin: 0,
                  color: '#92400E',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  <strong>注意：</strong>您还有 {unconfirmedCount} 个文件尚未确认，这些文件将不会包含在导出中。
                </p>
              </div>
            )}

            <p style={{ 
              marginTop: '1.5rem',
              color: 'var(--neutral-600)',
              fontSize: '0.9rem' 
            }}>
              导出的文件将打包成ZIP格式，包含原文和译文对照。
            </p>
          </div>
        </div>

        <div className={styles.footer}>
          <button 
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onClose}
          >
            取消
          </button>
          <button 
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onConfirm}
          >
            确认导出
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportConfirmModal;