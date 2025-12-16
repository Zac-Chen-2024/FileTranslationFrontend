import React, { useState } from 'react';
import './AIAssistantModal.css';
import { useLanguage } from '../../contexts/LanguageContext';

// API URL配置
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

const AIAssistantModal = ({
  isOpen,
  onClose,
  selectedTextboxes = [],
  onApply,
  entityGuidance = null
}) => {
  const { t } = useLanguage();
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [processingMode, setProcessingMode] = useState('unified');
  const [currentIndex, setCurrentIndex] = useState(0);

  const isMultiple = selectedTextboxes.length > 1;

  // 智能重排的固定提示词
  const SMART_REFORMAT_PROMPT = '不修改原文，只修正错误和缺失。用合理的换行让分段更合理，比如一段话或者一个子标题换一次行。给所有的标题加粗。';

  if (!isOpen) return null;

  // 提交修改指令
  const handleSubmit = async (customInstruction = null) => {
    const finalInstruction = customInstruction || instruction;

    if (!finalInstruction.trim()) {
      alert(t('enterModificationOpinion'));
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      const texts = selectedTextboxes.map(tb => tb.text);
      const token = localStorage.getItem('auth_token');

      // 构建增强的请求数据：包含OCR原文和实体指导
      const requestData = {
        texts: texts,
        instruction: finalInstruction,
        mode: processingMode,
        // 新增：OCR原文列表
        ocrTexts: selectedTextboxes.map(tb => ({
          regionId: tb.regionId ?? tb.regionIndex,
          text: tb.ocrOriginal || ''
        })),
        // 新增：实体指导信息
        entityGuidance: entityGuidance
      };

      const response = await fetch(`${API_URL}/api/ai-revise-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();

      if (data.success) {
        setResults(data.results);
        if (processingMode === 'individual') {
          setCurrentIndex(0);
        }
      } else {
        alert(t('aiProcessingFailed') + ': ' + (data.error || t('unknownError')));
      }
    } catch (error) {
      console.error(t('aiModificationFailed'), error);
      alert(t('networkError'));
    } finally {
      setLoading(false);
    }
  };

  // 处理智能重排
  const handleSmartReformat = async () => {
    await handleSubmit(SMART_REFORMAT_PROMPT);
  };

  // 采纳修改
  const handleAccept = () => {
    if (results.length === 0) return;

    if (processingMode === 'merge') {
      // 合并模式：返回合并后的文本，由外部处理合并逻辑
      onApply(results[0].revised, selectedTextboxes, 'merge');
    } else {
      // unified 或 individual 模式：分别更新每个文本框
      const updates = selectedTextboxes.map((tb, index) => ({
        textbox: tb,
        newText: results[index]?.revised || tb.text
      }));
      onApply(updates, selectedTextboxes, processingMode);
    }

    handleClose();
  };

  // 采纳当前项（individual模式）
  const handleAcceptCurrent = () => {
    const currentTextbox = selectedTextboxes[currentIndex];
    const currentResult = results[currentIndex];

    if (currentTextbox && currentResult) {
      onApply([{
        textbox: currentTextbox,
        newText: currentResult.revised
      }], [currentTextbox], 'individual');
    }

    // 移到下一个
    if (currentIndex < selectedTextboxes.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleClose();
    }
  };

  // 跳过当前项
  const handleSkipCurrent = () => {
    if (currentIndex < selectedTextboxes.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setInstruction('');
    setResults([]);
    setCurrentIndex(0);
    onClose();
  };

  // 返回输入重新修改
  const handleBackToInput = () => {
    setResults([]);
  };

  return (
    <div className={`ai-assistant-panel ${results.length > 0 ? 'has-results' : ''}`}>
      {/* 头部 */}
      <div className="ai-assistant-header">
        <div className="ai-assistant-title">
          <span className="ai-icon">✦</span>
          <span>{t('aiAssistant')}</span>
        </div>
        <button className="ai-assistant-close" onClick={handleClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* 内容区域 */}
      <div className="ai-assistant-content">
        {/* 输入界面 */}
        {!results.length && (
          <div className="ai-input-section">
            <button
              onClick={handleSmartReformat}
              disabled={loading || selectedTextboxes.length === 0}
              className="ai-quick-action"
            >
              <span className="quick-action-icon">✨</span>
              <span>智能重排</span>
            </button>

            <div className="ai-instruction-wrapper">
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="输入修改意见..."
                rows={3}
                disabled={loading}
                className="ai-instruction-input"
              />
            </div>

            <button
              onClick={() => handleSubmit()}
              disabled={loading || !instruction.trim()}
              className="ai-submit-btn"
            >
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  <span>处理中...</span>
                </>
              ) : (
                <span>提交修改</span>
              )}
            </button>
          </div>
        )}

        {/* 结果界面 */}
        {results.length > 0 && (
          <div className="ai-results-section">
            {/* 返回按钮 */}
            <button className="ai-back-btn" onClick={handleBackToInput}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M7.5 9L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>重新修改</span>
            </button>

            {processingMode === 'individual' ? (
              // Individual模式：逐个显示
              <div className="ai-single-result">
                <div className="result-progress">
                  <span className="progress-text">{currentIndex + 1} / {selectedTextboxes.length}</span>
                </div>

                <div className="result-comparison">
                  <div className="result-original">
                    <div className="result-label">原文</div>
                    <div className="result-text">{results[currentIndex]?.original}</div>
                  </div>
                  <div className="result-revised">
                    <div className="result-label">
                      <span className="revised-badge">修改后</span>
                    </div>
                    <div className="result-text">{results[currentIndex]?.revised}</div>
                  </div>
                </div>

                <div className="result-actions">
                  <button onClick={handleAcceptCurrent} className="action-btn primary">
                    采纳
                  </button>
                  <button onClick={handleSkipCurrent} className="action-btn secondary">
                    跳过
                  </button>
                </div>
              </div>
            ) : (
              // Unified模式
              <div className="ai-unified-results">
                <div className="results-scroll-area">
                  {results.map((result, index) => (
                    <div key={index} className="result-card">
                      {results.length > 1 && (
                        <div className="result-card-header">
                          <span className="result-index">#{index + 1}</span>
                        </div>
                      )}
                      <div className="result-comparison">
                        <div className="result-original">
                          <div className="result-label">原文</div>
                          <div className="result-text">{result.original}</div>
                        </div>
                        <div className="result-revised">
                          <div className="result-label">
                            <span className="revised-badge">修改后</span>
                          </div>
                          <div className="result-text">{result.revised}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="result-actions">
                  <button onClick={handleAccept} className="action-btn primary">
                    采纳全部
                  </button>
                  <button onClick={handleClose} className="action-btn secondary">
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAssistantModal;
