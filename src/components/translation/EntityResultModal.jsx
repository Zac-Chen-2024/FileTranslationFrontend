import React, { useState, useEffect } from 'react';
import './EntityResultModal.css';

const EntityResultModal = ({
  isOpen,
  onClose,
  entities,
  onAIOptimize,
  onConfirm,
  onSkip,
  loading
}) => {
  const [editedEntities, setEditedEntities] = useState([]);

  // 当 entities 改变时更新表格数据
  useEffect(() => {
    if (entities && entities.length > 0) {
      setEditedEntities(
        entities.map(e => ({
          chinese_name: e.chinese_name || e.entity || '',
          english_name: e.english_name || '',
          evidence: e.source || e.evidence || ''
        }))
      );
    }
  }, [entities]);

  if (!isOpen) return null;

  const handleFieldChange = (index, field, value) => {
    const newEntities = [...editedEntities];
    newEntities[index][field] = value;
    setEditedEntities(newEntities);
  };

  const handleAddRow = () => {
    setEditedEntities([
      ...editedEntities,
      { chinese_name: '', english_name: '', evidence: '' }
    ]);
  };

  const handleDeleteRow = (index) => {
    const newEntities = editedEntities.filter((_, i) => i !== index);
    setEditedEntities(newEntities);
  };

  const handleConfirm = () => {
    // 过滤掉空行（中文名为空的行）
    const validEntities = editedEntities.filter(e => e.chinese_name.trim() !== '');
    onConfirm(validEntities);
  };

  const handleAIOptimize = () => {
    // 传递当前的实体列表给 AI 优化
    const validEntities = editedEntities.filter(e => e.chinese_name.trim() !== '');
    onAIOptimize(validEntities);
  };

  return (
    <div className="entity-result-overlay" onClick={onClose}>
      <div className="entity-result-content" onClick={(e) => e.stopPropagation()}>
        <div className="entity-result-header">
          <h3>实体识别结果</h3>
          <button className="entity-result-close" onClick={onClose}>×</button>
        </div>

        <div className="entity-result-body">
          <p className="entity-result-desc">
            请编辑实体翻译信息，或点击"AI优化"自动查找官方英文名称
          </p>

          <div className="entity-editable-table">
            <div className="entity-table-header">
              <div className="entity-col-chinese">中文名</div>
              <div className="entity-col-english">英文名</div>
              <div className="entity-col-evidence">证据/来源</div>
              <div className="entity-col-actions">操作</div>
            </div>

            {editedEntities.map((entity, index) => (
              <div key={index} className="entity-table-row">
                <div className="entity-col-chinese">
                  <input
                    type="text"
                    value={entity.chinese_name}
                    onChange={(e) => handleFieldChange(index, 'chinese_name', e.target.value)}
                    placeholder="输入中文名"
                    className="entity-input"
                  />
                </div>
                <div className="entity-col-english">
                  <input
                    type="text"
                    value={entity.english_name}
                    onChange={(e) => handleFieldChange(index, 'english_name', e.target.value)}
                    placeholder="输入英文名"
                    className="entity-input"
                  />
                </div>
                <div className="entity-col-evidence">
                  <input
                    type="text"
                    value={entity.evidence}
                    onChange={(e) => handleFieldChange(index, 'evidence', e.target.value)}
                    placeholder="证据或来源"
                    className="entity-input"
                  />
                </div>
                <div className="entity-col-actions">
                  <button
                    className="entity-delete-btn"
                    onClick={() => handleDeleteRow(index)}
                    title="删除此行"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            <button className="entity-add-row-btn" onClick={handleAddRow}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              添加实体
            </button>
          </div>
        </div>

        <div className="entity-result-footer">
          <button className="entity-skip-btn" onClick={onSkip} disabled={loading}>
            跳过
          </button>
          <button className="entity-ai-btn" onClick={handleAIOptimize} disabled={loading}>
            {loading ? 'AI优化中...' : 'AI优化'}
          </button>
          <button className="entity-confirm-btn" onClick={handleConfirm} disabled={loading}>
            确认使用
          </button>
        </div>
      </div>
    </div>
  );
};

export default EntityResultModal;
