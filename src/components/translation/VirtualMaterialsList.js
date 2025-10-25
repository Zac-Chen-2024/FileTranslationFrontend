import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { materialAPI } from '../../services/api';
import styles from './MaterialsList.module.css';

// 虚拟滚动配置
const ITEM_HEIGHT = 110; // 每个材料项的高度（考虑多行文字：padding 12px*2 + border 2px + 文件名最多3-4行 + 元信息20px + 间距）
const ITEM_GAP = 10; // 项目之间的间距
const BUFFER_SIZE = 5; // 缓冲区大小，提前渲染的项目数
const SCROLL_DEBOUNCE = 10; // 滚动防抖延迟

// 获取类型标签的辅助函数
const getTypeLabel = (type, isPdfSession = false) => {
  if (isPdfSession) {
    return 'PDF文档';
  }
  const typeLabels = {
    pdf: 'PDF文档',
    image: '图片',
    webpage: '网页',
    document: '文档'
  };
  return typeLabels[type] || type;
};

// 单个材料项组件
const VirtualMaterialItem = React.memo(({ 
  material, 
  isActive,
  isSelected,
  onSelect, 
  onDelete,
  onCheckboxChange,
  style 
}) => {
  const handleClick = useCallback(() => {
    onSelect(material);
  }, [material, onSelect]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete(material, e);
  }, [material, onDelete]);

  const handleCheckboxClick = useCallback((e) => {
    e.stopPropagation();
    onCheckboxChange(e, material.id);
  }, [material.id, onCheckboxChange]);

  return (
    <div
      style={style}
      className={`${styles.materialItem} ${styles.virtualItem} ${
        isActive ? styles.active : ''
      } ${material.confirmed ? styles.confirmed : ''} ${
        isSelected ? styles.selected : ''
      }`}
      onClick={handleClick}
    >
      <input
        type="checkbox"
        className={styles.materialCheckbox}
        checked={isSelected}
        onChange={handleCheckboxClick}
        onClick={(e) => e.stopPropagation()}
      />
      <div className={styles.materialContent}>
        <div className={styles.materialTop}>
          <div className={styles.materialName}>
            {material.name}
            {material.isPdfSession && material.pdfTotalPages && (
              <span className={styles.pdfPageCount}> ({material.pdfTotalPages}页)</span>
            )}
          </div>
        </div>
        <div className={styles.materialMeta}>
          <span className={styles.materialType}>{getTypeLabel(material.type, material.isPdfSession)}</span>
          <span className={styles.materialStatus}>{material.status}</span>
        </div>
      </div>
      <button
        className={styles.deleteMaterialBtn}
        onClick={handleDelete}
        title="删除材料"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          <path d="M10 11v6M14 11v6"/>
        </svg>
      </button>
      {material.confirmed && (
        <div className={styles.confirmedIcon}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </div>
  );
});


const VirtualMaterialsList = ({ onAddMaterial, onExport, clientName, onFilesDropped }) => {
  const { state, actions } = useApp();
  const { t } = useLanguage();
  const { materials, currentClient, currentMaterial } = state;

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);
  const [selectedMaterials, setSelectedMaterials] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const scrollContainerRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const dragCounter = useRef(0);

  // 使用useMemo优化材料列表的计算 - 包含PDF合并逻辑
  const clientMaterials = useMemo(() => {
    const filtered = materials.filter(m => m.clientId === currentClient?.cid);

    // 先收集PDF会话
    const pdfSessions = new Map();
    const nonPdfMaterials = [];

    filtered.forEach(material => {
      if (material.pdfSessionId) {
        if (!pdfSessions.has(material.pdfSessionId)) {
          // 使用第一页作为代表,但修改名称去掉页码
          const baseName = material.name.replace(/ - 第\d+页$/, '');
          const sessionMaterial = {
            ...material,
            id: material.pdfSessionId, // 使用session ID作为唯一标识
            name: baseName,
            isPdfSession: true,
            pdfTotalPages: material.pdfTotalPages,
            // 收集该会话的所有页面
            pages: []
          };
          pdfSessions.set(material.pdfSessionId, sessionMaterial);
        }
        // 添加页面到会话
        pdfSessions.get(material.pdfSessionId).pages.push(material);
      } else {
        nonPdfMaterials.push(material);
      }
    });

    // 更新PDF会话的状态（基于所有页面的状态）
    pdfSessions.forEach(sessionMaterial => {
      const pages = sessionMaterial.pages;

      // 计算整体状态
      const allTranslated = pages.every(p => p.status === '已翻译' || p.status === '翻译完成');
      const anyProcessing = pages.some(p => p.status === '处理中' || p.status === '正在翻译');
      const anyFailed = pages.some(p => p.status === '翻译失败');
      const allConfirmed = pages.every(p => p.confirmed);

      if (allConfirmed) {
        sessionMaterial.status = '已确认';
        sessionMaterial.confirmed = true;
      } else if (allTranslated) {
        sessionMaterial.status = '已翻译';
      } else if (anyProcessing) {
        sessionMaterial.status = '处理中';
      } else if (anyFailed) {
        sessionMaterial.status = '部分失败';
      } else {
        sessionMaterial.status = pages[0].status;
      }

      // 对页面按页码排序
      pages.sort((a, b) => a.pdfPageNumber - b.pdfPageNumber);

      // 始终使用第一页（按页码顺序）
      const firstPage = pages[0];
      sessionMaterial.translatedImagePath = firstPage.translatedImagePath;
      sessionMaterial.currentPage = firstPage; // 保存第一页供点击时使用
    });

    // 合并PDF会话和普通材料
    const allMaterials = [...Array.from(pdfSessions.values()), ...nonPdfMaterials];

    // 对非PDF材料进行去重
    return allMaterials.reduce((unique, material) => {
      if (material.isPdfSession) {
        unique.push(material);
        return unique;
      }

      const existing = unique.find(m => !m.isPdfSession && m.name === material.name);
      if (!existing) {
        unique.push(material);
      } else {
        // 如果有同名材料，优先保留翻译完成的或更新时间更晚的
        const shouldReplace =
          (material.status === '翻译完成' && existing.status !== '翻译完成') ||
          (material.status === existing.status && new Date(material.updatedAt) > new Date(existing.updatedAt)) ||
          (material.translatedImagePath && !existing.translatedImagePath);

        if (shouldReplace) {
          const index = unique.indexOf(existing);
          unique[index] = material;
        }
      }
      return unique;
    }, []);
  }, [materials, currentClient?.cid]);

  // 计算虚拟滚动参数（包含间距）
  const itemWithGapHeight = ITEM_HEIGHT + ITEM_GAP;
  const totalHeight = clientMaterials.length * itemWithGapHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemWithGapHeight) - BUFFER_SIZE);
  const endIndex = Math.min(
    clientMaterials.length,
    Math.ceil((scrollTop + containerHeight) / itemWithGapHeight) + BUFFER_SIZE
  );
  const visibleItems = clientMaterials.slice(startIndex, endIndex);
  const offsetY = startIndex * itemWithGapHeight;

  // 处理滚动事件
  const handleScroll = useCallback((e) => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      setScrollTop(e.target.scrollTop);
    }, SCROLL_DEBOUNCE);
  }, []);

  // 监听容器尺寸变化
  useEffect(() => {
    const handleResize = () => {
      if (scrollContainerRef.current) {
        setContainerHeight(scrollContainerRef.current.clientHeight);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleMaterialSelect = useCallback((material) => {
    // 如果是PDF会话,选择第一页
    if (material.isPdfSession && material.currentPage) {
      actions.setCurrentMaterial(material.currentPage);
    } else {
      actions.setCurrentMaterial(material);
    }
  }, [actions]);

  const handleDeleteMaterial = useCallback(async (material, e) => {
    const deleteMessage = material.isPdfSession
      ? `确定要删除PDF "${material.name}" 的所有 ${material.pdfTotalPages} 页吗？`
      : `确定要删除材料 "${material.name}" 吗？`;

    actions.openConfirmDialog({
      title: '删除材料',
      message: deleteMessage,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          if (material.isPdfSession) {
            // 删除PDF会话的所有页面
            const deletePromises = material.pages.map(page => materialAPI.deleteMaterial(page.id));
            await Promise.all(deletePromises);

            actions.showNotification('删除成功', `PDF ${material.name} 的所有页面已删除`, 'success');

            // 从本地状态中移除所有页面
            const pageIds = material.pages.map(p => p.id);
            const updatedMaterials = materials.filter(m => !pageIds.includes(m.id));
            actions.setMaterials(updatedMaterials);

            // 如果删除的页面中包含当前选中的材料，清除选择
            if (currentMaterial && pageIds.includes(currentMaterial.id)) {
              actions.setCurrentMaterial(null);
            }
          } else {
            // 删除单个材料
            await materialAPI.deleteMaterial(material.id);
            actions.showNotification('删除成功', `材料 ${material.name} 已删除`, 'success');

            // 从本地状态中移除材料
            const updatedMaterials = materials.filter(m => m.id !== material.id);
            actions.setMaterials(updatedMaterials);

            // 如果删除的是当前选中的材料，清除选择
            if (currentMaterial?.id === material.id) {
              actions.setCurrentMaterial(null);
            }
          }
        } catch (error) {
          actions.showNotification('删除失败', error.message || '删除材料时出现错误', 'error');
        }
      }
    });
  }, [actions, materials, currentMaterial]);

  // 处理复选框变化
  const handleCheckboxChange = useCallback((e, materialId) => {
    setSelectedMaterials(prev => {
      const newSet = new Set(prev);
      if (newSet.has(materialId)) {
        newSet.delete(materialId);
      } else {
        newSet.add(materialId);
      }
      return newSet;
    });
  }, []);

  // 批量确认
  const handleBatchConfirm = useCallback(async () => {
    const selectedList = Array.from(selectedMaterials);

    // 展开PDF会话中的所有页面
    const materialsToConfirm = [];
    clientMaterials.forEach(m => {
      if (selectedList.includes(m.id)) {
        if (m.isPdfSession) {
          // 添加PDF会话的所有页面
          m.pages.forEach(page => {
            if ((page.status === '翻译完成' || page.status === '已翻译') && !page.confirmed) {
              materialsToConfirm.push(page);
            }
          });
        } else if ((m.status === '翻译完成' || m.status === '已翻译') && !m.confirmed) {
          materialsToConfirm.push(m);
        }
      }
    });

    const confirmableMaterials = materialsToConfirm;

    if (confirmableMaterials.length === 0) {
      actions.showNotification('提示', '没有可确认的材料', 'warning');
      return;
    }

    actions.openConfirmDialog({
      title: '批量确认',
      message: `确定要确认 ${confirmableMaterials.length} 个材料吗？`,
      type: 'primary',
      confirmText: '确认',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          // 批量确认API调用
          const promises = confirmableMaterials.map(material => 
            materialAPI.confirmMaterial(material.id)
          );
          
          await Promise.all(promises);
          
          // 更新本地状态
          confirmableMaterials.forEach(material => {
            actions.updateMaterial(material.id, { 
              confirmed: true,
              status: '已确认'
            });
          });
          
          actions.showNotification('批量确认成功', `已确认 ${confirmableMaterials.length} 个材料`, 'success');
          setSelectedMaterials(new Set());
        } catch (error) {
          actions.showNotification('批量确认失败', error.message || '操作过程中出现错误', 'error');
        }
      }
    });
  }, [selectedMaterials, clientMaterials, actions]);

  // 拖拽事件处理
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && onFilesDropped) {
      onFilesDropped(files);
    }
  }, [onFilesDropped]);

  // 批量删除
  const handleBatchDelete = useCallback(async () => {
    const selectedList = Array.from(selectedMaterials);
    if (selectedList.length === 0) {
      actions.showNotification('提示', '请选择要删除的材料', 'warning');
      return;
    }

    // 展开PDF会话中的所有页面
    const idsToDelete = [];
    clientMaterials.forEach(m => {
      if (selectedList.includes(m.id)) {
        if (m.isPdfSession) {
          // 添加PDF会话的所有页面ID
          m.pages.forEach(page => idsToDelete.push(page.id));
        } else {
          idsToDelete.push(m.id);
        }
      }
    });

    actions.openConfirmDialog({
      title: '批量删除',
      message: `确定要删除 ${selectedList.length} 个项目吗？此操作不可恢复。`,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          // 批量删除API调用
          const promises = idsToDelete.map(id =>
            materialAPI.deleteMaterial(id)
          );

          await Promise.all(promises);

          // 更新本地状态
          const updatedMaterials = materials.filter(m => !idsToDelete.includes(m.id));
          actions.setMaterials(updatedMaterials);

          // 如果删除了当前选中的材料
          if (currentMaterial && idsToDelete.includes(currentMaterial.id)) {
            actions.setCurrentMaterial(null);
          }

          actions.showNotification('批量删除成功', `已删除 ${selectedList.length} 个项目`, 'success');
          setSelectedMaterials(new Set());
        } catch (error) {
          actions.showNotification('批量删除失败', error.message || '操作过程中出现错误', 'error');
        }
      }
    });
  }, [selectedMaterials, materials, currentMaterial, actions, clientMaterials]);

  if (clientMaterials.length === 0) {
    return (
      <div
        className={`${styles.materialsSection} ${isDragging ? styles.dragging : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{clientName}的材料列表</h3>
          <div className={styles.actions}>
            <button
              className={`${styles.actionBtn} ${styles.btnAdd}`}
              onClick={onAddMaterial}
            >
              添加
            </button>
            <button
              className={`${styles.actionBtn} ${styles.btnExport}`}
              onClick={onExport}
              disabled={true}
              title="没有材料可导出"
            >
              导出
            </button>
          </div>
        </div>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h4 className={styles.emptyTitle}>暂无材料</h4>
          <p className={styles.emptyDescription}>
            为 {currentClient?.name} 添加翻译材料
          </p>
        </div>

        {/* 拖拽悬浮提示 */}
        {isDragging && (
          <div className={styles.dragOverlay}>
            <div className={styles.dragOverlayContent}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <p>释放文件以上传</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${styles.materialsSection} ${isDragging ? styles.dragging : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>{clientName}的材料列表</h3>
        <div className={styles.actions}>
          <button
            className={`${styles.actionBtn} ${styles.btnAdd}`}
            onClick={onAddMaterial}
          >
            添加
          </button>
          <button
            className={`${styles.actionBtn} ${styles.btnExport}`}
            onClick={onExport}
          >
            导出
          </button>
        </div>
      </div>
      
      {/* 批量操作栏 - 常驻 */}
      <div className={styles.batchActionsBar}>
        <div className={styles.batchActionsLeft}>
          <label className={styles.selectAllLabel}>
            <input
              type="checkbox"
              checked={selectedMaterials.size > 0 && selectedMaterials.size === clientMaterials.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedMaterials(new Set(clientMaterials.map(m => m.id)));
                } else {
                  setSelectedMaterials(new Set());
                }
              }}
            />
            <span>全选{selectedMaterials.size > 0 && `(${selectedMaterials.size})`}</span>
          </label>
        </div>
        <div className={styles.batchActionsRight}>
          <button
            className={`${styles.batchActionBtn} ${styles.batchConfirmBtn}`}
            onClick={handleBatchConfirm}
            disabled={selectedMaterials.size === 0}
          >
            确认
          </button>
          <button
            className={`${styles.batchActionBtn} ${styles.batchDeleteBtn}`}
            onClick={handleBatchDelete}
            disabled={selectedMaterials.size === 0}
          >
            删除
          </button>
        </div>
      </div>
      
      <div 
        ref={scrollContainerRef}
        className={styles.materialsList}
        onScroll={handleScroll}
        style={{
          height: '400px',
          overflowY: 'auto',
          position: 'relative'
        }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div
            style={{
              transform: `translateY(${offsetY}px)`,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0
            }}
          >
            {visibleItems.map((material, index) => (
              <VirtualMaterialItem
                key={material.id}
                material={material}
                isActive={currentMaterial?.id === material.id}
                isSelected={selectedMaterials.has(material.id)}
                onSelect={handleMaterialSelect}
                onDelete={handleDeleteMaterial}
                onCheckboxChange={handleCheckboxChange}
                style={{
                  position: 'absolute',
                  top: index * itemWithGapHeight,
                  left: 0,
                  right: 0,
                  minHeight: ITEM_HEIGHT,
                  marginBottom: ITEM_GAP
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 拖拽悬浮提示 */}
      {isDragging && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragOverlayContent}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <p>释放文件以上传</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(VirtualMaterialsList, (prevProps, nextProps) => {
  return (
    prevProps.clientName === nextProps.clientName &&
    prevProps.onAddMaterial === nextProps.onAddMaterial &&
    prevProps.onExport === nextProps.onExport &&
    prevProps.onFilesDropped === nextProps.onFilesDropped
  );
});