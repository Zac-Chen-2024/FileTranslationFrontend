import React, { useState, useEffect } from 'react';
import './EntityRecognitionModal.css';

const EntityRecognitionModal = ({
  isOpen,
  onClose,
  onConfirm,
  hasExistingEntityResult = false,  // 是否有先前的实体识别结果
  isRetranslate = false  // 是否为重新翻译流程
}) => {
  const [mode, setMode] = useState('standard'); // 'disabled', 'standard', 'deep', 'preserve'

  // 当弹窗打开时，如果是重译且有先前结果，默认选择保留
  useEffect(() => {
    if (isOpen && isRetranslate && hasExistingEntityResult) {
      setMode('preserve');
    } else if (isOpen) {
      setMode('standard');
    }
  }, [isOpen, isRetranslate, hasExistingEntityResult]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(mode);
    onClose();
  };

  // 是否显示保留选项
  const showPreserveOption = isRetranslate && hasExistingEntityResult;

  return (
    <div className="entity-modal-overlay" onClick={onClose}>
      <div className="entity-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="entity-modal-header">
          <h3>{isRetranslate ? '重新翻译' : '实体识别'}</h3>
          <button className="entity-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="entity-modal-body">
          <p className="entity-modal-desc">
            {isRetranslate
              ? '选择实体识别方式'
              : '识别公司/品牌名称，获取官方英文翻译'}
          </p>

          <div className="entity-mode-switch">
            {/* 保留先前结果选项 - 仅在重译时显示 */}
            {showPreserveOption && (
              <button
                className={`mode-option mode-preserve ${mode === 'preserve' ? 'active' : ''}`}
                onClick={() => setMode('preserve')}
              >
                <div className="mode-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <path d="m9 12 2 2 4-4"/>
                  </svg>
                </div>
                <div className="mode-label">保留先前结果</div>
                <div className="mode-badge mode-badge-green">推荐</div>
              </button>
            )}

            <button
              className={`mode-option ${mode === 'disabled' ? 'active' : ''}`}
              onClick={() => setMode('disabled')}
            >
              <div className="mode-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="m4.93 4.93 14.14 14.14"/>
                </svg>
              </div>
              <div className="mode-label">不启用</div>
            </button>

            <button
              className={`mode-option ${mode === 'standard' ? 'active' : ''}`}
              onClick={() => setMode('standard')}
            >
              <div className="mode-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m13 2-2 2.5L13 7"/>
                  <path d="M10 14 8 12l2-2"/>
                  <path d="m14 14 2-2-2-2"/>
                  <path d="m5 10 2-2-2-2"/>
                  <path d="M3 3v18h18"/>
                  <path d="M7.5 15.5 13 10l4 4"/>
                </svg>
              </div>
              <div className="mode-label">{showPreserveOption ? '重新识别' : '标准模式'}</div>
            </button>

            <button
              className="mode-option mode-disabled"
              disabled={true}
              title="功能开发中，敬请期待"
            >
              <div className="mode-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                  <circle cx="11" cy="11" r="5"/>
                  <circle cx="11" cy="11" r="2"/>
                </svg>
              </div>
              <div className="mode-label">深度模式</div>
              <div className="mode-badge">即将推出</div>
            </button>
          </div>

          <div className="entity-mode-description">
            {mode === 'preserve' && (
              <p>使用先前识别的实体结果，直接进行LLM翻译优化</p>
            )}
            {mode === 'disabled' && (
              <p>直接进行LLM翻译，不识别专有名词</p>
            )}
            {mode === 'standard' && (
              <p>{showPreserveOption ? '重新进行实体识别，覆盖先前结果' : '快速识别实体，可手动调整（推荐）'}</p>
            )}
          </div>
        </div>

        <div className="entity-modal-footer">
          <button className="entity-cancel-btn" onClick={onClose}>
            取消
          </button>
          <button className="entity-confirm-btn" onClick={handleConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
};

export default EntityRecognitionModal;
