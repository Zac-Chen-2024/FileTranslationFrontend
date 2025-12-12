import React, { useState, useRef, useEffect, useCallback } from 'react';
import { imageSeparationAPI } from '../services/api';
import styles from './AdobeStyleImageSeparation.module.css';

const AdobeStyleImageSeparation = () => {
  // 文件和结果状态
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [separationResult, setSeparationResult] = useState(null);
  const [textRegions, setTextRegions] = useState([]);

  // 视图控制状态
  const [viewMode, setViewMode] = useState('original'); // original, background, detection
  const [detectionMode, setDetectionMode] = useState('document'); // basic, advanced, document
  const [showRegions, setShowRegions] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRegionId, setEditingRegionId] = useState(null);

  // Canvas相关
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [images, setImages] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 处理文件选择
  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  // 处理拖拽上传
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add(styles.dragOver);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove(styles.dragOver);
  };

  // 处理文件
  const processFile = (selectedFile) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/webp'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('不支持的文件格式');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('文件大小超过10MB限制');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setSeparationResult(null);
    setSelectedRegionId(null);
    uploadAndSeparate(selectedFile);
  };

  // 上传并分离图片
  const uploadAndSeparate = async (fileToUpload) => {
    setLoading(true);
    setError(null);

    try {
      const response = await imageSeparationAPI.separateImage(fileToUpload, detectionMode);
      console.log('🔍 完整API响应:', response);
      console.log('🔍 响应类型:', typeof response);
      console.log('🔍 响应的所有键:', Object.keys(response));

      // API返回格式: { success: true, data: { original_image, background_image, ... } }
      // 响应拦截器返回 response.data，所以这里response = { success: true, data: {...} }
      // 实际图片数据在 response.data 里
      let data = null;
      if (response.success && response.data) {
        console.log('✅ 使用 response.data (正确路径)');
        data = response.data;
      } else if (response.data?.data) {
        console.log('✅ 使用 response.data.data');
        data = response.data.data;
      } else if (response.data) {
        console.log('✅ 使用 response.data');
        data = response.data;
      } else {
        console.log('✅ 直接使用 response');
        data = response;
      }

      console.log('📦 提取后的data对象:', data);
      console.log('📦 data的所有键:', data ? Object.keys(data) : 'null');
      console.log('📦 提取的数据字段检查:', {
        hasSuccess: !!data.success,
        hasOriginal: !!data.original_image,
        hasBackground: !!data.background_image,
        hasDetection: !!data.detection_visualization,
        regionsCount: data.text_regions?.length || 0
      });

      if (data?.success || data) {

        setSeparationResult(data);
        setTextRegions(data.text_regions || []);
        await preloadImages(data);
        // 自动调整视图以适应图片
        setTimeout(fitToView, 100);
      } else {
        setError(response.error || '检测失败');
      }
    } catch (err) {
      console.error('检测错误:', err);
      setError(err.response?.data?.error || '服务器错误');
    } finally {
      setLoading(false);
    }
  };

  // 预加载图片
  const preloadImages = async (data) => {
    const loadImage = (src, name) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          console.log(`✅ ${name} 图片加载成功:`, img.width, 'x', img.height);
          resolve(img);
        };
        img.onerror = (e) => {
          console.error(`❌ ${name} 图片加载失败:`, e);
          console.error(`图片源前100字符:`, src ? src.substring(0, 100) : 'null');
          resolve(null);
        };
        img.src = src;
      });
    };

    console.log('🖼️ 开始预加载图片，检查数据字段:');
    console.log('  data.original_image:', data.original_image ? `存在 (${data.original_image.substring(0, 50)}...)` : '❌ 不存在');
    console.log('  data.background_image:', data.background_image ? `存在 (${data.background_image.substring(0, 50)}...)` : '❌ 不存在');
    console.log('  data.detection_visualization:', data.detection_visualization ? `存在 (${data.detection_visualization.substring(0, 50)}...)` : '❌ 不存在');

    const loadedImages = {};
    if (data.original_image) {
      console.log('正在加载原图...');
      loadedImages.original = await loadImage(data.original_image, '原图');
    } else {
      console.warn('⚠️ data.original_image 字段不存在或为空');
    }

    if (data.background_image) {
      console.log('正在加载背景...');
      loadedImages.background = await loadImage(data.background_image, '背景');
    } else {
      console.warn('⚠️ data.background_image 字段不存在或为空');
    }

    if (data.detection_visualization) {
      console.log('正在加载检测可视化...');
      loadedImages.detection = await loadImage(data.detection_visualization, '检测');
    } else {
      console.warn('⚠️ data.detection_visualization 字段不存在或为空');
    }

    console.log('📊 图片加载完成汇总:', {
      original: !!loadedImages.original,
      background: !!loadedImages.background,
      detection: !!loadedImages.detection
    });

    setImages(loadedImages);
  };

  // 渲染Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 填充背景
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 获取当前图片
    const currentImage = images[viewMode] || images.original;
    console.log('渲染Canvas - viewMode:', viewMode, 'currentImage:', !!currentImage, 'images:', Object.keys(images));
    if (!currentImage) return;

    // 保存状态
    ctx.save();

    // 应用变换
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // 绘制图片
    ctx.drawImage(currentImage, 0, 0);

    // 绘制文字区域（如果启用且不是检测视图）
    if (showRegions && viewMode !== 'detection' && textRegions.length > 0) {
      textRegions.forEach(region => {
        const confidence = region.confidence || 0.7;

        // 只显示高于阈值的区域
        if (confidence < confidenceThreshold) return;

        const isSelected = region.id === selectedRegionId;

        // 设置样式
        ctx.strokeStyle = isSelected
          ? '#0084ff'
          : `rgba(0, 255, 0, ${0.5 + confidence * 0.5})`;
        ctx.lineWidth = isSelected ? 3 / scale : 2 / scale;
        ctx.setLineDash(isSelected ? [] : [5 / scale, 5 / scale]);

        // 绘制边界框
        ctx.strokeRect(
          region.bbox.x,
          region.bbox.y,
          region.bbox.width,
          region.bbox.height
        );

        // 选中时的填充
        if (isSelected) {
          ctx.fillStyle = 'rgba(0, 132, 255, 0.1)';
          ctx.fillRect(
            region.bbox.x,
            region.bbox.y,
            region.bbox.width,
            region.bbox.height
          );
        }

        // 如果区域被编辑过，显示编辑后的文字
        if (region.edited && region.editedText) {
          // 填充背景色
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.fillRect(
            region.bbox.x,
            region.bbox.y,
            region.bbox.width,
            region.bbox.height
          );

          // 绘制编辑后的英文文字
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // 根据区域大小调整字体
          const fontSize = Math.min(region.bbox.height * 0.6, region.bbox.width / region.editedText.length * 1.5);
          ctx.font = `${fontSize / scale}px Arial, sans-serif`;

          ctx.fillText(
            region.editedText,
            region.bbox.x + region.bbox.width / 2,
            region.bbox.y + region.bbox.height / 2
          );

          // 重置对齐方式
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        }

        // 绘制置信度标签
        if (region.confidence !== undefined) {
          // 标签背景
          const label = region.edited ? '已编辑' : `${(confidence * 100).toFixed(0)}%`;
          ctx.font = `${11 / scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial`;
          const metrics = ctx.measureText(label);
          const labelHeight = 14 / scale;

          ctx.fillStyle = region.edited ? '#10b981' : (isSelected ? '#0084ff' : 'rgba(0, 0, 0, 0.7)');
          ctx.fillRect(
            region.bbox.x,
            region.bbox.y - labelHeight - 2 / scale,
            metrics.width + 6 / scale,
            labelHeight
          );

          // 标签文字
          ctx.fillStyle = '#ffffff';
          ctx.fillText(
            label,
            region.bbox.x + 3 / scale,
            region.bbox.y - 4 / scale
          );
        }
      });

      ctx.setLineDash([]);
    }

    // 恢复状态
    ctx.restore();

    // 绘制信息栏
    if (separationResult) {
      // 半透明背景
      const infoHeight = 32;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, canvas.height - infoHeight, canvas.width, infoHeight);

      // 信息文字
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial';

      const info = [
        `缩放: ${(scale * 100).toFixed(0)}%`,
        `尺寸: ${currentImage.width}×${currentImage.height}`,
        `检测区域: ${textRegions.length}`,
        `显示: ${textRegions.filter(r => (r.confidence || 0.7) >= confidenceThreshold).length}`,
        selectedRegionId ? `选中: ${selectedRegionId}` : ''
      ].filter(Boolean).join(' | ');

      ctx.fillText(info, 12, canvas.height - 10);
    }
  }, [images, viewMode, scale, offset, showRegions, textRegions, confidenceThreshold, selectedRegionId, separationResult]);

  // Canvas尺寸更新
  useEffect(() => {
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      renderCanvas();
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [renderCanvas]);

  // Canvas交互 - 鼠标滚轮缩放
  const handleWheel = useCallback((e) => {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(scale * delta, 0.1), 10);

    // 以鼠标位置为中心缩放
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newOffsetX = mouseX - (mouseX - offset.x) * (newScale / scale);
    const newOffsetY = mouseY - (mouseY - offset.y) * (newScale / scale);

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [scale, offset]);

  // 监听状态变化并重新渲染
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // 添加wheel事件监听器（非被动）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 添加非被动的wheel事件监听器
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // 鼠标拖动
  const handleMouseDown = (e) => {
    if (e.button === 0) { // 左键
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      canvasRef.current.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'grab';
    }
  };

  // 点击选择区域
  const handleCanvasClick = (e) => {
    if (isDragging || !images[viewMode]) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / scale;
    const y = (e.clientY - rect.top - offset.y) / scale;

    // 查找点击的区域
    let clickedRegion = null;
    for (const region of textRegions) {
      if (region.confidence && region.confidence < confidenceThreshold) continue;

      if (x >= region.bbox.x &&
          x <= region.bbox.x + region.bbox.width &&
          y >= region.bbox.y &&
          y <= region.bbox.y + region.bbox.height) {
        clickedRegion = region;
        break;
      }
    }

    setSelectedRegionId(clickedRegion ? clickedRegion.id : null);
  };

  // 适应视图
  const fitToView = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const image = images[viewMode] || images.original;

    if (!canvas || !container || !image) return;

    const scaleX = container.clientWidth / image.width;
    const scaleY = container.clientHeight / image.height;
    const newScale = Math.min(scaleX, scaleY) * 0.9;

    setScale(newScale);
    setOffset({
      x: (container.clientWidth - image.width * newScale) / 2,
      y: (container.clientHeight - image.height * newScale) / 2
    });
  };

  // 导出
  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `processed-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // 移除选区（只隐藏框，不修改图片）
  const handleRemoveSelection = () => {
    if (!selectedRegionId) return;

    const confirmed = window.confirm('只移除选区框，不修改图片背景？');
    if (!confirmed) return;

    const newRegions = textRegions.filter(r => r.id !== selectedRegionId);
    setTextRegions(newRegions);
    setSelectedRegionId(null);
  };

  // 删除文字（从实际图片上擦除文字，用inpainting修复背景）
  const handleDeleteText = async () => {
    if (!selectedRegionId || !separationResult) return;

    const selectedRegion = textRegions.find(r => r.id === selectedRegionId);
    if (!selectedRegion) return;

    const confirmed = window.confirm('确定要从图片上删除此区域的文字吗？\n将使用智能修复填充背景。');
    if (!confirmed) return;

    try {
      setLoading(true);
      setError(null);

      // 调用后端API删除文字
      const response = await imageSeparationAPI.deleteTextFromImage(
        separationResult.original_image,
        selectedRegion
      );

      if (response.success && response.data) {
        // 更新原图
        const updatedResult = {
          ...separationResult,
          original_image: response.data.processed_image
        };
        setSeparationResult(updatedResult);

        // 移除选区
        const newRegions = textRegions.filter(r => r.id !== selectedRegionId);
        setTextRegions(newRegions);
        setSelectedRegionId(null);

        // 重新加载图片
        await preloadImages(updatedResult);
      } else {
        setError(response.error || '删除失败');
      }

    } catch (err) {
      console.error('删除文字失败:', err);
      setError('删除文字失败: ' + (err.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 编辑选中的区域（替换为英文文字）
  const handleEditRegion = async () => {
    if (!selectedRegionId || !separationResult) return;

    const selectedRegion = textRegions.find(r => r.id === selectedRegionId);
    if (!selectedRegion) return;

    const newText = prompt('请输入要替换的英文文字:', 'Sample Text');
    if (!newText) return;

    try {
      setLoading(true);
      setError(null);

      // 调用后端API编辑文字（使用已分离的背景+渲染英文）
      const response = await imageSeparationAPI.editTextInImage(
        separationResult.background_image,
        selectedRegion,
        newText
      );

      if (response.success && response.data) {
        // 更新背景图
        const updatedResult = {
          ...separationResult,
          background_image: response.data.processed_image
        };
        setSeparationResult(updatedResult);

        // 保留选区，不移除
        // 重新加载图片
        await preloadImages(updatedResult);
      } else {
        setError(response.error || '编辑失败');
      }

    } catch (err) {
      console.error('编辑文字失败:', err);
      setError('编辑文字失败: ' + (err.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 切换编辑模式
  const handleToggleEditMode = () => {
    setIsEditMode(!isEditMode);
    if (isEditMode) {
      setEditingRegionId(null);
    }
  };

  // 重置
  const handleReset = () => {
    setFile(null);
    setSeparationResult(null);
    setTextRegions([]);
    setSelectedRegionId(null);
    setViewMode('original');
    setError(null);
    setImages({});
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setIsEditMode(false);
    setEditingRegionId(null);
  };

  return (
    <div className={styles.container}>
      {/* 顶部工具栏 */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.logo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>智能文字检测 Pro</span>
          </div>

          {separationResult && (
            <>
              <div className={styles.divider} />

              {/* 视图模式切换 */}
              <div className={styles.viewModes}>
                <button
                  className={`${styles.viewBtn} ${viewMode === 'original' ? styles.active : ''}`}
                  onClick={() => setViewMode('original')}
                  title="原图"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  原图
                </button>
                <button
                  className={`${styles.viewBtn} ${viewMode === 'background' ? styles.active : ''}`}
                  onClick={() => setViewMode('background')}
                  title="背景"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                  背景
                </button>
                <button
                  className={`${styles.viewBtn} ${viewMode === 'detection' ? styles.active : ''}`}
                  onClick={() => setViewMode('detection')}
                  title="检测结果"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <rect x="7" y="7" width="3" height="3"/>
                    <rect x="14" y="7" width="3" height="3"/>
                    <rect x="7" y="14" width="3" height="3"/>
                    <rect x="14" y="14" width="3" height="3"/>
                  </svg>
                  检测
                </button>
              </div>

              <div className={styles.divider} />

              {/* 显示控制 */}
              <button
                className={`${styles.toolBtn} ${showRegions ? styles.active : ''}`}
                onClick={() => setShowRegions(!showRegions)}
                title="显示/隐藏区域"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>

              {/* 移除选区按钮 */}
              {selectedRegionId && (
                <button
                  className={styles.toolBtn}
                  onClick={handleRemoveSelection}
                  title="移除选区框（不修改图片）"
                  style={{ color: '#6b7280' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              )}

              {/* 编辑按钮 */}
              {selectedRegionId && (
                <button
                  className={styles.toolBtn}
                  onClick={handleEditRegion}
                  title="编辑文字（擦除中文+渲染英文）"
                  style={{ color: '#10b981' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}

              {/* 删除文字按钮 */}
              {selectedRegionId && (
                <button
                  className={styles.toolBtn}
                  onClick={handleDeleteText}
                  title="删除文字（用背景修复）"
                  style={{ color: '#ef4444' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              )}

              <div className={styles.divider} />

              {/* 缩放控制 */}
              <div className={styles.zoomControls}>
                <button onClick={() => setScale(scale * 0.8)} title="缩小">-</button>
                <span className={styles.zoomValue}>{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(scale * 1.2)} title="放大">+</button>
                <button onClick={fitToView} title="适应视图">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M7 17L17 7M7 7h10v10"/>
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

        <div className={styles.toolbarRight}>
          {separationResult && (
            <>
              <button className={styles.exportBtn} onClick={handleExport}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                导出
              </button>
              <button className={styles.resetBtn} onClick={handleReset}>
                重新开始
              </button>
            </>
          )}
        </div>
      </div>

      {/* 主内容区 */}
      <div className={styles.mainContent}>
        {/* 左侧面板 */}
        <div className={styles.sidePanel}>
          {!separationResult ? (
            <div className={styles.uploadSection}>
              <div
                className={styles.uploadBox}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <h3>拖放图片到这里</h3>
                <p>或点击选择文件</p>
                <span className={styles.formats}>PNG, JPG, BMP, WEBP (最大10MB)</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              {/* 模式选择 */}
              <div className={styles.modeSection}>
                <h4>检测模式</h4>
                <div className={styles.modeOptions}>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="detectionMode"
                      value="basic"
                      checked={detectionMode === 'basic'}
                      onChange={(e) => setDetectionMode(e.target.value)}
                    />
                    <span className={styles.radioLabel}>
                      <strong>快速模式</strong>
                      <small>基础检测，速度最快</small>
                    </span>
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="detectionMode"
                      value="advanced"
                      checked={detectionMode === 'advanced'}
                      onChange={(e) => setDetectionMode(e.target.value)}
                    />
                    <span className={styles.radioLabel}>
                      <strong>高级模式</strong>
                      <small>多算法组合，适合复杂图片</small>
                    </span>
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="detectionMode"
                      value="document"
                      checked={detectionMode === 'document'}
                      onChange={(e) => setDetectionMode(e.target.value)}
                    />
                    <span className={styles.radioLabel}>
                      <strong>文档模式</strong>
                      <small>专为合同/证书优化，识别表格和印章</small>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.controls}>
              {/* 统计信息 */}
              <div className={styles.stats}>
                <h4>检测统计</h4>
                <div className={styles.statGrid}>
                  <div className={styles.statItem}>
                    <span>图片尺寸</span>
                    <strong>
                      {separationResult.original_size?.width} × {separationResult.original_size?.height}
                    </strong>
                  </div>
                  <div className={styles.statItem}>
                    <span>总区域</span>
                    <strong>{separationResult.statistics?.total_regions_detected || 0}</strong>
                  </div>
                  <div className={styles.statItem}>
                    <span>高置信度</span>
                    <strong>{separationResult.statistics?.high_confidence_regions || 0}</strong>
                  </div>
                  <div className={styles.statItem}>
                    <span>平均置信度</span>
                    <strong>
                      {((separationResult.statistics?.average_confidence || 0) * 100).toFixed(0)}%
                    </strong>
                  </div>
                </div>
              </div>

              {/* 置信度阈值 */}
              <div className={styles.threshold}>
                <h4>置信度阈值</h4>
                <div className={styles.sliderContainer}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={confidenceThreshold * 100}
                    onChange={(e) => setConfidenceThreshold(e.target.value / 100)}
                    className={styles.slider}
                  />
                  <span className={styles.sliderValue}>
                    {(confidenceThreshold * 100).toFixed(0)}%
                  </span>
                </div>
                <p className={styles.sliderDesc}>
                  只显示置信度高于此值的区域
                </p>
              </div>

              {/* 区域列表 */}
              <div className={styles.regions}>
                <h4>
                  文字区域
                  <span className={styles.regionCount}>
                    ({textRegions.filter(r => (r.confidence || 0.7) >= confidenceThreshold).length})
                  </span>
                </h4>
                <div className={styles.regionList}>
                  {textRegions
                    .filter(r => (r.confidence || 0.7) >= confidenceThreshold)
                    .map((region, idx) => (
                      <div
                        key={region.id}
                        className={`${styles.regionItem} ${
                          region.id === selectedRegionId ? styles.selected : ''
                        }`}
                      >
                        <div
                          className={styles.regionIndex}
                          onClick={() => setSelectedRegionId(region.id)}
                        >#{idx + 1}</div>
                        <div
                          className={styles.regionInfo}
                          onClick={() => setSelectedRegionId(region.id)}
                        >
                          <div className={styles.regionPos}>
                            坐标: ({Math.round(region.bbox.x)}, {Math.round(region.bbox.y)})
                          </div>
                          <div className={styles.regionSize}>
                            尺寸: {Math.round(region.bbox.width)} × {Math.round(region.bbox.height)}
                          </div>
                          {region.confidence && (
                            <div className={styles.regionConf}>
                              置信度: {(region.confidence * 100).toFixed(0)}%
                            </div>
                          )}
                          {region.lang === 'zh' && (
                            <div className={styles.regionLang}>
                              语言: 中文
                            </div>
                          )}
                        </div>
                        {region.id === selectedRegionId && (
                          <button
                            className={styles.deleteBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSelection();
                            }}
                            title="删除此区域"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <line x1="18" y1="6" x2="6" y2="18"/>
                              <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className={styles.error}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* 加载状态 */}
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <p>正在使用{
                detectionMode === 'document' ? '文档专用' :
                detectionMode === 'advanced' ? '高级' : '快速'
              }算法检测...</p>
            </div>
          )}
        </div>

        {/* Canvas区域 */}
        <div
          ref={containerRef}
          className={styles.canvasContainer}
        >
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleCanvasClick}
          />
        </div>
      </div>
    </div>
  );
};

export default AdobeStyleImageSeparation;