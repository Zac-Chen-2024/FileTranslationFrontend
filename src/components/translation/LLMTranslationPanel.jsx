import React, { useState, useEffect } from 'react';
import FabricImageEditor from './FabricImageEditor';
import './LLMTranslationPanel.css';

const LLMTranslationPanel = ({ material, onTranslationComplete }) => {
  const [loading, setLoading] = useState(false);
  const [llmTranslations, setLlmTranslations] = useState(null);
  const [llmRegions, setLlmRegions] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [error, setError] = useState(null);

  // 自动触发LLM翻译
  useEffect(() => {
    if (material && material.translationTextInfo) {
      // 如果已有LLM翻译结果，直接使用
      if (material.llmTranslationResult) {
        setLlmTranslations(material.llmTranslationResult);
        buildLLMRegions(material.llmTranslationResult, material.translationTextInfo);
      } else {
        // 否则自动调用LLM API优化翻译
        handleLLMTranslate();
      }
    }
  }, [material?.id]); // 只在material.id变化时触发

  const buildLLMRegions = (llmTranslations, baiduTextInfo) => {
    if (!llmTranslations || !baiduTextInfo || !baiduTextInfo.regions) {
      return;
    }

    // 将LLM翻译结果合并到regions中
    const updatedRegions = baiduTextInfo.regions.map(region => {
      const llmTranslation = llmTranslations.find(t => t.id === region.id);
      if (llmTranslation) {
        return {
          ...region,
          dst: llmTranslation.translation,
          original_dst: region.dst // 保存百度原始翻译
        };
      }
      return region;
    });

    setLlmRegions(updatedRegions);
  };

  const handleLLMTranslate = async () => {
    if (!material || !material.id) {
      setError('材料信息不完整');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      const response = await fetch(`/api/materials/${material.id}/llm-translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'LLM翻译失败');
      }

      const result = await response.json();

      if (result.success) {
        setLlmTranslations(result.llm_translations);
        buildLLMRegions(result.llm_translations, material.translationTextInfo);
        onTranslationComplete && onTranslationComplete(result.llm_translations);
      } else {
        throw new Error(result.error || 'LLM翻译失败');
      }
    } catch (error) {
      console.error('LLM翻译失败:', error);
      setError(error.message || 'LLM翻译失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 获取原始图片URL（用于编辑器）
  const getImageUrl = () => {
    if (!material) {
      return null;
    }
    // 使用原始图片路径，而不是翻译后的图片
    if (material.filePath) {
      return `/api/files/${material.filePath.split('/').pop()}`;
    }
    return null;
  };

  return (
    <div className="llm-translation-panel">
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>正在使用ChatGPT优化翻译...</p>
        </div>
      )}

      {llmRegions.length > 0 && !loading && (
        <div className="editor-section">
          <h4>🎨 自定义编辑 - LLM修正</h4>
          <div className="editor-description">
            使用ChatGPT智能优化的翻译结果
          </div>
          <FabricImageEditor
            imageSrc={getImageUrl()}
            regions={llmRegions}
            editorKey="llm"
            onExport={(url, blob) => {
              const link = document.createElement('a');
              link.href = url;
              link.download = `${material.name || 'llm-edited'}_AI优化.jpg`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              setTimeout(() => URL.revokeObjectURL(url), 100);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default LLMTranslationPanel;
