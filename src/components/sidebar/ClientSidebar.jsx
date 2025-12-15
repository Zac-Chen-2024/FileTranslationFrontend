import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientAPI, authAPI, materialAPI } from '../../services/api';
import { useApp } from '../../contexts/AppContext';
import styles from './ClientSidebar.module.css';

/**
 * 处理材料列表，将PDF页面合并为单个PDF文件显示
 */
const processMaterials = (materials) => {
  if (!materials || materials.length === 0) return [];

  const pdfSessions = new Map();
  const nonPdfMaterials = [];

  materials.forEach(material => {
    if (material.pdfSessionId) {
      if (!pdfSessions.has(material.pdfSessionId)) {
        const baseName = material.name.replace(/ - 第\d+页$/, '');
        pdfSessions.set(material.pdfSessionId, {
          ...material,
          mid: material.pdfSessionId,
          name: baseName,
          isPdfSession: true,
          pdfTotalPages: material.pdfTotalPages || 1,
          type: 'pdf'
        });
      }
    } else {
      nonPdfMaterials.push(material);
    }
  });

  return [...Array.from(pdfSessions.values()), ...nonPdfMaterials];
};

/**
 * Claude风格客户侧边栏
 * 顶部客户选择器 + 材料列表
 * 使用AppContext中的materials，确保与主页面同步
 */
const ClientSidebar = ({
  selectedClientId,
  selectedMaterialId,
  onSelectClient,
  onSelectMaterial,
  onAddClient,
  onExport
}) => {
  const navigate = useNavigate();
  const { state, actions } = useApp();
  const { user, materials: contextMaterials, currentMaterial } = state;

  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientSelectorOpen, setClientSelectorOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // 加载客户列表
  useEffect(() => {
    loadClients();
  }, []);

  // 当选中客户ID变化时，设置选中的客户
  useEffect(() => {
    if (selectedClientId && clients.length > 0) {
      const client = clients.find(c => c.cid === selectedClientId);
      if (client) {
        setSelectedClient(client);
      }
    }
  }, [selectedClientId, clients]);

  const loadClients = async () => {
    try {
      setLoading(true);
      const response = await clientAPI.getClients();
      const clientList = response.clients || response || [];
      setClients(clientList);

      // 如果没有选中客户但有客户列表，默认展开选择器
      if (!selectedClientId && clientList.length > 0) {
        setClientSelectorOpen(true);
      }
    } catch (error) {
      console.error('加载客户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClient = (client) => {
    setSelectedClient(client);
    setClientSelectorOpen(false);
    onSelectClient?.(client);
  };

  const handleMaterialClick = (material) => {
    onSelectMaterial?.(material, selectedClient);
  };

  // 开始重命名
  const handleStartRename = (e) => {
    e.stopPropagation();
    if (selectedClient) {
      setRenameValue(selectedClient.name);
      setIsRenaming(true);
    }
  };

  // 确认重命名
  const handleConfirmRename = async () => {
    if (!selectedClient || !renameValue.trim()) {
      setIsRenaming(false);
      return;
    }
    try {
      await clientAPI.updateClient(selectedClient.cid, { name: renameValue.trim() });
      setSelectedClient({ ...selectedClient, name: renameValue.trim() });
      setClients(clients.map(c =>
        c.cid === selectedClient.cid ? { ...c, name: renameValue.trim() } : c
      ));
      actions.showNotification('成功', '客户名称已更新', 'success');
    } catch (error) {
      console.error('重命名失败:', error);
      actions.showNotification('错误', '重命名失败', 'error');
    }
    setIsRenaming(false);
  };

  // 取消重命名
  const handleCancelRename = () => {
    setIsRenaming(false);
    setRenameValue('');
  };

  // 处理导出
  const handleExport = (e) => {
    e.stopPropagation();
    onExport?.(selectedClient);
  };

  // 删除客户
  const handleDeleteClient = async (client, e) => {
    e.stopPropagation();

    actions.openConfirmDialog({
      title: '删除客户',
      message: `确定要删除客户 "${client.name}" 吗？该客户下的所有材料也将被删除！`,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await clientAPI.deleteClient(client.cid);
          actions.showNotification('成功', `客户 "${client.name}" 已删除`, 'success');

          // 从列表中移除
          setClients(clients.filter(c => c.cid !== client.cid));

          // 如果删除的是当前选中的客户，清除选择
          if (selectedClient?.cid === client.cid) {
            setSelectedClient(null);
            onSelectClient?.(null);
          }
        } catch (error) {
          console.error('删除客户失败:', error);
          actions.showNotification('错误', '删除客户失败', 'error');
        }
      }
    });
  };

  // 删除材料
  const handleDeleteMaterial = async (material, e) => {
    e.stopPropagation();

    const deleteMessage = material.isPdfSession
      ? `确定要删除 "${material.name}" 吗？该PDF的所有 ${material.pdfTotalPages} 页都将被删除！`
      : `确定要删除 "${material.name}" 吗？`;

    actions.openConfirmDialog({
      title: '删除材料',
      message: deleteMessage,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          if (material.isPdfSession) {
            // 删除PDF会话的所有页面
            const allMaterials = contextMaterials.filter(m => m.pdfSessionId === material.mid);
            const deletePromises = allMaterials.map(page => materialAPI.deleteMaterial(page.id));
            await Promise.all(deletePromises);

            // 从本地状态中移除
            const updatedMaterials = contextMaterials.filter(m => m.pdfSessionId !== material.mid);
            actions.setMaterials(updatedMaterials);

            // ✅ 如果删除的是当前选中的材料，清除 currentMaterial 回到引导界面
            if (currentMaterial && currentMaterial.pdfSessionId === material.mid) {
              actions.setCurrentMaterial(null);
            }
          } else {
            await materialAPI.deleteMaterial(material.mid || material.id);
            const updatedMaterials = contextMaterials.filter(m => m.id !== (material.mid || material.id));
            actions.setMaterials(updatedMaterials);

            // ✅ 如果删除的是当前选中的材料，清除 currentMaterial 回到引导界面
            if (currentMaterial && (currentMaterial.id === material.mid || currentMaterial.id === material.id)) {
              actions.setCurrentMaterial(null);
            }
          }

          actions.showNotification('成功', `"${material.name}" 已删除`, 'success');
        } catch (error) {
          console.error('删除材料失败:', error);
          actions.showNotification('错误', '删除材料失败', 'error');
        }
      }
    });
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      actions.logout();
      navigate('/');
    } catch (error) {
      actions.logout();
      navigate('/');
    }
  };

  // 获取文件类型图标
  const getFileIcon = (material) => {
    const type = material.type || '';
    if (type.includes('pdf') || material.isPdfSession) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      );
    }
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    );
  };

  // 获取材料状态
  const getMaterialStatus = (material) => {
    const status = material.status || material.processingStep;
    if (status === '已完成' || status === 'confirmed' || material.confirmed) {
      return <span className={styles.statusDone}>✓</span>;
    }
    if (status === '处理中' || status === 'translating') {
      return <span className={styles.statusProcessing}>⟳</span>;
    }
    return null;
  };

  // 使用AppContext中的materials
  const processedMaterials = processMaterials(contextMaterials);

  return (
    <div className={styles.sidebar}>
      {/* 客户选择器 */}
      <div className={styles.clientSelector}>
        <div
          className={styles.clientHeader}
          onClick={() => setClientSelectorOpen(!clientSelectorOpen)}
        >
          {isRenaming ? (
            <input
              type="text"
              className={styles.renameInput}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleConfirmRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmRename();
                if (e.key === 'Escape') handleCancelRename();
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span
              className={`${styles.clientLabel} ${selectedClient ? styles.clickable : ''}`}
              onClick={selectedClient ? handleStartRename : undefined}
              title={selectedClient ? '点击重命名' : ''}
            >
              {selectedClient ? selectedClient.name : '选择客户'}
            </span>
          )}
          {selectedClient && (
            <button
              className={styles.exportBtn}
              onClick={handleExport}
              title="导出"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
          )}
        </div>

        {/* 客户列表下拉 */}
        {clientSelectorOpen && (
          <div className={styles.clientDropdown}>
            {loading ? (
              <div className={styles.dropdownLoading}>加载中...</div>
            ) : clients.length === 0 ? (
              <div className={styles.dropdownEmpty}>
                <p>暂无客户</p>
              </div>
            ) : (
              <div className={styles.clientList}>
                {clients.map(client => (
                  <div
                    key={client.cid}
                    className={`${styles.clientItem} ${selectedClient?.cid === client.cid ? styles.active : ''}`}
                    onClick={() => handleSelectClient(client)}
                  >
                    <span className={styles.clientName}>{client.name}</span>
                    <div className={styles.clientActions}>
                      {selectedClient?.cid === client.cid && (
                        <span className={styles.checkIcon}>●</span>
                      )}
                      <button
                        className={styles.deleteClientBtn}
                        onClick={(e) => handleDeleteClient(client, e)}
                        title="删除客户"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          <path d="M10 11v6M14 11v6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              className={styles.addClientBtn}
              onClick={(e) => {
                e.stopPropagation();
                onAddClient?.();
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              添加客户
            </button>
          </div>
        )}
      </div>

      {/* 材料列表 */}
      <div className={styles.materialSection}>
        {!selectedClient ? (
          <div className={styles.noClient}>
            <p>请先选择客户</p>
          </div>
        ) : processedMaterials.length === 0 ? (
          <div className={styles.noMaterials}>
            <p>暂无材料</p>
            <p className={styles.hint}>拖拽文件到右侧上传</p>
          </div>
        ) : (
          <div className={styles.materialList}>
            {processedMaterials.map(material => (
              <div
                key={material.mid || material.id}
                className={`${styles.materialItem} ${selectedMaterialId === (material.mid || material.pdfSessionId) ? styles.active : ''}`}
                onClick={() => handleMaterialClick(material)}
              >
                <span className={styles.fileIcon}>
                  {getFileIcon(material)}
                </span>
                <span className={styles.materialName} title={material.name}>
                  {material.name}
                  {material.isPdfSession && material.pdfTotalPages > 1 && (
                    <span className={styles.pageCount}> ({material.pdfTotalPages}页)</span>
                  )}
                </span>
                <div className={styles.materialActions}>
                  {getMaterialStatus(material)}
                  <button
                    className={styles.deleteMaterialBtn}
                    onClick={(e) => handleDeleteMaterial(material, e)}
                    title="删除材料"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      <path d="M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部用户区域 */}
      {user && (
        <div className={styles.userSection}>
          <div
            className={styles.userRow}
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <div className={styles.userAvatar}>
              {user.name?.charAt(0) || 'U'}
            </div>
            <span className={styles.userNameText}>{user.name}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`${styles.menuArrow} ${showUserMenu ? styles.menuOpen : ''}`}
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>

          {showUserMenu && (
            <div className={styles.userMenu}>
              <button
                className={styles.menuItem}
                onClick={() => { navigate('/profile'); setShowUserMenu(false); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                设置
              </button>
              <button
                className={styles.menuItem}
                onClick={() => { navigate('/dashboard'); setShowUserMenu(false); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="9"/>
                  <rect x="14" y="3" width="7" height="5"/>
                  <rect x="14" y="12" width="7" height="9"/>
                  <rect x="3" y="16" width="7" height="5"/>
                </svg>
                原版界面
              </button>
              <div className={styles.menuDivider}></div>
              <button
                className={`${styles.menuItem} ${styles.logoutItem}`}
                onClick={handleLogout}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                退出登录
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientSidebar;
