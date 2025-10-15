import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { userAPI, authAPI } from '../services/api';
import Header from '../components/common/Header';
import styles from './ProfilePage.module.css';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { state, actions } = useApp();
  const { user } = state;

  // 基本信息
  const [basicInfo, setBasicInfo] = useState({
    name: '',
    email: '',
    phone: '',
    lawFirm: ''
  });

  // 通知设置
  const [notificationSettings, setNotificationSettings] = useState({
    translationComplete: true,
    translationFailed: false,
    dailySummary: false,
    emailEnabled: true,
    browserPushEnabled: true
  });

  // 翻译偏好
  const [translationPreferences, setTranslationPreferences] = useState({
    retryCount: 3,
    enginePriority: 'latex' // 'latex', 'api', 'concurrent'
  });

  // 主题设置
  const [themeMode, setThemeMode] = useState('light'); // 'light', 'dark', 'system'

  // 密码修改
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({
    basic: false,
    notification: false,
    translation: false
  });
  
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    loadUserSettings();
  }, []);

  const loadUserSettings = async () => {
    try {
      setLoading(true);
      // 从用户信息中加载基本信息
      if (user) {
        setBasicInfo({
          name: user.name || '',
          email: user.email || '',
          phone: user.phone || '',
          lawFirm: user.lawFirm || ''
        });
        
        // 从localStorage加载主题设置
        const savedTheme = localStorage.getItem('theme') || 'light';
        setThemeMode(savedTheme);
        
        // 从后端加载其他设置
        try {
          const settingsResponse = await userAPI.getSettings();
          if (settingsResponse.settings) {
            setNotificationSettings(settingsResponse.settings.notificationSettings);
            setTranslationPreferences(settingsResponse.settings.translationPreferences);
          }
        } catch (error) {
          console.error('加载设置失败:', error);
        }
      }
    } catch (error) {
      actions.showNotification('加载失败', '无法加载用户设置', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBasicInfo = async () => {
    try {
      // 调用后端API保存基本信息
      await userAPI.updateBasicInfo(basicInfo);
      actions.showNotification('保存成功', '基本信息已更新', 'success');
      setEditing({ ...editing, basic: false });
      
      // 更新本地用户信息
      actions.updateUser({
        ...user,
        name: basicInfo.name,
        email: basicInfo.email,
        phone: basicInfo.phone,
        lawFirm: basicInfo.lawFirm
      });
    } catch (error) {
      actions.showNotification('保存失败', error.message || '更新基本信息失败', 'error');
    }
  };

  const handleSaveNotifications = async () => {
    try {
      // TODO: 调用后端API保存通知设置
      // await userAPI.updateNotificationSettings(notificationSettings);
      actions.showNotification('保存成功', '通知设置已更新', 'success');
      setEditing({ ...editing, notification: false });
    } catch (error) {
      actions.showNotification('保存失败', error.message || '更新通知设置失败', 'error');
    }
  };

  const handleSavePreferences = async () => {
    try {
      // TODO: 调用后端API保存翻译偏好
      // await userAPI.updateTranslationPreferences(translationPreferences);
      actions.showNotification('保存成功', '翻译偏好已更新', 'success');
      setEditing({ ...editing, translation: false });
    } catch (error) {
      actions.showNotification('保存失败', error.message || '更新翻译偏好失败', 'error');
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      actions.showNotification('密码不匹配', '新密码与确认密码不一致', 'error');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      actions.showNotification('密码太短', '密码长度至少为6位', 'error');
      return;
    }

    try {
      // 调用后端API修改密码
      await userAPI.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      actions.showNotification('修改成功', '密码已更新', 'success');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordModal(false);
    } catch (error) {
      actions.showNotification('修改失败', error.message || '密码修改失败', 'error');
    }
  };

  const handleThemeChange = (theme) => {
    setThemeMode(theme);
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    actions.showNotification('主题已切换', `已切换到${theme === 'dark' ? '夜间' : '日间'}模式`, 'info');
  };

  if (loading) {
    return (
      <div className={styles.profilePage}>
        <Header />
        <div className={styles.loadingContainer}>
          <div className="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.profilePage}>
      <Header />
      
      <div className={styles.container}>
        <div className={styles.content}>
          {/* 基本信息 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '8px', verticalAlign: 'middle'}}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                基本信息
              </h2>
              {!editing.basic && (
                <button 
                  className={styles.editButton}
                  onClick={() => setEditing({ ...editing, basic: true })}
                >
                  编辑
                </button>
              )}
            </div>
            
            <div className={styles.infoGrid}>
              <div className={styles.infoRow}>
                <span className={styles.label}>姓名：</span>
                {editing.basic ? (
                  <input
                    type="text"
                    value={basicInfo.name}
                    onChange={(e) => setBasicInfo({ ...basicInfo, name: e.target.value })}
                    className={styles.input}
                  />
                ) : (
                  <span className={styles.value}>{basicInfo.name}</span>
                )}
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.label}>邮箱：</span>
                {editing.basic ? (
                  <input
                    type="email"
                    value={basicInfo.email}
                    onChange={(e) => setBasicInfo({ ...basicInfo, email: e.target.value })}
                    className={styles.input}
                  />
                ) : (
                  <span className={styles.value}>{basicInfo.email}</span>
                )}
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.label}>电话：</span>
                {editing.basic ? (
                  <input
                    type="tel"
                    value={basicInfo.phone}
                    onChange={(e) => setBasicInfo({ ...basicInfo, phone: e.target.value })}
                    className={styles.input}
                  />
                ) : (
                  <span className={styles.value}>{basicInfo.phone || '未设置'}</span>
                )}
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.label}>律所：</span>
                {editing.basic ? (
                  <input
                    type="text"
                    value={basicInfo.lawFirm}
                    onChange={(e) => setBasicInfo({ ...basicInfo, lawFirm: e.target.value })}
                    className={styles.input}
                  />
                ) : (
                  <span className={styles.value}>{basicInfo.lawFirm || '未设置'}</span>
                )}
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.label}>注册时间：</span>
                <span className={styles.value}>
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                </span>
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.label}>用户编号：</span>
                <span className={styles.value}>{user?.id || '-'}</span>
              </div>
            </div>
            
            {editing.basic && (
              <div className={styles.buttonGroup}>
                <button className={styles.saveButton} onClick={handleSaveBasicInfo}>
                  保存修改
                </button>
                <button 
                  className={styles.cancelButton}
                  onClick={() => setEditing({ ...editing, basic: false })}
                >
                  取消
                </button>
              </div>
            )}
            
            {/* 修改密码按钮 */}
            {!editing.basic && (
              <div className={styles.passwordButtonInCard}>
                <button 
                  className={styles.passwordChangeButtonSmall}
                  onClick={() => setShowPasswordModal(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px', verticalAlign: 'middle'}}>
                    <rect x="5" y="11" width="14" height="10" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  修改密码
                </button>
              </div>
            )}
          </div>

          {/* 设置卡片区域 */}
          <div className={styles.cardsContainer}>

            {/* 通知设置 */}
            <div className={styles.settingCard}>
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '8px', verticalAlign: 'middle'}}>
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                  <path d="m13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                通知设置
              </h3>
              
              <div className={styles.checkboxGroup}>
                <label>
                  <input
                    type="checkbox"
                    checked={notificationSettings.translationComplete}
                    onChange={(e) => setNotificationSettings({
                      ...notificationSettings,
                      translationComplete: e.target.checked
                    })}
                  />
                  翻译完成通知
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={notificationSettings.translationFailed}
                    onChange={(e) => setNotificationSettings({
                      ...notificationSettings,
                      translationFailed: e.target.checked
                    })}
                  />
                  翻译失败提醒
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={notificationSettings.dailySummary}
                    onChange={(e) => setNotificationSettings({
                      ...notificationSettings,
                      dailySummary: e.target.checked
                    })}
                  />
                  每日工作汇总
                </label>
              </div>
              
              <p className={styles.settingLabel}>通知方式：</p>
              <div className={styles.checkboxGroup}>
                <label>
                  <input
                    type="checkbox"
                    checked={notificationSettings.emailEnabled}
                    onChange={(e) => setNotificationSettings({
                      ...notificationSettings,
                      emailEnabled: e.target.checked
                    })}
                  />
                  邮件通知
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={notificationSettings.browserPushEnabled}
                    onChange={(e) => setNotificationSettings({
                      ...notificationSettings,
                      browserPushEnabled: e.target.checked
                    })}
                  />
                  浏览器推送
                </label>
              </div>
              
              <button 
                className={styles.saveButton}
                onClick={handleSaveNotifications}
              >
                保存设置
              </button>
            </div>

            {/* 翻译偏好 */}
            <div className={styles.settingCard}>
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '8px', verticalAlign: 'middle'}}>
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v6m0 6v6m5.2-11L13 12l4.2 4M6.8 8 11 12l-4.2 4M1 12h6m6 0h6M6.8 16 11 12 6.8 8m4.4-8 4.2 4 0-8"/>
                </svg>
                翻译偏好
              </h3>
              
              <div className={styles.formGroup}>
                <label>重试次数：</label>
                <select
                  value={translationPreferences.retryCount}
                  onChange={(e) => setTranslationPreferences({
                    ...translationPreferences,
                    retryCount: parseInt(e.target.value)
                  })}
                  className={styles.select}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </div>
              
              <button 
                className={styles.saveButton}
                onClick={handleSavePreferences}
              >
                保存偏好
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* 密码修改模态框 */}
      {showPasswordModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>修改密码</h3>
              <button 
                className={styles.closeButton}
                onClick={() => setShowPasswordModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className={styles.modalContent}>
              <div className={styles.formGroup}>
                <label>当前密码：</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({
                    ...passwordForm,
                    currentPassword: e.target.value
                  })}
                  className={styles.input}
                  placeholder="请输入当前密码"
                />
              </div>
              <div className={styles.formGroup}>
                <label>新密码：</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({
                    ...passwordForm,
                    newPassword: e.target.value
                  })}
                  className={styles.input}
                  placeholder="请输入新密码（至少6位）"
                />
              </div>
              <div className={styles.formGroup}>
                <label>确认密码：</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({
                    ...passwordForm,
                    confirmPassword: e.target.value
                  })}
                  className={styles.input}
                  placeholder="请再次输入新密码"
                />
              </div>
            </div>
            
            <div className={styles.modalFooter}>
              <button 
                className={styles.cancelButton}
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                }}
              >
                取消
              </button>
              <button 
                className={styles.saveButton}
                onClick={handleChangePassword}
                disabled={!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;