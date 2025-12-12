import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './WelcomePage.module.css';

// SVG图标组件
const Icons = {
  // Logo - 天平/法律
  Scale: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18"/>
      <path d="M5 6l7-3 7 3"/>
      <path d="M3 10c0 2 2 4 4 4s4-2 4-4l-4-4-4 4z"/>
      <path d="M13 10c0 2 2 4 4 4s4-2 4-4l-4-4-4 4z"/>
      <path d="M9 21h6"/>
    </svg>
  ),
  // PDF文档
  FileText: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  ),
  // 图片识别
  Image: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  // AI机器人
  Bot: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v4"/>
      <line x1="8" y1="16" x2="8" y2="16"/>
      <line x1="16" y1="16" x2="16" y2="16"/>
    </svg>
  ),
  // 导出/下载
  Download: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  // 箭头右
  ArrowRight: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  // 用户
  User: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
};

const WelcomePage = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Icons.FileText />,
      title: 'PDF精准翻译',
      description: '先进的OCR技术结合AI翻译，保持原文档格式和排版'
    },
    {
      icon: <Icons.Image />,
      title: '图片智能识别',
      description: '支持扫描件、截图等图片格式，智能识别并翻译文本内容'
    },
    {
      icon: <Icons.Bot />,
      title: 'AI辅助校对',
      description: '专业的法律词汇库和AI校对，确保翻译准确性和专业性'
    },
    {
      icon: <Icons.Download />,
      title: '一键打包导出',
      description: '批量处理完成后，一键导出所有翻译文档，提高工作效率'
    }
  ];

  return (
    <div className={styles.welcome}>
      <div className={styles.container}>
        {/* Logo区域 */}
        <div className={styles.logoSection}>
          <div className={`${styles.logo} animate-float`}>
            <Icons.Scale />
          </div>
          <h1 className={styles.title}>智能文书翻译平台</h1>
          <p className={styles.subtitle}>
            专为律师设计的智能翻译解决方案，提供精准、专业的法律文档翻译服务
          </p>
        </div>

        {/* 功能特性 */}
        <div className={styles.featuresGrid}>
          {features.map((feature, index) => (
            <div
              key={index}
              className={`${styles.featureCard} animate-fade-in`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className={styles.featureIcon}>{feature.icon}</div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDescription}>{feature.description}</p>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className={styles.authButtons}>
          <button
            className={`${styles.authBtn} ${styles.btnSignin}`}
            onClick={() => navigate('/signin')}
          >
            <Icons.User />
            <span>登录账号</span>
          </button>
          <button
            className={`${styles.authBtn} ${styles.btnSignup}`}
            onClick={() => navigate('/signup')}
          >
            <span>注册新用户</span>
            <Icons.ArrowRight />
          </button>
        </div>

        {/* 底部信息 */}
        <div className={styles.footer}>
          <p>安全可靠 · 专业高效 · 智能翻译</p>
        </div>
      </div>
    </div>
  );
};

export default WelcomePage;
