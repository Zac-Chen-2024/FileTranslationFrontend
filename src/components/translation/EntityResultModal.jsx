import React, { useState } from 'react';
import './EntityResultModal.css';

const EntityResultModal = ({
  isOpen,
  onClose,
  entities,
  onAIOptimize,
  onManualEdit,
  onSkip,
  loading,
  mode // 'fast_result', 'edit', 'ai_result'
}) => {
  const [editedEntities, setEditedEntities] = useState(
    entities.map(e => ({
      chinese_name: e.chinese_name,
      english_name: e.english_name || ''
    }))
  );

  if (!isOpen) return null;

  const handleEditChange = (index, value) => {
    const newEntities = [...editedEntities];
    newEntities[index].english_name = value;
    setEditedEntities(newEntities);
  };

  const handleConfirmEdit = () => {
    onManualEdit(editedEntities);
  };

  return (
    <div className="entity-result-overlay" onClick={onClose}>
      <div className="entity-result-content" onClick={(e) => e.stopPropagation()}>
        <div className="entity-result-header">
          <h3>
            {mode === 'fast_result' && '快速识别完成'}
            {mode === 'edit' && '编辑实体翻译'}
            {mode === 'ai_result' && 'AI优化完成'}
          </h3>
          <button className="entity-result-close" onClick={onClose}>×</button>
        </div>

        <div className="entity-result-body">
          {mode === 'fast_result' && (
            <>
              <p className="entity-result-desc">识别到以下实体：</p>
              <div className="entity-list">
                {entities.map((entity, index) => (
                  <div key={index} className="entity-item">
                    {entity.chinese_name}
                  </div>
                ))}
              </div>
            </>
          )}

          {(mode === 'edit' || mode === 'ai_result') && (
            <div className="entity-table">
              <div className="entity-table-header">
                <div className="entity-col-chinese">中文</div>
                <div className="entity-col-english">英文翻译</div>
              </div>
              {editedEntities.map((entity, index) => (
                <div key={index} className="entity-table-row">
                  <div className="entity-col-chinese">{entity.chinese_name}</div>
                  <div className="entity-col-english">
                    {mode === 'edit' ? (
                      <input
                        type="text"
                        value={entity.english_name}
                        onChange={(e) => handleEditChange(index, e.target.value)}
                        placeholder="输入英文翻译"
                        className="entity-input"
                      />
                    ) : (
                      <span>{entity.english_name}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="entity-result-footer">
          {mode === 'fast_result' && (
            <>
              <button className="entity-skip-btn" onClick={onSkip} disabled={loading}>
                跳过
              </button>
              <button className="entity-edit-btn" onClick={() => onManualEdit(entities)} disabled={loading}>
                人工编辑
              </button>
              <button className="entity-ai-btn" onClick={onAIOptimize} disabled={loading}>
                {loading ? 'AI优化中...' : 'AI优化'}
              </button>
            </>
          )}

          {mode === 'edit' && (
            <>
              <button className="entity-cancel-btn" onClick={onClose}>
                取消
              </button>
              <button className="entity-confirm-btn" onClick={handleConfirmEdit}>
                确认使用
              </button>
            </>
          )}

          {mode === 'ai_result' && (
            <>
              <button className="entity-edit-btn" onClick={() => onManualEdit(editedEntities)}>
                重新编辑
              </button>
              <button className="entity-confirm-btn" onClick={() => onManualEdit(editedEntities)}>
                使用这些翻译
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EntityResultModal;
