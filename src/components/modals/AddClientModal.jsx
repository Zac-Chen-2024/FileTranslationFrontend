import React, { useState, useEffect, useRef } from 'react';
import styles from './AddClientModal.module.css';

const AddClientModal = ({ isOpen, onClose, onConfirm }) => {
  const [clientName, setClientName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setClientName('');
      // 自动聚焦输入框
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!clientName.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(clientName.trim());
      onClose();
    } catch (error) {
      console.error('创建客户失败:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            添加客户
          </h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            <label className={styles.label}>客户名称</label>
            <input
              ref={inputRef}
              type="text"
              className={styles.input}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="请输入客户名称"
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnCancel}`}
              onClick={onClose}
              disabled={isSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!clientName.trim() || isSubmitting}
            >
              {isSubmitting ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddClientModal;
