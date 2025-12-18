import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './WelcomePageV2.module.css';

const WelcomePageV2 = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Logo */}
        <div className={styles.logoWrapper}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 3v18"/>
            <path d="M5 6l7-3 7 3"/>
            <path d="M3 10c0 2 2 4 4 4s4-2 4-4l-4-4-4 4z"/>
            <path d="M13 10c0 2 2 4 4 4s4-2 4-4l-4-4-4 4z"/>
            <path d="M9 21h6"/>
          </svg>
        </div>

        {/* 标题 */}
        <h1 className={styles.title}>智能文书翻译平台</h1>
        <p className={styles.subtitle}>专为律师设计的智能翻译解决方案</p>

        {/* 功能特性 */}
        <div className={styles.features}>
          <div className={styles.feature}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>PDF精准翻译</span>
          </div>
          <div className={styles.feature}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>图片智能识别</span>
          </div>
          <div className={styles.feature}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="10" rx="2"/>
              <circle cx="12" cy="5" r="2"/>
              <path d="M12 7v4"/>
            </svg>
            <span>AI辅助校对</span>
          </div>
          <div className={styles.feature}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>一键打包导出</span>
          </div>
        </div>

        {/* 按钮 */}
        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={() => navigate('/signin')}>
            登录账号
          </button>
          <button className={styles.secondaryBtn} onClick={() => navigate('/signup')}>
            注册新用户
          </button>
        </div>

        {/* 底部 */}
        <p className={styles.footer}>安全可靠 · 专业高效 · 智能翻译</p>
      </div>
    </div>
  );
};

export default WelcomePageV2;
