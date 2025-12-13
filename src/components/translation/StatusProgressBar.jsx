/**
 * StatusProgressBar - 统一进度显示组件
 *
 * 根据processingStep显示当前状态、描述和进度条
 */

import React from 'react';
import { ProcessingStep, STATUS_COLORS, PROCESSING_STATES, getStatusDisplay } from '../../constants/status';
import styles from './StatusProgressBar.module.css';

// 状态描述映射
const STEP_DESCRIPTIONS = {
  [ProcessingStep.UPLOADED]: '等待开始翻译',
  [ProcessingStep.SPLITTING]: '正在拆分PDF页面...',
  [ProcessingStep.SPLIT_COMPLETED]: '拆分完成，等待翻译',
  [ProcessingStep.TRANSLATING]: '正在进行OCR识别和翻译...',
  [ProcessingStep.TRANSLATED]: '基础翻译完成',
  [ProcessingStep.ENTITY_RECOGNIZING]: '正在识别实体（公司/机构名称）...',
  [ProcessingStep.ENTITY_PENDING_CONFIRM]: '请确认实体识别结果',
  [ProcessingStep.ENTITY_CONFIRMED]: '实体已确认，准备AI优化',
  [ProcessingStep.LLM_TRANSLATING]: '正在进行AI智能优化...',
  [ProcessingStep.LLM_TRANSLATED]: 'AI优化完成',
  [ProcessingStep.CONFIRMED]: '翻译已确认',
  [ProcessingStep.FAILED]: '处理失败，请重试',
};

/**
 * StatusProgressBar组件
 * @param {Object} props
 * @param {string} props.step - 当前处理步骤 (processingStep)
 * @param {number} props.progress - 进度百分比 (0-100)
 * @param {string} props.className - 额外的CSS类名
 */
const StatusProgressBar = ({ step, progress = 0, className = '' }) => {
  if (!step) return null;

  const statusDisplay = getStatusDisplay(step);
  const colors = STATUS_COLORS[step] || { bg: '#f5f5f5', text: '#757575' };
  const isProcessingState = PROCESSING_STATES.has(step);
  const description = STEP_DESCRIPTIONS[step] || statusDisplay;

  return (
    <div
      className={`${styles.statusBar} ${className}`}
      style={{ backgroundColor: colors.bg }}
    >
      <div className={styles.statusInfo}>
        <span className={styles.statusBadge} style={{ color: colors.text }}>
          {isProcessingState && (
            <svg className={styles.spinnerIcon} width="12" height="12" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeDasharray="31.4 31.4"
                strokeLinecap="round"
              />
            </svg>
          )}
          {statusDisplay}
        </span>
        <span className={styles.statusDescription}>{description}</span>
      </div>

      {progress > 0 && (
        <div className={styles.progressWrapper}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%`, backgroundColor: colors.text }}
            />
          </div>
          <span className={styles.progressText}>{progress}%</span>
        </div>
      )}
    </div>
  );
};

export default StatusProgressBar;
