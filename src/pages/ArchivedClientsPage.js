import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { clientAPI } from '../services/api';
import Header from '../components/common/Header';
import ConfirmDialog from '../components/common/ConfirmDialog';
import styles from './DashboardPage.module.css'; // 复用 DashboardPage 的样式

const ArchivedClientsPage = () => {
  const navigate = useNavigate();
  const { state, actions } = useApp();
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
      const response = await fetch('/api/clients?include_archived=true', {
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
      actions.showNotification('加载失败', '无法加载归档客户列表', 'error');
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
      title: '取消归档',
      message: `确定要将客户 "${client.name}" 从归档中恢复吗？`,
      confirmText: '恢复',
      cancelText: '取消'
    });
    setOpenMenuId(null);
  };

  const handleDeleteClient = (client, e) => {
    e.stopPropagation();
    setConfirmDialog({
      show: true,
      type: 'delete',
      client,
      title: '删除客户',
      message: `确定要永久删除客户 "${client.name}" 吗？这将同时删除该客户的所有材料，且无法恢复。`,
      confirmText: '删除',
      cancelText: '取消'
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
        actions.showNotification('恢复成功', `客户 ${client.name} 已从归档中恢复`, 'success');
      } else if (type === 'delete') {
        await clientAPI.deleteClient(client.cid);
        actions.showNotification('删除成功', `客户 ${client.name} 已永久删除`, 'success');
      }
      
      loadArchivedClients();
    } catch (error) {
      const actionName = type === 'unarchive' ? '恢复' : '删除';
      actions.showNotification(`${actionName}失败`, error.message || `${actionName}客户时出现错误`, 'error');
    }
    
    setConfirmDialog({ show: false, type: '', client: null });
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
            <h2 className={styles.sectionTitle}>归档客户</h2>
            <button 
              className={styles.addClientBtn}
              onClick={() => navigate('/dashboard')}
            >
              返回客户列表
            </button>
          </div>

          {archivedClients.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📁</div>
              <h3 className={styles.emptyTitle}>暂无归档客户</h3>
              <p className={styles.emptyDescription}>归档的客户将会显示在这里</p>
              <button 
                className={styles.addClientBtn}
                onClick={() => navigate('/dashboard')}
              >
                返回客户列表
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
                          恢复客户
                        </button>
                        <button
                          className={`${styles.menuItem} ${styles.deleteItem}`}
                          onClick={(e) => handleDeleteClient(client, e)}
                        >
                          永久删除
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