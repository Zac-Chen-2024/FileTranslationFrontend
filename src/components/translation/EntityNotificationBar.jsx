import React, { useState } from 'react';
import './EntityNotificationBar.css';

const EntityNotificationBar = ({
  entities,
  mode,
  onConfirm,
  onSkip
}) => {
  const [editedEntities, setEditedEntities] = useState(
    entities.map(entity => ({
      chinese_name: entity.chinese_name || '',
      english_name: entity.english_name || '',
      source: entity.source || ''
    }))
  );

  const handleCellEdit = (index, field, value) => {
    const updated = [...editedEntities];
    updated[index][field] = value;
    setEditedEntities(updated);
  };

  const handleConfirm = () => {
    // 构建翻译指导格式
    const translationGuidance = {};
    editedEntities.forEach(entity => {
      if (entity.chinese_name && entity.english_name) {
        translationGuidance[entity.chinese_name] = entity.english_name;
      }
    });

    onConfirm(editedEntities, translationGuidance);
  };

  const isConfirmDisabled = () => {
    // 至少要有一个实体的中文名和英文名都填写了
    return !editedEntities.some(
      entity => entity.chinese_name && entity.english_name
    );
  };

  return (
    <div className="entity-notification-bar">
      <div className="entity-notification-header">
        <div className="entity-notification-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <span>实体识别结果 - {mode === 'standard' ? '标准模式' : '深度模式'}</span>
        </div>
        <div className="entity-notification-actions">
          <button className="entity-skip-btn" onClick={onSkip}>
            跳过
          </button>
          <button
            className="entity-confirm-btn"
            onClick={handleConfirm}
            disabled={isConfirmDisabled()}
          >
            确认使用
          </button>
        </div>
      </div>

      <div className="entity-table-container">
        <table className="entity-table">
          <thead>
            <tr>
              <th>公司中文名称</th>
              <th>公司英文名称</th>
              <th>公司名称来源</th>
            </tr>
          </thead>
          <tbody>
            {editedEntities.map((entity, index) => (
              <tr key={index}>
                <td>
                  <input
                    type="text"
                    value={entity.chinese_name}
                    onChange={(e) => handleCellEdit(index, 'chinese_name', e.target.value)}
                    placeholder="输入中文名称"
                    className="entity-input"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={entity.english_name}
                    onChange={(e) => handleCellEdit(index, 'english_name', e.target.value)}
                    placeholder={mode === 'standard' ? '请填写英文名称' : '编辑英文名称'}
                    className="entity-input"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={entity.source}
                    onChange={(e) => handleCellEdit(index, 'source', e.target.value)}
                    placeholder={mode === 'standard' ? '可选' : '编辑来源'}
                    className="entity-input entity-input-source"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="entity-notification-hint">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4"/>
          <path d="M12 8h.01"/>
        </svg>
        <span>
          {mode === 'standard'
            ? '请填写英文名称，确认后将应用于整个PDF文档的翻译'
            : '深度模式已自动填充，您可以编辑任何字段，确认后将应用于整个PDF文档的翻译'}
        </span>
      </div>
    </div>
  );
};

export default EntityNotificationBar;
