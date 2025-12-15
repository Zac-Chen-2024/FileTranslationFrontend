import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { materialAPI, atomicAPI } from '../../services/api';
import LaTeXEditModal from '../modals/LaTeXEditModal';
import LaTeXEditModalV2 from '../modals/LaTeXEditModalV2';
import FabricImageEditor from './FabricImageEditor';
import EntityRecognitionModal from './EntityRecognitionModal';
import EntityResultModal from './EntityResultModal';
import styles from './ClaudePreviewSection.module.css';

// API URL配置
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

const ClaudePreviewSection = () => {
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
  const [isRetranslateFlow, setIsRetranslateFlow] = React.useState(false);  // 标记是否为重新翻译流程

  // LLM Translation states
  const [llmRegions, setLlmRegions] = React.useState([]);
  const [llmLoading, setLlmLoading] = React.useState(false);
  const [baiduRegions, setBaiduRegions] = React.useState([]);

  // 🔧 材料切换时的加载状态 - 防止显示旧数据
  const [materialDataReady, setMaterialDataReady] = React.useState(false);
  const lastReadyMaterialIdRef = React.useRef(null);

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

  // 🔧 竞态条件修复：使用ref跟踪当前材料ID和请求取消
  const currentMaterialIdRef = React.useRef(null);
  const abortControllerRef = React.useRef(null);

  // 🔧 关键修复：使用 ref 跟踪 baiduRegions，避免在 useEffect 依赖中使用 state
  const baiduRegionsRef = React.useRef([]);
  // ✅ 使用 ref 跟踪原子化流程状态（同步更新，避免 useEffect 竞态条件）
  const atomicFlowInProgressRef = React.useRef(false);
  // ========== 状态提升结束 ==========

  // 监听currentMaterial变化，强制刷新预览
  // 注意：只在材料 ID 变化时强制刷新，避免状态更新导致多次刷新
  useEffect(() => {
    setForceRefresh(prev => prev + 1);
  }, [currentMaterial?.id]); // 只监听 ID，移除 status 和 translatedImagePath

  // 🔧 竞态条件修复：材料切换时取消之前的请求，清理状态，更新当前材料ID ref
  useEffect(() => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 🔧 关键修复：材料切换时先设为"未准备好"状态，显示加载中
    if (currentMaterial?.id !== lastReadyMaterialIdRef.current) {
      setMaterialDataReady(false);
    }

    // 🔧 清理上一个材料的状态，避免显示旧数据
    setBaiduRegions([]);
    setLlmRegions([]);
    setLlmLoading(false);
    setEntityResults([]);
    setEditedImageData(null);
    setEditedImageBlob(null);
    setSavedEditedImage(null);
    setSavedRegions([]);

    // 更新当前材料ID ref
    currentMaterialIdRef.current = currentMaterial?.id || null;

    // 创建新的AbortController供后续请求使用
    abortControllerRef.current = new AbortController();

    // 组件卸载或材料切换时取消请求
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [currentMaterial?.id]);

  // 🔧 关键修复：同步 baiduRegions 到 ref，用于在其他 useEffect 中访问最新值而不触发重新渲染
  React.useEffect(() => {
    baiduRegionsRef.current = baiduRegions;
  }, [baiduRegions]);

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

  // 重新翻译当前图片 - 显示模式选择对话框
  const handleRetranslateCurrentImage = useCallback(async () => {
    if (!currentMaterial) return;

    // 设置为重新翻译流程，然后显示模式选择对话框
    setIsRetranslateFlow(true);
    setShowEntityModal(true);
  }, [currentMaterial]);

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

    // 设置为首次翻译流程，显示模式选择对话框
    setIsRetranslateFlow(false);
    setShowEntityModal(true);
  }, [currentMaterial]);

  // 处理实体识别模式选择
  const handleEntityModeConfirm = useCallback(async (mode) => {
    if (!currentMaterial) return;

    const wasRetranslateFlow = isRetranslateFlow;
    setShowEntityModal(false);
    setIsRetranslateFlow(false);  // 重置标志

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

      // ======= 单页图片：使用原子化API =======
      if (!isPDF) {
        // 清除旧状态（如果是重新翻译）
        if (wasRetranslateFlow) {
          actions.setCurrentMaterial(null);
          await new Promise(resolve => requestAnimationFrame(resolve));
          setLlmRegions([]);
          setBaiduRegions([]);
          setSavedEditedImage(null);
          setSavedRegions([]);
          setEditedImageData(null);
          setEditedImageBlob(null);
          llmTriggeredRef.current[currentMaterial.id] = false;
        }

        // ✅ 标记原子化流程开始（使用ref同步更新，防止useEffect竞态条件）
        atomicFlowInProgressRef.current = true;

        // ✅ 设置加载状态：显示"翻译中..."
        actions.updateMaterial(currentMaterial.id, {
          processingStep: 'translating',
          status: '处理中'
        });
        actions.setCurrentMaterial({
          ...currentMaterial,
          processingStep: 'translating',
          status: '处理中'
        });

        // 步骤1: 使用原子API执行百度OCR
        actions.showNotification('开始翻译', '正在执行OCR翻译...', 'info');
        const baiduResult = await atomicAPI.translateBaidu(currentMaterial.id, {
          clearPreviousData: wasRetranslateFlow
        });

        if (!baiduResult.success) {
          throw new Error(baiduResult.error || 'OCR翻译失败');
        }

        // 更新材料状态
        // ✅ 关键修复：提前设置 entityRecognitionEnabled，防止 useEffect 误触发
        // 注：atomicFlowInProgressRef 已在前面设置为 true（使用 ref 同步更新）
        const updatedMaterial = {
          ...currentMaterial,
          translationTextInfo: baiduResult.translationTextInfo,
          processingStep: baiduResult.processingStep,
          status: '翻译完成',
          entityRecognitionEnabled: mode !== 'disabled',
          entityRecognitionMode: mode !== 'disabled' ? mode : null
        };
        actions.updateMaterial(currentMaterial.id, updatedMaterial);
        actions.setCurrentMaterial(updatedMaterial);

        if (mode === 'disabled') {
          // 快速模式：直接执行LLM优化
          // ✅ 设置加载状态：显示加载页面遮住内容
          setLlmLoading(true);

          try {
            const llmResult = await atomicAPI.llmOptimize(currentMaterial.id, {
              useEntityGuidance: false
            });

            if (llmResult.success) {
              actions.showNotification('翻译完成', llmResult.message || '翻译优化已完成', 'success');
              actions.updateMaterial(currentMaterial.id, {
                processingStep: llmResult.processingStep,
                llmTranslationResult: llmResult.llmTranslationResult
              });
            } else {
              throw new Error(llmResult.error || 'LLM翻译失败');
            }
          } catch (llmError) {
            console.error('LLM翻译失败:', llmError);
            actions.showNotification('LLM翻译失败', `${llmError.message}（可点击重试）`, 'error');
          } finally {
            setLlmLoading(false);  // ✅ 无论成功失败都清除加载状态
            atomicFlowInProgressRef.current = false;  // ✅ 清除原子流程标志
          }
        } else if (mode === 'preserve') {
          // 保留先前结果模式：使用已有的实体识别结果直接进行LLM翻译
          // ✅ 设置加载状态：显示加载页面遮住内容
          setLlmLoading(true);

          try {
            // 解析已有的实体识别结果
            let existingResult;
            if (currentMaterial.entityRecognitionResult) {
              existingResult = typeof currentMaterial.entityRecognitionResult === 'string'
                ? JSON.parse(currentMaterial.entityRecognitionResult)
                : currentMaterial.entityRecognitionResult;
            }

            const entities = existingResult?.entities || [];

            // 构建翻译指导格式
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
                const guidanceItem = `${chineseName} -> ${englishName}`;
                const entityType = entity.type || 'ORGANIZATION';

                if (entityType === 'PERSON' || entityType === 'PER') {
                  translationGuidance.persons.push(guidanceItem);
                } else if (entityType === 'LOCATION' || entityType === 'LOC' || entityType === 'GPE') {
                  translationGuidance.locations.push(guidanceItem);
                } else if (entityType === 'ORGANIZATION' || entityType === 'ORG') {
                  translationGuidance.organizations.push(guidanceItem);
                } else {
                  translationGuidance.terms.push(guidanceItem);
                }
              }
            });

            // 更新材料状态为已确认实体
            actions.updateMaterial(currentMaterial.id, {
              processingStep: 'entity_confirmed',
              entityRecognitionEnabled: true,
              entityRecognitionMode: 'preserve',
              entity_recognition_confirmed: true
            });

            // 执行LLM翻译优化
            const llmResult = await atomicAPI.llmOptimize(currentMaterial.id, {
              useEntityGuidance: entities.length > 0,
              translationGuidance: entities.length > 0 ? translationGuidance : null
            });

            if (llmResult.success) {
              actions.showNotification('翻译完成', llmResult.message || '翻译优化已完成', 'success');
              actions.updateMaterial(currentMaterial.id, {
                processingStep: llmResult.processingStep,
                llmTranslationResult: llmResult.llmTranslationResult
              });
            } else {
              throw new Error(llmResult.error || 'LLM翻译失败');
            }
          } catch (preserveError) {
            console.error('保留模式翻译失败:', preserveError);
            actions.showNotification('翻译失败', `${preserveError.message}（可点击重试）`, 'error');
          } finally {
            setLlmLoading(false);  // ✅ 无论成功失败都清除加载状态
            atomicFlowInProgressRef.current = false;  // ✅ 清除原子流程标志
          }
        } else if (mode === 'standard' || mode === 'deep') {
          // 标准/深度模式：执行实体识别
          // ✅ 设置加载状态：显示"实体识别中..."
          actions.updateMaterial(currentMaterial.id, {
            processingStep: 'entity_recognizing',
            status: '处理中'
          });
          actions.setCurrentMaterial({
            ...updatedMaterial,
            processingStep: 'entity_recognizing',
            status: '处理中'
          });

          actions.showNotification('OCR完成', `正在进行${mode === 'deep' ? '深度' : '快速'}实体识别...`, 'info');

          try {
            const entityResult = await atomicAPI.entityRecognize(currentMaterial.id, mode === 'deep' ? 'deep' : 'fast');

            if (entityResult.success) {
              const entities = entityResult.entities || entityResult.entityResult?.entities || [];

              // ✅ 修复：强制设置为 entity_pending_confirm，确保弹出确认对话框
              actions.updateMaterial(currentMaterial.id, {
                processingStep: 'entity_pending_confirm',
                entityRecognitionResult: JSON.stringify(entityResult.entityResult || { entities }),
                entityRecognitionEnabled: true,
                entityRecognitionMode: mode,
                entity_recognition_confirmed: false
              });

              // ✅ 实体识别完成，清除原子流程标志（接下来由用户确认流程接管）
              atomicFlowInProgressRef.current = false;

              // ✅ 修复：使用 setTimeout 确保在下一个事件循环中设置，避免被 useEffect 清除
              setTimeout(() => {
                setEntityResults(entities);
              }, 50);

              actions.showNotification(
                '实体识别完成',
                `识别到 ${entities.length} 个实体，请确认翻译`,
                'success'
              );
            } else {
              throw new Error(entityResult.error || '实体识别失败');
            }
          } catch (entityError) {
            console.error('实体识别失败:', entityError);
            actions.showNotification('实体识别失败', entityError.message, 'error');
            atomicFlowInProgressRef.current = false;  // ✅ 失败时也清除标志
          }
        }

        return;  // 单页图片处理完成，直接返回
      }

      // ======= PDF模式：使用原子化API并行处理 =======
      // ✅ 标记原子化流程开始
      atomicFlowInProgressRef.current = true;

      // 清除旧状态（如果是重新翻译）
      if (wasRetranslateFlow) {
        // 重置所有页面的LLM触发标记
        materialIds.forEach(id => {
          llmTriggeredRef.current[id] = false;
        });
      }

      // 设置所有页面为处理中状态
      await Promise.all(materialIds.map(id =>
        actions.updateMaterial(id, {
          processingStep: 'translating',
          status: '处理中',
          entityRecognitionEnabled: mode !== 'disabled',
          entityRecognitionMode: mode !== 'disabled' ? mode : null
        })
      ));

      try {
        // 步骤1: 并行执行所有页面的百度OCR翻译
        actions.showNotification('开始翻译', `正在翻译PDF的${pageCount}页...`, 'info');

        const baiduResults = await Promise.all(materialIds.map(materialId =>
          atomicAPI.translateBaidu(materialId, { clearPreviousData: wasRetranslateFlow })
        ));

        // 检查是否所有页面都成功
        const failedPages = baiduResults.filter(r => !r.success);
        if (failedPages.length > 0) {
          console.error(`${failedPages.length} 页OCR翻译失败`);
        }

        if (mode === 'disabled') {
          // 路径A: 不启用实体识别，直接进行LLM优化
          // ✅ 设置加载状态：显示加载页面遮住内容
          setLlmLoading(true);

          try {
            const llmResults = await Promise.all(materialIds.map(materialId =>
              atomicAPI.llmOptimize(materialId, { useEntityGuidance: false })
            ));

            const failedLlm = llmResults.filter(r => !r.success);
            if (failedLlm.length > 0) {
              console.error(`${failedLlm.length} 页LLM翻译失败`);
            }

            actions.showNotification(
              '翻译完成',
              `PDF ${pageCount}页翻译已完成`,
              'success'
            );
          } finally {
            setLlmLoading(false);
          }

          atomicFlowInProgressRef.current = false;

        } else if (mode === 'standard' || mode === 'deep') {
          // 路径B/C: 进行实体识别
          // 设置所有页面为实体识别中状态
          await Promise.all(materialIds.map(id =>
            actions.updateMaterial(id, {
              processingStep: 'entity_recognizing',
              status: '处理中'
            })
          ));

          actions.showNotification('OCR完成', `正在进行${mode === 'deep' ? '深度' : '快速'}实体识别...`, 'info');

          const entityResults = await Promise.all(materialIds.map(materialId =>
            atomicAPI.entityRecognize(materialId, mode === 'deep' ? 'deep' : 'fast')
          ));

          // 检查结果，收集所有实体
          const allEntities = [];
          entityResults.forEach((result, index) => {
            if (result.success) {
              const entities = result.entities || result.entityResult?.entities || [];
              allEntities.push(...entities);

              // 更新该页面的状态
              actions.updateMaterial(materialIds[index], {
                processingStep: 'entity_pending_confirm',
                entityRecognitionResult: JSON.stringify(result.entityResult || { entities }),
                entity_recognition_confirmed: false
              });
            }
          });

          // 清除原子流程标志（接下来由用户确认流程接管）
          atomicFlowInProgressRef.current = false;

          // 合并去重实体并显示确认对话框
          const uniqueEntities = [];
          const seenEntities = new Set();
          allEntities.forEach(entity => {
            const key = `${entity.entity || entity.chinese_name}_${entity.type}`;
            if (!seenEntities.has(key)) {
              seenEntities.add(key);
              uniqueEntities.push(entity);
            }
          });

          setTimeout(() => {
            setEntityResults(uniqueEntities);
          }, 50);

          actions.showNotification(
            '实体识别完成',
            `PDF ${pageCount}页共识别到 ${uniqueEntities.length} 个实体，请确认翻译`,
            'success'
          );
        }
      } catch (pdfError) {
        console.error('PDF翻译流程失败:', pdfError);
        actions.showNotification('翻译失败', pdfError.message || 'PDF翻译过程出错', 'error');
        atomicFlowInProgressRef.current = false;
      }
    } catch (error) {
      console.error('启动翻译失败:', error);
      actions.showNotification('启动失败', error.message || '无法启动翻译', 'error');
    }
  }, [currentMaterial, pdfPages, actions, isRetranslateFlow]);

  // 处理跳过实体识别 - 直接进行LLM翻译（不使用实体指导）
  // ✅ 已迁移到原子化API
  const handleEntitySkip = useCallback(async () => {
    if (!currentMaterial) return;

    const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

    try {
      // 清空实体结果，隐藏Modal
      setEntityResults([]);
      setLlmLoading(true);

      if (isPDF) {
        // ===== PDF Session: 并行执行所有页面的LLM（无实体指导） =====
        const sessionId = currentMaterial.pdfSessionId;
        const pageIds = pdfPages.map(p => p.id);
        console.log(`⏭️ [PDF Session ${sessionId}] 跳过实体识别，直接进行LLM翻译`);

        // 更新所有页面状态
        pageIds.forEach(pageId => {
          actions.updateMaterial(pageId, {
            entityRecognitionEnabled: false,
            entity_recognition_confirmed: true
          });
        });

        // 并行执行LLM（无实体指导，加载页面已显示）
        const llmResults = await Promise.all(pageIds.map(pageId =>
          atomicAPI.llmOptimize(pageId, { useEntityGuidance: false })
        ));

        // 更新所有页面的结果
        llmResults.forEach((result, index) => {
          if (result.success) {
            actions.updateMaterial(pageIds[index], {
              processingStep: result.processingStep,
              llmTranslationResult: result.llmTranslationResult
            });
          }
        });

        const failedCount = llmResults.filter(r => !r.success).length;
        if (failedCount > 0) {
          actions.showNotification(
            'LLM翻译部分完成',
            `${pageIds.length - failedCount}页成功，${failedCount}页失败`,
            'warning'
          );
        } else {
          actions.showNotification(
            '翻译完成',
            `PDF ${pageIds.length}页LLM翻译已完成`,
            'success'
          );
        }
      } else {
        // ===== 单页图片: 直接执行LLM（无实体指导） =====
        actions.updateMaterial(currentMaterial.id, {
          entityRecognitionEnabled: false,
          entity_recognition_confirmed: true
        });

        // 执行LLM优化（加载页面已显示）
        const llmResult = await atomicAPI.llmOptimize(currentMaterial.id, {
          useEntityGuidance: false
        });

        if (llmResult.success) {
          actions.updateMaterial(currentMaterial.id, {
            processingStep: llmResult.processingStep,
            llmTranslationResult: llmResult.llmTranslationResult
          });
          actions.showNotification('翻译完成', 'LLM翻译已完成', 'success');
        } else {
          throw new Error(llmResult.error || 'LLM翻译失败');
        }
      }
    } catch (error) {
      console.error('跳过实体识别失败:', error);
      actions.showNotification('操作失败', error.message || '无法完成翻译', 'error');
    } finally {
      setLlmLoading(false);
    }
  }, [currentMaterial, pdfPages, actions]);

  // 处理确认实体
  // ✅ 已迁移到原子化API
  const handleConfirmEntities = useCallback(async (entities) => {
    if (!currentMaterial) return;

    const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

    try {
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
        // ===== PDF Session: 使用原子化API并行确认实体并执行LLM =====
        const sessionId = currentMaterial.pdfSessionId;
        console.log(`✅ [PDF Session ${sessionId}] 确认实体，整个PDF的${pdfPages.length}页将使用统一的实体翻译指导`);

        // 立即更新所有页面的本地状态，防止 Modal 重复弹出
        const pageIds = pdfPages.map(p => p.id);
        pageIds.forEach(pageId => {
          actions.updateMaterial(pageId, {
            entity_recognition_confirmed: true,
            processingStep: 'entity_confirmed'
          });
        });

        // ✅ 设置加载状态：显示"优化中..."
        setLlmLoading(true);

        try {
          // 步骤1: 并行确认所有页面的实体
          await Promise.all(pageIds.map(pageId =>
            atomicAPI.entityConfirm(pageId, entities, translationGuidance)
          ));

          // 步骤2: 并行执行所有页面的LLM优化（加载页面已显示）
          const llmResults = await Promise.all(pageIds.map(pageId =>
            atomicAPI.llmOptimize(pageId, { useEntityGuidance: entities.length > 0 })
          ));

          // 更新所有页面的结果
          llmResults.forEach((result, index) => {
            if (result.success) {
              actions.updateMaterial(pageIds[index], {
                processingStep: result.processingStep,
                llmTranslationResult: result.llmTranslationResult
              });
            }
          });

          const failedCount = llmResults.filter(r => !r.success).length;
          if (failedCount > 0) {
            actions.showNotification(
              'LLM翻译部分完成',
              `${pageIds.length - failedCount}页成功，${failedCount}页失败`,
              'warning'
            );
          } else {
            actions.showNotification(
              '翻译完成',
              `PDF ${pageIds.length}页LLM翻译已完成`,
              'success'
            );
          }
        } catch (pdfConfirmError) {
          console.error('PDF实体确认/LLM翻译失败:', pdfConfirmError);
          actions.showNotification(
            'LLM翻译失败',
            `${pdfConfirmError.message}（可点击重试按钮重新翻译）`,
            'error'
          );
        } finally {
          setLlmLoading(false);
        }
      } else {
        // ===== 单页图片: 使用原子化API确认实体 =====
        // 立即更新本地状态，防止 Modal 重复弹出
        actions.updateMaterial(currentMaterial.id, {
          entity_recognition_confirmed: true,
          processing_step: 'entity_confirmed'
        });

        // ✅ 设置加载状态：显示加载页面遮住内容
        setLlmLoading(true);

        // 步骤1: 原子API确认实体（不自动触发LLM）
        const confirmResult = await atomicAPI.entityConfirm(
          currentMaterial.id,
          entities,
          translationGuidance
        );

        if (!confirmResult.success) {
          throw new Error(confirmResult.error || '确认实体失败');
        }

        // 步骤2: 原子API执行LLM优化（前端主动控制）
        try {
          const llmResult = await atomicAPI.llmOptimize(currentMaterial.id, {
            useEntityGuidance: true
          });

          if (llmResult.success) {
            actions.showNotification(
              'LLM翻译完成',
              llmResult.message || '翻译优化已完成',
              'success'
            );

            // 更新材料状态
            actions.updateMaterial(currentMaterial.id, {
              processingStep: llmResult.processingStep,
              llmTranslationResult: llmResult.llmTranslationResult
            });
          } else {
            throw new Error(llmResult.error || 'LLM翻译失败');
          }
        } catch (llmError) {
          console.error('LLM翻译失败:', llmError);
          actions.showNotification(
            'LLM翻译失败',
            `${llmError.message}（可点击重试按钮重新翻译）`,
            'error'
          );
          // 注意：实体已确认，只是LLM失败，用户可以手动重试
        } finally {
          // ✅ 无论成功失败都清除加载状态
          setLlmLoading(false);
        }
      }
    } catch (error) {
      console.error('确认实体失败:', error);
      actions.showNotification('确认失败', error.message || '无法确认实体', 'error');
    }
  }, [currentMaterial, pdfPages, actions]);

  // 处理AI优化（深度查询）- 接收实体列表参数
  // ✅ 已迁移到原子化API
  const handleAIOptimize = useCallback(async (entities) => {
    if (!currentMaterial || !entities || entities.length === 0) return;

    const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

    try {
      setEntityModalLoading(true);

      if (isPDF) {
        // ===== PDF Session: 并行深度识别所有页面 =====
        const sessionId = currentMaterial.pdfSessionId;
        const pageIds = pdfPages.map(p => p.id);
        console.log(`🤖 [PDF Session ${sessionId}] 开始AI优化，对整个PDF的实体进行深度识别`);

        actions.showNotification(
          'AI优化中',
          `正在为PDF的${pageIds.length}页进行深度实体识别，这可能需要1-2分钟...`,
          'info'
        );

        // 并行调用原子API进行深度识别
        const results = await Promise.all(pageIds.map(pageId =>
          atomicAPI.entityRecognize(pageId, 'deep')
        ));

        // 收集所有实体并去重
        const allEntities = [];
        const seenEntities = new Set();
        results.forEach(result => {
          if (result.success) {
            const pageEntities = result.entities || result.entityResult?.entities || [];
            pageEntities.forEach(entity => {
              const key = `${entity.entity || entity.chinese_name}_${entity.type}`;
              if (!seenEntities.has(key)) {
                seenEntities.add(key);
                allEntities.push(entity);
              }
            });
          }
        });

        // 更新实体结果为AI优化后的结果
        setEntityResults(allEntities);

        actions.showNotification(
          'AI优化完成',
          `已为 ${allEntities.length} 个实体查找官方英文名称`,
          'success'
        );
      } else {
        // ===== 单页图片: 深度识别当前页面 =====
        actions.showNotification(
          'AI优化中',
          '正在进行深度实体识别，这可能需要1-2分钟...',
          'info'
        );

        // 调用原子API进行深度识别
        const response = await atomicAPI.entityRecognize(currentMaterial.id, 'deep');

        if (response.success) {
          const resultEntities = response.entities || response.entityResult?.entities || [];
          // 更新实体结果为AI优化后的结果
          setEntityResults(resultEntities);

          actions.showNotification(
            'AI优化完成',
            `已为 ${resultEntities.length} 个实体查找官方英文名称`,
            'success'
          );
        } else {
          throw new Error(response.error || '深度识别失败');
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
  // 🔧 关键修复：添加 materialId 验证，防止设置其他材料的 regions
  React.useEffect(() => {
    const materialId = currentMaterial?.id;

    // 验证是否是当前材料
    if (!materialId || currentMaterialIdRef.current !== materialId) {
      return;
    }

    if (currentMaterial?.hasEditedVersion && currentMaterial?.editedRegions) {
      // 恢复已保存的regions
      setSavedRegions(currentMaterial.editedRegions);
    } else {
      // 清空saved regions
      setSavedRegions([]);
    }
  }, [currentMaterial?.hasEditedVersion, currentMaterial?.editedRegions, currentMaterial?.id]);

  // 监听material的processing_step变化，处理实体识别流程
  // ⚠️ 注意：单页图片已由 handleEntityModeConfirm 使用原子化API处理
  // 此 useEffect 主要用于 PDF Session 的后台处理
  React.useEffect(() => {
    if (!currentMaterial) return;

    // ✅ 如果正在使用原子化流程处理，跳过此 useEffect 避免冲突
    // 使用 ref 而不是 state，因为 ref 是同步更新的，避免竞态条件
    if (atomicFlowInProgressRef.current) {
      console.log('⏭️ 原子化流程进行中，跳过 useEffect 自动触发');
      return;
    }

    const step = currentMaterial.processingStep;
    const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

    // ✅ 已迁移到原子化API：OCR完成后的实体识别由 handleEntityModeConfirm 处理
    // 单页图片和PDF都通过 handleEntityModeConfirm 触发，不再需要 useEffect 自动触发

    // 快速实体识别完成，显示结果让用户选择
    // 只有在 entity_pending_confirm 状态且还没确认过时才显示
    if (step === 'entity_pending_confirm' && currentMaterial.entityRecognitionResult && !currentMaterial.entity_recognition_confirmed) {
      const isPDF = pdfPages.length > 0 && currentMaterial.pdfSessionId;

      if (isPDF) {
        // ===== PDF Session: 整个PDF只显示一次Modal =====
        const sessionId = currentMaterial.pdfSessionId;

        // 检查该PDF Session的Modal是否已经显示过
        if (pdfSessionEntityModalShownRef.current[sessionId]) {
          return;
        }

        // 标记为已显示
        pdfSessionEntityModalShownRef.current[sessionId] = true;

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

          // ✅ 修复：支持多种 API 响应结构
          const entities = result.entities || result.entityResult?.entities || [];
          if (entities.length > 0) {
            setEntityResults(entities);
          }
        } catch (e) {
          console.error('解析实体识别结果失败:', e);
        }
      }
    }

    // 如果已确认实体，清空实体结果
    // ✅ 修复：只在确认后清除，避免在 entity_pending_confirm 状态下误清除
    if (currentMaterial.entity_recognition_confirmed && entityResults.length > 0) {
      setEntityResults([]);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  // 🔧 关键修复：移除 baiduRegions 依赖，使用 baiduRegionsRef 代替，避免循环触发
  }, [currentMaterial?.id, currentMaterial?.processingStep, currentMaterial?.entityRecognitionEnabled, currentMaterial?.entityRecognitionMode, currentMaterial?.llmTranslationResult, currentMaterial?.entity_recognition_confirmed, currentMaterial?.entityRecognitionResult, pdfPages, state.materials]);

  // ✅ 已删除旧的实体识别触发函数，统一使用 atomicAPI.entityRecognize()
  // - triggerDeepEntityRecognition
  // - triggerFastEntityRecognition
  // - triggerPdfSessionFastEntityRecognition
  // - triggerPdfSessionDeepEntityRecognition

  // 解析百度翻译结果
  // 🔧 竞态条件修复：添加材料ID验证
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!currentMaterial) {
      return;
    }

    // 🔧 如果材料没有翻译数据，也标记为"准备就绪"（显示原图）
    if (!currentMaterial.translationTextInfo) {
      if (currentMaterialIdRef.current === currentMaterial.id) {
        setMaterialDataReady(true);
        lastReadyMaterialIdRef.current = currentMaterial.id;
      }
      return;
    }

    const materialId = currentMaterial.id;

    // 🔧 验证是否仍是当前材料
    if (currentMaterialIdRef.current !== materialId) {
      return;
    }

    try {
      const textInfo = typeof currentMaterial.translationTextInfo === 'string'
        ? JSON.parse(currentMaterial.translationTextInfo)
        : currentMaterial.translationTextInfo;

      const regions = textInfo.regions || textInfo || [];

      // 🔧 再次验证材料ID
      if (currentMaterialIdRef.current !== materialId) {
        return;
      }

      setBaiduRegions(regions);

      // 如果有LLM结果，直接使用
      if (currentMaterial.llmTranslationResult) {
        const llmResult = typeof currentMaterial.llmTranslationResult === 'string'
          ? JSON.parse(currentMaterial.llmTranslationResult)
          : currentMaterial.llmTranslationResult;

        // 合并LLM翻译到regions
        const updatedRegions = regions.map(region => {
          const llmTrans = llmResult.find(t => t.id === region.id);
          return llmTrans ? { ...region, dst: llmTrans.translation } : region;
        });

        // 🔧 再次验证材料ID
        if (currentMaterialIdRef.current !== materialId) {
          return;
        }

        setLlmRegions(updatedRegions);
        llmTriggeredRef.current[materialId] = true; // 标记已处理
      }

      // 🔧 关键修复：在设置 ready 前再次验证材料ID
      if (currentMaterialIdRef.current !== materialId) {
        return;
      }

      // 🔧 数据解析完成，标记为准备就绪
      setMaterialDataReady(true);
      lastReadyMaterialIdRef.current = materialId;

      // 移除自动LLM触发逻辑 - 后端会在实体确认后自动触发LLM翻译
    } catch (e) {
      console.error('解析翻译数据失败:', e);
    }
  }, [currentMaterial?.id, currentMaterial?.translationTextInfo, currentMaterial?.processingProgress, currentMaterial?.entityRecognitionEnabled, currentMaterial?.entityRecognitionConfirmed, pdfSessionProgress?.progress]);

  // ✅ 已删除旧的 PDF auto-LLM useEffect，PDF的LLM翻译统一由 handleEntityModeConfirm 处理
  // ✅ 已删除旧的 handleLLMTranslate 函数，LLM翻译统一使用 atomicAPI.llmOptimize()

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

  // ✅ 已迁移到原子化API
  const handleRetryTranslation = useCallback(async (translationType) => {
    if (!currentMaterial) return;

    try {
      // 显示重试通知
      actions.showNotification('重新翻译', `正在重新进行${translationType === 'latex' ? 'LaTeX' : 'OCR'}翻译...`, 'info');

      if (translationType === 'api') {
        // 使用原子API重新进行OCR翻译
        setLlmLoading(true);

        // 步骤1: OCR翻译
        const baiduResult = await atomicAPI.translateBaidu(currentMaterial.id, {
          clearPreviousData: true
        });

        if (!baiduResult.success) {
          throw new Error(baiduResult.error || 'OCR翻译失败');
        }

        // 步骤2: LLM优化（不使用实体指导，加载页面已显示）
        const llmResult = await atomicAPI.llmOptimize(currentMaterial.id, {
          useEntityGuidance: false
        });

        if (llmResult.success) {
          actions.updateMaterial(currentMaterial.id, {
            processingStep: llmResult.processingStep,
            llmTranslationResult: llmResult.llmTranslationResult
          });
          actions.showNotification('重试成功', '翻译已完成', 'success');
        } else {
          throw new Error(llmResult.error || 'LLM翻译失败');
        }

        setLlmLoading(false);

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
      {/* 编辑器内容区 - 工具栏整合到 FabricImageEditor 中 */}
      <div className={styles.editorArea}>
        {(currentMaterial.type === 'image' || currentMaterial.type === 'pdf') ? (
          <>
            {/* 只要有图片就显示编辑器 */}
            {getImageUrl() && (
              <>
                {/* 实体识别结果 Modal */}
                  <EntityResultModal
                    isOpen={currentMaterial.processingStep === 'entity_pending_confirm' && entityResults.length > 0}
                    entities={entityResults}
                    onClose={() => {}} // 不允许直接关闭，必须选择操作
                    onConfirm={handleConfirmEntities}
                    loading={entityModalLoading}
                  />
                  {/* 显示翻译进行中状态 - 包括所有阶段：拆分、上传、百度翻译、实体识别、AI优化 */}
                  {/* 只有在真正翻译进行中时才显示加载界面 */}
                  {/* 排除需要用户交互的状态：entity_pending_confirm, entity_confirmed */}
                  {(() => {
                    // ✅ 修复：llmLoading 为 true 时强制显示加载页面（不受其他条件影响）
                    if (llmLoading) return true;

                    // 其他处理中状态
                    const baseCondition =
                      currentMaterial.status === '处理中' ||
                      currentMaterial.status === '拆分中' ||
                      currentMaterial.processingStep === 'splitting' ||
                      currentMaterial.processingStep === 'translating' ||
                      currentMaterial.processingStep === 'entity_recognizing' ||
                      (currentMaterial.processingStep === 'translated' && !currentMaterial.translationTextInfo) ||
                      (currentMaterial.processingStep === 'uploaded' && currentMaterial.status === '处理中');
                    // 只排除需要用户交互的状态（实体确认相关）
                    const excludeEntitySteps = !['entity_pending_confirm', 'entity_confirmed'].includes(currentMaterial.processingStep);
                    return baseCondition && excludeEntitySteps;
                  })() ? (
                    <div className={styles.processingOverlay}>
                      <div className={styles.processingSpinner}>
                        <svg className={styles.spinning} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                      </div>
                      <p className={styles.processingText}>
                        {(currentMaterial.status === '拆分中' || currentMaterial.processingStep === 'splitting') && 'PDF拆分中...'}
                        {currentMaterial.processingStep === 'uploaded' && '准备翻译...'}
                        {(currentMaterial.processingStep === 'translating' || (pdfSessionProgress && pdfSessionProgress.someTranslating)) && '翻译中...'}
                        {currentMaterial.processingStep === 'entity_recognizing' && '实体识别中...'}
                        {llmLoading && '优化中...'}
                        {!currentMaterial.processingStep && !llmLoading && currentMaterial.status !== '拆分中' && '处理中...'}
                      </p>
                    </div>
                  ) : !materialDataReady && currentMaterial.translationTextInfo ? (
                    /* 🔧 竞态条件修复：数据正在解析中，显示加载状态而非旧数据 */
                    <div className={styles.processingOverlay}>
                      <div className={styles.processingSpinner}>
                        <svg className={styles.spinning} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                      </div>
                      <p className={styles.processingText}>加载中...</p>
                    </div>
                  ) : !currentMaterial.translationTextInfo ? (
                    /* ✅ 没有翻译结果时（包括status='已上传'），显示原图编辑器供用户预览和旋转 */
                    <FabricImageEditor
                      key={`editor-${currentMaterial.id}-${currentMaterial.rotationCount || 0}`}
                      imageSrc={getImageUrl()}
                      regions={[]} // 空regions，只显示原图
                      editorKey={`empty-${currentMaterial.id}`}
                      exposeHandlers={true}
                      // 扩展工具栏控制
                      extraControls={{
                        // 页面导航
                        showPageNav: pdfPages.length > 1,
                        currentPage: currentPageIndex + 1,
                        totalPages: pdfPages.length,
                        onPrevPage: () => handlePageChange(currentPageIndex - 1),
                        onNextPage: () => handlePageChange(currentPageIndex + 1),
                        // 旋转
                        onRotate: handleRotateImage,
                        // 确认
                        isConfirmed: currentMaterial.confirmed,
                        onConfirm: handleConfirm,
                        // 开始翻译
                        showStartTranslate: currentMaterial.status === '已上传',
                        onStartTranslate: handleStartTranslation,
                        translateLabel: pdfPages.length > 0 ? `开始翻译 (${pdfPages.length})` : '开始翻译'
                      }}
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
                      key={`editor-${currentMaterial.id}-${currentMaterial.rotationCount || 0}`}
                      imageSrc={getImageUrl()}
                      regions={savedRegions.length > 0 ? savedRegions : llmRegions}
                      editorKey={`llm-${currentMaterial.id}`}
                      exposeHandlers={true}
                      // 扩展工具栏控制
                      extraControls={{
                        // 页面导航
                        showPageNav: pdfPages.length > 1,
                        currentPage: currentPageIndex + 1,
                        totalPages: pdfPages.length,
                        onPrevPage: () => handlePageChange(currentPageIndex - 1),
                        onNextPage: () => handlePageChange(currentPageIndex + 1),
                        // 旋转
                        onRotate: handleRotateImage,
                        // 确认
                        isConfirmed: currentMaterial.confirmed,
                        onConfirm: handleConfirm,
                        // 重新翻译（已翻译状态）
                        showRetranslate: true,
                        onRetranslate: handleRetranslateCurrentImage
                      }}
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
              hasExistingEntityResult={!!(currentMaterial?.entityRecognitionResult)}
              isRetranslate={isRetranslateFlow}
            />
              </>
            )}
          </>
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

export default ClaudePreviewSection;


