import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { clientAPI } from '../services/api';
import Header from '../components/common/Header';
import ConfirmDialog from '../components/common/ConfirmDialog';
import styles from './DashboardPage.module.css'; // 复用 DashboardPage 的样式

// API URL配置
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

const ArchivedClientsPage = () => {
  const navigate = useNavigate();
  const { state, actions } = useApp();
  const { t } = useLanguage();
  const { user } = state;
  const [loading, setLoading] = useState(true);
  const [archivedClients, setArchivedClients] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({ show: false, type: '', client: null });
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    loadArchivedClients();
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuId && !event.target.closest(`.${styles.menuContainer}`)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuId]);

  const loadArchivedClients = async () => {
    try {
      setLoading(true);
      // 通过添加查询参数获取包含归档客户的列表
      const response = await fetch(`${API_URL}/api/clients?include_archived=true`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
      });
      const clientsData = await response.json();
      // 只保留归档的客户
      const archived = (clientsData.clients || []).filter(client => client.isArchived);
      setArchivedClients(archived);
    } catch (error) {
      actions.showNotification(t('loadFailed'), t('cannotLoadArchivedClients'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClientClick = (client) => {
    actions.setCurrentClient(client);
    navigate(`/client/${client.cid}`);
  };

  const handleUnarchiveClient = (client, e) => {
    e.stopPropagation();
    setConfirmDialog({
      show: true,
      type: 'unarchive',
      client,
      title: t('unarchiveClientTitle'),
      message: t('unarchiveClientMessage', { name: client.name }),
      confirmText: t('restore'),
      cancelText: t('cancel')
    });
    setOpenMenuId(null);
  };

  const handleDeleteClient = (client, e) => {
    e.stopPropagation();
    setConfirmDialog({
      show: true,
      type: 'delete',
      client,
      title: t('deleteClientTitle'),
      message: t('permanentDeleteMessage', { name: client.name }),
      confirmText: t('deleteClient'),
      cancelText: t('cancel')
    });
    setOpenMenuId(null);
  };

  // 处理三点菜单切换
  const toggleMenu = (clientId, e) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === clientId ? null : clientId);
  };

  // 处理确认对话框
  const handleConfirm = async () => {
    const { type, client } = confirmDialog;

    try {
      if (type === 'unarchive') {
        await clientAPI.unarchiveClient(client.cid);
        actions.showNotification(t('restoreSuccess'), t('clientRestored', { name: client.name }), 'success');
      } else if (type === 'delete') {
        await clientAPI.deleteClient(client.cid);
        actions.showNotification(t('deleteSuccess'), t('clientDeleted', { name: client.name }), 'success');
      }

      loadArchivedClients();
    } catch (error) {
      const actionName = type === 'unarchive' ? t('restore') : t('deleteClient');
      actions.showNotification(`${actionName}${t('error')}`, error.message, 'error');
    }

    setConfirmDialog({ show: false, type: '', client: null });
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className="loading-spinner"></div>
        <p>{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <Header />

      <div className={styles.content}>
        <div className={styles.clientsSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('archivedClients')}</h2>
            <button
              className={styles.addClientBtn}
              onClick={() => navigate('/dashboard')}
            >
              {t('back')}
            </button>
          </div>

          {archivedClients.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📁</div>
              <h3 className={styles.emptyTitle}>{t('noArchivedClients')}</h3>
              <p className={styles.emptyDescription}>{t('selectMaterialHint')}</p>
              <button
                className={styles.addClientBtn}
                onClick={() => navigate('/dashboard')}
              >
                {t('back')}
              </button>
            </div>
          ) : (
            <div className={styles.clientsList}>
              {archivedClients.map((client) => (
                <div
                  key={client.cid}
                  className={`${styles.clientCard} ${styles.archivedCard}`}
                  onClick={() => handleClientClick(client)}
                >
                  <div className={styles.clientContent}>
                    <div className={styles.clientName}>
                      {client.name}
                      <span className={styles.archivedBadge}>已归档</span>
                    </div>
                    <div className={styles.clientMeta}>
                      <span>案件类型: {client.caseType || '未指定'}</span>
                      <span>创建日期: {client.caseDate}</span>
                      <span>归档时间: {client.archivedAt ? new Date(client.archivedAt).toLocaleDateString() : '未知'}</span>
                      {client.archivedReason && <span>归档原因: {client.archivedReason}</span>}
                    </div>
                  </div>
                  <div className={styles.menuContainer}>
                    <button
                      className={styles.menuBtn}
                      onClick={(e) => toggleMenu(client.cid, e)}
                      title="更多操作"
                    >
                      ⋮
                    </button>
                    {openMenuId === client.cid && (
                      <div className={styles.dropdownMenu}>
                        <button
                          className={styles.menuItem}
                          onClick={(e) => handleUnarchiveClient(client, e)}
                        >
                          {t('restoreClient')}
                        </button>
                        <button
                          className={`${styles.menuItem} ${styles.deleteItem}`}
                          onClick={(e) => handleDeleteClient(client, e)}
                        >
                          {t('deleteClient')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {confirmDialog.show && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText={confirmDialog.cancelText}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmDialog({ show: false, type: '', client: null })}
          isDestructive={confirmDialog.type === 'delete'}
        />
      )}
    </div>
  );
};

export default ArchivedClientsPage;