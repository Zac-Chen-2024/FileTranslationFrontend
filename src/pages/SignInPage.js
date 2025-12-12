import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { authAPI } from '../services/api';
import styles from './AuthPage.module.css';

// SVG图标组件
const Icons = {
  // 返回箭头
  ArrowLeft: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  ),
  // Logo - 天平
  Scale: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18"/>
      <path d="M5 6l7-3 7 3"/>
      <path d="M3 10c0 2 2 4 4 4s4-2 4-4l-4-4-4 4z"/>
      <path d="M13 10c0 2 2 4 4 4s4-2 4-4l-4-4-4 4z"/>
      <path d="M9 21h6"/>
    </svg>
  ),
  // 邮箱
  Mail: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  // 密码锁
  Lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  // 登录
  LogIn: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
      <polyline points="10 17 15 12 10 7"/>
      <line x1="15" y1="12" x2="3" y2="12"/>
    </svg>
  )
};

const SignInPage = () => {
  const navigate = useNavigate();
  const { actions } = useApp();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authAPI.signin(formData.email, formData.password);
      actions.setUser(response.user);
      actions.showNotification('登录成功', '欢迎回来！', 'success');
      navigate('/dashboard');
    } catch (error) {
      console.error('登录错误:', error);
      const errorMsg = error.message || '请检查邮箱和密码';
      actions.showNotification('登录失败', errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authPage}>
      <button className={styles.backBtn} onClick={() => navigate('/')}>
        <Icons.ArrowLeft />
        <span>返回</span>
      </button>

      <div className={styles.authContainer}>
        {/* Logo */}
        <div className={styles.logoSection}>
          <div className={styles.logo}>
            <Icons.Scale />
          </div>
          <h1 className={styles.brandName}>智能文书翻译</h1>
        </div>

        <div className={styles.authHeader}>
          <h2 className={styles.authTitle}>欢迎回来</h2>
          <p className={styles.authSubtitle}>请登录您的账户继续使用</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="email">
              <Icons.Mail />
              <span>邮箱地址</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              className={styles.formInput}
              placeholder="请输入您的邮箱"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="password">
              <Icons.Lock />
              <span>密码</span>
            </label>
            <input
              type="password"
              id="password"
              name="password"
              className={styles.formInput}
              placeholder="请输入您的密码"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? (
              <span>登录中...</span>
            ) : (
              <>
                <Icons.LogIn />
                <span>登录</span>
              </>
            )}
          </button>
        </form>

        <div className={styles.authSwitch}>
          还没有账户？<Link to="/signup">立即注册</Link>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
