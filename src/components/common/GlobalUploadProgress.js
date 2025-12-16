import React, { useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import styles from './GlobalUploadProgress.module.css';

const GlobalUploadProgress = () => {
  const { state, actions } = useApp();
  const { uploadStatus } = state;

  const progressPercentage = uploadStatus.total > 0 ? 
    Math.round((uploadStatus.current / uploadStatus.total) * 100) : 0;
  
  const isComplete = uploadStatus.current === uploadStatus.total && uploadStatus.total > 0;

  // 移除格式化时间函数，不再需要倒计时

  // ✅ 改为只关闭对话框，不自动翻译
  const handleComplete = useCallback(async () => {
    if (isComplete) {
      // 关闭上传进度框
      actions.hideUploadModal();

      // ✅ 显示提示：需要手动点击"开始翻译"按钮
      actions.showNotification(
        '上传完成',
        '文件已上传，请在预览区点击"开始翻译"按钮',
        'success'
      );
    }
  }, [isComplete, actions]);

  // 手动关闭进度框
  const handleManualClose = useCallback(() => {
    actions.hideUploadModal();
  }, [actions]);

  const handleCancel = async () => {
    if (isComplete) {
      // 撤销上传：删除已上传的文件
      actions.openConfirmDialog({
        title: '撤销上传',
        message: '确定要撤销这次上传吗？所有文件将被删除。',
        type: 'danger',
        confirmText: '撤销删除',
        cancelText: '保留文件',
        onConfirm: async () => {
          try {
            const { currentClient, uploadStatus } = state;
            if (uploadStatus.uploadedMaterialIds && uploadStatus.uploadedMaterialIds.length > 0) {
              // 调用后端API删除文件
              const { materialAPI } = await import('../../services/api');
              await materialAPI.cancelUpload(currentClient.cid, uploadStatus.uploadedMaterialIds);
              
              // 更新本地状态
              const updatedMaterials = state.materials.filter(m => 
                !uploadStatus.uploadedMaterialIds.includes(m.id)
              );
              actions.setMaterials(updatedMaterials);
              actions.showNotification('撤销成功', '已删除上传的文件', 'success');
            }
          } catch (error) {
            actions.showNotification('撤销失败', error.message || '删除文件时出现错误', 'error');
          }
          actions.cancelUpload();
        }
      });
    } else if (uploadStatus.canCancel) {
      // 取消上传中的过程
      actions.openConfirmDialog({
        title: '取消上传',
        message: '确定要取消上传吗？',
        type: 'warning',
        confirmText: '取消上传',
        cancelText: '继续上传',
        onConfirm: () => {
          actions.cancelUpload();
        }
      });
    }
  };

  // 移除自动倒计时，用户手动确认
  // 进度条框作为用户确认界面，不自动消失

  // 如果进度框不应该显示，不显示组件
  if (!uploadStatus.showModal) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>文件上传</h3>
          {isComplete && (
            <button 
              className={styles.closeBtn}
              onClick={handleManualClose}
              title="关闭进度框"
            >
              ✕
            </button>
          )}
        </div>
        
        <div className={styles.body}>
          {/* 简化的进度条 */}
          <div className={styles.progressBarContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <div className={styles.progressText}>
              {uploadStatus.message}
            </div>
          </div>
          
          {/* 完成后的确认提示 */}
          {isComplete && (
            <div className={styles.completionMessage}>
              <div className={styles.successMessage}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{display: 'inline-block', marginRight: '8px', verticalAlign: 'middle'}}>
                  <path d="M9 12l2 2 4-4"/>
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                文件已上传！请在预览区点击"开始翻译"按钮开始翻译。
              </div>
            </div>
          )}
        </div>
        
        {/* 简化的按钮 */}
        <div className={styles.footer}>
          {isComplete ? (
            <div className={styles.buttonGroup}>
              <button 
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={handleCancel}
              >
                撤销删除
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleComplete}
              >
                完成
              </button>
            </div>
          ) : (
            <div className={styles.buttonGroup}>
              <button 
                className={`${styles.btn} ${styles.btnCancel}`}
                onClick={handleCancel}
                disabled={!uploadStatus.canCancel}
              >
                取消上传
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalUploadProgress;