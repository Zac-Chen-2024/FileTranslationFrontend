import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { clientAPI } from '../services/api';
import Header from '../components/common/Header';
import AddClientModal from '../components/modals/AddClientModal';
import EditClientModal from '../components/modals/EditClientModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import styles from './DashboardPage.module.css';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { state, actions } = useApp();
  const { t } = useLanguage();
  const { user, clients } = state;
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ show: false, type: '', client: null });
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    loadClients();
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

  const loadClients = async () => {
    try {
      setLoading(true);
      // 直接从API加载客户列表
      const clientsData = await clientAPI.getClients();
      actions.setClients(clientsData.clients || []);
    } catch (error) {
      actions.showNotification(t('loadFailed'), t('cannotLoadClients'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClientClick = (client) => {
    actions.setCurrentClient(client);
    navigate(`/client/${client.cid}`);
  };

  const handleAddClient = () => {
    actions.toggleModal('addClient', true);
  };

  const handleDeleteClient = (client, e) => {
    e.stopPropagation(); // 防止触发点击客户卡片

    setConfirmDialog({
      show: true,
      type: 'delete',
      client,
      title: t('deleteClientTitle'),
      message: t('deleteClientMessage', { name: client.name }),
      confirmText: t('deleteClient'),
      cancelText: t('cancel')
    });
    setOpenMenuId(null);
  };

  // 处理编辑客户
  const handleEditClient = (client, e) => {
    e.stopPropagation();
    setEditingClient(client);
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  // 处理归档客户
  const handleArchiveClient = (client, e) => {
    e.stopPropagation();
    setConfirmDialog({
      show: true,
      type: 'archive',
      client,
      title: t('archiveClientTitle'),
      message: t('archiveClientMessage', { name: client.name }),
      confirmText: t('archiveClientAction'),
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
      if (type === 'archive') {
        await clientAPI.archiveClient(client.cid, t('manualArchive'));
        actions.showNotification(t('archiveSuccess'), t('clientArchived', { name: client.name }), 'success');
      } else if (type === 'delete') {
        await clientAPI.deleteClient(client.cid);
        actions.showNotification(t('deleteSuccess'), t('clientDeleted', { name: client.name }), 'success');
      }

      loadClients();
    } catch (error) {
      const actionName = type === 'archive' ? t('archiveClientAction') : t('deleteClient');
      actions.showNotification(`${actionName}失败`, error.message || `${actionName}客户时出现错误`, 'error');
    }
    
    setConfirmDialog({ show: false, type: '', client: null });
  };

  // 关闭编辑模态框
  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingClient(null);
  };

  // 编辑成功后刷新列表
  const handleEditSuccess = () => {
    loadClients();
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <Header />

      <div className={styles.content}>
        <div className={styles.clientsSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>{t('clientList')}</h2>
            <button
              className={styles.addClientBtn}
              onClick={handleAddClient}
            >
              {t('addClient')}
            </button>
          </div>

          {clients.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>👥</div>
              <h3 className={styles.emptyTitle}>{t('noClientsYet')}</h3>
              <p className={styles.emptyDescription}>{t('addFirstClient')}</p>
              <button
                className={styles.addClientBtn}
                onClick={handleAddClient}
              >
                {t('addClient')}
              </button>
            </div>
          ) : (
            <div className={styles.clientsList}>
              {clients.map((client) => (
                <div
                  key={client.cid}
                  className={styles.clientCard}
                  onClick={() => handleClientClick(client)}
                >
                  <div className={styles.clientContent}>
                    <div className={styles.clientName}>{client.name}</div>
                    <div className={styles.clientMeta}>
                      <span>案件类型: {client.caseType || '未指定'}</span>
                      <span>创建日期: {client.caseDate}</span>
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
                          onClick={(e) => handleEditClient(client, e)}
                        >
                          {t('editClient')}
                        </button>
                        <button
                          className={`${styles.menuItem} ${styles.archiveItem}`}
                          onClick={(e) => handleArchiveClient(client, e)}
                        >
                          {t('archiveClientAction')}
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

      <AddClientModal />
      
      {showEditModal && editingClient && (
        <EditClientModal
          client={editingClient}
          isOpen={showEditModal}
          onClose={handleCloseEditModal}
          onSuccess={handleEditSuccess}
        />
      )}
      
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

export default DashboardPage;





