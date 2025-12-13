/**
 * RetranslateConfirmModal - 重新翻译确认弹窗
 *
 * 替代原来的window.confirm
 * 当用户点击重新翻译且存在实体数据时显示
 */

import React from 'react';
import styles from './RetranslateConfirmModal.module.css';

/**
 * RetranslateConfirmModal组件
 * @param {Object} props
 * @param {boolean} props.isOpen - 是否显示弹窗
 * @param {boolean} props.hasEntityData - 是否有实体数据
 * @param {Function} props.onPreserveAndTranslate - 保留实体并翻译
 * @param {Function} props.onReselectMode - 重新选择模式
 * @param {Function} props.onCancel - 取消
 */
const RetranslateConfirmModal = ({
  isOpen = false,
  hasEntityData = true,
  onPreserveAndTranslate,
  onReselectMode,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </div>
          <h3 className={styles.title}>重新翻译</h3>
        </div>

        <div className={styles.content}>
          {hasEntityData ? (
            <>
              <p className={styles.message}>
                检测到您之前有实体识别结果，请选择如何处理：
              </p>
              <div className={styles.options}>
                <button
                  className={styles.optionBtn}
                  onClick={onPreserveAndTranslate}
                >
                  <div className={styles.optionIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </div>
                  <div className={styles.optionInfo}>
                    <span className={styles.optionLabel}>保留实体设置</span>
                    <span className={styles.optionDesc}>保留之前的实体翻译，直接重新翻译</span>
                  </div>
                </button>

                <button
                  className={styles.optionBtn}
                  onClick={onReselectMode}
                >
                  <div className={styles.optionIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                  </div>
                  <div className={styles.optionInfo}>
                    <span className={styles.optionLabel}>重新选择模式</span>
                    <span className={styles.optionDesc}>清除实体数据，重新选择翻译模式</span>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <p className={styles.message}>
              确定要重新翻译当前内容吗？
            </p>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            取消
          </button>
          {!hasEntityData && (
            <button className={styles.confirmBtn} onClick={onReselectMode}>
              确认重新翻译
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RetranslateConfirmModal;
