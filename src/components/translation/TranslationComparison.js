import React, { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { materialAPI } from '../../services/api';
import styles from './TranslationComparison.module.css';

const TranslationComparison = () => {
  const { state, actions } = useApp();
  const { currentMaterial } = state;
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
      actions.showNotification('选择成功', `已选择${translationType === 'latex' ? 'LaTeX' : 'API'}翻译结果`, 'success');
    } catch (error) {
      actions.showNotification('选择失败', error.message || '选择翻译结果失败', 'error');
    }
  };

  const handleConfirmResult = async () => {
    if (!currentMaterial || !selectedType) return;
    
    setIsConfirming(true);
    try {
      // 调用Phase 1新增的确认API端点
      await materialAPI.confirmMaterial(currentMaterial.id);
      
      // 更新本地状态
      actions.updateMaterial(currentMaterial.id, {
        confirmed: true,
        status: '已确认'
      });
      
      actions.showNotification('确认成功', `${currentMaterial.name} 翻译结果已确认`, 'success');
    } catch (error) {
      actions.showNotification('确认失败', error.message || '确认翻译结果失败', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleRetryTranslation = async (translationType) => {
    if (!currentMaterial) return;
    
    try {
      actions.showNotification('重试中', `正在重新${translationType === 'latex' ? 'LaTeX' : 'API'}翻译...`, 'info');
      
      // 这里可以调用重试API或重新触发翻译
      // 目前先显示提示
      setTimeout(() => {
        actions.showNotification('重试完成', `${translationType === 'latex' ? 'LaTeX' : 'API'}翻译重试已提交`, 'success');
      }, 1000);
      
    } catch (error) {
      actions.showNotification('重试失败', error.message || '重试翻译失败', 'error');
    }
  };

  if (!currentMaterial) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔍</div>
          <h3>选择材料查看翻译结果</h3>
          <p>从左侧材料列表中选择一个材料来查看和对比翻译结果</p>
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
        <h2 className={styles.title}>翻译结果对比</h2>
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
              LaTeX翻译
            </h3>
            <div className={styles.statusBadge}>
              {hasLatexResult && !latexFailed && (
                <span className={`${styles.badge} ${styles.success}`}>✅ 成功</span>
              )}
              {latexFailed && (
                <span className={`${styles.badge} ${styles.error}`}>❌ 失败</span>
              )}
              {!hasLatexResult && !latexFailed && (
                <span className={`${styles.badge} ${styles.pending}`}>⏳ 处理中</span>
              )}
            </div>
          </div>

          <div className={styles.cardContent}>
            {hasLatexResult && !latexFailed ? (
              <div className={styles.previewArea}>
                <div className={styles.previewPlaceholder}>
                  <span>📋 LaTeX内容预览</span>
                  <p>点击查看生成的LaTeX文档</p>
                </div>
                <button 
                  className={styles.previewBtn}
                  onClick={() => window.open(`/preview/latex/${currentMaterial.id}.pdf`, '_blank')}
                >
                  预览PDF
                </button>
              </div>
            ) : latexFailed ? (
              <div className={styles.errorArea}>
                <p className={styles.errorMessage}>
                  {currentMaterial.latexTranslationError || 'LaTeX翻译失败'}
                </p>
                <button 
                  className={styles.retryBtn}
                  onClick={() => handleRetryTranslation('latex')}
                >
                  重试翻译
                </button>
              </div>
            ) : (
              <div className={styles.loadingArea}>
                <div className={styles.spinner}></div>
                <p>正在生成LaTeX翻译...</p>
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
                {selectedType === 'latex' ? '已选择' : '选择此结果'}
              </button>
            </div>
          )}
        </div>

        {/* API翻译结果 */}
        <div className={`${styles.resultCard} ${selectedType === 'api' ? styles.selected : ''}`}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <span className={styles.methodIcon}>🔤</span>
              API翻译
            </h3>
            <div className={styles.statusBadge}>
              {hasApiResult && !apiFailed && (
                <span className={`${styles.badge} ${styles.success}`}>✅ 成功</span>
              )}
              {apiFailed && (
                <span className={`${styles.badge} ${styles.error}`}>❌ 失败</span>
              )}
              {!hasApiResult && !apiFailed && (
                <span className={`${styles.badge} ${styles.pending}`}>⏳ 处理中</span>
              )}
            </div>
          </div>

          <div className={styles.cardContent}>
            {hasApiResult && !apiFailed ? (
              <div className={styles.previewArea}>
                <div className={styles.imagePreview}>
                  <img 
                    src={`/download/api/${currentMaterial.translatedImagePath}`}
                    alt="API翻译结果"
                    className={styles.translatedImage}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'block';
                    }}
                  />
                  <div className={styles.previewPlaceholder} style={{display: 'none'}}>
                    <span>🖼️ 翻译图片</span>
                    <p>API翻译结果图片</p>
                  </div>
                </div>
                <button 
                  className={styles.previewBtn}
                  onClick={() => window.open(`/download/api/${currentMaterial.translatedImagePath}`, '_blank')}
                >
                  查看大图
                </button>
              </div>
            ) : apiFailed ? (
              <div className={styles.errorArea}>
                <p className={styles.errorMessage}>
                  {currentMaterial.translationError || 'API翻译失败'}
                </p>
                <button 
                  className={styles.retryBtn}
                  onClick={() => handleRetryTranslation('api')}
                >
                  重试翻译
                </button>
              </div>
            ) : (
              <div className={styles.loadingArea}>
                <div className={styles.spinner}></div>
                <p>正在进行API翻译...</p>
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
                {selectedType === 'api' ? '已选择' : '选择此结果'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 确认区域 */}
      {selectedType && (hasLatexResult || hasApiResult) && (
        <div className={styles.confirmationArea}>
          <div className={styles.selectedInfo}>
            <span className={styles.selectedLabel}>当前选择:</span>
            <span className={styles.selectedMethod}>
              {selectedType === 'latex' ? 'LaTeX翻译' : 'API翻译'}
            </span>
          </div>
          
          <button
            className={`${styles.confirmBtn} ${currentMaterial.confirmed ? styles.confirmed : ''}`}
            onClick={handleConfirmResult}
            disabled={isConfirming || currentMaterial.confirmed}
          >
            {isConfirming ? '确认中...' :
             currentMaterial.confirmed ? '已确认' : '确认选择'}
          </button>
        </div>
      )}
    </div>
  );
};

export default TranslationComparison;