import React, { useState } from 'react';
import './AIAssistantModal.css';

// API URL配置
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

const AIAssistantModal = ({
  isOpen,
  onClose,
  selectedTextboxes = [],
  onApply
}) => {
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [processingMode, setProcessingMode] = useState('unified');
  const [currentIndex, setCurrentIndex] = useState(0);

  const isMultiple = selectedTextboxes.length > 1;

  if (!isOpen) return null;

  // 提交修改指令
  const handleSubmit = async () => {
    if (!instruction.trim()) {
      alert('请输入修改意见');
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      const texts = selectedTextboxes.map(tb => tb.text);
      const token = localStorage.getItem('auth_token');

      const response = await fetch(`${API_URL}/api/ai-revise-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          texts: texts,
          instruction: instruction,
          mode: processingMode
        })
      });

      const data = await response.json();

      if (data.success) {
        setResults(data.results);
        if (processingMode === 'individual') {
          setCurrentIndex(0);
        }
      } else {
        alert('AI处理失败: ' + (data.error || '未知错误'));
      }
    } catch (error) {
      console.error('AI修改失败:', error);
      alert('网络错误，请重试');
    } finally {
      setLoading(false);
    }
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

  // 获取占位符文本
  const getPlaceholder = () => {
    if (!isMultiple) {
      return '例如：改得更简洁、改为正式语气、修正语法错误';
    }

    switch (processingMode) {
      case 'unified':
        return '例如：把所有文本改得更简洁';
      case 'merge':
        return '例如：合并后改为更连贯的表达';
      case 'individual':
        return '例如：逐个检查并优化';
      default:
        return '';
    }
  };

  return (
    <div className="ai-panel-content">
      <div className="ai-panel-header">
        <span className="ai-panel-title">AI助手</span>
        <button className="ai-panel-close" onClick={handleClose}>×</button>
      </div>

      <div className="ai-panel-body">
          {/* 多选时显示处理模式选择 */}
          {isMultiple && !results.length && (
            <div className="processing-mode-section">
              <h4>已选中 {selectedTextboxes.length} 个文本框</h4>
              <div className="mode-options">
                <label className={processingMode === 'unified' ? 'active' : ''}>
                  <input
                    type="radio"
                    value="unified"
                    checked={processingMode === 'unified'}
                    onChange={(e) => setProcessingMode(e.target.value)}
                  />
                  <div className="mode-content">
                    <strong>统一修改</strong>
                    <span>对每个文本框应用相同的修改指令</span>
                  </div>
                </label>

                <label className={processingMode === 'merge' ? 'active' : ''}>
                  <input
                    type="radio"
                    value="merge"
                    checked={processingMode === 'merge'}
                    onChange={(e) => setProcessingMode(e.target.value)}
                  />
                  <div className="mode-content">
                    <strong>合并后修改</strong>
                    <span>先合并为一个文本框，再进行优化</span>
                  </div>
                </label>

                <label className={processingMode === 'individual' ? 'active' : ''}>
                  <input
                    type="radio"
                    value="individual"
                    checked={processingMode === 'individual'}
                    onChange={(e) => setProcessingMode(e.target.value)}
                  />
                  <div className="mode-content">
                    <strong>逐个修改</strong>
                    <span>分别查看和处理每个文本框</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* 输入区域 */}
          {!results.length && (
            <div className="instruction-section">
              <label>修改意见（用自然语言描述）</label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={getPlaceholder()}
                rows={4}
                disabled={loading}
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !instruction.trim()}
                className="submit-button"
              >
                {loading ? '处理中...' : '提交修改'}
              </button>
            </div>
          )}

          {/* 对比结果 */}
          {results.length > 0 && (
            <div className="results-section">
              {processingMode === 'individual' ? (
                // Individual模式：逐个显示
                <div className="individual-result">
                  <div className="progress-bar">
                    <span>进度: {currentIndex + 1} / {selectedTextboxes.length}</span>
                  </div>

                  <div className="comparison">
                    <div className="original-version">
                      <h4>原始版本</h4>
                      <p>{results[currentIndex]?.original}</p>
                    </div>

                    <div className="arrow">→</div>

                    <div className="revised-version">
                      <h4>修改后</h4>
                      <p>{results[currentIndex]?.revised}</p>
                    </div>
                  </div>

                  <div className="individual-actions">
                    <button onClick={handleAcceptCurrent} className="accept-button">
                      ✓ 采纳此修改
                    </button>
                    <button onClick={handleSkipCurrent} className="skip-button">
                      跳过
                    </button>
                  </div>
                </div>
              ) : (
                // Unified或Merge模式：显示所有结果
                <div className="unified-results">
                  {processingMode === 'merge' ? (
                    // 合并模式：显示一个大的对比
                    <div className="comparison large">
                      <div className="original-version">
                        <h4>合并前（{selectedTextboxes.length}个文本框）</h4>
                        <p>{results[0]?.original}</p>
                      </div>

                      <div className="arrow">→</div>

                      <div className="revised-version">
                        <h4>合并并修改后</h4>
                        <p>{results[0]?.revised}</p>
                      </div>
                    </div>
                  ) : (
                    // 统一修改模式：显示列表
                    <div className="results-list">
                      {results.map((result, index) => (
                        <div key={index} className="result-item">
                          <div className="result-header">
                            文本框 {index + 1}
                          </div>
                          <div className="comparison">
                            <div className="original-version">
                              <label>原始:</label>
                              <p>{result.original}</p>
                            </div>
                            <div className="arrow">→</div>
                            <div className="revised-version">
                              <label>修改后:</label>
                              <p>{result.revised}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="unified-actions">
                    <button onClick={handleAccept} className="accept-all-button">
                      ✓ 采纳所有修改
                    </button>
                    <button onClick={handleClose} className="cancel-button">
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
