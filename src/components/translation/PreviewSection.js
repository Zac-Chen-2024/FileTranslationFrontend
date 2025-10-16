import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { materialAPI } from '../../services/api';
import LaTeXEditModal from '../modals/LaTeXEditModal';
import LaTeXEditModalV2 from '../modals/LaTeXEditModalV2';
import LLMTranslationPanel from './LLMTranslationPanel';
import FabricImageEditor from './FabricImageEditor';
import styles from './PreviewSection.module.css';

const PreviewSection = () => {
  const { state, actions } = useApp();
  const { currentMaterial } = state;
  const [showLatexEditor, setShowLatexEditor] = useState(false);
  const [showLatexEditorV2, setShowLatexEditorV2] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [latestRequestId, setLatestRequestId] = useState(null);

  // 监听currentMaterial变化，强制刷新预览
  useEffect(() => {
    console.log('PreviewSection: currentMaterial 变化:', currentMaterial);
    setForceRefresh(prev => prev + 1);
  }, [currentMaterial?.id, currentMaterial?.translatedImagePath, currentMaterial?.status]);

  // 开始轮询检查翻译状态
  const startPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    const checkTranslationStatus = async () => {
      if (!currentMaterial ||
          currentMaterial.status === '已确认' ||
          currentMaterial.status === '翻译失败' ||
          (currentMaterial.status === '翻译完成' && currentMaterial.processingProgress === 100)) {
        stopPolling();
        return;
      }
      
      try {
        const { materialAPI } = await import('../../services/api');
        // 获取所有材料的最新状态
        const response = await materialAPI.getMaterials(currentMaterial.clientId);
        if (response.materials) {
          // 查找当前正在查看的材料
          const viewedMaterial = response.materials.find(m => m.id === currentMaterial.id);

          if (viewedMaterial) {
            // 检查状态或进度是否有变化
            const statusChanged = viewedMaterial.status !== currentMaterial.status;
            const progressChanged = viewedMaterial.processingProgress !== currentMaterial.processingProgress;

            if (statusChanged || progressChanged) {
              console.log(`材料更新 - 状态: ${currentMaterial.status} -> ${viewedMaterial.status}, 进度: ${currentMaterial.processingProgress} -> ${viewedMaterial.processingProgress}`);

              // 更新当前查看的材料数据，但不改变选择
              const updatedCurrentMaterial = {
                ...currentMaterial,
                ...viewedMaterial,
                // 保留UI状态
                selectedResult: currentMaterial.selectedResult
              };

              actions.setCurrentMaterial(updatedCurrentMaterial);

              // 只有当100%完成或失败时才停止轮询
              if ((viewedMaterial.status === '翻译完成' && viewedMaterial.processingProgress === 100) ||
                  viewedMaterial.status === '翻译失败') {
                console.log('处理已完成，停止轮询');
                stopPolling();
              }
            }
          }
          
          // 更新材料列表中所有材料的状态，但不改变当前选择
          response.materials.forEach(material => {
            if (material.id !== currentMaterial.id) {
              actions.updateMaterial(material.id, material);
            }
          });
        }
      } catch (error) {
        console.error('轮询翻译状态失败:', error);
      }
    };
    
    // 立即检查一次
    checkTranslationStatus();
    
    // 每3秒检查一次，以便更及时地看到进度更新
    const interval = setInterval(checkTranslationStatus, 3000);
    setPollingInterval(interval);
  }, [currentMaterial, actions, pollingInterval]);
  
  const stopPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [pollingInterval]);
  
  // 当材料正在翻译时，开始轮询
  useEffect(() => {
    // 只要材料在处理中就轮询（包括翻译和LLM优化阶段）
    const needsPolling = currentMaterial &&
      (currentMaterial.status === '正在翻译' ||
       currentMaterial.status === '翻译中' ||
       currentMaterial.status === '处理中' ||
       currentMaterial.status === '翻译完成' && currentMaterial.processingProgress < 100 ||
       (currentMaterial.status === '已上传' && !currentMaterial.translatedImagePath));
    
    if (needsPolling) {
      console.log(`开始轮询材料: ${currentMaterial.name}, 状态: ${currentMaterial.status}`);
      startPolling();
    } else {
      console.log(`停止轮询，材料状态: ${currentMaterial?.status}`);
      stopPolling();
    }
    
    return () => {
      stopPolling();
    };
  }, [currentMaterial?.id, currentMaterial?.status, currentMaterial?.processingProgress]); // 添加进度依赖

  // 手动刷新功能
  const handleRefresh = async () => {
    if (!currentMaterial || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      const { materialAPI } = await import('../../services/api');
      const response = await materialAPI.getMaterials(currentMaterial.clientId);
      if (response.materials) {
        actions.setMaterials(response.materials);
        const updatedMaterial = response.materials.find(m => m.id === currentMaterial.id);
        if (updatedMaterial) {
          actions.setCurrentMaterial(updatedMaterial);
        }
      }
      actions.showNotification('刷新成功', '材料状态已更新', 'success');
    } catch (error) {
      console.error('刷新材料状态失败:', error);
      actions.showNotification('刷新失败', '无法获取最新状态', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEdit = () => {
    if (!currentMaterial) return;
    setShowLatexEditor(true);
  };

  const handleEditV2 = () => {
    if (!currentMaterial) return;
    setShowLatexEditorV2(true);
  };

  const handleConfirm = async () => {
    if (!currentMaterial) return;

    try {
      const newConfirmedState = !currentMaterial.confirmed;
      console.log('handleConfirm - 当前状态:', currentMaterial.confirmed, '新状态:', newConfirmedState);

      if (newConfirmedState) {
        // 确认时调用API
        console.log('调用确认API...');
        await materialAPI.confirmMaterial(currentMaterial.id);
      } else {
        // 取消确认时，需要调用取消确认API
        console.log('调用取消确认API...');
        const response = await materialAPI.unconfirmMaterial(currentMaterial.id);
        console.log('取消确认API响应:', response);
      }

      console.log('准备更新本地状态...');
      console.log('actions对象:', actions);
      console.log('updateMaterial方法:', actions?.updateMaterial);

      // 更新本地状态 - 只更新确认相关的字段，不影响编辑内容
      if (!actions || !actions.updateMaterial) {
        console.error('actions.updateMaterial 未定义!');
        throw new Error('actions.updateMaterial is not defined');
      }

      try {
        actions.updateMaterial(currentMaterial.id, {
          confirmed: newConfirmedState,
          status: newConfirmedState ? '已确认' : '翻译完成'
          // 不要重置 editedImagePath, hasEditedVersion 等编辑相关的字段
        });
        console.log('本地状态更新成功');
      } catch (updateError) {
        console.error('更新本地状态失败:', updateError);
        throw updateError;
      }

      const message = newConfirmedState
        ? `${currentMaterial.name} 已确认完成`
        : `${currentMaterial.name} 已取消确认`;

      console.log('准备显示通知...');
      actions.showNotification(
        newConfirmedState ? '确认成功' : '取消确认成功',
        message,
        'success'
      );
      console.log('通知显示完成');

    } catch (error) {
      console.error('确认/取消确认失败:', error);
      const errorMessage = error.response?.data?.error || error.message || '操作过程中出现错误';
      actions.showNotification('操作失败', errorMessage, 'error');
    }
  };

  // 使用useCallback优化性能，避免不必要的重新渲染
  const handleSelectResult = useCallback(async (resultType) => {
    console.log('handleSelectResult called:', {
      materialId: currentMaterial?.id,
      currentSelected: currentMaterial?.selectedResult,
      newSelection: resultType
    });
    
    if (!currentMaterial || currentMaterial.selectedResult === resultType) return;
    
    try {
      // 调用Phase 1新增的选择结果API
      await materialAPI.selectResult(currentMaterial.id, resultType);
      
      // 更新本地状态
      actions.updateMaterial(currentMaterial.id, { 
        selectedResult: resultType,
        selectedTranslationType: resultType
      });
      
      actions.showNotification('选择成功', `已选择${resultType === 'latex' ? 'LaTeX' : 'API'}翻译结果`, 'success');
      
    } catch (error) {
      actions.showNotification('选择失败', error.message || '选择结果时出现错误', 'error');
    }
  }, [currentMaterial, actions]);

  const handleRetryTranslation = useCallback(async (translationType) => {
    if (!currentMaterial) return;
    
    try {
      // 显示重试通知
      actions.showNotification('重新翻译', `正在重新进行${translationType === 'latex' ? 'LaTeX' : 'API'}翻译...`, 'info');
      
      if (translationType === 'api') {
        // 重新调用API翻译
        const { materialAPI } = await import('../../services/api');
        await materialAPI.startTranslation(currentMaterial.clientId);
        
        // 刷新材料列表
        setTimeout(async () => {
          try {
            const materialsData = await materialAPI.getMaterials(currentMaterial.clientId);
            actions.setMaterials(materialsData.materials || []);
          } catch (error) {
            console.error('刷新材料列表失败:', error);
          }
        }, 2000);
        
      } else if (translationType === 'latex') {
        // 生成唯一的请求ID
        const requestId = Date.now();
        setLatestRequestId(requestId);
        
        // 先清空当前的LaTeX结果，显示加载状态
        actions.updateMaterial(currentMaterial.id, {
          latexTranslationResult: null,
          latexTranslationError: null,
          status: '正在翻译'
        });
        
        // 调用LaTeX翻译重试API
        const { materialAPI } = await import('../../services/api');
        const response = await materialAPI.retryLatexTranslation(currentMaterial.id);
        
        // 检查是否是最新的请求
        if (requestId !== latestRequestId) {
          console.log('忽略过时的请求响应');
          return;
        }
        
        if (response.success) {
          // 只更新一次，避免闪烁
          const updatedMaterial = {
            ...currentMaterial,
            ...response.material,
            latexTranslationResult: response.material.latexTranslationResult,
            latexTranslationError: null,
            status: response.material.status || '翻译完成'
          };
          
          // 同时更新材料列表和当前材料
          actions.updateMaterial(currentMaterial.id, updatedMaterial);
          actions.setCurrentMaterial(updatedMaterial);
          
          actions.showNotification('重试成功', 'LaTeX翻译重试成功', 'success');
        } else {
          // 重试失败时也要更新状态
          if (requestId === latestRequestId) {
            actions.updateMaterial(currentMaterial.id, {
              latexTranslationError: response.error || 'LaTeX翻译失败',
              status: '翻译失败'
            });
          }
          actions.showNotification('重试失败', response.error || 'LaTeX翻译重试失败', 'error');
        }
      }
      
    } catch (error) {
      actions.showNotification('重试失败', error.message || '重新翻译时出现错误', 'error');
    }
  }, [currentMaterial, actions]);

  if (!currentMaterial) {
    return (
      <div className={styles.previewSection}>
        <div className={styles.header}>
          <h3 className={styles.title}>翻译预览</h3>
        </div>
        <div className={styles.content}>
          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
                <path d="M16 13H8M16 17H8M10 9H8"/>
              </svg>
            </div>
            <h4>选择材料查看翻译结果</h4>
            <p>请从左侧列表中选择要查看的材料</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewSection}>
      <div className={styles.header}>
        <h3 className={styles.title}>翻译预览</h3>
        <div className={styles.actions}>
          <button 
            className={`${styles.actionBtn} ${styles.btnRefresh}`}
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="刷新翻译结果"
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className={isRefreshing ? styles.rotating : ''}
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 12c0-4.75 3.25-9 9.25-9C17.5 3 22 7.5 22 12M12 22c4.75 0 9.25-4.5 9.25-9.25"/>
            </svg>
            刷新
          </button>
          {(currentMaterial.type === 'image' || currentMaterial.type === 'pdf') && 
           currentMaterial.selectedResult === 'latex' && null}
          <button 
            className={`${styles.actionBtn} ${currentMaterial.confirmed ? styles.btnUnconfirm : styles.btnConfirm}`}
            onClick={handleConfirm}
          >
            {currentMaterial.confirmed ? '取消确认' : '确认'}
          </button>
        </div>
      </div>
      
      <div className={styles.content}>
        {(currentMaterial.type === 'image' || currentMaterial.type === 'pdf') ? (
          <ComparisonView 
            key={`comparison-${currentMaterial.id}-${forceRefresh}`}
            material={currentMaterial} 
            onSelectResult={handleSelectResult}
          />
        ) : (
          <SinglePreview 
            key={`single-${currentMaterial.id}-${forceRefresh}`}
            material={currentMaterial} 
          />
        )}
      </div>

      {/* LaTeX编辑模态框 */}
      <LaTeXEditModal 
        isOpen={showLatexEditor}
        onClose={() => setShowLatexEditor(false)}
        material={currentMaterial}
      />

      {/* LaTeX编辑模态框 V2 */}
      <LaTeXEditModalV2 
        isOpen={showLatexEditorV2}
        onClose={() => setShowLatexEditorV2(false)}
        material={currentMaterial}
      />
    </div>
  );
};

const ComparisonView = ({ material, onSelectResult }) => {
  const { state, actions } = useApp();
  const isLatexSelected = material.selectedResult === 'latex';
  const isApiSelected = material.selectedResult === 'api';

  // PDF多页支持
  const [pdfPages, setPdfPages] = React.useState([]);
  const [currentPageIndex, setCurrentPageIndex] = React.useState(0);
  const [isLoadingPages, setIsLoadingPages] = React.useState(false);
  const [pdfSessionProgress, setPdfSessionProgress] = React.useState(null); // PDF整体进度
  const isChangingPageRef = React.useRef(false); // 标记是否正在切换页面

  // 加载PDF会话的所有页面
  React.useEffect(() => {
    const loadPdfPages = async () => {
      // 检查当前material是否是PDF页面
      if (!material.pdfSessionId) {
        setPdfPages([]);
        setPdfSessionProgress(null);
        return;
      }

      setIsLoadingPages(true);
      try {
        // 从materials列表中筛选同一个PDF会话的所有页面
        const allMaterials = state.materials || [];
        const sessionPages = allMaterials.filter(m =>
          m.pdfSessionId === material.pdfSessionId
        ).sort((a, b) => a.pdfPageNumber - b.pdfPageNumber);

        setPdfPages(sessionPages);

        // 计算PDF Session的整体进度
        if (sessionPages.length > 0) {
          const totalPages = sessionPages.length;
          const totalProgress = sessionPages.reduce((sum, page) => sum + (page.processingProgress || 0), 0);
          const avgProgress = Math.round(totalProgress / totalPages);

          // 确定整体状态
          const allTranslated = sessionPages.every(p => p.status === '翻译完成' && p.processingProgress >= 66);
          const someTranslating = sessionPages.some(p => p.processingStep === 'translating');

          setPdfSessionProgress({
            progress: avgProgress,
            allTranslated: allTranslated,
            someTranslating: someTranslating
          });

          console.log('PDF Session进度:', {
            totalPages,
            avgProgress,
            allTranslated,
            someTranslating,
            pageProgress: sessionPages.map(p => ({ id: p.id, progress: p.processingProgress, status: p.status }))
          });
        }

        // 设置当前页面索引（只在不是主动切换页面时更新，避免翻页循环）
        if (!isChangingPageRef.current) {
          const currentIndex = sessionPages.findIndex(p => p.id === material.id);
          if (currentIndex !== -1) {
            setCurrentPageIndex(currentIndex);
          }
        } else {
          // 切换页面操作完成，重置标志
          isChangingPageRef.current = false;
        }
      } catch (error) {
        console.error('加载PDF页面失败:', error);
      } finally {
        setIsLoadingPages(false);
      }
    };

    loadPdfPages();
  }, [material.id, material.pdfSessionId, state.materials]);

  // 切换到指定页面
  const handlePageChange = async (newIndex) => {
    if (newIndex < 0 || newIndex >= pdfPages.length) return;

    // 设置切换页面标志，防止useEffect重新设置索引
    isChangingPageRef.current = true;

    // 自动保存当前页面的编辑（如果有的话）
    if (window.currentFabricEditor && window.currentFabricEditor.generateBothVersions) {
      try {
        actions.showNotification('保存中', '正在保存当前页面...', 'info');

        const result = await window.currentFabricEditor.generateBothVersions();
        if (result) {
          const formData = new FormData();
          formData.append('edited_image', result.edited.blob, `edited_${material.name}.jpg`);
          formData.append('final_image', result.final.blob, `final_${material.name}.jpg`);
          formData.append('edited_regions', JSON.stringify(result.edited.regions || []));

          const token = localStorage.getItem('auth_token');
          const response = await fetch(`/api/materials/${material.id}/save-edited-image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          });

          if (!response.ok) {
            throw new Error('保存编辑后的图片失败');
          }

          const data = await response.json();

          // 验证返回的路径不是data URI
          if (!data.edited_image_path || !data.final_image_path ||
              data.edited_image_path.startsWith('data:') ||
              data.final_image_path.startsWith('data:')) {
            throw new Error('后端返回了无效的图片路径');
          }

          actions.updateMaterial(material.id, {
            editedImagePath: data.edited_image_path,
            finalImagePath: data.final_image_path,
            hasEditedVersion: true,
            editedRegions: data.material?.editedRegions || result.edited.regions || []
          });

          actions.showNotification('保存成功', `第 ${currentPageIndex + 1} 页已保存`, 'success');
        }
      } catch (error) {
        console.error('自动保存失败:', error);
        actions.showNotification('保存失败', error.message || '自动保存当前页面失败', 'error');
      }
    }

    // 切换到新页面
    const newPage = pdfPages[newIndex];
    setCurrentPageIndex(newIndex);
    actions.setCurrentMaterial(newPage);
  };

  // 调试信息可以在问题解决后移除

  // 重新翻译当前图片 - 只翻译这一张
  const handleRetranslateCurrentImage = useCallback(async () => {
    if (!material) return;

    try {
      actions.showNotification('重新翻译', '正在重新翻译当前图片...', 'info');

      // 调用单个材料的重新翻译API
      const { materialAPI } = await import('../../services/api');
      const response = await materialAPI.retranslateMaterial(material.id);

      if (response.success) {
        // 首先清除当前material，让编辑器卸载
        actions.setCurrentMaterial(null);

        // 等待一帧，让React完成卸载
        await new Promise(resolve => requestAnimationFrame(resolve));

        // 清除所有旧状态
        setLlmRegions([]);
        setBaiduRegions([]);
        setSavedEditedImage(null);
        setSavedRegions([]);
        setEditedImageData(null);
        setEditedImageBlob(null);

        // 重置LLM触发标志
        llmTriggeredRef.current[material.id] = false;

        // 更新当前材料，使用新的翻译结果
        const updatedMaterial = {
          ...material,
          id: material.id,
          name: material.name,
          filePath: material.filePath,
          translationTextInfo: response.material.translationTextInfo,
          llmTranslationResult: response.material.llmTranslationResult,
          status: response.material.status,
          processingProgress: response.material.processingProgress,
          processingStep: response.material.processingStep,
          translationError: null,
          // 清除编辑相关字段
          editedImagePath: null,
          finalImagePath: null,
          hasEditedVersion: false,
          editedRegions: null,
          // 保留PDF相关字段
          pdfSessionId: response.material.pdfSessionId || material.pdfSessionId,
          pdfPageNumber: response.material.pdfPageNumber || material.pdfPageNumber,
          pdfTotalPages: response.material.pdfTotalPages || material.pdfTotalPages
        };

        // 先更新material列表
        actions.updateMaterial(material.id, updatedMaterial);

        // 等待一小会儿
        await new Promise(resolve => setTimeout(resolve, 100));

        // 然后设置为当前material，触发重新渲染
        actions.setCurrentMaterial(updatedMaterial);

        actions.showNotification('重新翻译完成', '已清除编辑内容，从原始图片重新翻译', 'success');
      } else {
        throw new Error(response.error || '重新翻译失败');
      }
    } catch (error) {
      console.error('重新翻译失败:', error);
      actions.showNotification('重试失败', error.message || '重新翻译时出现错误', 'error');
    }
  }, [material, actions]);

  // 旋转图片（只旋转，不重新翻译）
  const handleRotateImage = useCallback(async () => {
    if (!material) return;

    try {
      actions.showNotification('旋转图片', '正在旋转图片...', 'info');

      // 调用旋转并重新翻译API
      const { materialAPI } = await import('../../services/api');
      const response = await materialAPI.rotateMaterial(material.id);

      if (response.success) {
        // 先清除当前material，让编辑器完全卸载
        actions.setCurrentMaterial(null);

        // 等待一帧，让React完成卸载
        await new Promise(resolve => requestAnimationFrame(resolve));

        // 清除所有本地状态
        setLlmRegions([]);
        setBaiduRegions([]);
        setSavedEditedImage(null);
        setSavedRegions([]);
        setEditedImageData(null);
        setEditedImageBlob(null);

        // 重置LLM触发标志
        llmTriggeredRef.current[material.id] = false;

        // 更新当前材料状态为已上传（清除翻译结果）
        // 添加时间戳和旋转计数来强制刷新
        const rotationCount = (material.rotationCount || 0) + 1;
        const updatedMaterial = {
          ...material,
          ...response.material,
          filePath: response.material.filePath,
          translationTextInfo: null,
          llmTranslationResult: null,
          status: '已上传',
          translationError: null,
          processingProgress: 0,
          processingStep: null,
          editedImagePath: null,
          finalImagePath: null,
          hasEditedVersion: false,
          editedRegions: null,
          updatedAt: new Date().toISOString(), // 更新时间戳，强制刷新图片缓存
          rotationCount: rotationCount, // 添加旋转计数，用于强制重新渲染
          // 保留PDF相关字段
          pdfSessionId: response.material.pdfSessionId || material.pdfSessionId,
          pdfPageNumber: response.material.pdfPageNumber || material.pdfPageNumber,
          pdfTotalPages: response.material.pdfTotalPages || material.pdfTotalPages
        };

        // 先更新材料列表
        actions.updateMaterial(material.id, updatedMaterial);

        // 等待一小会儿，确保状态已更新
        await new Promise(resolve => setTimeout(resolve, 100));

        // 然后重新设置当前材料，触发重新挂载
        actions.setCurrentMaterial(updatedMaterial);

        actions.showNotification('旋转完成', response.message || '图片已旋转90度，请点击重新翻译按钮', 'success');
      } else {
        throw new Error(response.error || '旋转失败');
      }
    } catch (error) {
      console.error('旋转失败:', error);
      actions.showNotification('旋转失败', error.message || '旋转图片时出现错误', 'error');
    }
  }, [material, actions]);

  const handleRetryTranslation = useCallback(async (translationType) => {
    if (!material) return;

    try {
      actions.showNotification('重新翻译', `正在重新进行${translationType === 'latex' ? 'LaTeX' : 'API'}翻译...`, 'info');

      if (translationType === 'api') {
        const { materialAPI } = await import('../../services/api');
        const { state: currentState } = await import('../../contexts/AppContext');
        console.log('重新翻译API调用，材料ID:', material.id);
        const response = await materialAPI.startTranslation(material.clientId);
        console.log('重新翻译API响应:', response);

        // 使用与GlobalUploadProgress相同的实时更新机制
        if (response.data && response.data.translated_materials && response.data.translated_materials.length > 0) {
          console.log('重新翻译：使用API直接返回的翻译结果:', response.data.translated_materials);

          // 创建翻译结果映射
          const translatedMaterialsMap = new Map();
          response.data.translated_materials.forEach(tm => {
            translatedMaterialsMap.set(tm.id, tm);
          });

          // 检查当前材料是否被翻译
          const translatedCurrentMaterial = translatedMaterialsMap.get(material.id);
          if (translatedCurrentMaterial) {
            const updatedMaterial = {
              ...material,
              status: '翻译完成',
              translatedImagePath: translatedCurrentMaterial.translated_image_path,
              translationTextInfo: translatedCurrentMaterial.translation_text_info,
              translationError: null,
              updatedAt: new Date().toISOString()
            };
            console.log('重新翻译：立即更新当前材料:', updatedMaterial);
            actions.setCurrentMaterial(updatedMaterial);

            // 同时更新材料列表中的对应项
            actions.updateMaterial(material.id, {
              status: '翻译完成',
              translatedImagePath: translatedCurrentMaterial.translated_image_path,
              translationTextInfo: translatedCurrentMaterial.translation_text_info,
              translationError: null,
              updatedAt: new Date().toISOString()
            });
          }

          actions.showNotification(
            '重新翻译完成',
            `成功翻译 ${response.data.translated_count} 个文件`,
            'success'
          );
        } else {
          // 备用方案：刷新材料列表
          try {
            const materialsData = await materialAPI.getMaterials(material.clientId);
            console.log('重新翻译后刷新的材料数据:', materialsData.materials);
            actions.setMaterials(materialsData.materials || []);

            const updatedCurrentMaterial = materialsData.materials.find(
              m => m.id === material.id
            );
            if (updatedCurrentMaterial) {
              console.log('重新翻译后更新当前材料:', updatedCurrentMaterial);
              actions.setCurrentMaterial(updatedCurrentMaterial);
            }

            actions.showNotification('重新翻译完成', '翻译结果已更新', 'success');
          } catch (error) {
            console.error('刷新材料列表失败:', error);
            actions.showNotification('更新失败', '翻译完成，但获取结果时出错，请手动刷新', 'warning');
          }
        }

      } else if (translationType === 'latex') {
        // 调用LaTeX翻译重试API
        const { materialAPI } = await import('../../services/api');
        const response = await materialAPI.retryLatexTranslation(material.id);

        if (response.success) {
          // 更新本地状态
          actions.updateMaterial(material.id, {
            latexTranslationResult: response.material.latexTranslationResult,
            latexTranslationError: null,
            status: response.material.status
          });

          // 更新当前材料如果它是当前选中的
          const { state } = await import('../../contexts/AppContext');
          if (state.currentMaterial && state.currentMaterial.id === material.id) {
            actions.setCurrentMaterial({
              ...material,
              latexTranslationResult: response.material.latexTranslationResult,
              latexTranslationError: null,
              status: response.material.status
            });
          }

          actions.showNotification('重试成功', 'LaTeX翻译重试成功', 'success');

          // 刷新材料列表以获取最新状态
          setTimeout(async () => {
            try {
              const materialsData = await materialAPI.getMaterials(material.clientId);
              actions.setMaterials(materialsData.materials || []);
            } catch (error) {
              console.error('刷新材料列表失败:', error);
            }
          }, 1000);
        } else {
          actions.showNotification('重试失败', response.error || 'LaTeX翻译重试失败', 'error');
        }
      }

    } catch (error) {
      actions.showNotification('重试失败', error.message || '重新翻译时出现错误', 'error');
    }
  }, [material, actions]);

  // 调试日志 - 实际项目中可以移除
  console.log('ComparisonView render:', {
    materialId: material.id,
    selectedResult: material.selectedResult,
    isLatexSelected,
    isApiSelected,
    status: material.status,
    translatedImagePath: material.translatedImagePath,
    translationError: material.translationError,
    translationTextInfo: material.translationTextInfo,
    updatedAt: material.updatedAt,
    // 判断条件
    hasTranslatedImage: !!material.translatedImagePath,
    isTranslationComplete: material.status === '翻译完成',
    isTranslationFailed: material.status === '翻译失败',
    isUploaded: material.status === '已上传'
  });

  // ========== Reference项目的LLM编辑器集成方式 ==========
  const [llmRegions, setLlmRegions] = React.useState([]);
  const [llmLoading, setLlmLoading] = React.useState(false);
  const [baiduRegions, setBaiduRegions] = React.useState([]);
  const [editedImageData, setEditedImageData] = React.useState(null); // 保存编辑后的图片数据
  const [editedImageBlob, setEditedImageBlob] = React.useState(null); // 保存编辑后的图片Blob
  const [savedEditedImage, setSavedEditedImage] = React.useState(null); // 已保存到后端的编辑图片
  const [savedRegions, setSavedRegions] = React.useState([]); // 已保存的regions状态
  const llmTriggeredRef = React.useRef({}); // 记录每个material是否已触发LLM
  const previousMaterialId = React.useRef(null); // 记录上一个material的id

  // 移除了确认时自动保存图片的逻辑，因为保存应该是独立的操作

  // 当material.id改变时，重置状态（切换材料时）
  React.useEffect(() => {
    // 只有真正切换材料时才重置，不是确认状态改变
    if (previousMaterialId.current !== material?.id) {
      console.log('切换材料，重置状态');
      setLlmRegions([]);
      setLlmLoading(false);
      setEditedImageData(null);
      setEditedImageBlob(null);
      setSavedEditedImage(null);
      previousMaterialId.current = material?.id;
    }
  }, [material?.id]);

  // 检查是否有已保存的编辑图片和regions
  React.useEffect(() => {
    if (material?.hasEditedVersion && material?.editedImagePath) {
      // 验证editedImagePath不是无效的data URI
      if (material.editedImagePath === 'data:,' || material.editedImagePath.startsWith('data:')) {
        console.error('❌ 材料的editedImagePath是无效的data URI:', material.editedImagePath);
        // 清除无效的标志
        actions.updateMaterial(material.id, {
          editedImagePath: null,
          hasEditedVersion: false
        });
        return;
      }

      // 如果材料有已保存的编辑版本，设置显示标志
      setSavedEditedImage(material.editedImagePath);
      console.log('检测到已保存的编辑图片:', material.editedImagePath);

      // 如果有保存的regions，恢复它们
      if (material?.editedRegions) {
        setSavedRegions(material.editedRegions);
        console.log('恢复已保存的regions:', material.editedRegions);
      }
    }
  }, [material?.hasEditedVersion, material?.editedImagePath, material?.editedRegions]);

  // 解析百度翻译结果
  React.useEffect(() => {
    if (!material || !material.translationTextInfo) {
      console.log('跳过：没有material或translationTextInfo');
      return;
    }

    const materialId = material.id;
    console.log('=== 处理material ===', materialId);

    try {
      const textInfo = typeof material.translationTextInfo === 'string'
        ? JSON.parse(material.translationTextInfo)
        : material.translationTextInfo;

      const regions = textInfo.regions || textInfo || [];
      console.log('解析后的regions数量:', regions.length);
      setBaiduRegions(regions);

      // 如果有LLM结果，直接使用
      if (material.llmTranslationResult) {
        console.log('✓ 检测到已有LLM结果，直接使用');
        const llmResult = typeof material.llmTranslationResult === 'string'
          ? JSON.parse(material.llmTranslationResult)
          : material.llmTranslationResult;

        // 合并LLM翻译到regions
        const updatedRegions = regions.map(region => {
          const llmTrans = llmResult.find(t => t.id === region.id);
          return llmTrans ? { ...region, dst: llmTrans.translation } : region;
        });
        setLlmRegions(updatedRegions);
        llmTriggeredRef.current[materialId] = true; // 标记已处理
      } else if (!llmTriggeredRef.current[materialId] &&
                 regions.length > 0 &&
                 (material.processingProgress >= 66 ||
                  (pdfSessionProgress && pdfSessionProgress.progress >= 66))) {
        // 只在百度翻译完成（进度>=66%）时触发LLM翻译
        console.log('⚡ 首次触发LLM翻译 - Material:', materialId, '进度:', material.processingProgress, 'PDF进度:', pdfSessionProgress?.progress);
        llmTriggeredRef.current[materialId] = true; // 立即设置flag，防止重复触发
        handleLLMTranslate(regions);
      } else {
        // 防止重复调用的保护日志
        if (llmTriggeredRef.current[materialId]) {
          console.log('🛡️ 防止重复LLM调用 - Material已处理:', materialId);
        } else if (regions.length === 0) {
          console.log('⊘ 跳过LLM调用 - regions为空');
        }
      }
    } catch (e) {
      console.error('解析翻译数据失败:', e);
    }
  }, [material?.id, material?.translationTextInfo, material?.processingProgress, pdfSessionProgress?.progress]); // 添加进度依赖

  // 当PDF所有页面翻译完成时，自动为所有页面触发LLM
  React.useEffect(() => {
    // 只有当是PDF多页 && 整体进度达到66% && 所有页面翻译完成时才执行
    if (!material.pdfSessionId || !pdfSessionProgress || pdfSessionProgress.progress < 66) {
      return;
    }

    if (!pdfSessionProgress.allTranslated) {
      return; // 还有页面未翻译完成
    }

    console.log('🚀 PDF所有页面翻译完成，检查是否需要为其他页面触发LLM');

    // 遍历所有PDF页面，为未触发LLM的页面触发
    pdfPages.forEach(async (page) => {
      // 跳过已经触发过LLM的页面
      if (llmTriggeredRef.current[page.id]) {
        console.log(`⊘ 页面 ${page.pdfPageNumber} 已触发过LLM，跳过`);
        return;
      }

      // 跳过没有翻译结果的页面
      if (!page.translationTextInfo) {
        console.log(`⊘ 页面 ${page.pdfPageNumber} 没有翻译结果，跳过`);
        return;
      }

      // 如果已经有LLM结果，也跳过
      if (page.llmTranslationResult) {
        console.log(`⊘ 页面 ${page.pdfPageNumber} 已有LLM结果，跳过`);
        llmTriggeredRef.current[page.id] = true;
        return;
      }

      // 为这个页面触发LLM
      try {
        console.log(`⚡ 为页面 ${page.pdfPageNumber} (ID: ${page.id}) 触发LLM翻译`);
        llmTriggeredRef.current[page.id] = true; // 立即标记，防止重复

        const token = localStorage.getItem('auth_token');
        const response = await fetch(`/api/materials/${page.id}/llm-translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`✓ 页面 ${page.pdfPageNumber} LLM翻译完成`);

          // 更新materials列表中的这个页面
          actions.updateMaterial(page.id, {
            llmTranslationResult: data.llm_translations,
            processingProgress: 100 // LLM完成后设置为100%
          });
        } else {
          console.error(`✗ 页面 ${page.pdfPageNumber} LLM翻译失败:`, await response.text());
        }
      } catch (error) {
        console.error(`✗ 页面 ${page.pdfPageNumber} LLM翻译出错:`, error);
      }
    });
  }, [pdfSessionProgress?.allTranslated, pdfSessionProgress?.progress, pdfPages]); // 监听整体翻译完成状态

  // LLM翻译（完全按照Reference的方式）
  const handleLLMTranslate = async (regions) => {
    console.log('开始LLM翻译，regions参数:', regions);
    console.log('开始LLM翻译，regions数量:', regions.length);
    console.log('regions前3个:', regions.slice(0, 3));
    setLlmLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/materials/${material.id}/llm-translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('LLM翻译失败，响应:', errorText);
        throw new Error(`LLM翻译失败: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('LLM API返回数据:', data);

      // 显示日志文件信息
      if (data.log_files) {
        console.log('LLM翻译日志已保存:', data.log_files);
      }

      // 更新LLM regions的翻译结果（Reference的方式）
      if (data.llm_translations) {
        console.log('收到llm_translations，数量:', data.llm_translations.length);
        console.log('用于合并的regions数量:', regions.length);

        const updatedRegions = regions.map(region => {
          const llmTranslation = data.llm_translations.find(t => t.id === region.id);
          if (llmTranslation) {
            return {
              ...region,
              dst: llmTranslation.translation
            };
          }
          return region;
        });

        console.log('LLM翻译完成，更新regions数量:', updatedRegions.length);
        console.log('updatedRegions前3个:', updatedRegions.slice(0, 3));
        console.log('准备调用setLlmRegions...');
        setLlmRegions(updatedRegions);
        console.log('setLlmRegions调用完成');
        actions.showNotification('AI优化完成', `成功优化 ${updatedRegions.length} 个翻译区域`, 'success');
      } else {
        console.error('data中没有llm_translations字段！', data);
      }
    } catch (err) {
      console.error('LLM翻译错误:', err);
      actions.showNotification('LLM翻译失败', err.message, 'error');
      // LLM翻译失败时，使用百度原始翻译
      setLlmRegions(regions);
    } finally {
      setLlmLoading(false);
    }
  };

  // 获取图片URL - 用于编辑器的底图
  const getImageUrl = () => {
    if (!material) return null;

    // 如果有已保存的编辑图片，编辑器应该加载编辑后的图片作为底图
    // 添加防护：确保不是空的data URI
    if (savedEditedImage && savedEditedImage !== 'data:,' && !savedEditedImage.startsWith('data:')) {
      const url = `/download/image/${savedEditedImage}`;
      console.log('✅ 编辑器加载已保存的编辑图片:', url, 'editedImagePath:', savedEditedImage);
      return url;
    }

    // 如果savedEditedImage是无效的，记录警告并清除它
    if (savedEditedImage && (savedEditedImage === 'data:,' || savedEditedImage.startsWith('data:'))) {
      console.warn('⚠️ 检测到无效的editedImagePath (data URI)，已忽略:', savedEditedImage);
      setSavedEditedImage(null); // 清除无效值
    }

    // 否则使用原始图片
    if (material.filePath) {
      // 添加时间戳参数强制刷新图片缓存（特别是旋转后）
      const timestamp = material.updatedAt ? new Date(material.updatedAt).getTime() : Date.now();
      const url = `/download/image/${material.filePath}?t=${timestamp}`;
      console.log('✅ 编辑器加载原始图片:', url, 'filePath:', material.filePath);
      return url;
    }

    console.log('❌ 没有文件路径，无法显示');
    return null;
  };

  // 调试日志
  console.log('PreviewSection渲染状态:', {
    llmRegions: llmRegions.length,
    imageUrl: getImageUrl(),
    llmLoading,
    material: material?.id,
    materialType: material?.type,
    hasTranslationInfo: !!material.translationTextInfo,
    // 🔍 加载界面条件检查
    status: material?.status,
    processingStep: material?.processingStep,
    shouldShowLoading: llmLoading || material?.status === '处理中' || material?.processingStep === 'uploaded' || material?.processingStep === 'translating' || (material?.processingStep === 'translated' && !material?.translationTextInfo)
  });

  // ========== Reference项目完整复刻：一进来就显示编辑器 ==========
  return (
    <div className={styles.llmImageTranslationView}>
      {/* 只要有图片就显示编辑器 - Reference App.jsx 第355行完整复刻 */}
      {getImageUrl() && (
        <div className={styles.llmEditorSection}>
          <div className={styles.llmEditorHeader}>
            <div>
              <h2 className={styles.llmEditorTitle}>自定义编辑</h2>
              {llmLoading && <p className={styles.sectionDescription}>
                <span style={{ color: '#007bff' }}>正在加载...</span>
              </p>}
              {/* PDF页面导航 */}
              {pdfPages.length > 0 && (
                <div className={styles.pdfNavigation}>
                  <button
                    className={styles.pdfNavBtn}
                    onClick={() => handlePageChange(currentPageIndex - 1)}
                    disabled={currentPageIndex === 0}
                    title="上一页"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 18l-6-6 6-6"/>
                    </svg>
                    上一页
                  </button>
                  <span className={styles.pdfPageInfo}>
                    第 {currentPageIndex + 1} / {pdfPages.length} 页
                  </span>
                  <button
                    className={styles.pdfNavBtn}
                    onClick={() => handlePageChange(currentPageIndex + 1)}
                    disabled={currentPageIndex === pdfPages.length - 1}
                    title="下一页"
                  >
                    下一页
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {/* 旋转、重新翻译和保存修改按钮 - 始终显示（除非正在加载） */}
            {!llmLoading && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className={styles.rotateButton}
                  onClick={handleRotateImage}
                  title="旋转图片90度并重新翻译"
                >
                  旋转
                </button>
                <button
                  className={styles.retranslateButton}
                  onClick={handleRetranslateCurrentImage}
                  title="重新翻译当前图片"
                >
                  重新翻译
                </button>
                <button
                  className={styles.saveEditButton}
                  onClick={async () => {
                  // 保存两个版本的图片：不带文字版本和带文字版本
                  if (window.currentFabricEditor && window.currentFabricEditor.generateBothVersions) {
                    try {
                      actions.showNotification('保存中', '正在生成图片...', 'info');

                      // 调用新的generateBothVersions函数一次性生成两个版本
                      const result = await window.currentFabricEditor.generateBothVersions();

                      if (!result) {
                        throw new Error('生成图片失败');
                      }

                      // 上传两个版本到后端
                      const formData = new FormData();
                      formData.append('edited_image', result.edited.blob, `edited_${material.name}.jpg`);
                      formData.append('final_image', result.final.blob, `final_${material.name}.jpg`);
                      formData.append('edited_regions', JSON.stringify(result.edited.regions || []));

                      const token = localStorage.getItem('auth_token');
                      const response = await fetch(`/api/materials/${material.id}/save-edited-image`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`
                        },
                        body: formData
                      });

                      if (!response.ok) {
                        throw new Error('保存编辑后的图片失败');
                      }

                      const data = await response.json();

                      // 验证返回的路径
                      if (!data.edited_image_path || !data.final_image_path ||
                          data.edited_image_path.startsWith('data:') ||
                          data.final_image_path.startsWith('data:')) {
                        throw new Error('后端返回了无效的图片路径');
                      }

                      // 更新材料数据
                      actions.updateMaterial(material.id, {
                        editedImagePath: data.edited_image_path,
                        finalImagePath: data.final_image_path,
                        hasEditedVersion: true,
                        editedRegions: data.material?.editedRegions || result.edited.regions || []
                      });

                      // 更新本地状态
                      setSavedEditedImage(data.edited_image_path);
                      setEditedImageData(result.edited.url);
                      setEditedImageBlob(result.edited.blob);

                      actions.showNotification('保存成功', '编辑已保存，导出时将使用带文字的完整版本', 'success');
                    } catch (error) {
                      console.error('保存编辑图片失败:', error);
                      actions.showNotification('保存失败', error.message || '无法保存编辑后的图片', 'error');
                    }
                  }
                }}
              >
                保存修改
              </button>
              </div>
            )}
          </div>

            <div className={styles.llmEditorContent}>
            {/* 显示翻译进行中状态 - 包括所有三个阶段：上传、百度翻译、AI优化 */}
            {/* 只有在进度未完成时才显示加载界面，避免已完成的页面闪现进度条 */}
            {(material.processingProgress < 100 || !material.llmTranslationResult) && (llmLoading || material.status === '处理中' || material.processingStep === 'uploaded' || material.processingStep === 'translating' || (material.processingStep === 'translated' && !material.translationTextInfo)) ? (
              <div className={styles.processingContainer}>
                <div className={styles.processingContent}>
                  <div className={styles.processingIconWrapper}>
                    <div className={styles.processingIcon}>
                      <svg className={styles.spinning} width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                    </div>
                  </div>
                  <h3 className={styles.processingTitle}>
                    {material.processingStep === 'uploaded' && '正在准备翻译...'}
                    {(material.processingStep === 'translating' || (pdfSessionProgress && pdfSessionProgress.someTranslating)) && '正在翻译中...'}
                    {llmLoading && '正在AI优化中...'}
                    {!material.processingStep && !llmLoading && '处理中...'}
                  </h3>
                  <div className={styles.processingSteps}>
                    <div className={`${styles.processingStep} ${(pdfSessionProgress ? pdfSessionProgress.progress >= 33 : material.processingProgress >= 33) ? styles.active : ''}`}>
                      <div className={styles.stepIcon}>
                        {(pdfSessionProgress ? pdfSessionProgress.progress >= 33 : material.processingProgress >= 33) ? '✓' : '1'}
                      </div>
                      <span>上传完成</span>
                    </div>
                    <div className={styles.stepLine}></div>
                    <div className={`${styles.processingStep} ${(pdfSessionProgress ? pdfSessionProgress.progress >= 66 : material.processingProgress >= 66) ? styles.active : (material.processingStep === 'translating' || (pdfSessionProgress && pdfSessionProgress.someTranslating)) ? styles.current : ''}`}>
                      <div className={styles.stepIcon}>
                        {(pdfSessionProgress ? pdfSessionProgress.progress >= 66 : material.processingProgress >= 66) ? '✓' : '2'}
                      </div>
                      <span>百度翻译</span>
                    </div>
                    <div className={styles.stepLine}></div>
                    <div className={`${styles.processingStep} ${(pdfSessionProgress ? pdfSessionProgress.progress === 100 : material.processingProgress === 100) ? styles.active : llmLoading ? styles.current : ''}`}>
                      <div className={styles.stepIcon}>
                        {(pdfSessionProgress ? pdfSessionProgress.progress === 100 : material.processingProgress === 100) ? '✓' : '3'}
                      </div>
                      <span>AI优化</span>
                    </div>
                  </div>
                  <div className={styles.progressBarWrapper}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${pdfSessionProgress ? pdfSessionProgress.progress : (llmLoading && material.processingProgress < 66 ? 66 : (material.processingProgress || 0))}%` }}
                      ></div>
                    </div>
                    <span className={styles.progressText}>{pdfSessionProgress ? pdfSessionProgress.progress : (llmLoading && material.processingProgress < 66 ? 66 : (material.processingProgress || 0))}%</span>
                  </div>
                  <p className={styles.processingTip}>请稍候，翻译完成后会自动刷新显示</p>
                </div>
              </div>
            ) : !material.translationTextInfo ? (
              /* 没有翻译结果时，显示空的编辑器（例如旋转后） */
              <FabricImageEditor
                imageSrc={getImageUrl()}
                regions={[]} // 空regions，只显示原图
                editorKey={`empty-${material.id}-${material.rotationCount || 0}`}
                exposeHandlers={true}
                onExport={async (url, blob, currentRegions, includeText) => {
                  try {
                    // 创建FormData上传编辑后的图片和regions到后端
                    const formData = new FormData();
                    formData.append('edited_image', blob, `edited_${material.name}.jpg`);
                    formData.append('edited_regions', JSON.stringify(currentRegions || []));

                    const token = localStorage.getItem('auth_token');
                    const response = await fetch(`/api/materials/${material.id}/save-edited-image`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${token}`
                      },
                      body: formData
                    });

                    if (!response.ok) {
                      throw new Error('保存编辑后的图片失败');
                    }

                    const data = await response.json();

                    // 更新材料数据，包括后端返回的 editedRegions
                    actions.updateMaterial(material.id, {
                      editedImageData: url,
                      editedImageBlob: blob,
                      editedImagePath: data.edited_image_path,
                      hasEditedVersion: true,
                      editedRegions: data.material?.editedRegions || currentRegions || []
                    });

                    // 更新本地状态，显示已保存的图片
                    setSavedEditedImage(data.edited_image_path);
                    setEditedImageData(url);
                    setEditedImageBlob(blob);

                    // 同步更新 material 对象（用于直接访问）
                    if (material) {
                      material.editedRegions = data.material?.editedRegions || currentRegions || [];
                    }

                    actions.showNotification('保存成功', '编辑已保存，导出时将使用编辑后的版本', 'success');
                  } catch (error) {
                    console.error('保存编辑图片失败:', error);
                    actions.showNotification('保存失败', error.message || '无法保存编辑后的图片', 'error');
                  }
                }}
              />
            ) : (
              /* LLM翻译完成：显示可编辑的结果 */
              <FabricImageEditor
                imageSrc={getImageUrl()}
                regions={savedRegions.length > 0 ? savedRegions : llmRegions} // 使用保存的regions或新的llmRegions
                editorKey={`llm-${material.id}-${material.rotationCount || 0}`} // 添加旋转计数，确保旋转后重新初始化
                exposeHandlers={true}
                onExport={async (url, blob, currentRegions, includeText) => {
                  try {
                    // 创建FormData上传编辑后的图片和regions到后端
                    const formData = new FormData();
                    formData.append('edited_image', blob, `edited_${material.name}.jpg`);
                    formData.append('edited_regions', JSON.stringify(currentRegions || llmRegions));

                    const token = localStorage.getItem('auth_token');
                    const response = await fetch(`/api/materials/${material.id}/save-edited-image`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${token}`
                      },
                      body: formData
                    });

                    if (!response.ok) {
                      throw new Error('保存编辑后的图片失败');
                    }

                    const data = await response.json();

                    // 更新材料数据，包括后端返回的编辑图片路径和 editedRegions
                    actions.updateMaterial(material.id, {
                      editedImageData: url,
                      editedImageBlob: blob,
                      editedImagePath: data.edited_image_path,
                      hasEditedVersion: true,
                      editedRegions: data.material?.editedRegions || currentRegions || llmRegions
                    });

                    // 更新本地状态，显示已保存的图片
                    setSavedEditedImage(data.edited_image_path);
                    // 不立即更新 savedRegions，避免编辑器重新初始化
                    // setSavedRegions(currentRegions || llmRegions);
                    setEditedImageData(url);
                    setEditedImageBlob(blob);

                    // 同步更新 material 对象（用于直接访问）
                    if (material) {
                      material.editedRegions = data.material?.editedRegions || currentRegions || llmRegions;
                    }

                    // 显示保存成功提示
                    actions.showNotification('保存成功', '编辑已保存，导出时将使用编辑后的版本', 'success');
                  } catch (error) {
                    console.error('保存编辑图片失败:', error);
                    actions.showNotification('保存失败', error.message || '无法保存编辑后的图片', 'error');
                  }
                }}
              />
            )}
            </div>
        </div>
      )}

      {/* 如果连图片都没有，显示占位符 */}
      {!getImageUrl() && (
        <div className={styles.previewPlaceholder}>
          <div className={styles.placeholderIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/>
            </svg>
          </div>
          <h4>没有图片</h4>
          <p>无法获取材料图片</p>
        </div>
      )}
    </div>
  );
};

const SinglePreview = ({ material }) => {
  const { actions } = useApp();
  const [error, setError] = useState(null);

  // 判断是否正在翻译
  const isTranslating = material && material.status === '正在翻译';
  
  // 判断是否有翻译结果
  const hasTranslationResult = material && material.translatedImagePath && 
    (material.status === '翻译完成' || material.status === '已确认');
  
  // 调试日志
  console.log('SinglePreview Debug:', {
    materialType: material?.type,
    materialId: material?.id,
    materialName: material?.name,
    translatedImagePath: material?.translatedImagePath,
    status: material?.status,
    hasTranslationResult: hasTranslationResult,
    isTranslating: isTranslating,
    previewUrl: material?.translatedImagePath ? `/preview/translated/${material.translatedImagePath}` : null
  });

  useEffect(() => {
    // 当翻译失败时，设置错误信息
    if (material && material.status === '翻译失败' && material.translationError) {
      setError(material.translationError);
    } else {
      setError(null);
    }
  }, [material]);

  const handleTranslate = async () => {
    if (!material || !material.url) return;
    
    setError(null);
    
    // 更新状态为正在翻译
    actions.updateMaterial(material.id, {
      status: '正在翻译'
    });
    
    try {
      // 调用Google网页翻译API
      const response = await fetch('/api/webpage-google-translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          url: material.url
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // 更新材料状态
        actions.updateMaterial(material.id, {
          status: '翻译完成',
          translatedImagePath: data.pdf_filename,
          translationError: null
        });
        
        actions.showNotification('翻译成功', '网页翻译已完成', 'success');
      } else {
        setError(data.error || '翻译失败');
        actions.updateMaterial(material.id, {
          status: '翻译失败',
          translationError: data.error
        });
      }
    } catch (err) {
      setError(err.message || '网络错误');
      actions.updateMaterial(material.id, {
        status: '翻译失败',
        translationError: err.message
      });
    }
  };

  const handleOpenPdf = () => {
    if (material && material.translatedImagePath) {
      // URL编码文件名，处理空格等特殊字符
      const encodedFilename = encodeURIComponent(material.translatedImagePath);
      // 使用完整的后端URL，绕过React Router
      window.open(`http://localhost:5010/preview/translated/${encodedFilename}`, '_blank');
    }
  };

  if (error) {
    return (
      <div className={styles.singlePreview}>
        <div className={styles.errorContent}>
          <div className={styles.errorIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="m15 9-6 6M9 9l6 6"/>
            </svg>
          </div>
          <h4>翻译失败</h4>
          <p className={styles.errorMessage}>{error}</p>
          <button 
            className={styles.retryBtn}
            onClick={handleTranslate}
          >
            重新翻译
          </button>
        </div>
      </div>
    );
  }

  if (isTranslating) {
    return (
      <div className={styles.singlePreview}>
        <div className={styles.previewPlaceholder}>
          <div className={styles.loadingSpinner}>
            <svg className={styles.spinning} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          </div>
          <h4>正在翻译网页</h4>
          <p>使用Google翻译处理中，请稍候...</p>
          <p className={styles.urlInfo}>{material.url}</p>
        </div>
      </div>
    );
  }

  if (hasTranslationResult) {
    // 对文件名进行URL编码，处理空格等特殊字符
    const encodedFilename = encodeURIComponent(material.translatedImagePath);
    // 使用完整的后端URL，绕过React Router的通配符路由
    const previewUrl = `http://localhost:5010/preview/translated/${encodedFilename}`;

    console.log('📄 PDF预览URL:', previewUrl);
    console.log('📄 完整材料信息:', material);

    return (
      <div className={styles.singlePreview}>
        <div className={styles.pdfPreviewContainer}>
          <iframe
            src={previewUrl}
            className={styles.pdfIframe}
            title="网页翻译预览"
            onLoad={() => console.log('✅ PDF iframe加载完成')}
            onError={(e) => console.error('❌ PDF iframe加载失败:', e)}
          />
          <div className={styles.pdfActions}>
            <button
              className={styles.pdfActionBtn}
              onClick={handleOpenPdf}
            >
              在新标签页中打开
            </button>
            <button
              className={styles.pdfActionBtn}
              onClick={handleTranslate}
            >
              重新翻译
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 根据材料状态显示不同内容
  if (material.status === '已添加') {
    // 刚添加还未开始翻译
    return (
      <div className={styles.singlePreview}>
        <div className={styles.previewPlaceholder}>
          <div className={styles.placeholderIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <h4>等待翻译</h4>
          <p className={styles.urlInfo}>{material.url}</p>
          <p className={styles.waitingText}>网页材料已添加，即将自动开始翻译...</p>
        </div>
      </div>
    );
  }
  
  // 其他状态（未知状态）
  return (
    <div className={styles.singlePreview}>
      <div className={styles.previewPlaceholder}>
        <div className={styles.placeholderIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="m7.5 12 9.5-5.5m0 11L7.5 12"/>
            <path d="M12 2v20M2 12h20"/>
          </svg>
        </div>
        <h4>网页材料</h4>
        <p className={styles.urlInfo}>{material.url}</p>
        <p className={styles.statusText}>状态：{material.status}</p>
      </div>
    </div>
  );
};

// LaTeX PDF预览组件
const LatexPdfPreview = ({ material }) => {
  const [pdfLoadError, setPdfLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 解析LaTeX翻译结果
  const latexResult = React.useMemo(() => {
    if (!material.latexTranslationResult) return null;
    
    try {
      return JSON.parse(material.latexTranslationResult);
    } catch (error) {
      console.error('解析LaTeX翻译结果失败:', error);
      return null;
    }
  }, [material.latexTranslationResult]);

  // 构建PDF预览URL
  const pdfPreviewUrl = React.useMemo(() => {
    if (!latexResult?.pdf_file) return null;
    
    // 从PDF文件路径中提取文件名
    const pdfFileName = latexResult.pdf_file.split('/').pop();
    if (!pdfFileName) return null;
    
    // 构建预览URL
    const encodedFileName = encodeURIComponent(pdfFileName);
    return `/preview/poster/${encodedFileName}`;
  }, [latexResult]);

  const handlePdfLoad = () => {
    setIsLoading(false);
    setPdfLoadError(false);
    console.log('LaTeX PDF预览加载成功');
  };

  const handlePdfError = () => {
    setIsLoading(false);
    setPdfLoadError(true);
    console.error('LaTeX PDF预览加载失败');
  };

  const handleRetryLoad = () => {
    setIsLoading(true);
    setPdfLoadError(false);
    // 强制重新加载iframe
    const iframe = document.getElementById(`latex-pdf-iframe-${material.id}`);
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const handleOpenInNewTab = () => {
    if (pdfPreviewUrl) {
      window.open(pdfPreviewUrl, '_blank');
    }
  };

  if (!latexResult) {
    return (
      <div className={styles.pdfErrorContainer}>
        <div className={styles.errorIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <path d="M12 9v4M12 17h.01"/>
          </svg>
        </div>
        <p>LaTeX翻译结果解析失败</p>
      </div>
    );
  }

  if (!pdfPreviewUrl) {
    return (
      <div className={styles.pdfErrorContainer}>
        <div className={styles.errorIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <path d="M12 9v4M12 17h.01"/>
          </svg>
        </div>
        <p>PDF文件路径无效</p>
        <div className={styles.debugInfo}>
          <p>调试信息：</p>
          <p>LaTeX结果: {JSON.stringify(latexResult, null, 2)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.latexPdfPreview}>
      <div className={styles.pdfContainer}>
        {isLoading && (
          <div className={styles.pdfLoading}>
            <div className={styles.loadingSpinner}></div>
            <p>PDF预览加载中...</p>
          </div>
        )}
        
        {pdfLoadError ? (
          <div className={styles.pdfError}>
            <div className={styles.errorIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <path d="M12 9v4M12 17h.01"/>
          </svg>
        </div>
            <h4>PDF预览不可用</h4>
            <p>可能的原因：</p>
            <ul>
              <li>浏览器不支持PDF预览</li>
              <li>PDF文件损坏或不存在</li>
              <li>网络连接问题</li>
            </ul>
            <div className={styles.pdfActions}>
              <button 
                className={styles.pdfActionBtn}
                onClick={handleOpenInNewTab}
              >
                在新标签页中打开PDF
              </button>
              <button 
                className={styles.pdfActionBtn}
                onClick={handleRetryLoad}
              >
                重新加载预览
              </button>
            </div>
          </div>
        ) : (
          <iframe
            id={`latex-pdf-iframe-${material.id}`}
            src={pdfPreviewUrl}
            className={styles.pdfIframe}
            title="LaTeX翻译PDF预览"
            onLoad={handlePdfLoad}
            onError={handlePdfError}
            style={{ opacity: isLoading ? 0 : 1 }}
          />
        )}
      </div>
    </div>
  );
};

export default PreviewSection;


