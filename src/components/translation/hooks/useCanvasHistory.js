import { useState, useRef, useCallback } from 'react';

/**
 * Canvas历史记录管理Hook
 * 提供撤销/重做功能
 *
 * @param {Object} fabricCanvasRef - fabric canvas的ref
 * @param {Function} onHistoryRestore - 历史恢复后的回调，用于更新对象引用
 * @param {number} maxHistory - 最大历史记录数量，默认50
 */
const useCanvasHistory = (fabricCanvasRef, onHistoryRestore, maxHistory = 50) => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const isHistoryOperationRef = useRef(false);

  // 更新撤销/重做按钮状态
  const updateHistoryButtons = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // 保存历史记录
  const saveHistory = useCallback(() => {
    if (!fabricCanvasRef.current || isHistoryOperationRef.current) return;

    const canvas = fabricCanvasRef.current;
    // 包含所有自定义属性以便正确恢复
    const customProperties = [
      // 基础标识
      'id', 'regionIndex', 'regionId',
      // 遮罩相关
      'isMask', 'isCustomMask', 'manuallyEdited', 'isMergedMask', 'mergedIndexes', 'originalBounds',
      // 文本相关
      'isMerged', '_markdownText', 'mergedBounds',
      // 背景相关
      'hasBackground', 'isBlurBackground',
      // 样式属性（确保字体样式也被保存）
      'fontFamily', 'fontSize', 'fill', 'textAlign', 'lineHeight', 'fontWeight', 'fontStyle'
    ];
    const currentState = JSON.stringify(canvas.toJSON(customProperties));

    // 如果当前不是最新的历史记录，删除后面的记录
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }

    // 添加新的历史记录
    historyRef.current.push(currentState);
    historyIndexRef.current++;

    // 限制历史记录数量
    if (historyRef.current.length > maxHistory) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }

    updateHistoryButtons();
  }, [fabricCanvasRef, maxHistory, updateHistoryButtons]);

  // 撤销操作
  const handleUndo = useCallback(() => {
    if (!fabricCanvasRef.current || historyIndexRef.current <= 0) return;

    const canvas = fabricCanvasRef.current;
    historyIndexRef.current--;
    isHistoryOperationRef.current = true;

    canvas.loadFromJSON(historyRef.current[historyIndexRef.current], () => {
      canvas.renderAll();
      isHistoryOperationRef.current = false;
      updateHistoryButtons();

      // 恢复后更新引用
      if (onHistoryRestore) {
        onHistoryRestore();
      }
    });
  }, [fabricCanvasRef, onHistoryRestore, updateHistoryButtons]);

  // 重做操作
  const handleRedo = useCallback(() => {
    if (!fabricCanvasRef.current || historyIndexRef.current >= historyRef.current.length - 1) return;

    const canvas = fabricCanvasRef.current;
    historyIndexRef.current++;
    isHistoryOperationRef.current = true;

    canvas.loadFromJSON(historyRef.current[historyIndexRef.current], () => {
      canvas.renderAll();
      isHistoryOperationRef.current = false;
      updateHistoryButtons();

      // 恢复后更新引用
      if (onHistoryRestore) {
        onHistoryRestore();
      }
    });
  }, [fabricCanvasRef, onHistoryRestore, updateHistoryButtons]);

  // 清空历史记录
  const clearHistory = useCallback(() => {
    historyRef.current = [];
    historyIndexRef.current = -1;
    updateHistoryButtons();
  }, [updateHistoryButtons]);

  // 检查是否正在执行历史操作（外部可用于判断是否跳过某些操作）
  const isHistoryOperation = useCallback(() => {
    return isHistoryOperationRef.current;
  }, []);

  return {
    canUndo,
    canRedo,
    saveHistory,
    handleUndo,
    handleRedo,
    clearHistory,
    isHistoryOperation,
  };
};

export default useCanvasHistory;
