import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { materialAPI } from '../../services/api';
import LaTeXEditModal from '../modals/LaTeXEditModal';
import LaTeXEditModalV2 from '../modals/LaTeXEditModalV2';
import FabricImageEditor from './FabricImageEditor';
import EntityRecognitionModal from './EntityRecognitionModal';
import EntityResultModal from './EntityResultModal';
import styles from './PreviewSection.module.css';

// API URL配置
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

const PreviewSection = () => {
  const { state, actions } = useApp();
  const { currentMaterial } = state;
  const { t } = useLanguage();
  const [showLatexEditor, setShowLatexEditor] = useState(false);
  const [showLatexEditorV2, setShowLatexEditorV2] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latestRequestId, setLatestRequestId] = useState(null);

  // ========== ComparisonView的状态提升到PreviewSection ==========
  // PDF多页支持
  const [pdfPages, setPdfPages] = React.useState([]);
  const [currentPageIndex, setCurrentPageIndex] = React.useState(0);
  const [isLoadingPages, setIsLoadingPages] = React.useState(false);
  const [pdfSessionProgress, setPdfSessionProgress] = React.useState(null);
  const isChangingPageRef = React.useRef(false);
  const previousPdfSessionId = React.useRef(null);

  // Entity Recognition states
  const [showEntityModal, setShowEntityModal] = React.useState(false);
  const [entityResults, setEntityResults] = React.useState([]);
  const [entityModalLoading, setEntityModalLoading] = React.useState(false);

  // LLM Translation states
  const [llmRegions, setLlmRegions] = React.useState([]);
  const [llmLoading, setLlmLoading] = React.useState(false);
  const [baiduRegions, setBaiduRegions] = React.useState([]);

  // Edited image states
  const [editedImageData, setEditedImageData] = React.useState(null);
  const [editedImageBlob, setEditedImageBlob] = React.useState(null);
  const [savedEditedImage, setSavedEditedImage] = React.useState(null);
  const [savedRegions, setSavedRegions] = React.useState([]);

  // Refs
  const llmTriggeredRef = React.useRef({});
  const previousMaterialId = React.useRef(null);
  const pdfSessionEntityTriggeredRef = React.useRef({}); // 跟踪PDF Session实体识别是否已触发
  const pdfSessionEntityModalShownRef = React.useRef({}); // 跟踪PDF Session实体Modal是否已显示
  // ========== 状态提升结束 ==========

  // 监听currentMaterial变化，强制刷新预览
  // 注意：只在材料 ID 变化时强制刷新，避免状态更新导致多次刷新
  useEffect(() => {
    setForceRefresh(prev => prev + 1);
  }, [currentMaterial?.id]); // 只监听 ID，移除 status 和 translatedImagePath

  // ========== ComparisonView的hooks和handlers（已内联到PreviewSection）==========
  const isLatexSelected = currentMaterial?.selectedResult === 'latex';
  const isApiSelected = currentMaterial?.selectedResult === 'api';

  // 加载PDF会话的所有页面
  React.useEffect(() => {
    const loadPdfPages = async () => {
      // 检查当前material是否是PDF页面
      if (!currentMaterial?.pdfSessionId) {
        setPdfPages([]);
        setPdfSessionProgress(null);
        previousPdfSessionId.current = null;
        return;
      }

      setIsLoadingPages(true);
      try {
        // 从materials列表中筛选同一个PDF会话的所有页面
        const allMaterials = state.materials || [];
        const sessionPages = allMaterials.filter(m =>
          m.pdfSessionId === currentMaterial.pdfSessionId
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

        // ✅ 检测到新的PDF Session：强制重置到第一页
        const isNewPdfSession = previousPdfSessionId.current !== null &&
                                previousPdfSessionId.current !== currentMaterial.pdfSessionId;

        if (isNewPdfSession) {
          console.log('🔄 检测到新的PDF Session，重置到第一页');
          setCurrentPageIndex(0);
          previousPdfSessionId.current = currentMaterial.pdfSessionId;
        }
        // 设置当前页面索引（非新Session且非手动切换）
        else if (!isChangingPageRef.current) {
          const currentIndex = sessionPages.findIndex(p => p.id === currentMaterial.id);
          if (currentIndex !== -1) {
            setCurrentPageIndex(currentIndex);
            // 首次加载时记录PDF Session ID
            if (previousPdfSessionId.current === null) {
              previousPdfSessionId.current = currentMaterial.pdfSessionId;
            }
          } else {
            // 如果找不到当前页面，默认显示第一页
            setCurrentPageIndex(0);
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
  }, [currentMaterial?.id, currentMaterial?.pdfSessionId, state.materials]);

  // 切换到指定页面
  const handlePageChange = async (newIndex) => {
    if (newIndex < 0 || newIndex >= pdfPages.length) return;

    // 设置切换页面标志，防止useEffect重新设置索引
    isChangingPageRef.current = true;

    // ✅ 重构：自动保存当前页面的编辑（保存regions + 生成最终图片）
    if (window.currentFabricEditor && window.currentFabricEditor.getCurrentRegions) {
      try {
        actions.showNotification('保存中', '正在保存当前页面...', 'info');

        const currentRegions = window.currentFabricEditor.getCurrentRegions();
        if (currentRegions && currentRegions.length > 0) {
          const { materialAPI } = await import('../../services/api');

          // 1. 保存 regions
          const response = await materialAPI.saveRegions(currentMaterial.id, currentRegions);

          if (!response.success) {
            throw new Error(response.error || '保存失败');
          }

          // 2. 生成并上传最终图片（确保导出时和编辑器一致）
          if (window.currentFabricEditor.generateFinalImage) {
            try {
              const finalImage = await window.currentFabricEditor.generateFinalImage();
              if (finalImage && finalImage.blob) {
                await materialAPI.saveFinalImage(currentMaterial.id, finalImage.blob);
                console.log(`✓ 第 ${currentPageIndex + 1} 页最终图片已生成并上传`);
              }
            } catch (imageError) {
              console.warn('生成最终图片失败:', imageError);
              // 不阻止页面切换
            }
          }

          actions.updateMaterial(currentMaterial.id, {
            editedRegions: currentRegions,
            hasEditedVersion: true
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

  // 重新翻译当前图片 - 只翻译这一张
  const handleRetranslateCurrentImage = useCallback(async () => {
    if (!currentMaterial) return;

    try {
      actions.showNotification(t('retranslating'), t('retranslatingCurrentImage'), 'info');

      // 调用单个材料的重新翻译API
      const { materialAPI } = await import('../../services/api');
      const response = await materialAPI.retranslateMaterial(currentMaterial.id);

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
        llmTriggeredRef.current[currentMaterial.id] = false;

        // 更新当前材料，使用新的翻译结果
        const updatedMaterial = {
          ...currentMaterial,
          id: currentMaterial.id,
          name: currentMaterial.name,
          filePath: currentMaterial.filePath,
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
          pdfSessionId: response.material.pdfSessionId || currentMaterial.pdfSessionId,
          pdfPageNumber: response.material.pdfPageNumber || currentMaterial.pdfPageNumber,
          pdfTotalPages: response.material.pdfTotalPages || currentMaterial.pdfTotalPages
        };

        // 先更新material列表
        actions.updateMaterial(currentMaterial.id, updatedMaterial);

        // 等待一小会儿
        await new Promise(resolve => setTimeout(resolve, 100));

        // 然后设置为当前material，触发重新渲染
        actions.setCurrentMaterial(updatedMaterial);

        actions.showNotification(t('retranslateComplete'), t('clearedEditContent'), 'success');
      } else {
        throw new Error(response.error || t('retranslateFailed'));
      }
    } catch (error) {
      console.error('重新翻译失败:', error);
      actions.showNotification(t('error'), error.message || t('operationError'), 'error');
    }
  }, [currentMaterial, actions, t]);

  // 旋转图片（只旋转，不重新翻译）
  const handleRotateImage = useCallback(async () => {
    if (!currentMaterial) return;

    try {
      actions.showNotification('旋转图片', '正在旋转图片...', 'info');

      // 调用旋转并重新翻译API
      const { materialAPI } = await import('../../services/api');
      const response = await materialAPI.rotateMaterial(currentMaterial.id);

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
        llmTriggeredRef.current[currentMaterial.id] = false;

        // 更新当前材料状态为已上传（清除翻译结果）
        // 添加时间戳和旋转计数来强制刷新
        const rotationCount = (currentMaterial.rotationCount || 0) + 1;
        const updatedMaterial = {
          ...currentMaterial,
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
          pdfSessionId: response.material.pdfSessionId || currentMaterial.pdfSessionId,
          pdfPageNumber: response.material.pdfPageNumber || currentMaterial.pdfPageNumber,
          pdfTotalPages: response.material.pdfTotalPages || currentMaterial.pdfTotalPages
        };

        // 先更新材料列表
        actions.updateMaterial(currentMaterial.id, updatedMaterial);

        // 等待一小会儿，确保状态已更新
        await new Promise(resolve => setTimeout(resolve, 100));

        // 然后重新设置当前材料，触发重新挂载
        actions.setCurrentMaterial(updatedMaterial);

        actions.showNotification(t('rotateComplete'), response.message || t('imageRotated90'), 'success');
      } else {
        throw new Error(response.error || '旋转失败');
      }
    } catch (error) {
      console.error('旋转失败:', error);
      actions.showNotification('旋转失败', error.message || '旋转图片时出现错误', 'error');
    }
  }, [currentMaterial, actions, t]);

  // 手动开始翻译（针对已上传但未翻译的材料）
  const handleStartTranslation = useCallback(async () => {
    if (!currentMaterial || !currentMaterial.clientId) return;

    // 显示实体识别模式选择对话框
    setShowEntityModal(true);
  }, [currentMaterial]);

  // 处理实体识别模式选择
  const handleEntityModeConfirm = useCallback(async (mode) => {
    if (!currentMaterial) return;

    setShowEntityModal(false);

    try {
      const { materialAPI } = await import('../../services/api');

      // 检查是否是PDF - 如果是，获取所有页面的IDs
      const isPDF = pdfPages.length > 0;
      const materialIds = isPDF ? pdfPages.map(p => p.id) : [currentMaterial.id];
      const pageCount = materialIds.length;

      // 重置PDF Session实体识别相关的ref（如果是重新翻译）
      if (isPDF && currentMaterial.pdfSessionId) {
        const sessionId = currentMaterial.pdfSessionId;
        pdfSessionEntityTriggeredRef.current[sessionId] = false;
        pdfSessionEntityModalShownRef.current[sessionId] = false;
        console.log(`🔄 [PDF Session ${sessionId}] 重置实体识别ref，准备新的翻译流程`);
      }

      if (mode === 'disabled') {
        // 路径A: 不启用实体识别，直接进行OCR翻译
        // 为所有页面禁用实体识别
        if (isPDF) {
          await Promise.all(materialIds.map(id =>
            materialAPI.enableEntityRecognition(id, false)
          ));
        } else {
          await materialAPI.enableEntityRecognition(currentMaterial.id, false);
        }

        actions.showNotification('开始翻译', '正在启动翻译任务...', 'info');
        // 翻译所有页面
        await materialAPI.startTranslation(currentMaterial.clientId, materialIds);

        actions.showNotification(
          '翻译已启动',
          isPDF
            ? `正在翻译PDF的${pageCount}页，请稍候...`
            : '正在翻译图片，请稍候...',
          'success'
        );
      } else if (mode === 'deep') {
        // 路径B: 深度模式 - 全自动流程
        // 为所有页面启用实体识别（深度模式）
        if (isPDF) {
          await Promise.all(materialIds.map(id =>
            materialAPI.enableEntityRecognition(id, true, 'deep')
          ));
        } else {
          await materialAPI.enableEntityRecognition(currentMaterial.id, true, 'deep');
        }

        // 启动OCR翻译（所有页面）
        actions.showNotification('开始翻译', '正在启动翻译任务...', 'info');
        await materialAPI.startTranslation(currentMaterial.clientId, materialIds);

        // 显示等待提示
        actions.showNotification(
          '深度识别启动',
          isPDF
            ? `正在翻译PDF的${pageCount}页，翻译完成后将自动进行深度实体识别...`
            : '翻译完成后将自动进行深度实体识别（预计30-120秒），请稍候...',
          'info'
        );

        // WebSocket会监听所有页面OCR完成状态，然后自动触发深度识别
      } else if (mode === 'standard') {
        // 路径C: 标准模式 - 快速识别 + 用户选择
        // 为所有页面启用实体识别（标准模式）
        if (isPDF) {
          await Promise.all(materialIds.map(id =>
            materialAPI.enableEntityRecognition(id, true, 'standard')
          ));
        } else {
          await materialAPI.enableEntityRecognition(currentMaterial.id, true, 'standard');
        }

        // 启动OCR翻译（所有页面）
        actions.showNotification('开始翻译', '正在启动翻译任务...', 'info');
        await materialAPI.startTranslation(currentMaterial.clientId, materialIds);

        actions.showNotification(
          '标准模式启动',
          isPDF
            ? `正在翻译PDF的${pageCount}页，翻译完成后将进行整体实体识别...`
            : '翻译完成后将进行快速实体识别，请稍候...',
          'info'
        );

        // 对于PDF：WebSocket会监听所有页面OCR完成状态，然后触发整个PDF Session的实体识别
        // 对于单页图片：WebSocket会监听OCR完成，然后触发该页的快速识别
        // 快速识别完成后会显示EntityResultModal让用户选择
      }
    } catch (error) {
      console.error('启动翻译失败:', error);
      actions.showNotification('启动失败', error.message || '无法启动翻译', 'error');
    }
  }, [currentMaterial, pdfPages, actions]);

  // 处理跳过实体识别
  const handleEntitySkip = useCallback(async () => {
    if (!currentMaterial) return;

    const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

    try {
      const { materialAPI } = await import('../../services/api');

      // 清空实体结果，隐藏Modal
      setEntityResults([]);

      if (isPDF) {
        // ===== PDF Session: 禁用所有页面的实体识别 =====
        const sessionId = currentMaterial.pdfSessionId;
        console.log(`⏭️ [PDF Session ${sessionId}] 跳过实体识别，禁用所有${pdfPages.length}个页面的实体识别`);

        // 为所有页面禁用实体识别
        await Promise.all(pdfPages.map(page =>
          materialAPI.enableEntityRecognition(page.id, false)
        ));

        actions.showNotification(
          '跳过实体识别',
          `PDF的${pdfPages.length}页将直接进行LLM翻译`,
          'info'
        );
      } else {
        // ===== 单页图片: 禁用当前页面的实体识别 =====
        await materialAPI.enableEntityRecognition(currentMaterial.id, false);
        actions.showNotification('跳过实体识别', '将直接进行LLM翻译', 'info');
      }
    } catch (error) {
      console.error('跳过实体识别失败:', error);
      actions.showNotification('操作失败', error.message || '无法跳过实体识别', 'error');
    }
  }, [currentMaterial, pdfPages, actions]);

  // 处理确认实体
  const handleConfirmEntities = useCallback(async (entities) => {
    if (!currentMaterial) return;

    const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

    try {
      const { materialAPI } = await import('../../services/api');

      // 清空实体结果，隐藏Modal
      setEntityResults([]);

      // 构建翻译指导格式（按LLM服务期待的格式）
      const translationGuidance = {
        organizations: [],
        persons: [],
        locations: [],
        terms: []
      };

      entities.forEach(entity => {
        const chineseName = entity.chinese_name || entity.entity;
        const englishName = entity.english_name;
        if (chineseName && englishName) {
          // 格式：中文名 -> 英文名
          const guidanceItem = `${chineseName} -> ${englishName}`;

          // 根据实体类型分类（如果有的话），否则默认归类为 organizations
          const entityType = entity.type || 'ORGANIZATION';

          if (entityType === 'PERSON' || entityType === 'PER') {
            translationGuidance.persons.push(guidanceItem);
          } else if (entityType === 'LOCATION' || entityType === 'LOC' || entityType === 'GPE') {
            translationGuidance.locations.push(guidanceItem);
          } else if (entityType === 'ORGANIZATION' || entityType === 'ORG') {
            translationGuidance.organizations.push(guidanceItem);
          } else {
            // 其他类型归类为术语
            translationGuidance.terms.push(guidanceItem);
          }
        }
      });

      if (isPDF) {
        // ===== PDF Session: 确认整个PDF的实体 =====
        const sessionId = currentMaterial.pdfSessionId;
        console.log(`✅ [PDF Session ${sessionId}] 确认实体，整个PDF的${pdfPages.length}页将使用统一的实体翻译指导`);

        // 立即更新所有页面的本地状态，防止 Modal 重复弹出
        pdfPages.forEach(page => {
          actions.updateMaterial(page.id, {
            entity_recognition_confirmed: true,
            processing_step: 'entity_confirmed'
          });
        });

        // 确认整个PDF Session的实体
        await materialAPI.pdfSessionConfirmEntities(sessionId, entities, translationGuidance);

        actions.showNotification(
          '实体确认成功',
          `已确认PDF的${pdfPages.length}页实体翻译，LLM翻译将自动开始`,
          'success'
        );
      } else {
        // ===== 单页图片: 确认当前页面的实体 =====
        // 立即更新本地状态，防止 Modal 重复弹出
        actions.updateMaterial(currentMaterial.id, {
          entity_recognition_confirmed: true,
          processing_step: 'entity_confirmed'
        });

        // 确认实体
        await materialAPI.confirmEntities(currentMaterial.id, entities, translationGuidance);

        actions.showNotification(
          '实体确认成功',
          '已确认实体翻译，LLM翻译将自动开始',
          'success'
        );
      }
    } catch (error) {
      console.error('确认实体失败:', error);
      actions.showNotification('确认失败', error.message || '无法确认实体', 'error');
    }
  }, [currentMaterial, pdfPages, actions]);

  // 处理AI优化（深度查询）- 接收实体列表参数
  const handleAIOptimize = useCallback(async (entities) => {
    if (!currentMaterial || !entities || entities.length === 0) return;

    const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

    try {
      setEntityModalLoading(true);
      const { materialAPI } = await import('../../services/api');

      if (isPDF) {
        // ===== PDF Session: 整体深度识别 =====
        const sessionId = currentMaterial.pdfSessionId;
        console.log(`🤖 [PDF Session ${sessionId}] 开始AI优化，对整个PDF的实体进行深度识别`);

        actions.showNotification(
          'AI优化中',
          `正在为PDF的${pdfPages.length}页进行深度实体识别，这可能需要1-2分钟...`,
          'info'
        );

        // 调用PDF Session深度识别API
        const response = await materialAPI.pdfSessionEntityRecognitionDeep(sessionId, entities);

        if (response.success && response.result && response.result.entities) {
          // 更新实体结果为AI优化后的结果
          setEntityResults(response.result.entities);

          actions.showNotification(
            'AI优化完成',
            `已为 ${response.result.entities.length} 个实体查找官方英文名称`,
            'success'
          );
        }
      } else {
        // ===== 单页图片: 深度识别当前页面 =====
        actions.showNotification(
          'AI优化中',
          '正在进行深度实体识别，这可能需要1-2分钟...',
          'info'
        );

        // 提取实体中文名称列表
        const entityNames = entities.map(e => e.chinese_name || e.entity);

        // 调用深度识别API（传入实体列表）
        const response = await materialAPI.entityRecognitionDeep(currentMaterial.id, entityNames);

        if (response.success && response.result && response.result.entities) {
          // 更新实体结果为AI优化后的结果
          setEntityResults(response.result.entities);

          actions.showNotification(
            'AI优化完成',
            `已为 ${response.result.entities.length} 个实体查找官方英文名称`,
            'success'
          );
        }
      }
    } catch (error) {
      console.error('AI优化失败:', error);
      actions.showNotification('AI优化失败', error.message || '无法完成深度识别', 'error');
    } finally {
      setEntityModalLoading(false);
    }
  }, [currentMaterial, pdfPages, actions]);

  // 当material.id改变时，重置状态（切换材料时）
  React.useEffect(() => {
    // 只有真正切换材料时才重置，不是确认状态改变
    if (previousMaterialId.current !== currentMaterial?.id) {
      console.log('切换材料，重置状态');
      setLlmRegions([]);
      setLlmLoading(false);
      setEditedImageData(null);
      setEditedImageBlob(null);
      setSavedEditedImage(null);
      previousMaterialId.current = currentMaterial?.id;
    }
  }, [currentMaterial?.id]);

  // ✅ 重构：只检查是否有已保存的regions，不再加载编辑后的图片
  React.useEffect(() => {
    if (currentMaterial?.hasEditedVersion && currentMaterial?.editedRegions) {
      // 恢复已保存的regions
      setSavedRegions(currentMaterial.editedRegions);
    } else {
      // 清空saved regions
      setSavedRegions([]);
    }
  }, [currentMaterial?.hasEditedVersion, currentMaterial?.editedRegions, currentMaterial?.id]);

  // 监听material的processing_step变化，处理实体识别流程
  React.useEffect(() => {
    if (!currentMaterial) return;

    // 🔍 调试：打印材料的完整状态
    console.log('🔍 材料状态诊断:', {
      id: currentMaterial.id,
      status: currentMaterial.status,
      processingStep: currentMaterial.processingStep,
      entityRecognitionEnabled: currentMaterial.entityRecognitionEnabled,
      entityRecognitionMode: currentMaterial.entityRecognitionMode,
      entityRecognitionTriggered: currentMaterial.entityRecognitionTriggered,
      translationTextInfo: currentMaterial.translationTextInfo ? '存在' : '不存在',
      processingProgress: currentMaterial.processingProgress
    });

    const step = currentMaterial.processingStep;

    // OCR翻译完成，检查是否需要进行实体识别
    if (step === 'translated' && currentMaterial.entityRecognitionEnabled) {
      const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

      if (isPDF) {
        // ===== PDF Session 整体实体识别逻辑 =====
        const sessionId = currentMaterial.pdfSessionId;

        // 检查该PDF Session是否已经触发过实体识别（避免重复）
        if (pdfSessionEntityTriggeredRef.current[sessionId]) {
          console.log(`⏭️ [PDF Session ${sessionId}] 已触发过实体识别，跳过`);
          return;
        }

        // 检查所有页面是否都完成了OCR翻译
        const allPagesTranslated = pdfPages.every(page => {
          const latestPage = state.materials.find(m => m.id === page.id);
          return latestPage && latestPage.processingStep === 'translated';
        });

        if (!allPagesTranslated) {
          const translatedCount = pdfPages.filter(page => {
            const latestPage = state.materials.find(m => m.id === page.id);
            return latestPage && latestPage.processingStep === 'translated';
          }).length;
          console.log(`⏳ [PDF Session ${sessionId}] 等待所有页面完成OCR翻译... (${translatedCount}/${pdfPages.length})`);
          return;
        }

        // 所有页面都已翻译，触发整体实体识别
        console.log(`✅ [PDF Session ${sessionId}] 所有${pdfPages.length}个页面已完成OCR，触发整体实体识别`);
        pdfSessionEntityTriggeredRef.current[sessionId] = true;

        // 根据模式触发不同的实体识别
        if (currentMaterial.entityRecognitionMode === 'deep') {
          triggerPdfSessionDeepEntityRecognition(sessionId);
        } else if (currentMaterial.entityRecognitionMode === 'standard') {
          triggerPdfSessionFastEntityRecognition(sessionId);
        }
      } else {
        // ===== 单页图片实体识别逻辑 =====
        // 检查是否已经触发过实体识别（避免重复）
        if (currentMaterial.entityRecognitionTriggered) {
          return;
        }

        // 标记为已触发（前端状态，防止重复）
        const entityTriggeredKey = `entity_triggered_${currentMaterial.id}`;
        if (sessionStorage.getItem(entityTriggeredKey)) {
          return;
        }
        sessionStorage.setItem(entityTriggeredKey, 'true');

        // 根据模式触发不同的实体识别
        if (currentMaterial.entityRecognitionMode === 'deep') {
          triggerDeepEntityRecognition();
        } else if (currentMaterial.entityRecognitionMode === 'standard') {
          triggerFastEntityRecognition();
        }
      }
    }
    // 禁用实体识别时，OCR完成后自动触发LLM翻译
    else if (step === 'translated' && !currentMaterial.entityRecognitionEnabled && currentMaterial.translationTextInfo) {
      console.log('🔍 检查LLM触发条件:', {
        已触发: llmTriggeredRef.current[currentMaterial.id],
        已有结果: !!currentMaterial.llmTranslationResult,
        有翻译数据: !!currentMaterial.translationTextInfo,
        baiduRegions长度: baiduRegions?.length || 0
      });

      // 检查是否已触发过LLM翻译（避免重复）
      if (llmTriggeredRef.current[currentMaterial.id]) {
        console.log('⏭️ 已触发过LLM，跳过');
        return;
      }

      // 检查是否已有LLM翻译结果
      if (currentMaterial.llmTranslationResult) {
        console.log('⏭️ 已有LLM结果，跳过');
        return;
      }

      // 必须等待baiduRegions准备好
      if (!baiduRegions || baiduRegions.length === 0) {
        console.log('⏭️ baiduRegions未就绪，等待下次触发');
        return;
      }

      // 标记为已触发
      llmTriggeredRef.current[currentMaterial.id] = true;

      console.log('🚀 实体识别已禁用，自动触发LLM翻译，regions数量:', baiduRegions.length);

      // 触发LLM翻译
      handleLLMTranslate(baiduRegions);
    }

    // 快速实体识别完成，显示结果让用户选择
    // 只有在 entity_pending_confirm 状态且还没确认过时才显示
    if (step === 'entity_pending_confirm' && currentMaterial.entityRecognitionResult && !currentMaterial.entity_recognition_confirmed) {
      const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

      if (isPDF) {
        // ===== PDF Session: 整个PDF只显示一次Modal =====
        const sessionId = currentMaterial.pdfSessionId;

        // 检查该PDF Session的Modal是否已经显示过
        if (pdfSessionEntityModalShownRef.current[sessionId]) {
          console.log(`⏭️ [PDF Session ${sessionId}] Modal已显示过，跳过`);
          return;
        }

        // 标记为已显示
        pdfSessionEntityModalShownRef.current[sessionId] = true;
        console.log(`📋 [PDF Session ${sessionId}] 显示实体识别结果Modal（整个PDF统一编辑）`);

        try {
          const result = typeof currentMaterial.entityRecognitionResult === 'string'
            ? JSON.parse(currentMaterial.entityRecognitionResult)
            : currentMaterial.entityRecognitionResult;

          if (result.entities && result.entities.length > 0) {
            setEntityResults(result.entities);
          }
        } catch (e) {
          console.error('解析实体识别结果失败:', e);
        }
      } else {
        // ===== 单页图片: 正常显示Modal =====
        try {
          const result = typeof currentMaterial.entityRecognitionResult === 'string'
            ? JSON.parse(currentMaterial.entityRecognitionResult)
            : currentMaterial.entityRecognitionResult;

          if (result.entities && result.entities.length > 0) {
            setEntityResults(result.entities);
          }
        } catch (e) {
          console.error('解析实体识别结果失败:', e);
        }
      }
    }

    // 如果已经确认或状态已经变化，清空实体结果
    if (step !== 'entity_pending_confirm' || currentMaterial.entity_recognition_confirmed) {
      if (entityResults.length > 0) {
        setEntityResults([]);
      }
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMaterial?.id, currentMaterial?.processingStep, currentMaterial?.entityRecognitionEnabled, currentMaterial?.entityRecognitionMode, currentMaterial?.llmTranslationResult, currentMaterial?.entity_recognition_confirmed, currentMaterial?.entityRecognitionResult, baiduRegions, pdfPages, state.materials]);

  // 触发深度实体识别
  const triggerDeepEntityRecognition = React.useCallback(async () => {
    if (!currentMaterial) return;

    try {
      const { materialAPI } = await import('../../services/api');
      await materialAPI.entityRecognitionDeep(currentMaterial.id);
      console.log('✓ 深度实体识别已启动');
    } catch (error) {
      console.error('深度实体识别启动失败:', error);
      actions.showNotification('实体识别失败', error.message || '无法启动深度识别', 'error');
    }
  }, [currentMaterial, actions]);

  // 触发快速实体识别
  const triggerFastEntityRecognition = React.useCallback(async () => {
    if (!currentMaterial) return;

    try {
      const { materialAPI } = await import('../../services/api');
      const response = await materialAPI.entityRecognitionFast(currentMaterial.id);

      if (response.success && response.result.entities) {
        console.log('✓ 快速实体识别完成，识别到', response.result.entities.length, '个实体');
        // 结果会通过WebSocket更新到material.entityRecognitionResult
        // 然后上面的useEffect会捕获并显示对话框
      }
    } catch (error) {
      console.error('快速实体识别失败:', error);
      actions.showNotification('实体识别失败', error.message || '无法启动快速识别', 'error');
    }
  }, [currentMaterial, actions]);

  // 触发PDF Session整体快速实体识别
  const triggerPdfSessionFastEntityRecognition = React.useCallback(async (sessionId) => {
    if (!sessionId) return;

    try {
      const { materialAPI } = await import('../../services/api');
      console.log(`🔍 [PDF Session] 开始整体快速实体识别，Session ID: ${sessionId}`);
      const response = await materialAPI.pdfSessionEntityRecognitionFast(sessionId);

      if (response.success && response.result) {
        console.log(`✓ [PDF Session] 整体快速实体识别完成，共${response.total_pages}页，识别到 ${response.result.total_entities} 个实体`);
        // 结果会通过WebSocket更新到所有页面的material.entityRecognitionResult
        // 然后上面的useEffect会捕获并显示对话框
      }
    } catch (error) {
      console.error('[PDF Session] 整体快速实体识别失败:', error);
      actions.showNotification('实体识别失败', error.message || '无法启动PDF整体识别', 'error');
    }
  }, [actions]);

  // 触发PDF Session整体深度实体识别
  const triggerPdfSessionDeepEntityRecognition = React.useCallback(async (sessionId) => {
    if (!sessionId) return;

    try {
      const { materialAPI } = await import('../../services/api');
      console.log(`🔍 [PDF Session] 开始整体深度实体识别，Session ID: ${sessionId}`);
      await materialAPI.pdfSessionEntityRecognitionDeep(sessionId, []);
      console.log('✓ [PDF Session] 整体深度实体识别已启动');
    } catch (error) {
      console.error('[PDF Session] 整体深度实体识别启动失败:', error);
      actions.showNotification('实体识别失败', error.message || '无法启动PDF深度识别', 'error');
    }
  }, [actions]);

  // 解析百度翻译结果
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!currentMaterial || !currentMaterial.translationTextInfo) {
      console.log('跳过：没有material或translationTextInfo');
      return;
    }

    const materialId = currentMaterial.id;
    console.log('=== 处理material ===', materialId);

    try {
      const textInfo = typeof currentMaterial.translationTextInfo === 'string'
        ? JSON.parse(currentMaterial.translationTextInfo)
        : currentMaterial.translationTextInfo;

      const regions = textInfo.regions || textInfo || [];
      console.log('解析后的regions数量:', regions.length);
      setBaiduRegions(regions);

      // 如果有LLM结果，直接使用
      if (currentMaterial.llmTranslationResult) {
        console.log('✓ 检测到已有LLM结果，直接使用');
        const llmResult = typeof currentMaterial.llmTranslationResult === 'string'
          ? JSON.parse(currentMaterial.llmTranslationResult)
          : currentMaterial.llmTranslationResult;

        // 合并LLM翻译到regions
        const updatedRegions = regions.map(region => {
          const llmTrans = llmResult.find(t => t.id === region.id);
          return llmTrans ? { ...region, dst: llmTrans.translation } : region;
        });
        setLlmRegions(updatedRegions);
        llmTriggeredRef.current[materialId] = true; // 标记已处理
      }
      // 移除自动LLM触发逻辑 - 后端会在实体确认后自动触发LLM翻译
    } catch (e) {
      console.error('解析翻译数据失败:', e);
    }
  }, [currentMaterial?.id, currentMaterial?.translationTextInfo, currentMaterial?.processingProgress, currentMaterial?.entityRecognitionEnabled, currentMaterial?.entityRecognitionConfirmed, pdfSessionProgress?.progress]);

  // 当PDF所有页面翻译完成时，自动为所有页面触发LLM（仅限禁用实体识别时）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    // 只有当是PDF多页 && 整体进度达到66% && 所有页面翻译完成时才执行
    if (!currentMaterial?.pdfSessionId || !pdfSessionProgress || pdfSessionProgress.progress < 66) {
      return;
    }

    if (!pdfSessionProgress.allTranslated) {
      return; // 还有页面未翻译完成
    }

    // ⭐ 如果启用了实体识别，不要自动触发LLM（应该等待用户确认实体后，由后端自动触发）
    if (currentMaterial.entityRecognitionEnabled) {
      console.log('⏭️ PDF实体识别已启用，跳过自动LLM触发（等待用户确认实体）');
      return;
    }

    console.log('🚀 PDF所有页面翻译完成，检查是否需要为其他页面触发LLM（实体识别已禁用）');

    // 遍历所有PDF页面，为未触发LLM的页面触发
    pdfPages.forEach(async (pageRef) => {
      // 🔧 修复：从最新的materials state中获取页面的实时状态
      const latestPage = state.materials.find(m => m.id === pageRef.id);
      if (!latestPage) {
        console.log(`⊘ 页面 ${pageRef.pdfPageNumber} 未找到最新状态，跳过`);
        return;
      }

      // 跳过已经触发过LLM的页面
      if (llmTriggeredRef.current[latestPage.id]) {
        console.log(`⊘ 页面 ${latestPage.pdfPageNumber} 已触发过LLM，跳过`);
        return;
      }

      // 跳过没有翻译结果的页面
      if (!latestPage.translationTextInfo) {
        console.log(`⊘ 页面 ${latestPage.pdfPageNumber} 没有翻译结果，跳过`);
        return;
      }

      // 如果已经有LLM结果，也跳过
      if (latestPage.llmTranslationResult) {
        console.log(`⊘ 页面 ${latestPage.pdfPageNumber} 已有LLM结果，跳过`);
        llmTriggeredRef.current[latestPage.id] = true;
        return;
      }

      // 🔧 修复：如果页面正在进行实体识别流程，跳过自动触发LLM
      if (latestPage.processingStep === 'entity_recognizing' ||
          latestPage.processingStep === 'entity_pending_confirm') {
        console.log(`⊘ 页面 ${latestPage.pdfPageNumber} 正在进行实体识别流程（${latestPage.processingStep}），跳过自动LLM触发`);
        return;
      }

      // 为这个页面触发LLM
      try {
        llmTriggeredRef.current[latestPage.id] = true; // 立即标记，防止重复

        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/api/materials/${latestPage.id}/llm-translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();

          // 更新materials列表中的这个页面
          actions.updateMaterial(latestPage.id, {
            llmTranslationResult: data.llm_translations,
            processingProgress: 100 // LLM完成后设置为100%
          });
        } else {
          console.error(`✗ 页面 ${latestPage.pdfPageNumber} LLM翻译失败:`, await response.text());
        }
      } catch (error) {
        console.error(`✗ 页面 ${latestPage.pdfPageNumber} LLM翻译出错:`, error);
      }
    });
  }, [pdfSessionProgress?.allTranslated, pdfSessionProgress?.progress, pdfPages, state.materials]);

  // LLM翻译（完全按照Reference的方式）
  const handleLLMTranslate = async (regions) => {
    setLlmLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/materials/${currentMaterial.id}/llm-translate`, {
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
        actions.showNotification(t('aiOptimizationComplete'), t('aiOptimizationSuccessCount', { count: updatedRegions.length }), 'success');
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

  // ✅ 重构：获取图片URL - 始终从原图加载
  const getImageUrl = () => {
    if (!currentMaterial) return null;

    // ✅ 重构：始终使用原始图片作为底图，配合保存的regions重建
    if (currentMaterial.filePath) {
      // 使用 rotationCount 作为缓存键，只在旋转时刷新
      const cacheKey = currentMaterial.rotationCount || 0;
      const url = `${API_URL}/download/image/${currentMaterial.filePath}?v=${cacheKey}`;
      return url;
    }

    return null;
  };
  // ========== ComparisonView的hooks和handlers结束 ==========

  // ✅ WebSocket 已接管所有状态更新，移除轮询逻辑

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
      actions.showNotification(t('refreshSuccess'), t('materialStatusUpdated'), 'success');
    } catch (error) {
      console.error('刷新材料状态失败:', error);
      actions.showNotification(t('refreshFailed'), t('cannotGetLatestStatus'), 'error');
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
        ? t('materialConfirmedComplete', { name: currentMaterial.name })
        : t('materialUnconfirmed', { name: currentMaterial.name });

      console.log('准备显示通知...');
      actions.showNotification(
        newConfirmedState ? t('confirmSuccess') : t('unconfirmSuccess'),
        message,
        'success'
      );
      console.log('通知显示完成');

    } catch (error) {
      console.error('确认/取消确认失败:', error);
      const errorMessage = error.response?.data?.error || error.message || t('operationError');
      actions.showNotification(t('error'), errorMessage, 'error');
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
          <h3 className={styles.title}>{t('translationPreview')}</h3>
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
            <h4>{t('selectMaterialToViewTranslation')}</h4>
            <p>{t('selectMaterialFromList')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewSection}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t('translationPreview')}</h3>
        <div className={styles.actions}>
          {/* 组1: 视图控制 */}
          <button
            className={`${styles.actionBtn} ${styles.btnRefresh}`}
            onClick={handleRefresh}
            disabled={isRefreshing}
            title={t('refreshTranslationResult')}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={isRefreshing ? styles.rotating : ''}
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 12c0-4.75 3.25-9 9.25-9C17.5 3 22 7.5 22 12M12 22c4.75 0 9.25-4.5 9.25-9.25"/>
            </svg>
            {t('refresh')}
          </button>

          {/* 组2: PDF页面导航 (仅PDF时显示) */}
          {pdfPages.length > 0 && (
            <div className={`${styles.buttonGroup} ${styles.pdfNavGroup}`}>
              <div className={styles.pdfNavigation}>
                <button
                  className={styles.pdfNavBtn}
                  onClick={() => handlePageChange(currentPageIndex - 1)}
                  disabled={currentPageIndex === 0}
                  title="上一页"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                </button>
                <span className={styles.pdfPageInfo}>
                  {t('currentPage', { current: currentPageIndex + 1, total: pdfPages.length })}
                </span>
                <button
                  className={styles.pdfNavBtn}
                  onClick={() => handlePageChange(currentPageIndex + 1)}
                  disabled={currentPageIndex === pdfPages.length - 1}
                  title={t('nextPage')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
                <div className={styles.groupDivider}></div>
                <select
                  className={styles.pdfPageSelect}
                  value={currentPageIndex}
                  onChange={(e) => handlePageChange(parseInt(e.target.value))}
                  title={t('selectPage')}
                >
                  {pdfPages.map((_, index) => (
                    <option key={index} value={index}>
                      {t('pageSelector', { page: index + 1 })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 组3: 编辑操作 */}
          <div className={`${styles.buttonGroup} ${styles.editActionsGroup}`}>
            {/* 旋转按钮 */}
            <button
              className={styles.rotateButton}
              onClick={handleRotateImage}
              title={t('rotate')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 12c0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10"/>
              </svg>
              {t('rotate')}
            </button>

            {/* 开始翻译/重新翻译按钮 */}
            {currentMaterial.status === '已上传' && !currentMaterial.translationTextInfo ? (
              <button
                className={styles.startTranslationBtn}
                onClick={handleStartTranslation}
                title={t('startTranslation')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                {t('startTranslation')}{pdfPages.length > 0 ? ` (${pdfPages.length})` : ''}
              </button>
            ) : currentMaterial.translationTextInfo && (
              <button
                className={styles.retranslateButton}
                onClick={handleRetranslateCurrentImage}
                title={t('retranslateCurrentImage')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 12c0-4.75 3.25-9 9.25-9C17.5 3 22 7.5 22 12M12 22c4.75 0 9.25-4.5 9.25-9.25"/>
                </svg>
                {t('retranslate')}
              </button>
            )}

            <div className={styles.groupDivider}></div>

            {/* 保存修改按钮 */}
            <button
              className={styles.saveEditButton}
              onClick={async () => {
              // ✅ 重构：保存regions数据 + 生成最终图片
              if (window.currentFabricEditor && window.currentFabricEditor.getCurrentRegions) {
                try {
                  actions.showNotification(t('saving'), t('savingEdits'), 'info');

                  // 获取当前的regions数据
                  const currentRegions = window.currentFabricEditor.getCurrentRegions();

                  if (!currentRegions || currentRegions.length === 0) {
                    throw new Error(t('noEditContent'));
                  }

                  const { materialAPI } = await import('../../services/api');

                  // 1. 保存regions数据到后端
                  const response = await materialAPI.saveRegions(currentMaterial.id, currentRegions);

                  if (!response.success) {
                    throw new Error(response.error || t('saveFailed'));
                  }

                  // 2. 生成并上传最终图片
                  if (window.currentFabricEditor.generateFinalImage) {
                    try {
                      const finalImage = await window.currentFabricEditor.generateFinalImage();
                      if (finalImage && finalImage.blob) {
                        await materialAPI.saveFinalImage(currentMaterial.id, finalImage.blob);
                        console.log('✓ 最终图片已生成并上传');
                      }
                    } catch (imageError) {
                      console.warn('生成最终图片失败:', imageError);
                      // 不阻止保存流程
                    }
                  }

                  // 更新材料数据
                  actions.updateMaterial(currentMaterial.id, {
                    editedRegions: currentRegions,
                    hasEditedVersion: true
                  });

                  actions.showNotification(t('saveSuccess'), t('savingEdits'), 'success');
                } catch (error) {
                  console.error('保存编辑失败:', error);
                  actions.showNotification(t('saveFailed'), error.message || t('saveFailed'), 'error');
                }
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            {t('saveEdits')}
          </button>
          </div>

          {/* 组4: 状态控制 */}
          <button
            className={`${styles.actionBtn} ${currentMaterial.confirmed ? styles.btnUnconfirm : styles.btnConfirm}`}
            onClick={handleConfirm}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {currentMaterial.confirmed ? (
                <path d="M18 6L6 18M6 6l12 12"/>
              ) : (
                <polyline points="20 6 9 17 4 12"/>
              )}
            </svg>
            {currentMaterial.confirmed ? t('unconfirm') : t('confirm')}
          </button>
        </div>
      </div>
      
      <div className={styles.content}>
        {(currentMaterial.type === 'image' || currentMaterial.type === 'pdf') ? (
          <div className={styles.llmImageTranslationView}>
            {/* 只要有图片就显示编辑器 - Reference App.jsx 第355行完整复刻 */}
            {getImageUrl() && (
              <div className={styles.llmEditorSection}>
                {/* header已移到PreviewSection，直接渲染编辑器内容 */}
                <div className={styles.llmEditorContent}>
                  {/* 实体识别结果 Modal - 局部定位，仅覆盖预览区域 */}
                  <EntityResultModal
                    isOpen={currentMaterial.processingStep === 'entity_pending_confirm' && entityResults.length > 0}
                    entities={entityResults}
                    onClose={() => {}} // 不允许直接关闭，必须选择操作
                    onConfirm={handleConfirmEntities}
                    onAIOptimize={handleAIOptimize}
                    onSkip={handleEntitySkip}
                    loading={entityModalLoading}
                  />
                  {/* 显示翻译进行中状态 - 包括所有阶段：拆分、上传、百度翻译、AI优化 */}
                  {/* 只有在真正翻译进行中时才显示加载界面 */}
                  {/* 排除实体识别相关状态：entity_recognizing, entity_pending_confirm, entity_confirmed */}
                  {(() => {
                    // 修复：只在真正处理中才显示加载界面
                    const baseCondition = llmLoading ||
                      currentMaterial.status === '处理中' ||
                      currentMaterial.status === '拆分中' ||
                      currentMaterial.processingStep === 'splitting' ||
                      currentMaterial.processingStep === 'translating' ||
                      (currentMaterial.processingStep === 'translated' && !currentMaterial.translationTextInfo) ||
                      (currentMaterial.processingStep === 'uploaded' && currentMaterial.status === '处理中');  // ← 修复：只在处理中才显示
                    const excludeEntitySteps = !['entity_recognizing', 'entity_pending_confirm', 'entity_confirmed'].includes(currentMaterial.processingStep);
                    const shouldShowLoading = baseCondition && excludeEntitySteps;

                    return shouldShowLoading;
                  })() ? (
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
                          {(currentMaterial.status === '拆分中' || currentMaterial.processingStep === 'splitting') && t('splittingPdfPages')}
                          {currentMaterial.processingStep === 'uploaded' && t('preparingTranslation')}
                          {(currentMaterial.processingStep === 'translating' || (pdfSessionProgress && pdfSessionProgress.someTranslating)) && t('statusTranslatingProgress')}
                          {llmLoading && t('aiOptimizing')}
                          {!currentMaterial.processingStep && !llmLoading && !currentMaterial.status === '拆分中' && t('statusProcessing')}
                        </h3>
                        <div className={styles.processingSteps}>
                          <div className={`${styles.processingStep} ${(pdfSessionProgress ? pdfSessionProgress.progress >= 33 : currentMaterial.processingProgress >= 33) ? styles.active : ''}`}>
                            <div className={styles.stepIcon}>
                              {(pdfSessionProgress ? pdfSessionProgress.progress >= 33 : currentMaterial.processingProgress >= 33) ? '✓' : '1'}
                            </div>
                            <span>{t('uploadComplete')}</span>
                          </div>
                          <div className={styles.stepLine}></div>
                          <div className={`${styles.processingStep} ${(pdfSessionProgress ? pdfSessionProgress.progress >= 66 : currentMaterial.processingProgress >= 66) ? styles.active : (currentMaterial.processingStep === 'translating' || (pdfSessionProgress && pdfSessionProgress.someTranslating)) ? styles.current : ''}`}>
                            <div className={styles.stepIcon}>
                              {(pdfSessionProgress ? pdfSessionProgress.progress >= 66 : currentMaterial.processingProgress >= 66) ? '✓' : '2'}
                            </div>
                            <span>{t('machineTranslation')}</span>
                          </div>
                          <div className={styles.stepLine}></div>
                          <div className={`${styles.processingStep} ${(pdfSessionProgress ? pdfSessionProgress.progress === 100 : currentMaterial.processingProgress === 100) ? styles.active : llmLoading ? styles.current : ''}`}>
                            <div className={styles.stepIcon}>
                              {(pdfSessionProgress ? pdfSessionProgress.progress === 100 : currentMaterial.processingProgress === 100) ? '✓' : '3'}
                            </div>
                            <span>{t('aiOptimization')}</span>
                          </div>
                        </div>
                        <div className={styles.progressBarWrapper}>
                          <div className={styles.progressBar}>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${pdfSessionProgress ? pdfSessionProgress.progress : (llmLoading && currentMaterial.processingProgress < 66 ? 66 : (currentMaterial.processingProgress || 0))}%` }}
                            ></div>
                          </div>
                          <span className={styles.progressText}>{pdfSessionProgress ? pdfSessionProgress.progress : (llmLoading && currentMaterial.processingProgress < 66 ? 66 : (currentMaterial.processingProgress || 0))}%</span>
                        </div>
                        <p className={styles.processingTip}>{t('pleaseWait')}</p>
                      </div>
                    </div>
                  ) : !currentMaterial.translationTextInfo ? (
                    /* ✅ 没有翻译结果时（包括status='已上传'），显示原图编辑器供用户预览和旋转 */
                    <FabricImageEditor
                      imageSrc={getImageUrl()}
                      regions={[]} // 空regions，只显示原图
                      editorKey={`empty-${currentMaterial.id}-${currentMaterial.rotationCount || 0}`}
                      exposeHandlers={true}
                      onExport={async (url, blob, currentRegions, includeText) => {
                        try {
                          // ✅ 重构：只保存regions数据
                          if (!currentRegions || currentRegions.length === 0) {
                            actions.showNotification('提示', '没有可保存的编辑内容', 'warning');
                            return;
                          }

                          const { materialAPI } = await import('../../services/api');
                          const response = await materialAPI.saveRegions(currentMaterial.id, currentRegions);

                          if (!response.success) {
                            throw new Error(response.error || '保存失败');
                          }

                          // 2. 生成并上传最终图片
                          if (window.currentFabricEditor && window.currentFabricEditor.generateFinalImage) {
                            try {
                              const finalImage = await window.currentFabricEditor.generateFinalImage();
                              if (finalImage && finalImage.blob) {
                                await materialAPI.saveFinalImage(currentMaterial.id, finalImage.blob);
                                console.log('✓ 导出回调1：最终图片已生成并上传');
                              }
                            } catch (imageError) {
                              console.warn('生成最终图片失败:', imageError);
                            }
                          }

                          // 更新材料数据
                          actions.updateMaterial(currentMaterial.id, {
                            editedRegions: currentRegions,
                            hasEditedVersion: true
                          });

                          actions.showNotification('保存成功', '编辑已保存，导出时将使用编辑后的版本', 'success');
                        } catch (error) {
                          console.error('保存编辑失败:', error);
                          actions.showNotification('保存失败', error.message || '无法保存编辑', 'error');
                        }
                      }}
                    />
                  ) : (
                    /* LLM翻译完成：显示可编辑的结果 */
                    <FabricImageEditor
                      imageSrc={getImageUrl()}
                      regions={savedRegions.length > 0 ? savedRegions : llmRegions} // 使用保存的regions或新的llmRegions
                      editorKey={`llm-${currentMaterial.id}-${currentMaterial.rotationCount || 0}`} // 添加旋转计数，确保旋转后重新初始化
                      exposeHandlers={true}
                      onExport={async (url, blob, currentRegions, includeText) => {
                        try {
                          // ✅ 重构：只保存regions数据
                          const regionsToSave = currentRegions || llmRegions;
                          if (!regionsToSave || regionsToSave.length === 0) {
                            actions.showNotification('提示', '没有可保存的编辑内容', 'warning');
                            return;
                          }

                          const { materialAPI } = await import('../../services/api');
                          const response = await materialAPI.saveRegions(currentMaterial.id, regionsToSave);

                          if (!response.success) {
                            throw new Error(response.error || '保存失败');
                          }

                          // 2. 生成并上传最终图片
                          if (window.currentFabricEditor && window.currentFabricEditor.generateFinalImage) {
                            try {
                              const finalImage = await window.currentFabricEditor.generateFinalImage();
                              if (finalImage && finalImage.blob) {
                                await materialAPI.saveFinalImage(currentMaterial.id, finalImage.blob);
                                console.log('✓ 导出回调2：最终图片已生成并上传');
                              }
                            } catch (imageError) {
                              console.warn('生成最终图片失败:', imageError);
                            }
                          }

                          // 更新材料数据
                          actions.updateMaterial(currentMaterial.id, {
                            editedRegions: regionsToSave,
                            hasEditedVersion: true
                          });

                          actions.showNotification('保存成功', '编辑已保存，导出时将使用编辑后的版本', 'success');
                        } catch (error) {
                          console.error('保存编辑失败:', error);
                          actions.showNotification('保存失败', error.message || '无法保存编辑', 'error');
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

            {/* 实体识别模式选择对话框 */}
            <EntityRecognitionModal
              isOpen={showEntityModal}
              onClose={() => setShowEntityModal(false)}
              onConfirm={handleEntityModeConfirm}
            />

          </div>
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

const SinglePreview = ({ material }) => {
  const { actions } = useApp();
  const { t } = useLanguage();
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
    previewUrl: material?.translatedImagePath ? `${API_URL}/preview/translated/${material.translatedImagePath}` : null
  });

  useEffect(() => {
    // 当翻译失败时，设置错误信息
    if (material && material.status === '翻译失败' && material.translationError) {
      setError(material.translationError);
    } else {
      setError(null);
    }
  }, [material]);

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
          <h4>{t('translationFailed')}</h4>
          <p className={styles.errorMessage}>{error}</p>
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
    const previewUrl = `${API_URL}/preview/translated/${encodedFilename}`;

    console.log('📄 PDF预览URL:', previewUrl);
    console.log('📄 完整材料信息:', material);

    return (
      <div className={styles.singlePreview}>
        <div className={styles.pdfPreviewContainer}>
          <iframe
            src={previewUrl}
            className={styles.pdfIframe}
            title="网页翻译预览"
            onError={(e) => console.error('❌ PDF iframe加载失败:', e)}
          />
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
          <h4>{t('waitingForTranslation')}</h4>
          <p className={styles.urlInfo}>{material.url}</p>
          <p className={styles.waitingText}>{t('waitingForTranslation')}...</p>
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
    return `${API_URL}/preview/poster/${encodedFileName}`;
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


