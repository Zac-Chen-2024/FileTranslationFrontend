import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { authAPI } from '../../services/api';
import LanguageSelector from './LanguageSelector';
import styles from './Header.module.css';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, actions } = useApp();
  const { user } = state;
  const { t } = useLanguage();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    // 从localStorage加载主题设置
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const handleLogoClick = () => {
    // 如果用户已登录且不在欢迎页，跳转到客户列表页面
    if (user && location.pathname !== '/') {
      navigate('/dashboard');
    }
    // 如果未登录或已在欢迎页，保持在当前页面
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      actions.logout();
      navigate('/');
      setShowUserDropdown(false);
    } catch (error) {
      console.error('Logout error:', error);
      // 即使logout API失败，也要清除本地状态
      actions.logout();
      navigate('/');
    }
  };

  const handleUserProfile = () => {
    navigate('/profile');
    setShowUserDropdown(false);
  };

  const handleArchivedClients = () => {
    navigate('/archived-clients');
    setShowUserDropdown(false);
  };

  const handleThemeToggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const handleNotificationClick = () => {
    setShowNotificationDropdown(!showNotificationDropdown);
  };

  const handleNotificationItemClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead();
  };

  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <div className={styles.brand} onClick={handleLogoClick}>
          <div className={styles.logo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21H4"/>
              <path d="m6 3 6 7"/>
              <path d="m18 3-6 7"/>
              <path d="M12 3v18"/>
              <path d="m8 10-2 9"/>
              <path d="m16 10 2 9"/>
              <circle cx="6" cy="19" r="2"/>
              <circle cx="18" cy="19" r="2"/>
            </svg>
          </div>
          <h1 className={styles.siteName}>{t('siteTitle')}</h1>
        </div>
      </div>

      <div className={styles.userArea}>
        {user && (
          <div className={styles.toolButtons}>
            {/* 语言选择器 */}
            <LanguageSelector />

            {/* 主题切换按钮 */}
            <button
              className={styles.toolButton}
              onClick={handleThemeToggle}
              title={theme === 'light' ? t('switchToDarkMode') : t('switchToLightMode')}
            >
              {theme === 'light' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <path d="m12 1 0 2m0 18 0 2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12l2 0m18 0 2 0M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              )}
            </button>
            
            {/* 通知按钮 */}
            <div className={styles.notificationContainer}>
              <button
                className={styles.toolButton}
                onClick={handleNotificationClick}
                title={t('notifications')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                  <path d="m13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unreadCount > 0 && (
                  <span className={styles.notificationBadge}>{unreadCount}</span>
                )}
              </button>
              
              {showNotificationDropdown && (
                <div className={styles.notificationDropdown}>
                  <div className={styles.notificationHeader}>
                    <h3>{t('notifications')}</h3>
                    <span className={styles.notificationCount}>{t('notificationCount', { count: notifications.length })}</span>
                  </div>
                  <div className={styles.notificationList}>
                    {notifications.length === 0 ? (
                      <div className={styles.noNotifications}>{t('noNotifications')}</div>
                    ) : (
                      <>
                        {/* 未读通知 */}
                        {notifications.filter(n => !n.read).map(notification => (
                          <div 
                            key={notification.id} 
                            className={`${styles.notificationItem} ${styles.unread}`}
                            onClick={() => handleNotificationItemClick(notification)}
                          >
                            <div className={styles.notificationIcon}>
                              {notification.type === 'success' && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M9 12l2 2 4-4"/>
                                  <circle cx="12" cy="12" r="9"/>
                                </svg>
                              )}
                              {notification.type === 'info' && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10"/>
                                  <path d="M12 16v-4M12 8h.01"/>
                                </svg>
                              )}
                              {notification.type === 'warning' && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                  <path d="M12 9v4M12 17h.01"/>
                                </svg>
                              )}
                            </div>
                            <div className={styles.notificationContent}>
                              <div className={styles.notificationTitle}>{notification.title}</div>
                              <div className={styles.notificationMessage}>{notification.message}</div>
                              <div className={styles.notificationTime}>{notification.time}</div>
                            </div>
                          </div>
                        ))}
                        
                        {/* 已读通知 */}
                        {notifications.filter(n => n.read).length > 0 && (
                          <>
                            {notifications.filter(n => !n.read).length > 0 && (
                              <div className={styles.notificationSeparator}></div>
                            )}
                            {notifications.filter(n => n.read).map(notification => (
                              <div 
                                key={notification.id} 
                                className={`${styles.notificationItem} ${styles.read}`}
                                title="点击查看详情"
                              >
                                <div className={styles.notificationIcon}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="m9 18 6-6-6-6"/>
                                  </svg>
                                </div>
                                <div className={styles.notificationContent}>
                                  <div className={styles.notificationTitle}>{notification.title}</div>
                                  <div className={styles.notificationMessage}>{notification.message}</div>
                                  <div className={styles.notificationTime}>{notification.time}</div>
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <div className={styles.notificationFooter}>
                      <button className={styles.clearAllButton} onClick={handleMarkAllAsRead}>
                        {t('markAllRead')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        
        {user ? (
          <div className={styles.userMenu}>
            <div 
              className={styles.userButton}
              onClick={() => setShowUserDropdown(!showUserDropdown)}
            >
              <div className={styles.userAvatar}>
                {user.name?.charAt(0) || 'U'}
              </div>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.dropdownArrow}>▼</span>
            </div>

            {showUserDropdown && (
              <div className={styles.dropdown}>
                <button
                  className={styles.dropdownItem}
                  onClick={handleUserProfile}
                >
                  {t('userSettings')}
                </button>
                <button
                  className={styles.dropdownItem}
                  onClick={handleArchivedClients}
                >
                  {t('archivedMaterials')}
                </button>
                <div className={styles.dropdownDivider}></div>
                <button
                  className={`${styles.dropdownItem} ${styles.logoutItem}`}
                  onClick={handleLogout}
                >
                  {t('logout')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.authButtons}>
            <button
              className={styles.authBtn}
              onClick={() => navigate('/signin')}
            >
              {t('signIn')}
            </button>
            <button
              className={`${styles.authBtn} ${styles.primaryBtn}`}
              onClick={() => navigate('/signup')}
            >
              {t('signUp')}
            </button>
          </div>
        )}
      </div>

      {/* 点击其他地方关闭下拉菜单 */}
      {showUserDropdown && (
        <div 
          className={styles.dropdownOverlay}
          onClick={() => setShowUserDropdown(false)}
        />
      )}
      
      {/* 点击其他地方关闭通知下拉菜单 */}
      {showNotificationDropdown && (
        <div 
          className={styles.dropdownOverlay}
          onClick={() => setShowNotificationDropdown(false)}
        />
      )}
    </header>
  );
};

export default Header;