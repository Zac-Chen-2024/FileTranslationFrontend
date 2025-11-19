import React, { useState } from 'react';
import './EntityRecognitionModal.css';

const EntityRecognitionModal = ({ isOpen, onClose, onConfirm }) => {
  const [mode, setMode] = useState('standard'); // 'disabled', 'standard', 'deep'

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(mode);
    onClose();
  };

  return (
    <div className="entity-modal-overlay" onClick={onClose}>
      <div className="entity-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="entity-modal-header">
          <h3>实体识别</h3>
          <button className="entity-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="entity-modal-body">
          <p className="entity-modal-desc">识别公司/品牌名称，获取官方英文翻译</p>

          <div className="entity-mode-switch">
            <button
              className={`mode-option ${mode === 'disabled' ? 'active' : ''}`}
              onClick={() => setMode('disabled')}
            >
              <div className="mode-icon">🚫</div>
              <div className="mode-label">不启用</div>
            </button>

            <button
              className={`mode-option ${mode === 'standard' ? 'active' : ''}`}
              onClick={() => setMode('standard')}
            >
              <div className="mode-icon">⚡</div>
              <div className="mode-label">标准模式</div>
            </button>

            <button
              className={`mode-option ${mode === 'deep' ? 'active' : ''}`}
              onClick={() => setMode('deep')}
            >
              <div className="mode-icon">🔍</div>
              <div className="mode-label">深度模式</div>
            </button>
          </div>

          <div className="entity-mode-description">
            {mode === 'disabled' && (
              <p>直接进行LLM翻译，不识别专有名词</p>
            )}
            {mode === 'standard' && (
              <p>快速识别实体，可手动调整（推荐）</p>
            )}
            {mode === 'deep' && (
              <p>全自动深度搜索，耗时30-120秒</p>
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
