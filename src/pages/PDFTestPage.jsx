import React, { useState, useRef } from 'react';
import FabricImageEditor from '../components/translation/FabricImageEditor';
import previewStyles from '../components/translation/PreviewSection.module.css';
import './PDFTestPage.css';

// API URL配置
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

/**
 * PDF多页编辑测试页面
 * 使用现有的FabricImageEditor组件
 */
const PDFTestPage = () => {
  const [pdfData, setPdfData] = useState(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pages, setPages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [notification, setNotification] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // 用于强制刷新编辑器

  // 保存每页的编辑数据
  const pageEditsRef = useRef({});

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  /**
   * 处理PDF上传
   */
  const handleFileUpload = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      showNotification('请上传PDF文件', 'error');
      return;
    }

    setIsUploading(true);
    setUploadProgress('正在上传PDF...');

    const formData = new FormData();
    formData.append('pdf_file', file);

    try {
      const response = await fetch(`${API_URL}/api/pdf/split-pages`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('上传失败');
      }

      setUploadProgress('正在拆分页面...');

      const data = await response.json();

      if (data.success) {
        setPdfData(data);
        setPages(data.pages);

        // 初始化每页的编辑数据
        const edits = {};
        data.pages.forEach((page, idx) => {
          edits[idx] = {
            originalUrl: page.image_url,
            regions: [],
            hasEdits: false
          };
        });
        pageEditsRef.current = edits;

        setCurrentPageIndex(0);
        showNotification(`✓ 成功拆分为 ${data.total_pages} 页`, 'success');
      } else {
        throw new Error(data.error || '处理失败');
      }
    } catch (error) {
      showNotification('错误: ' + error.message, 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  /**
   * 保存当前页的编辑
   */
  const saveCurrentPage = async () => {
    if (!window.currentFabricEditor || !window.currentFabricEditor.generateBothVersions) {
      return true;
    }

    try {
      const result = await window.currentFabricEditor.generateBothVersions();

      if (result) {
        pageEditsRef.current[currentPageIndex] = {
          ...pageEditsRef.current[currentPageIndex],
          editedBlob: result.edited.blob,
          finalBlob: result.final.blob,
          regions: result.edited.regions,
          hasEdits: true
        };

        console.log(`✓ 第 ${currentPageIndex + 1} 页已保存`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('保存页面失败:', error);
      return false;
    }
  };

  /**
   * 切换到指定页面
   */
  const goToPage = async (pageIndex) => {
    if (pageIndex < 0 || pageIndex >= pages.length) return;
    if (pageIndex === currentPageIndex) return;

    // 保存当前页
    await saveCurrentPage();

    // 切换页面
    setCurrentPageIndex(pageIndex);
    showNotification(`切换到第 ${pageIndex + 1} 页`, 'info');
  };

  /**
   * 上一页
   */
  const previousPage = async () => {
    if (currentPageIndex > 0) {
      await goToPage(currentPageIndex - 1);
    }
  };

  /**
   * 下一页
   */
  const nextPage = async () => {
    if (currentPageIndex < pages.length - 1) {
      await goToPage(currentPageIndex + 1);
    }
  };

  /**
   * 翻译当前页
   */
  const translateCurrentPage = async () => {
    const currentPage = pages[currentPageIndex];

    try {
      showNotification(`正在翻译第 ${currentPageIndex + 1} 页...`, 'info');

      // 先获取图片文件
      const response = await fetch(currentPage.image_url);
      const blob = await response.blob();

      // 创建FormData
      const formData = new FormData();
      formData.append('image', blob, `page_${currentPageIndex + 1}.png`);
      formData.append('from_lang', 'zh');
      formData.append('to_lang', 'en');
      formData.append('save_image', 'false'); // 不保存图片，只要regions数据

      // 获取JWT token
      const token = localStorage.getItem('auth_token');

      // 调用百度翻译API
      const translateResponse = await fetch(`${API_URL}/api/api-translate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!translateResponse.ok) {
        throw new Error('翻译请求失败');
      }

      const data = await translateResponse.json();

      if (data.error_code && data.error_code !== 0 && data.error_code !== '0') {
        throw new Error(data.error_msg || '翻译失败');
      }

      // 解析regions数据
      const content = data.data?.content || [];

      if (!content || content.length === 0) {
        showNotification('未识别到文字区域', 'error');
        return;
      }

      // 构建regions格式
      const regions = content.map((item, idx) => ({
        id: idx,
        src: item.src || '',
        dst: item.dst || '',
        points: item.points || [],
        lineCount: item.lineCount || 1
      }));

      // 更新当前页的regions
      pageEditsRef.current[currentPageIndex] = {
        ...pageEditsRef.current[currentPageIndex],
        regions: regions,
        hasEdits: true
      };

      showNotification(`✓ 第 ${currentPageIndex + 1} 页翻译完成，识别到 ${regions.length} 个区域`, 'success');

      // 强制刷新编辑器以显示翻译结果
      setRefreshKey(prev => prev + 1);

    } catch (error) {
      console.error('翻译失败:', error);
      showNotification('翻译失败: ' + error.message, 'error');
    }
  };

  /**
   * 导出PDF
   */
  const exportPDF = async () => {
    try {
      // 1. 先保存当前页
      await saveCurrentPage();
      showNotification('正在准备导出...', 'info');

      const token = localStorage.getItem('auth_token');

      // 2. 上传所有已编辑的页面
      const pageImages = [];

      for (let idx = 0; idx < pages.length; idx++) {
        const editData = pageEditsRef.current[idx];

        if (editData.hasEdits && editData.finalBlob) {
          // 上传编辑后的图片（带文字的完整版本）
          const formData = new FormData();
          formData.append('page_number', idx + 1);
          formData.append('final_image', editData.finalBlob, `final_page_${idx + 1}.png`);
          formData.append('pdf_session_id', pdfData.pdf_session_id);

          const uploadResponse = await fetch(`${API_URL}/api/pdf/save-page-edit`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });

          if (!uploadResponse.ok) {
            throw new Error(`保存第 ${idx + 1} 页失败`);
          }

          const uploadData = await uploadResponse.json();

          // 使用上传后的路径
          pageImages.push({
            page_number: idx + 1,
            image_path: uploadData.image_path,
            has_edits: true
          });

          showNotification(`第 ${idx + 1} 页已上传`, 'info');
        } else {
          // 使用原始图片
          pageImages.push({
            page_number: idx + 1,
            image_path: pages[idx].image_path,
            has_edits: false
          });
        }
      }

      // 3. 调用合并API
      showNotification('正在合并PDF...', 'info');

      const mergeResponse = await fetch(`${API_URL}/api/pdf/merge-pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pdf_session_id: pdfData.pdf_session_id,
          page_images: pageImages
        })
      });

      if (!mergeResponse.ok) {
        throw new Error('合并PDF失败');
      }

      const mergeData = await mergeResponse.json();

      if (mergeData.success) {
        showNotification('✓ PDF导出成功！正在下载...', 'success');

        // 4. 下载PDF - 先fetch获取blob，再创建下载链接
        const downloadUrl = mergeData.pdf_url;

        const pdfResponse = await fetch(downloadUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!pdfResponse.ok) {
          throw new Error('无法获取PDF文件');
        }

        const pdfBlob = await pdfResponse.blob();
        const blobUrl = window.URL.createObjectURL(pdfBlob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `edited_${pdfData.pdf_filename}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 清理blob URL
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);

        console.log('✓ PDF已下载:', downloadUrl);
      } else {
        throw new Error(mergeData.error || '导出失败');
      }
    } catch (error) {
      console.error('导出失败:', error);
      showNotification('导出失败: ' + error.message, 'error');
    }
  };

  /**
   * 重置
   */
  const reset = () => {
    // eslint-disable-next-line no-restricted-globals
    if (window.confirm('确定要重新上传吗？当前编辑将丢失。')) {
      setPdfData(null);
      setPages([]);
      setCurrentPageIndex(0);
      pageEditsRef.current = {};
    }
  };

  // 上传界面
  if (!pdfData) {
    return (
      <div className="pdf-test-upload">
        <div className="upload-container">
          <div className="upload-icon">📄</div>
          <h1>PDF多页编辑器测试</h1>
          <p>上传PDF文件，在自定义编辑器中逐页编辑</p>

          <div
            className="upload-area"
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('dragover');
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove('dragover');
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('dragover');
              const files = e.dataTransfer.files;
              if (files.length > 0) {
                handleFileUpload(files[0]);
              }
            }}
          >
            <p>📤 拖拽PDF文件到这里</p>
            <p style={{ fontSize: '14px', color: '#999', margin: '10px 0' }}>或</p>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                if (e.target.files.length > 0) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              style={{ display: 'none' }}
              id="pdfFileInput"
            />
            <button
              className="btn-primary"
              onClick={() => document.getElementById('pdfFileInput').click()}
              disabled={isUploading}
            >
              选择文件
            </button>
          </div>

          {isUploading && (
            <div className="upload-progress">
              <div className="spinner"></div>
              <p>{uploadProgress}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentPage = pages[currentPageIndex];
  const currentEdit = pageEditsRef.current[currentPageIndex];

  return (
    <div className="pdf-test-editor">
      {/* 通知 */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* 顶部工具栏 */}
      <div className="toolbar">
        <div className="toolbar-left">
          <h1>📄 PDF多页编辑器测试</h1>
          <div className="page-info">
            第 {currentPageIndex + 1} / {pages.length} 页
            {currentEdit.hasEdits && (
              <span className="edited-badge">已编辑</span>
            )}
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn-secondary" onClick={translateCurrentPage}>
            🌐 翻译当前页
          </button>
          <button className="btn-success" onClick={exportPDF}>
            📥 导出PDF
          </button>
          <button className="btn-secondary" onClick={reset}>
            🔄 重新上传
          </button>
        </div>
      </div>

      {/* 编辑器区域 - 使用PreviewSection的样式 */}
      <div className={previewStyles.llmImageTranslationView}>
        <div className={previewStyles.llmEditorSection}>
          <div className={previewStyles.llmEditorHeader}>
            <div>
              <h2 className={previewStyles.llmEditorTitle}>自定义编辑</h2>
              <p className={previewStyles.sectionDescription}>
                编辑当前页面的翻译内容
              </p>
            </div>
            <button className={previewStyles.saveEditButton} onClick={saveCurrentPage}>
              保存修改
            </button>
          </div>

          <div className={previewStyles.llmEditorContent}>
            <FabricImageEditor
              key={`page-${pdfData.pdf_session_id}-${currentPageIndex}-${refreshKey}`}
              imageSrc={currentPage.image_url}
              regions={currentEdit.regions || []}
              editorKey={`pdf-${pdfData.pdf_session_id}-page-${currentPageIndex}-${refreshKey}`}
              exposeHandlers={true}
              onExport={() => {}}
            />
          </div>
        </div>
      </div>

      {/* 底部导航 */}
      <div className="bottom-nav">
        <button
          className="nav-btn"
          onClick={previousPage}
          disabled={currentPageIndex === 0}
        >
          ← 上一页
        </button>

        <div className="page-indicator">
          {pages.map((_, idx) => (
            <button
              key={idx}
              className={`page-dot ${idx === currentPageIndex ? 'active' : ''} ${pageEditsRef.current[idx]?.hasEdits ? 'edited' : ''}`}
              onClick={() => goToPage(idx)}
              title={`第 ${idx + 1} 页`}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        <button
          className="nav-btn"
          onClick={nextPage}
          disabled={currentPageIndex === pages.length - 1}
        >
          下一页 →
        </button>
      </div>
    </div>
  );
};

export default PDFTestPage;
