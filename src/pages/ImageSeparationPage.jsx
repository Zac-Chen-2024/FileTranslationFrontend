import React, { useState, useRef, useEffect } from 'react';
import { imageSeparationAPI } from '../services/api';
import FabricImageEditor from '../components/translation/FabricImageEditor';
import styles from './ImageSeparationPage.module.css';

const ImageSeparationPage = () => {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [separationResult, setSeparationResult] = useState(null);
  const [showBackground, setShowBackground] = useState(true);
  const [textRegions, setTextRegions] = useState([]);

  const fileInputRef = useRef(null);
  const editorRef = useRef(null);

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
    setPreviewUrl(url);

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
        setTextRegions(response.data.text_regions.map(r => ({ ...r, visible: true })));
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

  // 切换背景显示
  const toggleBackground = () => {
    setShowBackground(!showBackground);
  };

  // 切换文字区域显示
  const toggleTextRegion = (index) => {
    setTextRegions(prev => prev.map((region, i) =>
      i === index ? { ...region, visible: !region.visible } : region
    ));
  };

  // 导出图片
  const exportImage = (format = 'png') => {
    if (editorRef.current && editorRef.current.exportImage) {
      const dataUrl = editorRef.current.exportImage();

      // 创建下载链接
      const link = document.createElement('a');
      link.download = `separated-image.${format}`;
      link.href = dataUrl;
      link.click();
    }
  };

  // 导出JSON数据
  const exportJSON = () => {
    const exportData = {
      original_size: separationResult?.original_size,
      background_visible: showBackground,
      text_regions: textRegions.map((region, i) => ({
        id: region.id,
        bbox: region.bbox,
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
            <p>正在分离背景和文字...</p>
          </div>
        )}

        {/* 图层控制 */}
        {separationResult && !loading && (
          <div className={styles.layerControl}>
            <h3>图层控制</h3>

            <div className={styles.layerItem}>
              <label>
                <input
                  type="checkbox"
                  checked={showBackground}
                  onChange={toggleBackground}
                />
                <span>背景图层</span>
              </label>
            </div>

            <div className={styles.layerGroup}>
              <h4>文字区域 ({textRegions.length})</h4>
              {textRegions.map((region, index) => (
                <div key={region.id} className={styles.layerItem}>
                  <label>
                    <input
                      type="checkbox"
                      checked={region.visible}
                      onChange={() => toggleTextRegion(index)}
                    />
                    <span>文字 {index + 1}</span>
                    <span className={styles.layerSize}>
                      {region.bbox.width}×{region.bbox.height}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 导出控制 */}
        {separationResult && !loading && (
          <div className={styles.exportControl}>
            <h3>导出</h3>
            <button onClick={() => exportImage('png')} className={styles.exportBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              导出图片 (PNG)
            </button>
            <button onClick={exportJSON} className={styles.exportBtnSecondary}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              导出项目数据 (JSON)
            </button>
          </div>
        )}
      </div>

      {/* 编辑器区域 */}
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
          <FabricImageEditor
            ref={editorRef}
            imageUrl={showBackground ? separationResult.background_image : null}
            textRegions={textRegions.filter(r => r.visible)}
            editable={true}
          />
        )}
      </div>
    </div>
  );
};

export default ImageSeparationPage;
