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
  // 用户
  User: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
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
  // 确认
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  // 注册
  UserPlus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <line x1="20" y1="8" x2="20" y2="14"/>
      <line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  )
};

const SignUpPage = () => {
  const navigate = useNavigate();
  const { actions } = useApp();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
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

    if (formData.password !== formData.confirmPassword) {
      actions.showNotification('注册失败', '两次输入的密码不一致', 'error');
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.signup(formData.name, formData.email, formData.password);
      actions.setUser(response.user);
      actions.showNotification('注册成功', '欢迎使用智能文书翻译平台！', 'success');
      navigate('/dashboard');
    } catch (error) {
      console.error('注册错误:', error);
      const errorMsg = error.message || '注册过程中出现错误';
      actions.showNotification('注册失败', errorMsg, 'error');
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
          <h2 className={styles.authTitle}>创建账户</h2>
          <p className={styles.authSubtitle}>注册后即可使用智能翻译服务</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="name">
              <Icons.User />
              <span>姓名</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              className={styles.formInput}
              placeholder="请输入您的姓名"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

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
              placeholder="请输入密码"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="confirmPassword">
              <Icons.Check />
              <span>确认密码</span>
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              className={styles.formInput}
              placeholder="请再次输入密码"
              value={formData.confirmPassword}
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
              <span>注册中...</span>
            ) : (
              <>
                <Icons.UserPlus />
                <span>注册</span>
              </>
            )}
          </button>
        </form>

        <div className={styles.authSwitch}>
          已有账户？<Link to="/signin">立即登录</Link>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
