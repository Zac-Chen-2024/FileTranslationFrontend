import React, { useState, useRef, useEffect } from 'react';
import { imageSeparationAPI } from '../services/api';
import FabricImageEditor from '../components/translation/FabricImageEditor';
import styles from './ImageSeparationPage.module.css';

const ImageSeparationPage = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [separationResult, setSeparationResult] = useState(null);
  const [textRegions, setTextRegions] = useState([]);
  const [processedRegions, setProcessedRegions] = useState([]);
  const [showMask, setShowMask] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  const editorHandlersRef = useRef(null);

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
    setEditorReady(false);

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

        // 转换数据格式为编辑器可用的格式
        const convertedRegions = (response.data.text_regions || []).map((region, idx) => ({
          x: region.bbox.x,
          y: region.bbox.y,
          width: region.bbox.width,
          height: region.bbox.height,
          dst: `文字区域 ${idx + 1}`,
          src: '',
          id: region.id,
          visible: true
        }));
        setProcessedRegions(convertedRegions);
        setEditorReady(true);

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

  // 切换区域显示
  const toggleRegion = (regionId) => {
    setProcessedRegions(prev => prev.map(region =>
      region.id === regionId
        ? { ...region, visible: !region.visible }
        : region
    ));
  };

  // 切换所有区域
  const toggleAllRegions = (visible) => {
    setProcessedRegions(prev => prev.map(region => ({
      ...region,
      visible
    })));
  };

  // 导出处理后的图片
  const handleExportImage = () => {
    if (editorHandlersRef.current && editorHandlersRef.current.exportImage) {
      const dataUrl = editorHandlersRef.current.exportImage();

      // 创建下载链接
      const link = document.createElement('a');
      link.download = 'processed-image.png';
      link.href = dataUrl;
      link.click();
    }
  };

  // 导出JSON数据
  const handleExportJSON = () => {
    if (!separationResult) return;

    const exportData = {
      original_size: separationResult.original_size,
      text_regions: processedRegions.map(region => ({
        id: region.id,
        bbox: {
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height
        },
        text: region.dst,
        visible: region.visible
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

  // 处理编辑器导出回调
  const handleEditorExport = (exportedData) => {
    console.log('Editor exported data:', exportedData);
  };

  // 重新处理
  const handleReset = () => {
    setFile(null);
    setSeparationResult(null);
    setTextRegions([]);
    setProcessedRegions([]);
    setEditorReady(false);
    setError(null);
  };

  return (
    <div className={styles.container}>
      {/* 左侧控制面板 */}
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <h1 className={styles.title}>图片背景文字分离工具</h1>
          <p className={styles.subtitle}>实验功能 - 文字检测与编辑</p>
        </div>

        {/* 上传区域 */}
        {!separationResult && (
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
                <p>点击或拖拽图片上传</p>
                <span className={styles.fileInfo}>
                  支持 PNG、JPG、BMP、WEBP
                  <br />
                  最大 10MB
                </span>
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
        )}

        {/* 错误提示 */}
        {error && (
          <div className={styles.error}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 加载提示 */}
        {loading && (
          <div className={styles.loadingBox}>
            <div className={styles.spinner}></div>
            <p>正在检测文字区域...</p>
          </div>
        )}

        {/* 检测结果和控制面板 */}
        {separationResult && !loading && (
          <>
            {/* 统计信息 */}
            <div className={styles.stats}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>图片尺寸</span>
                <span className={styles.statValue}>
                  {separationResult.original_size.width} × {separationResult.original_size.height}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>检测到文字区域</span>
                <span className={styles.statValue}>{textRegions.length} 个</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>显示中</span>
                <span className={styles.statValue}>
                  {processedRegions.filter(r => r.visible).length} 个
                </span>
              </div>
            </div>

            {/* 文字区域控制 */}
            <div className={styles.controlSection}>
              <div className={styles.sectionHeader}>
                <h3>文字区域管理</h3>
                <div className={styles.quickActions}>
                  <button
                    className={styles.actionBtn}
                    onClick={() => toggleAllRegions(true)}
                  >
                    全选
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => toggleAllRegions(false)}
                  >
                    全不选
                  </button>
                </div>
              </div>

              <div className={styles.regionList}>
                {processedRegions.map((region, idx) => (
                  <div
                    key={region.id}
                    className={`${styles.regionItem} ${region.visible ? styles.active : ''}`}
                    onClick={() => toggleRegion(region.id)}
                  >
                    <input
                      type="checkbox"
                      checked={region.visible}
                      onChange={() => {}}
                      className={styles.checkbox}
                    />
                    <div className={styles.regionInfo}>
                      <span className={styles.regionName}>{region.dst}</span>
                      <span className={styles.regionCoords}>
                        ({region.x}, {region.y}) - {region.width}×{region.height}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 调试选项 */}
            <div className={styles.debugSection}>
              <label className={styles.debugControl}>
                <input
                  type="checkbox"
                  checked={showMask}
                  onChange={(e) => setShowMask(e.target.checked)}
                />
                <span>显示检测 Mask（调试）</span>
              </label>
            </div>

            {/* 操作按钮 */}
            <div className={styles.actions}>
              <button
                onClick={handleExportImage}
                className={styles.primaryBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                导出编辑后图片
              </button>
              <button
                onClick={handleExportJSON}
                className={styles.secondaryBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                导出区域数据 (JSON)
              </button>
              <button
                onClick={handleReset}
                className={styles.dangerBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
                重新开始
              </button>
            </div>
          </>
        )}
      </div>

      {/* 右侧编辑器区域 */}
      <div className={styles.editorArea}>
        {!separationResult && !loading && (
          <div className={styles.emptyState}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <h2>开始使用</h2>
            <p>上传一张图片以开始文字检测和编辑</p>
          </div>
        )}

        {loading && (
          <div className={styles.emptyState}>
            <div className={styles.spinner}></div>
            <p>处理中，请稍候...</p>
          </div>
        )}

        {separationResult && editorReady && !loading && (
          <div className={styles.editorWrapper}>
            <FabricImageEditor
              ref={editorRef}
              imageSrc={showMask && separationResult.text_mask ?
                       separationResult.text_mask :
                       separationResult.background_image}
              regions={processedRegions.filter(r => r.visible)}
              onExport={handleEditorExport}
              editorKey={`image-separation-${file?.name || 'default'}`}
              exposeHandlers={(handlers) => {
                editorHandlersRef.current = handlers;
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageSeparationPage;