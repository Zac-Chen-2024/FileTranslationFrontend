import React, { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { materialAPI } from '../../services/api';
import styles from './TranslationComparison.module.css';

// API URL配置
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

const TranslationComparison = () => {
  const { state, actions } = useApp();
  const { currentMaterial } = state;
  const { t } = useLanguage();
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedType, setSelectedType] = useState(null);

  useEffect(() => {
    if (currentMaterial) {
      setSelectedType(currentMaterial.selectedTranslationType || currentMaterial.selectedResult);
    }
  }, [currentMaterial]);

  const handleSelectResult = async (translationType) => {
    if (!currentMaterial || selectedType === translationType) return;
    
    try {
      // 调用Phase 1新增的API端点
      await materialAPI.selectResult(currentMaterial.id, translationType);
      
      // 更新本地状态
      actions.updateMaterial(currentMaterial.id, { 
        selectedResult: translationType,
        selectedTranslationType: translationType
      });
      
      setSelectedType(translationType);
      const resultText = translationType === 'latex' ? t('selectedLatexResult') : t('selectedApiResult');
      actions.showNotification(t('selectionSuccess'), resultText, 'success');
    } catch (error) {
      actions.showNotification(t('selectionFailed'), error.message || t('selectResultFailed'), 'error');
    }
  };

  const handleConfirmResult = async () => {
    if (!currentMaterial || !selectedType) return;

    setIsConfirming(true);
    try {
      // ✅ 确认前为当前页面保存regions并生成最终图片
      if (window.currentFabricEditor && window.currentFabricEditor.getCurrentRegions) {
        try {
          actions.showNotification('保存中', '正在保存当前页面编辑...', 'info');

          const currentRegions = window.currentFabricEditor.getCurrentRegions();
          if (currentRegions && currentRegions.length > 0) {
            // 1. 保存 regions
            const response = await materialAPI.saveRegions(currentMaterial.id, currentRegions);

            if (response.success) {
              // 2. 生成并上传最终图片
              if (window.currentFabricEditor.generateFinalImage) {
                const finalImage = await window.currentFabricEditor.generateFinalImage();
                if (finalImage && finalImage.blob) {
                  await materialAPI.saveFinalImage(currentMaterial.id, finalImage.blob);
                  console.log('✓ 当前页面最终图片已生成并上传');
                }
              }
            }
          }
        } catch (saveError) {
          console.warn('保存当前页面失败，但继续确认:', saveError);
        }
      }

      // 调用Phase 1新增的确认API端点
      await materialAPI.confirmMaterial(currentMaterial.id);

      // 更新本地状态
      actions.updateMaterial(currentMaterial.id, {
        confirmed: true,
        status: t('confirmed')
      });

      actions.showNotification(t('confirmationSuccess'), t('materialConfirmed', { name: currentMaterial.name }), 'success');
    } catch (error) {
      actions.showNotification(t('confirmationFailed'), error.message || t('confirmResultFailed'), 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleRetryTranslation = async (translationType) => {
    if (!currentMaterial) return;

    try {
      const retryingMsg = translationType === 'latex' ? t('retryingLatex') : t('retryingApi');
      actions.showNotification(t('retrying'), retryingMsg, 'info');

      // 这里可以调用重试API或重新触发翻译
      // 目前先显示提示
      setTimeout(() => {
        const completeMsg = translationType === 'latex' ? t('latexRetrySubmitted') : t('apiRetrySubmitted');
        actions.showNotification(t('retryComplete'), completeMsg, 'success');
      }, 1000);

    } catch (error) {
      actions.showNotification(t('retryFailed'), error.message || t('retryTranslationFailed'), 'error');
    }
  };

  if (!currentMaterial) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔍</div>
          <h3>{t('selectMaterialToView')}</h3>
          <p>{t('selectMaterialHint')}</p>
        </div>
      </div>
    );
  }

  // 判断翻译状态
  const hasLatexResult = currentMaterial.latexTranslationResult || currentMaterial.latexStatus === 'completed';
  const hasApiResult = currentMaterial.translatedImagePath || currentMaterial.apiStatus === 'completed';
  const latexFailed = currentMaterial.latexTranslationError || currentMaterial.latexStatus === 'failed';
  const apiFailed = currentMaterial.translationError || currentMaterial.apiStatus === 'failed';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('translationComparison')}</h2>
        <div className={styles.materialInfo}>
          <span className={styles.materialName}>{currentMaterial.name}</span>
          <span className={`${styles.status} ${styles[currentMaterial.status?.replace(/\s+/g, '')]}`}>
            {currentMaterial.status}
          </span>
        </div>
      </div>

      <div className={styles.comparisonGrid}>
        {/* LaTeX翻译结果 */}
        <div className={`${styles.resultCard} ${selectedType === 'latex' ? styles.selected : ''}`}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <span className={styles.methodIcon}>📄</span>
              {t('latexTranslation')}
            </h3>
            <div className={styles.statusBadge}>
              {hasLatexResult && !latexFailed && (
                <span className={`${styles.badge} ${styles.success}`}>✅ {t('success')}</span>
              )}
              {latexFailed && (
                <span className={`${styles.badge} ${styles.error}`}>❌ {t('error')}</span>
              )}
              {!hasLatexResult && !latexFailed && (
                <span className={`${styles.badge} ${styles.pending}`}>⏳ {t('processing')}</span>
              )}
            </div>
          </div>

          <div className={styles.cardContent}>
            {hasLatexResult && !latexFailed ? (
              <div className={styles.previewArea}>
                <div className={styles.previewPlaceholder}>
                  <span>📋 {t('latexContent')}</span>
                  <p>{t('clickToViewLatex')}</p>
                </div>
                <button
                  className={styles.previewBtn}
                  onClick={() => window.open(`${API_URL}/preview/latex/${currentMaterial.id}.pdf`, '_blank')}
                >
                  {t('previewPDF')}
                </button>
              </div>
            ) : latexFailed ? (
              <div className={styles.errorArea}>
                <p className={styles.errorMessage}>
                  {currentMaterial.latexTranslationError || t('latexTranslationFailed')}
                </p>
                <button
                  className={styles.retryBtn}
                  onClick={() => handleRetryTranslation('latex')}
                >
                  {t('retryTranslation')}
                </button>
              </div>
            ) : (
              <div className={styles.loadingArea}>
                <div className={styles.spinner}></div>
                <p>{t('generatingLatex')}</p>
              </div>
            )}
          </div>

          {hasLatexResult && !latexFailed && (
            <div className={styles.cardActions}>
              <button
                className={`${styles.selectBtn} ${selectedType === 'latex' ? styles.selected : ''}`}
                onClick={() => handleSelectResult('latex')}
                disabled={selectedType === 'latex'}
              >
                {selectedType === 'latex' ? t('selected') : t('selectThisResult')}
              </button>
            </div>
          )}
        </div>

        {/* API翻译结果 */}
        <div className={`${styles.resultCard} ${selectedType === 'api' ? styles.selected : ''}`}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <span className={styles.methodIcon}>🔤</span>
              {t('apiTranslation')}
            </h3>
            <div className={styles.statusBadge}>
              {hasApiResult && !apiFailed && (
                <span className={`${styles.badge} ${styles.success}`}>✅ {t('success')}</span>
              )}
              {apiFailed && (
                <span className={`${styles.badge} ${styles.error}`}>❌ {t('error')}</span>
              )}
              {!hasApiResult && !apiFailed && (
                <span className={`${styles.badge} ${styles.pending}`}>⏳ {t('processing')}</span>
              )}
            </div>
          </div>

          <div className={styles.cardContent}>
            {hasApiResult && !apiFailed ? (
              <div className={styles.previewArea}>
                <div className={styles.imagePreview}>
                  <img
                    src={`/download/api/${currentMaterial.translatedImagePath}`}
                    alt={t('apiTranslationResult')}
                    className={styles.translatedImage}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'block';
                    }}
                  />
                  <div className={styles.previewPlaceholder} style={{display: 'none'}}>
                    <span>🖼️ {t('translationImage')}</span>
                    <p>{t('apiTranslationResult')}</p>
                  </div>
                </div>
                <button
                  className={styles.previewBtn}
                  onClick={() => window.open(`/download/api/${currentMaterial.translatedImagePath}`, '_blank')}
                >
                  {t('viewLargeImage')}
                </button>
              </div>
            ) : apiFailed ? (
              <div className={styles.errorArea}>
                <p className={styles.errorMessage}>
                  {currentMaterial.translationError || t('apiTranslationFailed')}
                </p>
                <button
                  className={styles.retryBtn}
                  onClick={() => handleRetryTranslation('api')}
                >
                  {t('retryTranslation')}
                </button>
              </div>
            ) : (
              <div className={styles.loadingArea}>
                <div className={styles.spinner}></div>
                <p>{t('performingApiTranslation')}</p>
              </div>
            )}
          </div>

          {hasApiResult && !apiFailed && (
            <div className={styles.cardActions}>
              <button
                className={`${styles.selectBtn} ${selectedType === 'api' ? styles.selected : ''}`}
                onClick={() => handleSelectResult('api')}
                disabled={selectedType === 'api'}
              >
                {selectedType === 'api' ? t('selected') : t('selectThisResult')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 确认区域 */}
      {selectedType && (hasLatexResult || hasApiResult) && (
        <div className={styles.confirmationArea}>
          <div className={styles.selectedInfo}>
            <span className={styles.selectedLabel}>{t('currentSelection')}:</span>
            <span className={styles.selectedMethod}>
              {selectedType === 'latex' ? t('latexTranslation') : t('apiTranslation')}
            </span>
          </div>

          <button
            className={`${styles.confirmBtn} ${currentMaterial.confirmed ? styles.confirmed : ''}`}
            onClick={handleConfirmResult}
            disabled={isConfirming || currentMaterial.confirmed}
          >
            {isConfirming ? t('confirming') :
             currentMaterial.confirmed ? t('confirmed') : t('confirmSelection')}
          </button>
        </div>
      )}
    </div>
  );
};

export default TranslationComparison;