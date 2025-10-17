import React, { useCallback, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useNotifications } from '../../contexts/NotificationContext';
import styles from './GlobalUploadProgress.module.css';

const GlobalUploadProgress = () => {
  const { state, actions } = useApp();
  const { uploadStatus } = state;
  const { addTranslationCompleteNotification } = useNotifications();
  const [notifyEnabled, setNotifyEnabled] = useState(false);

  const progressPercentage = uploadStatus.total > 0 ? 
    Math.round((uploadStatus.current / uploadStatus.total) * 100) : 0;
  
  const isComplete = uploadStatus.current === uploadStatus.total && uploadStatus.total > 0;

  // 移除格式化时间函数，不再需要倒计时

  const handleComplete = useCallback(async () => {
    if (isComplete) {
      // 立即关闭进度框，不等待任何操作
      actions.hideUploadModal();
      
      // 后台启动翻译进程
      try {
        const { currentClient } = state;
        const { materialAPI } = await import('../../services/api');
        
        actions.showNotification('翻译开始', '正在翻译图片，请稍候...', 'success');
        
        // 启动翻译（等待完成）
        console.log('启动翻译，客户端ID:', currentClient.cid);
        try {
          const response = await materialAPI.startTranslation(currentClient.cid);
          console.log('翻译API响应:', response);
          
          // 方案1: 如果API直接返回了翻译结果，立即使用
          if (response.data && response.data.translated_materials && response.data.translated_materials.length > 0) {
            console.log('使用API直接返回的翻译结果:', response.data.translated_materials);
            
            // 1. 先更新每个翻译成功的材料在全局状态中
            const translatedMaterialsMap = new Map();
            response.data.translated_materials.forEach(tm => {
              translatedMaterialsMap.set(tm.id, tm);
            });
            
            console.log('翻译结果映射:', translatedMaterialsMap);
            
            // 2. 更新材料列表，将翻译结果直接应用到对应材料
            const currentMaterials = state.materials.map(material => {
              const translatedData = translatedMaterialsMap.get(material.id);
              if (translatedData) {
                console.log('更新材料翻译状态:', material.id, translatedData);
                return {
                  ...material,
                  status: '翻译完成',
                  translatedImagePath: translatedData.translated_image_path,
                  translationTextInfo: translatedData.translation_text_info,
                  translationError: null,
                  updatedAt: new Date().toISOString() // 更新时间戳确保最新
                };
              }
              return material;
            });
            
            // 3. 立即应用更新后的材料列表
            console.log('应用更新后的材料列表:', currentMaterials);
            actions.setMaterials(currentMaterials);
            
            // 4. 如果当前选中的材料被翻译了，立即更新预览
            if (state.currentMaterial) {
              const translatedCurrentMaterial = translatedMaterialsMap.get(state.currentMaterial.id);
              if (translatedCurrentMaterial) {
                const updatedCurrentMaterial = {
                  ...state.currentMaterial,
                  status: '翻译完成',
                  translatedImagePath: translatedCurrentMaterial.translated_image_path,
                  translationTextInfo: translatedCurrentMaterial.translation_text_info,
                  translationError: null,
                  updatedAt: new Date().toISOString()
                };
                console.log('立即更新当前材料翻译状态:', updatedCurrentMaterial);
                actions.setCurrentMaterial(updatedCurrentMaterial);
              }
            }
            
            actions.showNotification(
              '翻译完成', 
              `成功翻译 ${response.data.translated_count} 个文件，失败 ${response.data.failed_count || 0} 个`, 
              'success'
            );
            
            // 如果用户启用了通知，发送通知系统消息
            if (notifyEnabled) {
              const clientName = currentClient?.name || '客户';
              const materialNames = response.data.translated_materials?.map(m => m.name)?.join('、') || '材料';
              addTranslationCompleteNotification(clientName, materialNames);
            }
          } else {
            // WebSocket 会自动推送翻译进度和结果，无需轮询
            console.log('等待 WebSocket 推送翻译结果...');
          }
        } catch (error) {
          console.error('翻译API调用失败:', error);
          actions.showNotification('翻译失败', error.message || '启动翻译时出现错误', 'error');
        }
        
      } catch (error) {
        actions.showNotification('翻译失败', error.message || '启动翻译时出现错误', 'error');
      }
    }
  }, [isComplete, state, actions, notifyEnabled, addTranslationCompleteNotification]);

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
              {uploadStatus.current}/{uploadStatus.total} 文件 ({progressPercentage}%)
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
                文件已上传到服务器！请选择下一步操作，或点击右上角 ✕ 关闭此框。
              </div>
              <div className={styles.notificationToggle}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    className={styles.toggleCheckbox}
                    checked={notifyEnabled}
                    onChange={(e) => setNotifyEnabled(e.target.checked)}
                  />
                  <span className={styles.toggleText}>
                    翻译完成时通知我
                  </span>
                </label>
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
                完成并翻译
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