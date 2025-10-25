import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { materialAPI, exportAPI } from '../services/api';
import Header from '../components/common/Header';
import AddMaterialModal from '../components/modals/AddMaterialModal';
import ExportConfirmModal from '../components/modals/ExportConfirmModal';
import VirtualMaterialsList from '../components/translation/VirtualMaterialsList';
import PreviewSection from '../components/translation/PreviewSection';
import styles from './TranslationPage.module.css';

const TranslationPage = () => {
  const navigate = useNavigate();
  const { clientId } = useParams();
  const { state, actions } = useApp();
  const { t } = useLanguage();
  const { currentClient, materials, currentMaterial } = state;
  const [loading, setLoading] = useState(true);
  const [hasLoadedMaterials, setHasLoadedMaterials] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);

  // 客户初始化
  useEffect(() => {
    if (!currentClient && clientId) {
      const client = state.clients.find(c => c.cid === clientId);
      if (client) {
        actions.setCurrentClient(client);
      } else {
        navigate('/dashboard');
      }
    }
  }, [clientId, currentClient, state.clients, actions, navigate]);

  // 材料加载 - 只在客户端ID变化或首次加载时触发
  useEffect(() => {
    if (clientId && !hasLoadedMaterials) {
      loadMaterials();
      setHasLoadedMaterials(true);
    }
  }, [clientId]); // 只依赖clientId，避免循环

  // 当客户端ID变化时重置加载状态
  useEffect(() => {
    setHasLoadedMaterials(false);
  }, [clientId]);

  const loadMaterials = async () => {
    try {
      setLoading(true);
      // 直接从API加载材料列表
      const materialsData = await materialAPI.getMaterials(clientId);
      actions.setMaterials(materialsData.materials || []);
    } catch (error) {
      actions.showNotification(t('loadFailed'), t('cannotLoadMaterialList'), 'error');
    } finally {
      setLoading(false);
    }
  };


  const handleAddMaterial = () => {
    console.log('========== handleAddMaterial clicked ==========');
    console.log('currentClient:', currentClient);
    actions.toggleModal('addMaterial', true);
  };

  const handleFilesDropped = async (files) => {
    if (!currentClient) {
      actions.showNotification('错误', '没有选择客户', 'error');
      return;
    }

    // 过滤支持的文件类型
    const supportedFiles = files.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'gif', 'tiff', 'txt', 'doc', 'docx'].includes(ext);
    });

    if (supportedFiles.length === 0) {
      actions.showNotification('文件类型不支持', '请上传PDF、图片或文档文件', 'error');
      return;
    }

    if (supportedFiles.length !== files.length) {
      actions.showNotification(
        '部分文件被过滤', 
        `${files.length - supportedFiles.length} 个文件类型不支持，已被过滤`, 
        'warning'
      );
    }

    // 启动上传过程
    const materialsToAdd = supportedFiles.map(file => ({
      id: 'material_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      clientId: currentClient.cid,
      name: file.name,
      type: getFileType(file.name),
      status: '上传中',
      confirmed: false,
      file: file,
      createdAt: new Date().toISOString()
    }));

    actions.startUpload(materialsToAdd, '准备上传拖拽的文件...');

    try {
      const response = await materialAPI.uploadFiles(currentClient.cid, supportedFiles);
      
      if (response.materials) {
        actions.addMaterials(response.materials);
        actions.setUploadedMaterials(response.materials.map(m => m.id));
      }
      
      actions.showNotification('上传成功', `成功上传 ${supportedFiles.length} 个文件`, 'success');
      actions.updateUploadProgress(supportedFiles.length, '上传完成！', false, false);
      
      // 重新加载材料列表
      await loadMaterials();
      setHasLoadedMaterials(true);
      
    } catch (error) {
      actions.showNotification('上传失败', error.message || '文件上传时出现错误', 'error');
      actions.cancelUpload();
    }
  };

  const getFileType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return 'pdf';
    if (['jpg', 'jpeg', 'png', 'bmp', 'gif', 'tiff'].includes(ext)) return 'image';
    return 'document';
  };

  const handleExport = () => {
    const clientMaterials = materials.filter(m => m.clientId === clientId);
    const confirmedMaterials = clientMaterials.filter(m => m.confirmed);
    
    if (confirmedMaterials.length === 0) {
      actions.showNotification(t('exportFailed'), t('noConfirmedMaterials'), 'error');
      return;
    }
    
    // 显示确认弹窗
    setShowExportConfirm(true);
  };

  const handleConfirmExport = async () => {
    setShowExportConfirm(false);
    
    const clientMaterials = materials.filter(m => m.clientId === clientId);
    const confirmedMaterials = clientMaterials.filter(m => m.confirmed);
    
    try {
      actions.showNotification(t('exportStart'), t('packingFiles'), 'info');

      // 生成文件名
      const clientName = (currentClient?.name || t('export')).replace(/[<>:"/\\|?*]/g, '_');
      const now = new Date();
      const dateStr = now.getFullYear() +
                      String(now.getMonth() + 1).padStart(2, '0') +
                      String(now.getDate()).padStart(2, '0') + '_' +
                      String(now.getHours()).padStart(2, '0') +
                      String(now.getMinutes()).padStart(2, '0');

      // 调用导出API
      await exportAPI.exportClientMaterials(clientId, `${clientName}_${dateStr}.zip`);

      actions.showNotification(t('exportComplete'), t('exportedFiles', { count: confirmedMaterials.length }), 'success');

    } catch (error) {
      console.error('导出失败:', error);
      actions.showNotification(t('exportFailed'), error.message || t('exportError'), 'error');
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  if (!currentClient) {
    return (
      <div className={styles.loadingContainer}>
        <p>客户信息不存在</p>
        <button onClick={() => navigate('/dashboard')}>返回主界面</button>
      </div>
    );
  }

  return (
    <div className={styles.translation}>
      <Header />

      <div className={styles.content}>
        <VirtualMaterialsList
          onAddMaterial={handleAddMaterial}
          onExport={handleExport}
          onFilesDropped={handleFilesDropped}
          clientName={currentClient.name}
        />
        <PreviewSection />
      </div>

      <AddMaterialModal />
      
      <ExportConfirmModal
        isOpen={showExportConfirm}
        onClose={() => setShowExportConfirm(false)}
        onConfirm={handleConfirmExport}
        confirmedCount={materials.filter(m => m.clientId === clientId && m.confirmed).length}
        unconfirmedCount={materials.filter(m => m.clientId === clientId && !m.confirmed).length}
        clientName={currentClient?.name || ''}
      />
    </div>
  );
};

export default TranslationPage;





