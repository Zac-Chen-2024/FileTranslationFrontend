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
  const [exportFiles, setExportFiles] = useState([]);

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

    // 显示上传进度弹窗
    const fileCountText = supportedFiles.length === 1 ? '1个文件' : `${supportedFiles.length}个文件`;
    actions.startUpload(supportedFiles, `${fileCountText}上传中...`, hasPdf ? 2 : 1);

    try {
      // 调用上传API
      const response = await materialAPI.uploadFiles(selectedClient.cid, supportedFiles);

      if (response.materials && response.materials.length > 0) {
        // 上传成功，添加材料到列表
        // 材料的 processingStep 会是 'splitting' 或 'translating'，画布会自动显示加载层
        actions.addMaterials(response.materials);
        actions.setUploadedMaterials(response.materials.map(m => m.id));
      }

      // 如果包含PDF，等待拆分完成
      if (hasPdf) {
        actions.updateUploadProgress(1, 'PDF拆分中...', false, true);

        // 等待PDF拆分稳定（连续3次结果相同）
        let attempts = 0;
        const maxAttempts = 120;
        let lastPageCount = 0;
        let stableCount = 0;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;

          try {
            const materialsResponse = await materialAPI.getMaterials(selectedClient.cid);
            const materialList = materialsResponse.materials || [];

            // 检查PDF页面数量（不要在这里 setMaterials，避免覆盖）
            const pdfPages = materialList.filter(m => m.pdfSessionId);
            const currentPageCount = pdfPages.length;

            if (currentPageCount > 0) {
              if (currentPageCount === lastPageCount) {
                stableCount++;
                if (stableCount >= 3) {
                  // 拆分完成，现在才更新材料列表
                  actions.setMaterials(materialList);
                  break;
                }
              } else {
                stableCount = 0;
                lastPageCount = currentPageCount;
              }
            }
          } catch (e) {
            console.warn('轮询材料列表失败:', e);
          }
        }

        // 最终刷新一次材料列表（超时或未在循环中更新时）
        if (stableCount < 3) {
          const finalResponse = await materialAPI.getMaterials(selectedClient.cid);
          actions.setMaterials(finalResponse.materials || []);
        }

        actions.completeUpload();

        // 获取当前材料列表中的PDF页面
        const currentMaterials = await materialAPI.getMaterials(selectedClient.cid);
        const pdfPages = (currentMaterials.materials || []).filter(m => m.pdfSessionId);

        if (pdfPages.length > 0) {
          actions.showNotification('上传成功', `成功拆分 ${pdfPages.length} 页`, 'success');
          // 自动选中第一页
          const firstPage = pdfPages.find(m => m.pdfPageNumber === 1);
          if (firstPage) {
            setTimeout(() => actions.setCurrentMaterial(firstPage), 100);
          }
        } else {
          actions.showNotification('上传成功', '文件已上传', 'info');
        }

      } else {
        // 非PDF文件，直接完成
        actions.completeUpload();
        actions.showNotification('上传成功', `成功上传 ${supportedFiles.length} 个文件`, 'success');

        // 自动选中第一个上传的材料
        if (response.materials && response.materials.length > 0) {
          actions.setCurrentMaterial(response.materials[0]);
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

    // 计算实际文档数量（PDF 按 session 计为 1 个文档）并生成文件名列表
    const processedSessions = new Set();
    let documentCount = 0;
    const fileList = [];

    confirmedMaterials.forEach(m => {
      if (m.pdfSessionId) {
        if (!processedSessions.has(m.pdfSessionId)) {
          processedSessions.add(m.pdfSessionId);
          documentCount++;
          // PDF 文件名：去掉页码后缀
          const pdfName = m.name?.replace(/ - 第\d+页$/, '') || m.originalFilename || `pdf_${m.pdfSessionId}`;
          const baseName = pdfName.replace(/\.(pdf|PDF)$/, '');
          fileList.push(`${baseName}_translated.pdf`);
        }
      } else {
        documentCount++;
        // 图片文件名
        const originalName = m.originalFilename || m.name || `material_${m.id}`;
        const baseName = originalName.replace(/\.[^/.]+$/, '');
        fileList.push(`${baseName}_translated.jpg`);
      }
    });

    setExportDocumentCount(documentCount);
    setExportFiles(fileList);
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
        exportFiles={exportFiles}
      />

      <GlobalConfirmDialog />
    </>
  );
};

export default DemoClaudeLayout;
