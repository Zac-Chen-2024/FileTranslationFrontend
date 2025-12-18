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
  const [exportDocumentCount, setExportDocumentCount] = useState(0);

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
      const response = await clientAPI.addClient({ name: clientName });
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

    // 检查是否包含PDF文件
    const hasPdf = supportedFiles.some(file =>
      file.name.split('.').pop().toLowerCase() === 'pdf'
    );

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

    // 如果有PDF，总进度分两步：上传(50%) + 拆分(50%)
    const totalSteps = hasPdf ? 2 : 1;
    const fileCountText = supportedFiles.length === 1 ? '1个文件' : `${supportedFiles.length}个文件`;
    actions.startUpload(materialsToAdd, `${fileCountText}上传中...`, totalSteps);

    try {
      const response = await materialAPI.uploadFiles(selectedClient.cid, supportedFiles);

      if (response.materials) {
        actions.addMaterials(response.materials);
        actions.setUploadedMaterials(response.materials.map(m => m.id));
      }

      // 如果包含PDF，等待拆分完成
      if (hasPdf) {
        // 上传完成，进度50%，开始拆分
        actions.updateUploadProgress(1, 'PDF拆分中...', false, true);

        // 轮询等待PDF拆分完成（只检查，不更新材料状态）
        let attempts = 0;
        const maxAttempts = 60; // 最多等待60秒
        let finalMaterialList = null;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;

          try {
            const materialsResponse = await materialAPI.getMaterials(selectedClient.cid);
            const materialList = materialsResponse.materials || materialsResponse || [];

            // 检查是否有PDF页面（pdfSessionId不为空的材料）
            const pdfPages = materialList.filter(m => m.pdfSessionId);

            if (pdfPages.length > 0) {
              // PDF拆分完成，保存最终列表
              finalMaterialList = materialList;
              break;
            }
          } catch (e) {
            // 忽略轮询错误，继续等待
          }

          // 保持显示拆分中
          actions.updateUploadProgress(1, 'PDF拆分中...', false, true);
        }

        // 拆分完成或超时后，一次性更新所有状态
        if (!finalMaterialList) {
          const materialsResponse = await materialAPI.getMaterials(selectedClient.cid);
          finalMaterialList = materialsResponse.materials || materialsResponse || [];
        }

        // 先更新材料列表
        actions.setMaterials(finalMaterialList);

        const pdfPages = finalMaterialList.filter(m => m.pdfSessionId);
        if (pdfPages.length > 0) {
          // 进度100%
          actions.updateUploadProgress(2, '完成', false, false);
          actions.showNotification('上传成功', `成功上传 ${supportedFiles.length} 个文件`, 'success');

          // 延迟选中第一个PDF页面，确保状态已更新
          const firstPage = pdfPages.find(m => m.pdfPageNumber === 1);
          if (firstPage) {
            setTimeout(() => {
              actions.setCurrentMaterial(firstPage);
            }, 100);
          }
        } else {
          actions.updateUploadProgress(2, '完成', false, false);
          actions.showNotification('上传成功', `文件已上传，PDF可能仍在处理中`, 'info');
        }

      } else {
        // 非PDF文件，直接完成 (totalSteps = 1)
        actions.updateUploadProgress(1, '完成', false, false);
        actions.showNotification('上传成功', `成功上传 ${supportedFiles.length} 个文件`, 'success');

        // 重新加载材料列表
        const materialsResponse = await materialAPI.getMaterials(selectedClient.cid);
        const materialList = materialsResponse.materials || materialsResponse || [];
        actions.setMaterials(materialList);

        // 上传完成后自动选中新上传的第一个材料
        if (response.materials && response.materials.length > 0) {
          const firstUploadedId = response.materials[0].id;
          const uploadedMaterial = materialList.find(m => m.id === firstUploadedId);
          if (uploadedMaterial) {
            actions.setCurrentMaterial(uploadedMaterial);
          }
        }
      }

    } catch (error) {
      actions.showNotification('上传失败', error.message || '文件上传时出现错误', 'error');
      actions.cancelUpload();
    }
  };

  // 导出功能
  const handleExport = (client) => {
    // 优先使用传入的client，其次是selectedClient，最后是URL中的clientId
    const targetClientId = client?.cid || selectedClient?.cid || clientId;
    if (!targetClientId) {
      actions.showNotification(t('exportFailed'), '请先选择客户', 'error');
      return;
    }
    const clientMaterials = materials.filter(m => String(m.clientId) === String(targetClientId));
    const confirmedMaterials = clientMaterials.filter(m => m.confirmed);

    if (confirmedMaterials.length === 0) {
      actions.showNotification(t('exportFailed'), t('noConfirmedMaterials'), 'error');
      return;
    }

    // 计算实际文档数量（PDF 按 session 计为 1 个文档）
    const processedSessions = new Set();
    let documentCount = 0;
    confirmedMaterials.forEach(m => {
      if (m.pdfSessionId) {
        if (!processedSessions.has(m.pdfSessionId)) {
          processedSessions.add(m.pdfSessionId);
          documentCount++;
        }
      } else {
        documentCount++;
      }
    });
    setExportDocumentCount(documentCount);

    setShowExportConfirm(true);
  };

  const handleConfirmExport = async () => {
    setShowExportConfirm(false);

    const targetClientId = selectedClient?.cid || clientId;
    const clientMaterials = materials.filter(m => String(m.clientId) === String(targetClientId));
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

      await exportAPI.exportClientMaterials(targetClientId, `${clientName}_${dateStr}.zip`);

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
      onUploadFiles={handleFilesDropped}
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
      {/* 始终显示预览区域，由 ClaudePreviewSection 内部处理禁用状态 */}
      <div className={styles.previewWrapper}>
        <ClaudePreviewSection
          isLoading={loading}
          clientName={selectedClient?.name}
          noClient={!selectedClient && !clientId}
        />
      </div>

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
        confirmedCount={exportDocumentCount}
        unconfirmedCount={materials.filter(m => m.clientId === clientId && !m.confirmed).length}
        clientName={selectedClient?.name || ''}
      />

      <GlobalConfirmDialog />
    </>
  );
};

export default DemoClaudeLayout;
