import React from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import styles from './Notification.module.css';

const Notification = () => {
  const { state } = useApp();
  const { notification } = state;
  const location = useLocation();

  // ✅ 在 demo-v2 页面禁用通知
  if (location.pathname.startsWith('/demo-v2')) {
    return null;
  }

  if (!notification) return null;

  const { title, message, type = 'success' } = notification;

  return (
    <div className={`${styles.notification} ${styles[type]} ${styles.show}`}>
      <div className={styles.title}>{title}</div>
      <div className={styles.message}>{message}</div>
    </div>
  );
};

export default Notification;



