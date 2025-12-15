import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClaudeStyleLayout from '../layouts/ClaudeStyleLayout';
import ClientSidebar from '../components/sidebar/ClientSidebar';
import ClaudePreviewSection from '../components/translation/ClaudePreviewSection';
import AddMaterialModal from '../components/modals/AddMaterialModal';
import AddClientModal from '../components/modals/AddClientModal';
import ExportConfirmModal from '../components/modals/ExportConfirmModal';
import GlobalConfirmDialog from '../components/common/GlobalConfirmDialog';
import { useApp } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { clientAPI, materialAPI, exportAPI } from '../services/api';
import styles from './DemoClaudeLayout.module.css';

/**
 * Claude风格布局 - 完整版
 * 集成翻译功能
 */
const DemoClaudeLayout = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { state, actions } = useApp();
  const { t } = useLanguage();
  const { currentClient, materials, currentMaterial } = state;

  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);

  // 当URL中有clientId时，加载客户信息
  useEffect(() => {
    if (clientId) {
      loadClientData(clientId);
    }
  }, [clientId]);

  // 同步selectedClient到AppContext
  useEffect(() => {
    if (selectedClient && selectedClient.cid !== currentClient?.cid) {
      actions.setCurrentClient(selectedClient);
    }
  }, [selectedClient]);

  const loadClientData = async (cid) => {
    try {
      setLoading(true);

      // 从客户列表中查找指定客户
      const clientsResponse = await clientAPI.getClients();
      const clientList = clientsResponse.clients || clientsResponse || [];
      const client = clientList.find(c => c.cid === cid);

      if (client) {
        setSelectedClient(client);
        actions.setCurrentClient(client);

        const materialsResponse = await materialAPI.getMaterials(cid);
        const materialList = materialsResponse.materials || materialsResponse || [];
        actions.setMaterials(materialList);
      } else {
        console.error('客户不存在:', cid);
        navigate('/demo-v2');
      }
    } catch (error) {
      console.error('加载客户数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClient = (client) => {
    setSelectedClient(client);
    actions.setCurrentClient(client);
    setSelectedMaterialId(null);
    actions.setCurrentMaterial(null);
    navigate(`/demo-v2/${client.cid}`);
  };

  const handleSelectMaterial = (material, client) => {
    // 如果是PDF Session，需要找到第一页的实际material
    if (material.isPdfSession) {
      const allMaterials = state.materials || materials || [];
      const firstPage = allMaterials.find(m =>
        m.pdfSessionId === material.mid && m.pdfPageNumber === 1
      );
      if (firstPage) {
        setSelectedMaterialId(material.mid);
        actions.setCurrentMaterial(firstPage);
      }
    } else {
      setSelectedMaterialId(material.mid);
      actions.setCurrentMaterial(material);
    }

    if (client && client.cid !== selectedClient?.cid) {
      setSelectedClient(client);
      actions.setCurrentClient(client);
      navigate(`/demo-v2/${client.cid}`);
    }
  };

  const handleAddClient = () => {
    setShowAddClientModal(true);
  };

  const handleCreateClient = async (clientName) => {
    try {
      const response = await clientAPI.createClient({ name: clientName });
      const newClient = response.client || response;

      actions.showNotification('成功', `客户 "${clientName}" 已创建`, 'success');

      // 自动选中新创建的客户
      setSelectedClient(newClient);
      actions.setCurrentClient(newClient);
      actions.setMaterials([]);
      navigate(`/demo-v2/${newClient.cid}`);
    } catch (error) {
      console.error('创建客户失败:', error);
      actions.showNotification('错误', '创建客户失败', 'error');
      throw error;
    }
  };

  // 文件拖拽上传
  const handleFilesDropped = async (files) => {
    if (!selectedClient) {
      actions.showNotification('错误', '请先选择客户', 'error');
      return;
    }

    const supportedFiles = files.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'gif', 'tiff', 'txt', 'doc', 'docx'].includes(ext);
    });

    if (supportedFiles.length === 0) {
      actions.showNotification('文件类型不支持', '请上传PDF、图片或文档文件', 'error');
      return;
    }

    const getFileType = (filename) => {
      const ext = filename.split('.').pop().toLowerCase();
      if (['pdf'].includes(ext)) return 'pdf';
      if (['jpg', 'jpeg', 'png', 'bmp', 'gif', 'tiff'].includes(ext)) return 'image';
      return 'document';
    };

    const materialsToAdd = supportedFiles.map(file => ({
      id: 'material_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      clientId: selectedClient.cid,
      name: file.name,
      type: getFileType(file.name),
      status: '上传中',
      confirmed: false,
      file: file,
      createdAt: new Date().toISOString()
    }));

    actions.startUpload(materialsToAdd, '准备上传文件...');

    try {
      const response = await materialAPI.uploadFiles(selectedClient.cid, supportedFiles);

      if (response.materials) {
        actions.addMaterials(response.materials);
        actions.setUploadedMaterials(response.materials.map(m => m.id));
      }

      actions.showNotification('上传成功', `成功上传 ${supportedFiles.length} 个文件`, 'success');
      actions.updateUploadProgress(supportedFiles.length, '上传完成！', false, false);

      // 重新加载材料列表
      const materialsResponse = await materialAPI.getMaterials(selectedClient.cid);
      const materialList = materialsResponse.materials || materialsResponse || [];
      actions.setMaterials(materialList);

    } catch (error) {
      actions.showNotification('上传失败', error.message || '文件上传时出现错误', 'error');
      actions.cancelUpload();
    }
  };

  // 导出功能
  const handleExport = () => {
    const clientMaterials = materials.filter(m => m.clientId === clientId);
    const confirmedMaterials = clientMaterials.filter(m => m.confirmed);

    if (confirmedMaterials.length === 0) {
      actions.showNotification(t('exportFailed'), t('noConfirmedMaterials'), 'error');
      return;
    }

    setShowExportConfirm(true);
  };

  const handleConfirmExport = async () => {
    setShowExportConfirm(false);

    const clientMaterials = materials.filter(m => m.clientId === clientId);
    const confirmedMaterials = clientMaterials.filter(m => m.confirmed);

    try {
      actions.showNotification(t('exportStart'), t('packingFiles'), 'info');

      const clientName = (selectedClient?.name || t('export')).replace(/[<>:"/\\|?*]/g, '_');
      const now = new Date();
      const dateStr = now.getFullYear() +
                      String(now.getMonth() + 1).padStart(2, '0') +
                      String(now.getDate()).padStart(2, '0') + '_' +
                      String(now.getHours()).padStart(2, '0') +
                      String(now.getMinutes()).padStart(2, '0');

      await exportAPI.exportClientMaterials(clientId, `${clientName}_${dateStr}.zip`);

      actions.showNotification(t('exportComplete'), t('exportedFiles', { count: confirmedMaterials.length }), 'success');

    } catch (error) {
      console.error('导出失败:', error);
      actions.showNotification(t('exportFailed'), error.message || t('exportError'), 'error');
    }
  };

  // 拖拽事件处理
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFilesDropped(files);
    }
  }, [selectedClient]);

  // 侧边栏组件
  const sidebar = (
    <ClientSidebar
      selectedClientId={selectedClient?.cid || clientId}
      selectedMaterialId={selectedMaterialId}
      onSelectClient={handleSelectClient}
      onSelectMaterial={handleSelectMaterial}
      onAddClient={handleAddClient}
      onExport={handleExport}
    />
  );

  // 主内容区
  const mainContent = (
    <div
      className={`${styles.mainContent} ${isDragging ? styles.dragging : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!selectedClient && !clientId ? (
        // 未选择客户时的欢迎界面
        <div className={styles.welcome}>
          <div className={styles.welcomeIcon}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h1 className={styles.welcomeTitle}>智能文书翻译平台</h1>
          <p className={styles.welcomeDesc}>从左侧选择一个客户开始工作</p>
          <div className={styles.welcomeHints}>
            <div className={styles.hint}>
              <span className={styles.hintIcon}>1</span>
              <span>选择或创建客户</span>
            </div>
            <div className={styles.hint}>
              <span className={styles.hintIcon}>2</span>
              <span>上传需要翻译的文件</span>
            </div>
            <div className={styles.hint}>
              <span className={styles.hintIcon}>3</span>
              <span>自动翻译并编辑调整</span>
            </div>
          </div>
        </div>
      ) : loading ? (
        // 加载中
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>加载中...</p>
        </div>
      ) : !currentMaterial ? (
        // 已选客户但未选材料
        <div className={styles.noMaterial}>
          <div className={styles.noMaterialIcon}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <h2 className={styles.noMaterialTitle}>{selectedClient?.name}</h2>
          <p className={styles.noMaterialDesc}>从左侧选择材料，或拖拽文件到此处上传</p>
          <div className={styles.uploadHint}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>支持 PDF、图片、Word 文档</span>
          </div>
        </div>
      ) : (
        // 显示预览区域
        <div className={styles.previewWrapper}>
          <ClaudePreviewSection />
        </div>
      )}

      {/* 拖拽提示遮罩 */}
      {isDragging && selectedClient && (
        <div className={styles.dropOverlay}>
          <div className={styles.dropContent}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p>释放以上传文件</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <ClaudeStyleLayout sidebar={sidebar}>
        {mainContent}
      </ClaudeStyleLayout>

      <AddMaterialModal />

      <AddClientModal
        isOpen={showAddClientModal}
        onClose={() => setShowAddClientModal(false)}
        onConfirm={handleCreateClient}
      />

      <ExportConfirmModal
        isOpen={showExportConfirm}
        onClose={() => setShowExportConfirm(false)}
        onConfirm={handleConfirmExport}
        confirmedCount={materials.filter(m => m.clientId === clientId && m.confirmed).length}
        unconfirmedCount={materials.filter(m => m.clientId === clientId && !m.confirmed).length}
        clientName={selectedClient?.name || ''}
      />

      <GlobalConfirmDialog />
    </>
  );
};

export default DemoClaudeLayout;
