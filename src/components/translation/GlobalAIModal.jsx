import React, { useState } from 'react';
import './GlobalAIModal.css';
import { useLanguage } from '../../contexts/LanguageContext';

// API URL配置
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

const GlobalAIModal = ({ isOpen, onClose, allTextboxes, onApply }) => {
  const { t } = useLanguage();
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndexes, setSelectedIndexes] = useState(new Set());

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!instruction.trim()) {
      alert(t('enterRequirement'));
      return;
    }

    setLoading(true);
    setSuggestions([]);

    try {
      const texts = allTextboxes.map(tb => tb.text);
      const token = localStorage.getItem('auth_token');

      const response = await fetch(`${API_URL}/api/ai-global-optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          texts: texts,
          taskType: 'custom',
          instruction: instruction
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuggestions(data.suggestions);
        // 默认选中所有有修改的项
        const changedIndexes = new Set(
          data.suggestions
            .filter(s => s.revised !== s.original)
            .map(s => s.index)
        );
        setSelectedIndexes(changedIndexes);
      } else {
        alert('全局优化失败: ' + (data.error || '未知错误'));
      }
    } catch (error) {
      console.error('全局优化错误:', error);
      alert('全局优化失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelection = (index) => {
    const newSet = new Set(selectedIndexes);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedIndexes(newSet);
  };

  const handleApply = () => {
    const updates = [];
    suggestions.forEach(suggestion => {
      if (selectedIndexes.has(suggestion.index)) {
        updates.push({
          textbox: allTextboxes[suggestion.index],
          newText: suggestion.revised
        });
      }
    });

    if (updates.length === 0) {
      alert(t('selectAtLeastOne'));
      return;
    }

    onApply(updates);
    handleClose();
  };

  const handleClose = () => {
    setInstruction('');
    setSuggestions([]);
    setSelectedIndexes(new Set());
    onClose();
  };

  const hasChanges = suggestions.some(s => s.revised !== s.original);

  return (
    <div className="global-ai-overlay" onClick={handleClose}>
      <div className="global-ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="global-ai-header">
          <h3>{t('globalAssistantEdit')}</h3>
          <button className="global-ai-close" onClick={handleClose}>×</button>
        </div>

        <div className="global-ai-body">
          {!suggestions.length && (
            <>
              <div className="instruction-input">
                <label>{t('modificationRequirement')}</label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={t('modificationRequirementPlaceholder')}
                  rows={4}
                  disabled={loading}
                />
              </div>

              <div className="text-count-info">
                <span>{t('willProcess', { count: allTextboxes.length })}</span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="global-submit-btn"
              >
                {loading ? t('analyzing') : t('startAnalysis')}
              </button>
            </>
          )}

          {suggestions.length > 0 && (
            <>
              <div className="suggestions-header">
                <h4>{t('optimizationSuggestions')}</h4>
                {hasChanges ? (
                  <span className="changes-count">
                    {t('foundSuggestions', { count: suggestions.filter(s => s.revised !== s.original).length })}
                  </span>
                ) : (
                  <span className="no-changes">{t('noChangesNeeded')}</span>
                )}
              </div>

              <div className="suggestions-list">
                {suggestions.map((suggestion, idx) => {
                  const hasChange = suggestion.revised !== suggestion.original;
                  if (!hasChange) return null;

                  return (
                    <div key={idx} className="suggestion-item">
                      <div className="suggestion-header">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedIndexes.has(suggestion.index)}
                            onChange={() => handleToggleSelection(suggestion.index)}
                          />
                          <span>文本框 {suggestion.index + 1}</span>
                        </label>
                        {suggestion.changes && (
                          <span className="change-note">{suggestion.changes}</span>
                        )}
                      </div>

                      <div className="suggestion-comparison">
                        <div className="suggestion-original">
                          <label>原文</label>
                          <p>{suggestion.original}</p>
                        </div>
                        <div className="suggestion-arrow">→</div>
                        <div className="suggestion-revised">
                          <label>建议</label>
                          <p>{suggestion.revised}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="suggestions-actions">
                <button onClick={handleApply} className="apply-btn" disabled={selectedIndexes.size === 0}>
                  应用选中的修改 ({selectedIndexes.size})
                </button>
                <button onClick={handleClose} className="cancel-btn">
                  取消
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalAIModal;
