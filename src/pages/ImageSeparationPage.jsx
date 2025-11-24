import React, { useState, useRef } from 'react';
import { imageSeparationAPI } from '../services/api';
import styles from './ImageSeparationPage.module.css';

const ImageSeparationPage = () => {
  const [file, setFile] = useState(null);
  const [originalImage, setOriginalImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [separationResult, setSeparationResult] = useState(null);
  const [textRegions, setTextRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [showMask, setShowMask] = useState(false);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

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
  };

  // 处理文件
  const processFile = (selectedFile) => {
    // 检查文件类型
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/webp'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('不支持的文件格式。请上传 PNG、JPG、BMP 或 WEBP 格式的图片。');
      return;
    }

    // 检查文件大小（10MB）
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('文件大小超过10MB限制');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setSeparationResult(null);

    // 创建预览URL
    const url = URL.createObjectURL(selectedFile);
    setOriginalImage(url);

    // 自动开始分离
    uploadAndSeparate(selectedFile);
  };

  // 上传并分离图片
  const uploadAndSeparate = async (fileToUpload) => {
    setLoading(true);
    setError(null);

    try {
      const response = await imageSeparationAPI.separateImage(fileToUpload);

      if (response.success) {
        setSeparationResult(response.data);
        setTextRegions(response.data.text_regions || []);

        // 如果有调试用的mask，可以显示
        if (response.data.text_mask) {
          console.log('文字mask已生成，可用于调试');
        }
      } else {
        setError(response.error || '图片分离失败');
      }
    } catch (err) {
      console.error('分离错误:', err);
      setError(err.response?.data?.error || '服务器错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 计算缩放比例
  const getScaleFactor = () => {
    if (!separationResult || !canvasRef.current) return 1;

    const containerWidth = canvasRef.current.parentElement.clientWidth - 40; // 留边距
    const containerHeight = canvasRef.current.parentElement.clientHeight - 40;
    const imgWidth = separationResult.original_size.width;
    const imgHeight = separationResult.original_size.height;

    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;

    return Math.min(scaleX, scaleY, 1); // 不放大，只缩小
  };

  // 点击文字区域
  const handleRegionClick = (region) => {
    setSelectedRegion(region.id === selectedRegion ? null : region.id);
  };

  // 删除选中的文字区域
  const handleDeleteRegion = async () => {
    if (!selectedRegion || !file) return;

    setLoading(true);
    try {
      // 调用后端API移除文字并修复背景
      const formData = new FormData();
      formData.append('image', file);
      formData.append('region_id', selectedRegion);
      formData.append('text_regions', JSON.stringify(textRegions));

      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5010'}/api/image-separation/remove-text`,
        {
          method: 'POST',
          body: formData
        }
      );

      const result = await response.json();

      if (result.success) {
        // 更新背景图片
        setSeparationResult(prev => ({
          ...prev,
          background_image: result.data.inpainted_image
        }));

        // 从列表中移除该区域
        setTextRegions(prev => prev.filter(r => r.id !== selectedRegion));
        setSelectedRegion(null);
      } else {
        setError(result.error || '删除文字区域失败');
      }
    } catch (err) {
      console.error('删除错误:', err);
      setError('删除文字区域失败');
    } finally {
      setLoading(false);
    }
  };

  // 导出图片
  const exportImage = () => {
    if (!separationResult) return;

    // 创建下载链接
    const link = document.createElement('a');
    link.download = 'processed-image.png';
    link.href = separationResult.background_image;
    link.click();
  };

  // 导出JSON数据
  const exportJSON = () => {
    const exportData = {
      original_size: separationResult?.original_size,
      text_regions: textRegions.map(region => ({
        id: region.id,
        bbox: region.bbox
      }))
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.download = 'image-separation-data.json';
    link.href = url;
    link.click();
  };

  // 键盘事件处理
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' && selectedRegion) {
        handleDeleteRegion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRegion]);

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <h1 className={styles.title}>图片背景文字分离</h1>
        <p className={styles.subtitle}>测试工具 - 仅通过URL访问</p>

        {/* 上传区域 */}
        <div className={styles.uploadSection}>
          <div
            className={styles.dropZone}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className={styles.dropZoneContent}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <p>点击或拖拽图片到这里</p>
              <span className={styles.fileInfo}>支持 PNG、JPG、BMP、WEBP（最大10MB）</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/bmp,image/webp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className={styles.error}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* 加载提示 */}
        {loading && (
          <div className={styles.loadingBox}>
            <div className={styles.spinner}></div>
            <p>正在处理...</p>
          </div>
        )}

        {/* 检测结果 */}
        {separationResult && !loading && (
          <div className={styles.resultInfo}>
            <h3>检测结果</h3>
            <p>检测到 <strong>{textRegions.length}</strong> 个文字区域</p>
            {selectedRegion && (
              <div className={styles.selectedInfo}>
                <p>已选中: {selectedRegion}</p>
                <button
                  className={styles.deleteBtn}
                  onClick={handleDeleteRegion}
                >
                  删除选中区域 (Del)
                </button>
              </div>
            )}
            <div className={styles.debugControl}>
              <label>
                <input
                  type="checkbox"
                  checked={showMask}
                  onChange={(e) => setShowMask(e.target.checked)}
                />
                <span>显示检测mask (调试)</span>
              </label>
            </div>
          </div>
        )}

        {/* 导出控制 */}
        {separationResult && !loading && (
          <div className={styles.exportControl}>
            <h3>导出</h3>
            <button onClick={exportImage} className={styles.exportBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              导出处理后图片
            </button>
            <button onClick={exportJSON} className={styles.exportBtnSecondary}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              导出区域数据 (JSON)
            </button>
          </div>
        )}
      </div>

      {/* 图片编辑区域 */}
      <div className={styles.editorArea}>
        {!separationResult && !loading && (
          <div className={styles.emptyState}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <h2>开始使用</h2>
            <p>上传一张图片以开始背景文字分离</p>
          </div>
        )}

        {separationResult && !loading && (
          <div className={styles.imageContainer}>
            {/* 背景图片 */}
            <img
              src={showMask && separationResult.text_mask ?
                    separationResult.text_mask :
                    separationResult.background_image}
              alt="Background"
              className={styles.backgroundImage}
              ref={canvasRef}
            />

            {/* 文字区域边界框 */}
            {!showMask && (
              <svg
                className={styles.overlay}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none'
                }}
              >
                {textRegions.map(region => {
                  const scale = getScaleFactor();
                  const isSelected = region.id === selectedRegion;
                  const isHovered = region.id === hoveredRegion;

                  return (
                    <g key={region.id}>
                      {/* 边界框 */}
                      <rect
                        x={region.bbox.x * scale}
                        y={region.bbox.y * scale}
                        width={region.bbox.width * scale}
                        height={region.bbox.height * scale}
                        fill="none"
                        stroke={isSelected ? '#ff0000' : (isHovered ? '#00ff00' : '#3b82f6')}
                        strokeWidth={isSelected ? 2 : 1}
                        strokeDasharray={isSelected ? '0' : '5,5'}
                        style={{
                          pointerEvents: 'all',
                          cursor: 'pointer',
                          fillOpacity: isHovered ? 0.1 : 0
                        }}
                        onClick={() => handleRegionClick(region)}
                        onMouseEnter={() => setHoveredRegion(region.id)}
                        onMouseLeave={() => setHoveredRegion(null)}
                      />

                      {/* 标签 */}
                      <text
                        x={region.bbox.x * scale + 2}
                        y={region.bbox.y * scale - 4}
                        fill={isSelected ? '#ff0000' : '#3b82f6'}
                        fontSize="12"
                        fontWeight={isSelected ? 'bold' : 'normal'}
                        style={{ pointerEvents: 'none' }}
                      >
                        {region.id}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageSeparationPage;