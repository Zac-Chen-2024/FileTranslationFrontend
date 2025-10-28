import React, { useRef, useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import AIAssistantModal from './AIAssistantModal';
import GlobalAIModal from './GlobalAIModal';
import './ImageEditor.css';

/* global fabric */

function FabricImageEditor({ imageSrc, regions, onExport, editorKey = 'default', exposeHandlers = false }) {
  const { t } = useLanguage();
  // 检查 Fabric.js 是否加载
  const [fabricLoaded, setFabricLoaded] = useState(false);
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const canvasWrapperRef = useRef(null); // 滚动容器ref
  const [selectedObjects, setSelectedObjects] = useState([]);
  const [fontSize, setFontSize] = useState(11);
  const [textAlign, setTextAlign] = useState('center');
  const [lineSpacing, setLineSpacing] = useState(1.2);
  const [selectedFont, setSelectedFont] = useState('Arial');
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);

  // 记住上一次合并的设置
  const lastMergeSettingsRef = useRef({
    textAlign: 'center',
    fontSize: 11,
    lineSpacing: 1.1,
    fontFamily: 'Arial',
    isBold: false,
    isItalic: false
  });
  const [zoomLevel, setZoomLevel] = useState(100);
  const imageRef = useRef(null);
  const textObjectsRef = useRef([]);
  const backgroundRectsRef = useRef([]);
  const initializedRef = useRef(false); // 跟踪是否已经初始化过

  // AI助手相关状态
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiButtonPosition, setAiButtonPosition] = useState(null);
  const [selectedTextboxes, setSelectedTextboxes] = useState([]);
  const [showGlobalAI, setShowGlobalAI] = useState(false);

  // 撤销/重做功能相关
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const isHistoryOperationRef = useRef(false);

  // 文字区域折叠状态（默认折叠，因为一般用不到）
  const [regionsCollapsed, setRegionsCollapsed] = useState(true);

  // 遮罩层编辑模式状态
  const [maskEditMode, setMaskEditMode] = useState(false);

  // 检查 Fabric.js 是否已加载
  useEffect(() => {
    let isMounted = true; // ✅ 跟踪组件是否已挂载
    
    const checkFabric = () => {
      if (!isMounted) return; // ✅ 如果组件已卸载，停止递归
      
      if (window.fabric) {
        console.log('Fabric.js loaded from CDN');
        if (isMounted) { // ✅ 卸载后不更新 state
          setFabricLoaded(true);
        }
      } else {
        console.log('Waiting for Fabric.js...');
        setTimeout(checkFabric, 100);
      }
    };
    checkFabric();
    
    return () => {
      isMounted = false; // ✅ Cleanup: 标记组件已卸载
    };
  }, []);

  // 初始化 Fabric.js canvas
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fabricLoaded) return;
    if (!canvasRef.current) return;
    
    console.log('Initializing Fabric.js v5 canvas...');
    const canvas = new fabric.Canvas(canvasRef.current, {
      selection: true,
      preserveObjectStacking: true
    });
    
    fabricCanvasRef.current = canvas;

    // 添加自定义控制点用于个体旋转
    const individualRotateIcon = 'data:image/svg+xml;base64,' + btoa(`
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2v4m0 0a8 8 0 11-5.657 2.343M12 6a8 8 0 105.657 2.343" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
        <path d="M16 2l-4 4 4 4" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `);

    // 自定义个体旋转控制
    fabric.Object.prototype.controls.individualRotate = new fabric.Control({
      x: 0.5,
      y: -0.5,
      offsetY: -30,
      offsetX: 30,
      cursorStyle: 'crosshair',
      actionHandler: function(_, transform, x, y) {
        const activeObject = transform.target;
        if (activeObject.type !== 'activeSelection') return false;

        // 获取鼠标角度
        const center = activeObject.getCenterPoint();
        const angle = Math.atan2(y - center.y, x - center.x) * 180 / Math.PI + 90;

        // 计算角度差
        if (!activeObject.__individualRotateStart) {
          activeObject.__individualRotateStart = angle;
          activeObject.__originalAngles = activeObject.getObjects().map(obj => ({
            obj: obj,
            angle: obj.angle || 0
          }));
        }

        const angleDiff = angle - activeObject.__individualRotateStart;

        // 应用旋转到每个对象
        activeObject.__originalAngles.forEach(data => {
          data.obj.set({
            angle: (data.angle + angleDiff) % 360
          });

          // 同步遮罩
          if (data.obj.type === 'textbox' && data.obj.bgRect) {
            data.obj.bgRect.set({
              angle: (data.angle + angleDiff) % 360
            });
          }
        });

        canvas.renderAll();
        return true;
      },
      actionName: 'individualRotating',
      render: function(ctx, left, top, _, fabricObject) {
        // 只对多选显示此控制点
        if (fabricObject.type !== 'activeSelection') return;

        const textboxes = fabricObject.getObjects().filter(obj => obj.type === 'textbox');
        if (textboxes.length < 2) return;

        const img = new Image();
        img.src = individualRotateIcon;
        if (img.complete) {
          ctx.save();
          ctx.translate(left, top);
          ctx.drawImage(img, -10, -10, 20, 20);
          ctx.restore();
        } else {
          // 如果图标未加载，绘制一个简单的圆形
          ctx.save();
          ctx.fillStyle = '#3b82f6';
          ctx.beginPath();
          ctx.arc(left, top, 8, 0, 2 * Math.PI);
          ctx.fill();
          ctx.restore();
        }
      }
    });

    // 事件监听
    canvas.on('selection:created', (e) => {
      const selected = e.selected || [];
      setSelectedObjects(selected);
      updateAIButton(selected);

      // 如果选中了单个文本框，显示它的当前样式
      if (selected.length === 1 && selected[0].type === 'textbox') {
        const textObj = selected[0];
        setFontSize(textObj.fontSize || 11);
        setTextAlign(textObj.textAlign || 'left');
        setLineSpacing(textObj.lineHeight || 1.2);
        setSelectedFont(textObj.fontFamily || 'Arial');
        setIsBold(textObj.fontWeight === 'bold');
        setIsItalic(textObj.fontStyle === 'italic');
      }
    });

    canvas.on('selection:updated', (e) => {
      const selected = e.selected || [];
      setSelectedObjects(selected);
      updateAIButton(selected);

      // 如果选中了单个文本框，显示它的当前样式
      if (selected.length === 1 && selected[0].type === 'textbox') {
        const textObj = selected[0];
        setFontSize(textObj.fontSize || 11);
        setTextAlign(textObj.textAlign || 'left');
        setLineSpacing(textObj.lineHeight || 1.2);
        setSelectedFont(textObj.fontFamily || 'Arial');
        setIsBold(textObj.fontWeight === 'bold');
        setIsItalic(textObj.fontStyle === 'italic');
      }
    });

    canvas.on('selection:cleared', () => {
      setSelectedObjects([]);
      setSelectedTextboxes([]);
      setAiButtonPosition(null);
    });

    // 同步遮罩位置和大小到文本框
    const syncMaskWithTextbox = (textbox) => {
      if (!textbox || textbox.type !== 'textbox') return;

      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      // 同步背景矩形（bgRect）
      if (textbox.bgRect) {
        // 如果遮罩被手动编辑过，不自动同步
        if (textbox.bgRect.manuallyEdited) {
          // 只确保层级关系正确，不改变位置和大小
          const textIndex = canvas.getObjects().indexOf(textbox);
          const maskIndex = canvas.getObjects().indexOf(textbox.bgRect);
          if (maskIndex > textIndex) {
            canvas.moveTo(textbox.bgRect, textIndex - 1);
          }
        } else {
          // 未手动编辑的遮罩，自动同步到文本框
          textbox.bgRect.set({
            left: textbox.left,
            top: textbox.top,
            width: textbox.width * textbox.scaleX,
            height: textbox.height * textbox.scaleY,
            scaleX: 1,
            scaleY: 1,
            angle: textbox.angle
          });
          textbox.bgRect.setCoords();

          // 确保遮罩在文本框下层
          const textIndex = canvas.getObjects().indexOf(textbox);
          const maskIndex = canvas.getObjects().indexOf(textbox.bgRect);
          if (maskIndex > textIndex) {
            canvas.moveTo(textbox.bgRect, textIndex - 1);
          }
        }
      }

      // 同步模糊背景（blurBackground）
      if (textbox.blurBackground) {
        textbox.blurBackground.set({
          left: textbox.left,
          top: textbox.top,
          scaleX: (textbox.width * textbox.scaleX) / textbox.blurBackground.width,
          scaleY: (textbox.height * textbox.scaleY) / textbox.blurBackground.height,
          angle: textbox.angle
        });
        textbox.blurBackground.setCoords();

        // 确保模糊背景在文本框下层
        const textIndex = canvas.getObjects().indexOf(textbox);
        const blurIndex = canvas.getObjects().indexOf(textbox.blurBackground);
        if (blurIndex > textIndex) {
          canvas.moveTo(textbox.blurBackground, textIndex - 1);
        }
      }
    };

    // 监听对象移动/缩放，更新AI按钮位置并同步遮罩
    canvas.on('object:moving', (e) => {
      updateAIButtonFromCanvas();

      // 在遮罩编辑模式下移动遮罩时，标记为手动编辑
      if (maskEditMode && e.target && e.target.type === 'rect' &&
          (e.target.isBlurBackground || e.target === e.target.associatedTextbox?.bgRect)) {
        e.target.manuallyEdited = true;
      }

      // 如果在遮罩编辑模式下，不同步遮罩位置（避免用户手动编辑遮罩时被文本框覆盖）
      if (e.target && e.target.type === 'textbox' && !maskEditMode) {
        syncMaskWithTextbox(e.target);
        canvas.renderAll();
      }
    });

    canvas.on('object:rotating', (e) => {
      updateAIButtonFromCanvas();

      const activeObject = e.target;

      // 处理单个文本框旋转，但遮罩编辑模式下不同步
      if (activeObject && activeObject.type === 'textbox' && !maskEditMode) {
        syncMaskWithTextbox(activeObject);
        canvas.renderAll();
      }
    });

    canvas.on('object:scaling', (e) => {
      updateAIButtonFromCanvas();

      // 在遮罩编辑模式下缩放遮罩时，标记为手动编辑
      if (maskEditMode && e.target && e.target.type === 'rect' &&
          (e.target.isBlurBackground || e.target === e.target.associatedTextbox?.bgRect)) {
        e.target.manuallyEdited = true;
      }

      // 遮罩编辑模式下不同步
      if (e.target && e.target.type === 'textbox' && !maskEditMode) {
        syncMaskWithTextbox(e.target);
        canvas.renderAll();
      }
    });

    // 监听文本选中事件，更新加粗/斜体按钮状态
    canvas.on('text:selection:changed', (e) => {
      if (e.target && e.target.type === 'textbox') {
        const textbox = e.target;

        // 如果有选中的文字，检查选中文字的样式
        if (textbox.selectionStart !== textbox.selectionEnd) {
          const styles = textbox.getSelectionStyles();
          if (styles && styles.length > 0) {
            // 检查选中文字是否加粗/斜体
            const hasBold = styles.some(style => style.fontWeight === 'bold');
            const hasItalic = styles.some(style => style.fontStyle === 'italic');
            setIsBold(hasBold);
            setIsItalic(hasItalic);
          }
        }
      }
    });

    // 多选文本框的右侧宽度调整功能
    let scalingData = null; // 存储缩放开始时的原始数据

    canvas.on('mouse:down', (e) => {
      const activeObject = canvas.getActiveObject();
      if (!activeObject || activeObject.type !== 'activeSelection') return;

      // 只处理文本框的多选
      const textboxes = activeObject.getObjects().filter(obj => obj.type === 'textbox');
      if (textboxes.length < 2) return;

      // 保存每个文本框的原始宽度和中心X坐标，以及遮罩的原始位置
      scalingData = {
        initialScaleX: activeObject.scaleX || 1,
        selectionWidth: activeObject.width || 1,
        groupMatrix: activeObject.calcTransformMatrix(), // 保存初始的组变换矩阵
        textboxes: textboxes.map(tb => ({
          obj: tb,
          originalWidth: tb.width,
          originalCenterX: tb.left + (tb.width / 2),
          originalLeft: tb.left,
          originalTop: tb.top,
          // 保存遮罩的原始绝对位置
          maskOriginalPos: tb.bgRect ? {
            left: tb.bgRect.left,
            top: tb.bgRect.top,
            width: tb.bgRect.width,
            height: tb.bgRect.height
          } : null
        }))
      };
    });

    canvas.on('object:scaling', (e) => {
      const activeObject = e.target;

      // 更新AI按钮位置
      updateAIButtonFromCanvas();

      // 检查是否是ActiveSelection
      if (!activeObject || activeObject.type !== 'activeSelection') return;

      // 获取控制点类型
      const transform = activeObject.__corner;

      // 检查是否是右侧中点控制（mr = middle-right）并且有scalingData
      if (transform === 'mr' && scalingData) {
        // 使用特殊的右侧中点处理逻辑（下面的代码会处理）
        // 这里不做处理，让后面的代码处理
      } else {
        // 对于其他控制点，禁用缩放（只允许右侧中点）
        activeObject.lockScalingX = true;
        activeObject.lockScalingY = true;
        return;
      }

      // 原有的右侧控制点特殊处理逻辑
      if (!scalingData) return;
      if (transform !== 'mr') return;

      // 只处理文本框
      const textboxes = activeObject.getObjects().filter(obj => obj.type === 'textbox');
      if (textboxes.length < 2) return;

      // 计算实际的宽度变化比例
      const currentScaleX = activeObject.scaleX;
      const scaleRatio = currentScaleX / scalingData.initialScaleX;

      // 对每个文本框应用宽度调整
      scalingData.textboxes.forEach(data => {
        // 计算新宽度，基于原始宽度和缩放比例
        const newWidth = Math.max(20, data.originalWidth * scaleRatio);

        // 保持中心位置不变，计算新的left值
        const newLeft = data.originalCenterX - (newWidth / 2);

        data.obj.set({
          width: newWidth,
          left: newLeft,
          top: data.originalTop, // 保持垂直位置不变
          scaleX: 1,
          scaleY: 1
        });

        // ✅ 修复遮罩同步 - 不使用变换矩阵，而是暂时隐藏遮罩
        if (data.obj.bgRect) {
          // 在缩放过程中暂时隐藏遮罩，避免飞走
          data.obj.bgRect.set({
            visible: false
          });
        }

        // 同步更新模糊背景
        if (data.obj.blurBackground) {
          const blurBg = data.obj.blurBackground;
          const padding = blurBg.blurPadding || 30;

          // 计算模糊背景的新位置和尺寸
          const imageWidth = imageRef.current ? imageRef.current.width : 10000;
          const newBlurLeft = Math.max(0, newLeft - padding);
          const maxBlurRight = Math.min(imageWidth, newLeft + newWidth + padding);
          const newBlurWidth = maxBlurRight - newBlurLeft;

          blurBg.set({
            left: newBlurLeft,
            width: newBlurWidth
          });
        }
      });

      // 重置ActiveSelection的缩放，防止累积
      activeObject.set({
        scaleX: 1,
        scaleY: 1
      });

      canvas.renderAll();
    });

    canvas.on('mouse:up', () => {
      // 清理个体旋转数据
      const activeObject = canvas.getActiveObject();
      if (activeObject && activeObject.type === 'activeSelection') {
        activeObject.__individualRotateStart = null;
        activeObject.__originalAngles = null;
      }

      // 清除缩放数据
      if (scalingData) {
        console.log('多选宽度调整完成');

        // 缩放结束后，重新同步所有背景遮罩的位置
        const activeObject = canvas.getActiveObject();
        if (activeObject && activeObject.type === 'activeSelection') {
          const textboxes = activeObject.getObjects().filter(obj => obj.type === 'textbox');

          // 获取ActiveSelection的变换矩阵
          const groupMatrix = activeObject.calcTransformMatrix();

          textboxes.forEach(textbox => {
            if (textbox.bgRect) {
              // 计算文本框在画布上的绝对位置
              const point = fabric.util.transformPoint(
                { x: textbox.left, y: textbox.top },
                groupMatrix
              );

              // 恢复遮罩的可见性并更新位置
              textbox.bgRect.set({
                left: point.x,
                top: point.y,
                width: textbox.width,
                height: textbox.height,
                scaleX: 1,
                scaleY: 1,
                angle: activeObject.angle || 0,
                visible: true  // 恢复可见性
              });
              textbox.bgRect.setCoords();
            }
          });

          canvas.renderAll();
        }

        scalingData = null;
      }
    });

    // 监听对象修改事件以保存历史和同步遮罩
    canvas.on('object:modified', (e) => {
      if (!isHistoryOperationRef.current) {
        saveHistory();
      }

      // 修改完成后同步遮罩位置
      const modifiedObject = e.target;
      if (modifiedObject) {
        // 检查是否在遮罩编辑模式下修改了遮罩
        if (maskEditMode && modifiedObject.type === 'rect' &&
            (modifiedObject.isBlurBackground || modifiedObject === modifiedObject.associatedTextbox?.bgRect)) {
          // 标记此遮罩为手动编辑过
          modifiedObject.manuallyEdited = true;
          console.log('标记遮罩为手动编辑:', modifiedObject);
        }

        // 遮罩编辑模式下不同步遮罩
        if (!maskEditMode) {
          if (modifiedObject.type === 'textbox' && modifiedObject.bgRect) {
            syncMaskWithTextbox(modifiedObject);
          } else if (modifiedObject.type === 'activeSelection') {
            // 多选修改完成后，同步所有文本框的遮罩
            const textboxes = modifiedObject.getObjects().filter(obj => obj.type === 'textbox');
            textboxes.forEach(textbox => {
              if (textbox.bgRect) {
                syncMaskWithTextbox(textbox);
              }
            });
          }
        }
        canvas.renderAll();
      }
    });

    canvas.on('text:changed', () => {
      if (!isHistoryOperationRef.current) {
        saveHistory();
      }
    });

    // ==================== Markdown 编辑/显示模式切换 ====================

    // 监听文本框开始编辑 - 恢复原始 markdown 文本
    canvas.on('text:editing:entered', (e) => {
      const textbox = e.target;
      if (!textbox || textbox.type !== 'textbox') return;

      // 如果有保存的原始 markdown 文本，恢复它
      if (textbox._markdownText) {
        textbox.text = textbox._markdownText;

        // 完全清除所有字符级样式，恢复为纯文本显示
        // 方法：将 styles 对象重置为空
        textbox.styles = {};

        textbox.dirty = true;
      }
      canvas.renderAll();
    });

    // 监听文本框结束编辑 - 移除标记并应用样式
    canvas.on('text:editing:exited', (e) => {
      const textbox = e.target;
      if (!textbox || textbox.type !== 'textbox') return;

      const originalText = textbox.text;

      // 保存原始 markdown 文本
      textbox._markdownText = originalText;

      // 移除 markdown 标记，得到纯文本
      const displayText = removeMarkdownTags(originalText);

      // 更新文本内容为不带标记的版本
      textbox.text = displayText;
      textbox.dirty = true;

      // 应用 markdown 样式到纯文本
      // 需要根据原始文本中的标记位置，计算出在新文本中的对应位置
      applyMarkdownStylesToCleanText(textbox, originalText, displayText);

      canvas.renderAll();
    });

    // 监听键盘事件
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        // 检查是否在输入框、textarea中
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' ||
                              activeElement.tagName === 'TEXTAREA' ||
                              activeElement.isContentEditable)) {
          return; // 在输入框中，不处理删除
        }

        // Backspace/Delete键删除选中的文本框和对应的遮罩
        const activeObject = canvas.getActiveObject();
        if (!activeObject) return;

        // 如果正在编辑文本，不删除
        if (activeObject.isEditing) return;

        e.preventDefault();
        handleDeleteSelected();
      }
    };

    // 监听页面滚动，更新AI按钮位置
    const handleScroll = () => {
      const activeSelection = canvas.getActiveObject();
      if (!activeSelection) return;

      // 获取当前选中的对象
      let selected = [];
      if (activeSelection.type === 'activeSelection') {
        selected = activeSelection.getObjects();
      } else {
        selected = [activeSelection];
      }

      updateAIButton(selected);
    };

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      canvas.dispose();
    };
  }, [fabricLoaded]);
  // 注意：此 useEffect 使用了多个函数（updateAIButton, saveHistory, handleUndo等）
  // 但这些函数不应加入依赖项，因为：
  // 1. Canvas 只应在 fabricLoaded 时初始化一次
  // 2. 事件监听器注册后不需要重新注册
  // 3. 如果加入依赖项会导致每次函数更新时重建整个 canvas
  
  // 记录上一次的图片URL
  const previousImageSrcRef = useRef(null);

  // 加载图片
  useEffect(() => {
    console.log('Image loading effect:', { fabricLoaded, imageSrc: !!imageSrc, canvas: !!fabricCanvasRef.current, initialized: initializedRef.current });
    if (!fabricLoaded || !imageSrc || !fabricCanvasRef.current) return;

    // 检查图片URL是否改变（用于旋转等场景）
    const imageChanged = previousImageSrcRef.current !== imageSrc;

    // 如果已经初始化过，且图片URL没有改变，则跳过
    if (initializedRef.current && !imageChanged) {
      console.log('Already initialized and same image, skipping...');
      return;
    }

    // 如果图片改变了，需要清除画布并重新加载
    if (imageChanged) {
      console.log('Image URL changed, clearing canvas and reloading...', {
        previous: previousImageSrcRef.current,
        current: imageSrc
      });

      // 清除画布上的所有对象
      const canvas = fabricCanvasRef.current;
      canvas.clear();

      // 重置初始化标记，允许重新加载
      initializedRef.current = false;
      previousImageSrcRef.current = imageSrc;
    }

    console.log('Loading image...');
    const canvas = fabricCanvasRef.current;

    // 确保 canvas 存在
    if (!canvas) {
      console.error('Canvas not initialized yet, skipping image load');
      return;
    }

    window.fabric.Image.fromURL(imageSrc, (img) => {
      // 再次检查 canvas 是否还存在（组件可能已卸载）
      if (!fabricCanvasRef.current) {
        console.warn('Canvas was destroyed before image loaded');
        return;
      }

      imageRef.current = img;

      // 设置画布大小
      canvas.setWidth(img.width);
      canvas.setHeight(img.height);

      // 设置图片为背景
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));

      console.log('Image loaded successfully');

      // 初始化文本区域
      initializeTextRegions(regions);

      // 标记为已初始化
      initializedRef.current = true;
    }, {
      crossOrigin: 'anonymous'
    });
  }, [fabricLoaded, imageSrc, regions]);

  // 清理函数 - 组件卸载时清理 canvas
  useEffect(() => {
    return () => {
      if (fabricCanvasRef.current) {
        console.log('Cleaning up fabric canvas');
        try {
          fabricCanvasRef.current.dispose();
        } catch (e) {
          console.error('Error disposing canvas:', e);
        }
        fabricCanvasRef.current = null;
      }
      initializedRef.current = false; // 重置初始化标记
    };
  }, []);
  
  // 保存历史记录
  const saveHistory = () => {
    if (!fabricCanvasRef.current || isHistoryOperationRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    const currentState = JSON.stringify(canvas.toJSON(['id', 'hasBackground', 'isMerged']));
    
    // 如果当前不是最新的历史记录，删除后面的记录
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }
    
    // 添加新的历史记录
    historyRef.current.push(currentState);
    historyIndexRef.current++;
    
    // 限制历史记录数量（最多保存50条）
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
    
    updateHistoryButtons();
  };
  
  // 更新撤销/重做按钮状态
  const updateHistoryButtons = () => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };
  
  // 撤销操作
  const handleUndo = () => {
    if (!fabricCanvasRef.current || historyIndexRef.current <= 0) return;
    
    const canvas = fabricCanvasRef.current;
    historyIndexRef.current--;
    isHistoryOperationRef.current = true;
    
    canvas.loadFromJSON(historyRef.current[historyIndexRef.current], () => {
      canvas.renderAll();
      isHistoryOperationRef.current = false;
      updateHistoryButtons();
      
      // 更新引用
      updateObjectReferences();
    });
  };
  
  // 重做操作
  const handleRedo = () => {
    if (!fabricCanvasRef.current || historyIndexRef.current >= historyRef.current.length - 1) return;
    
    const canvas = fabricCanvasRef.current;
    historyIndexRef.current++;
    isHistoryOperationRef.current = true;
    
    canvas.loadFromJSON(historyRef.current[historyIndexRef.current], () => {
      canvas.renderAll();
      isHistoryOperationRef.current = false;
      updateHistoryButtons();
      
      // 更新引用
      updateObjectReferences();
    });
  };
  
  // 更新对象引用
  const updateObjectReferences = () => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    
    textObjectsRef.current = [];
    backgroundRectsRef.current = [];
    
    canvas.getObjects().forEach((obj) => {
      if (obj.type === 'textbox' && obj.id !== undefined) {
        textObjectsRef.current[obj.id] = obj;
      } else if (obj.type === 'rect' && obj.hasBackground) {
        const textId = obj.id;
        if (textId !== undefined) {
          backgroundRectsRef.current[textId] = obj;
        }
      }
    });
  };
  
  // 初始化文本区域
  const initializeTextRegions = async (regionsData) => {
    if (!fabricCanvasRef.current || !regionsData || !window.fabric) return;

    console.log('Initializing text regions...', regionsData);
    const canvas = fabricCanvasRef.current;

    // 清除所有对象
    canvas.clear();

    // 重新设置背景图片
    if (imageRef.current) {
      canvas.setBackgroundImage(imageRef.current, canvas.renderAll.bind(canvas));
    }

    textObjectsRef.current = [];
    backgroundRectsRef.current = [];

    const bgRects = [];
    const texts = [];

    regionsData.forEach((region, index) => {
      // 支持两种格式：带points的原始格式，和带x,y,width,height的保存格式
      let minX, minY, width, height;

      if (region.x !== undefined && region.y !== undefined && region.width !== undefined && region.height !== undefined) {
        // 保存的格式（从getCurrentRegions来的）
        minX = region.x;
        minY = region.y;
        width = region.width;
        height = region.height;
      } else if (region.points && region.points.length >= 4) {
        // 原始格式
        const points = region.points;
        minX = Math.min(...points.map(p => p.x));
        minY = Math.min(...points.map(p => p.y));
        const maxX = Math.max(...points.map(p => p.x));
        const maxY = Math.max(...points.map(p => p.y));
        width = maxX - minX;
        height = maxY - minY;
      } else {
        // 无效的region，跳过
        return;
      }
      
      const textContent = region.dst || region.src || '';
      const calculatedFontSize = calculateFontSize(width, height, textContent);
      
      // 调试信息
      console.log(`区域 ${index}: width=${width}, height=${height}, 文本="${textContent}", 计算字号=${calculatedFontSize}`);
      
      // 创建背景矩形或模糊背景
      let bgRect = null;
      if (!region.isMerged) {
        // 非合并文本：创建透明背景矩形
        // 如果有手动编辑过的遮罩位置，使用保存的位置
        const maskLeft = region.maskManuallyEdited ? region.maskX : minX;
        const maskTop = region.maskManuallyEdited ? region.maskY : minY;
        const maskWidth = region.maskManuallyEdited ? region.maskWidth : width;
        const maskHeight = region.maskManuallyEdited ? region.maskHeight : height;

        bgRect = new window.fabric.Rect({
          left: maskLeft,
          top: maskTop,
          width: maskWidth,
          height: maskHeight,
          angle: region.maskAngle || 0, // 恢复遮罩旋转角度
          fill: 'transparent',
          stroke: 'transparent',
          strokeWidth: 0,
          selectable: false,
          evented: false,
          regionIndex: index,
          manuallyEdited: region.maskManuallyEdited || false
        });
      } else {
        // 合并文本：创建模糊背景
        bgRect = createBlurBackground({
          left: minX,
          top: minY,
          width: width,
          height: height,
          angle: region.angle || 0, // 恢复旋转角度
          textObj: null, // 稍后关联
          mergedIndexes: region.mergedIndexes || [],
          mergedBounds: { left: minX, top: minY, width, height }
        });
      }
      
      // 创建文本对象
      const text = new window.fabric.Textbox(textContent, {
        left: minX,
        top: minY,
        width: width,
        angle: region.angle || 0, // 恢复旋转角度
        // 使用保存的格式属性，如果没有则使用默认值
        fontSize: region.fontSize || calculatedFontSize,
        fontFamily: region.fontFamily || selectedFont,
        fill: region.fill || selectedColor,
        textAlign: region.textAlign || 'center',
        lineHeight: region.lineHeight || 1.2,
        splitByGrapheme: false, // 按单词换行，不截断英文单词
        selectable: true,
        editable: true,
        originX: 'left',
        originY: 'top'
      });

      // ========== Markdown 初始化处理 ==========
      // 保存原始 markdown 文本
      text._markdownText = textContent;

      // 移除 markdown 标记，显示格式化后的文本
      const displayText = removeMarkdownTags(textContent);
      text.text = displayText;

      // 应用 markdown 样式
      applyMarkdownStylesToCleanText(text, textContent, displayText);

      // 添加自定义属性
      if (region.isMerged) {
        // 合并的文本不需要regionIndex，但可以添加标记
        text.isMerged = true;
        // 关联模糊背景和文本
        if (bgRect) {
          bgRect.textObj = text;
          text.blurBackground = bgRect;
        }
      } else if (region.id !== undefined) {
        text.regionId = region.id;
        text.regionIndex = index;
      } else {
        text.regionIndex = index;
      }

      // 设置文本框样式（统一使用蓝色主题）
      text.set({
        borderColor: '#2196F3',
        cornerColor: '#2196F3',
        cornerSize: 10,
        transparentCorners: false,
        hasRotatingPoint: false
      });

      if (bgRect) {
        if (!region.isMerged) {
          // 只有非合并的文本才添加到背景矩形数组
          backgroundRectsRef.current.push(bgRect);
        }
        // 建立双向关联
        text.bgRect = bgRect;
        bgRect.textObj = text;
        bgRect.associatedTextbox = text; // 新增：确保双向关联
        bgRects.push(bgRect);
      }

      textObjectsRef.current.push(text);
      texts.push(text);
    });
    
    // 先添加所有背景矩形
    bgRects.forEach(bgRect => {
      canvas.add(bgRect);
    });

    // 应用智能填充到所有背景（只对非模糊背景的矩形应用）
    for (const bgRect of bgRects) {
      // 跳过已经是模糊背景的对象（fabric.Image）
      if (bgRect.type !== 'image' && !bgRect.isBlurBackground) {
        await applySmartFill(bgRect);
      }
    }
    
    // 最后添加所有文本，确保它们在最上层
    texts.forEach(text => {
      canvas.add(text);
      
      // 为每个文本添加事件监听
      // 注释掉moving事件，让遮罩始终保持在百度API返回的原始位置
      // text.on('moving', function() {
      //   if (this.bgRect) {
      //     this.bgRect.set({
      //       left: this.left,
      //       top: this.top
      //     });
      //     canvas.renderAll();
      //   }
      // });
      
      text.on('scaling', function() {
        // 计算新的宽度和高度
        const newWidth = this.width * this.scaleX;
        const newHeight = this.height * this.scaleY;
        
        // 更新文本框大小但保持字体大小不变
        this.set({
          width: newWidth,
          height: newHeight,
          scaleX: 1,
          scaleY: 1
        });
        
        // 同步更新背景
        if (this.bgRect) {
          this.bgRect.set({
            width: newWidth,
            height: newHeight
          });
          canvas.renderAll();
        }
      });
      
      // 添加缩放结束后的处理
      text.on('modified', function() {
        // 让Fabric.js自动处理文本框的缩放，不手动干预
        canvas.renderAll();
      });
      
      // 监听文本编辑结束，同步更新背景大小
      text.on('editing:exited', function() {
        if (this.bgRect) {
          // 获取文本框的实际大小
          const bounds = this.getBoundingRect();
          const scaleX = this.scaleX || 1;
          const scaleY = this.scaleY || 1;
          
          // 更新背景大小
          this.bgRect.set({
            width: this.width * scaleX,
            height: this.height * scaleY
          });
          canvas.renderAll();
        }
      });
      
      // 监听文本内容改变
      text.on('changed', function() {
        if (this.bgRect) {
          // 延迟更新，等待文本框自动调整完成
          setTimeout(() => {
            const scaleX = this.scaleX || 1;
            const scaleY = this.scaleY || 1;
            this.bgRect.set({
              width: this.width * scaleX,
              height: this.height * scaleY
            });
            canvas.renderAll();
          }, 10);
        }
      });
      
      text.on('rotating', function() {
        if (this.bgRect) {
          // 同步旋转角度
          this.bgRect.set({
            angle: this.angle
          });
          canvas.renderAll();
        }
      });
    });
    
    canvas.renderAll();
    console.log('Text regions initialized');
    
    // 保存初始状态到历史记录
    setTimeout(() => {
      saveHistory();
    }, 100);
  };
  
  // 计算合适的字体大小 - 根据文本内容和矩形宽度
  const calculateFontSize = (width, height, text = '') => {
    if (!text || text.length === 0) {
      // 如果没有文本，使用默认计算
      return Math.max(12, Math.min(32, Math.floor(height * 0.3)));
    }
    
    // 估算字符宽度：中文字符约等于字号，英文字符约等于字号的0.6倍
    const estimateTextWidth = (fontSize, textContent) => {
      let totalWidth = 0;
      for (let char of textContent) {
        if (/[\u4e00-\u9fff]/.test(char)) {
          // 中文字符
          totalWidth += fontSize;
        } else if (/[A-Za-z0-9]/.test(char)) {
          // 英文字符和数字
          totalWidth += fontSize * 0.6;
        } else {
          // 其他字符（标点等）
          totalWidth += fontSize * 0.4;
        }
      }
      return totalWidth;
    };
    
    // 从一个较大的字号开始，逐渐减小直到能放下
    let fontSize = Math.min(40, Math.floor(height * 0.8)); // 从高度的80%开始
    const minFontSize = 8;
    const maxFontSize = 40;
    
    // 留一些边距
    const availableWidth = width * 0.9; // 使用90%的宽度，留10%边距
    
    while (fontSize > minFontSize) {
      const estimatedWidth = estimateTextWidth(fontSize, text);
      if (estimatedWidth <= availableWidth) {
        break; // 找到合适的字号
      }
      fontSize -= 1;
    }
    
    return Math.max(minFontSize, Math.min(maxFontSize, fontSize));
  };
  
  // 创建高斯模糊滤镜效果
  const createBlurFilter = () => {
    if (!window.fabric || !window.fabric.Image.filters) return null;
    
    // 创建一个自定义滤镜
    const BlurFilter = fabric.util.createClass(fabric.Image.filters.BaseFilter, {
      type: 'GaussianBlur',
      
      fragmentSource: `
        precision highp float;
        uniform sampler2D uTexture;
        uniform float uBlurRadius;
        uniform vec2 uDelta;
        varying vec2 vTexCoord;
        
        void main() {
          vec4 color = vec4(0.0);
          float total = 0.0;
          
          // 高斯核
          for (float x = -4.0; x <= 4.0; x += 1.0) {
            float weight = exp(-0.5 * pow(x / 2.0, 2.0)) / 2.506628274631;
            vec2 offset = vec2(x * uDelta.x * uBlurRadius, x * uDelta.y * uBlurRadius);
            color += texture2D(uTexture, vTexCoord + offset) * weight;
            total += weight;
          }
          
          gl_FragColor = color / total;
          gl_FragColor.a = 0.95; // 设置透明度
        }
      `,
      
      mainParameter: 'uBlurRadius',
      
      applyTo: function(options) {
        if (options.webgl) {
          // WebGL实现
          options.passes++;
          const gl = options.context;
          
          if (options.passes === 1) {
            // 水平模糊
            this.uniforms.uDelta = [1 / options.sourceWidth, 0];
          } else {
            // 垂直模糊
            this.uniforms.uDelta = [0, 1 / options.sourceHeight];
          }
          
          this.sendUniformData(gl);
        } else {
          // Canvas 2D 实现
          this.applyTo2d(options);
        }
      },
      
      applyTo2d: function(options) {
        const imageData = options.imageData;
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const radius = this.uBlurRadius || 10;
        
        // 简单的盒式模糊
        const output = new Uint8ClampedArray(data);
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, a = 0, count = 0;
            
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const ny = Math.min(Math.max(y + dy, 0), height - 1);
                const nx = Math.min(Math.max(x + dx, 0), width - 1);
                const idx = (ny * width + nx) * 4;
                
                r += data[idx];
                g += data[idx + 1];
                b += data[idx + 2];
                a += data[idx + 3];
                count++;
              }
            }
            
            const idx = (y * width + x) * 4;
            output[idx] = r / count;
            output[idx + 1] = g / count;
            output[idx + 2] = b / count;
            output[idx + 3] = a / count * 0.95; // 透明度
          }
        }
        
        for (let i = 0; i < data.length; i++) {
          data[i] = output[i];
        }
      },
      
      uniforms: {
        uBlurRadius: 15.0,
        uDelta: [0, 0]
      }
    });
    
    return BlurFilter;
  };
  
  // 智能采样背景色，避免采样到文字
  const sampleBackgroundColor = (ctx, bounds) => {
    const { left, top, width, height } = bounds;
    const sampleSize = 5; // 采样区域大小
    const edgeOffset = 10; // 从边缘向内的偏移量
    
    // 定义采样点：四个角和四个边的中点附近
    const samplePoints = [
      // 四个角
      { x: left + edgeOffset, y: top + edgeOffset },
      { x: left + width - edgeOffset, y: top + edgeOffset },
      { x: left + edgeOffset, y: top + height - edgeOffset },
      { x: left + width - edgeOffset, y: top + height - edgeOffset },
      // 四个边的中点
      { x: left + width / 2, y: top + edgeOffset },
      { x: left + width / 2, y: top + height - edgeOffset },
      { x: left + edgeOffset, y: top + height / 2 },
      { x: left + width - edgeOffset, y: top + height / 2 }
    ];
    
    let totalR = 0, totalG = 0, totalB = 0;
    let validSamples = 0;
    
    // 对每个采样点进行采样
    samplePoints.forEach(point => {
      try {
        const imageData = ctx.getImageData(
          Math.round(point.x - sampleSize / 2),
          Math.round(point.y - sampleSize / 2),
          sampleSize,
          sampleSize
        );
        const data = imageData.data;
        
        // 计算采样区域的平均颜色
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        
        if (count > 0) {
          totalR += r / count;
          totalG += g / count;
          totalB += b / count;
          validSamples++;
        }
      } catch (e) {
        // 忽略超出边界的采样点
      }
    });
    
    // 计算最终的平均颜色
    if (validSamples > 0) {
      return {
        r: Math.round(totalR / validSamples),
        g: Math.round(totalG / validSamples),
        b: Math.round(totalB / validSamples)
      };
    }
    
    // 默认返回浅灰色
    return { r: 245, g: 245, b: 245 };
  };
  
  // 直接在背景图上应用模糊效果
  const applyBlurToBackground = async (bounds) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageRef.current) return;
    
    // 获取背景图像
    const bgImage = canvas.backgroundImage;
    if (!bgImage) return;
    
    console.log('Applying blur to background at:', bounds);
    
    // 创建临时canvas来处理图像
    const tempCanvas = document.createElement('canvas');
    const originalCanvas = bgImage.getElement();
    tempCanvas.width = originalCanvas.width;
    tempCanvas.height = originalCanvas.height;
    const ctx = tempCanvas.getContext('2d');
    
    // 复制原图
    ctx.drawImage(originalCanvas, 0, 0);
    
    // 在指定区域应用模糊
    const imageData = ctx.getImageData(
      Math.round(bounds.left),
      Math.round(bounds.top),
      Math.round(bounds.width),
      Math.round(bounds.height)
    );
    
    // 简单的模糊算法
    const data = imageData.data;
    const radius = 15; // 模糊半径
    const width = imageData.width;
    const height = imageData.height;
    
    // 创建一个副本来存储原始数据
    const originalData = new Uint8ClampedArray(data);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        let count = 0;
        
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const idx = (ny * width + nx) * 4;
              r += originalData[idx];
              g += originalData[idx + 1];
              b += originalData[idx + 2];
              a += originalData[idx + 3];
              count++;
            }
          }
        }
        
        const idx = (y * width + x) * 4;
        data[idx] = Math.round(r / count);
        data[idx + 1] = Math.round(g / count);
        data[idx + 2] = Math.round(b / count);
        data[idx + 3] = Math.round(a / count);
      }
    }
    
    // 将模糊后的数据放回
    ctx.putImageData(imageData, Math.round(bounds.left), Math.round(bounds.top));
    
    // 采样背景色
    const backgroundColor = sampleBackgroundColor(ctx, bounds);
    
    // 在模糊区域上添加背景色蒙版
    ctx.fillStyle = `rgba(${backgroundColor.r}, ${backgroundColor.g}, ${backgroundColor.b}, 0.7)`;
    ctx.fillRect(
      Math.round(bounds.left),
      Math.round(bounds.top),
      Math.round(bounds.width),
      Math.round(bounds.height)
    );
    
    console.log('Applied background color overlay:', backgroundColor);
    
    // 创建新的背景图像
    return new Promise((resolve) => {
      fabric.Image.fromURL(tempCanvas.toDataURL(), (img) => {
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
          scaleX: bgImage.scaleX,
          scaleY: bgImage.scaleY
        });
        imageRef.current = img;
        resolve();
      });
    });
  };
  
  // 创建简单的模糊背景矩形（保留为兼容）
  const createBlurBackground = (options) => {
    const { left, top, width, height, angle, textObj, mergedIndexes } = options;

    if (!imageRef.current) {
      console.error('createBlurBackground: imageRef.current is null');
      return null;
    }

    console.log('Creating blur background with options:', {
      left, top, width, height,
      hasTextObj: !!textObj,
      mergedIndexes: mergedIndexes || 'none'
    });

    const image = imageRef.current.getElement();

    if (!image || !image.width || !image.height) {
      console.error('createBlurBackground: invalid image element', {
        hasImage: !!image,
        width: image?.width,
        height: image?.height
      });
      return null;
    }

    console.log('Image dimensions:', { width: image.width, height: image.height });

    // 验证输入参数的有效性
    if (isNaN(left) || isNaN(top) || isNaN(width) || isNaN(height)) {
      console.error('createBlurBackground: invalid input parameters', { left, top, width, height });
      return null;
    }

    if (width <= 0 || height <= 0) {
      console.error('createBlurBackground: width or height is zero or negative', { width, height });
      return null;
    }

    // 扩展padding用于更好的边缘羽化效果
    const blurPadding = 30;

    // 计算扩展后的区域（确保不超出图像边界）
    const expandedLeft = Math.max(0, Math.round(left - blurPadding));
    const expandedTop = Math.max(0, Math.round(top - blurPadding));
    const expandedRight = Math.min(image.width, Math.round(left + width + blurPadding));
    const expandedBottom = Math.min(image.height, Math.round(top + height + blurPadding));

    const expandedWidth = expandedRight - expandedLeft;
    const expandedHeight = expandedBottom - expandedTop;

    console.log('Expanded dimensions:', {
      expandedLeft, expandedTop, expandedWidth, expandedHeight,
      expandedRight, expandedBottom
    });

    // 验证尺寸有效性
    if (expandedWidth <= 0 || expandedHeight <= 0) {
      console.error('Invalid blur background dimensions:', {
        expandedWidth, expandedHeight,
        input: { left, top, width, height },
        image: { width: image.width, height: image.height }
      });
      return null;
    }

    // 创建扩展尺寸的临时canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = expandedWidth;
    tempCanvas.height = expandedHeight;
    const ctx = tempCanvas.getContext('2d');

    // 1. 绘制扩展区域的原图
    ctx.drawImage(
      image,
      expandedLeft, expandedTop, expandedWidth, expandedHeight,  // 源：扩展区域
      0, 0, expandedWidth, expandedHeight                         // 目标：整个canvas
    );

    // 2. 创建一个新的canvas用于应用模糊，避免重复绘制问题
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = expandedWidth;
    blurCanvas.height = expandedHeight;
    const blurCtx = blurCanvas.getContext('2d');

    // 应用模糊滤镜到新canvas
    blurCtx.filter = 'blur(15px)';
    blurCtx.drawImage(tempCanvas, 0, 0);
    blurCtx.filter = 'none';

    // 将模糊结果复制回主canvas
    ctx.clearRect(0, 0, expandedWidth, expandedHeight);
    ctx.drawImage(blurCanvas, 0, 0);

    // 3. 添加带羽化的半透明白色遮罩
    // 使用像素级别的距离计算来创建平滑的羽化效果
    const innerLeft = left - expandedLeft;
    const innerTop = top - expandedTop;
    const innerRight = innerLeft + width;
    const innerBottom = innerTop + height;

    // 创建一个临时canvas用于绘制遮罩
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = expandedWidth;
    maskCanvas.height = expandedHeight;
    const maskCtx = maskCanvas.getContext('2d');

    // 获取像素数据
    const imageData = maskCtx.createImageData(expandedWidth, expandedHeight);
    const data = imageData.data;

    // 对每个像素计算到中心矩形的距离，生成平滑的羽化
    for (let y = 0; y < expandedHeight; y++) {
      for (let x = 0; x < expandedWidth; x++) {
        const idx = (y * expandedWidth + x) * 4;

        // 计算当前像素到中心矩形的距离
        let distX = 0;
        let distY = 0;

        if (x < innerLeft) {
          distX = innerLeft - x;
        } else if (x > innerRight) {
          distX = x - innerRight;
        }

        if (y < innerTop) {
          distY = innerTop - y;
        } else if (y > innerBottom) {
          distY = y - innerBottom;
        }

        // 使用欧几里得距离
        const distance = Math.sqrt(distX * distX + distY * distY);

        // 根据距离计算透明度（羽化范围是blurPadding）
        const alpha = Math.max(0, Math.min(1, 1 - distance / blurPadding)) * 0.7;

        // 设置白色遮罩
        data[idx] = 255;     // R
        data[idx + 1] = 255; // G
        data[idx + 2] = 255; // B
        data[idx + 3] = alpha * 255; // A
      }
    }

    // 将遮罩绘制到主canvas上
    maskCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(maskCanvas, 0, 0);

    // 4. 创建fabric图像对象（使用扩展后的位置和尺寸）
    const blurImage = new window.fabric.Image(tempCanvas, {
      left: expandedLeft,
      top: expandedTop,
      width: expandedWidth,
      height: expandedHeight,
      angle: angle || 0, // 设置旋转角度
      selectable: false,
      evented: false,
      originX: 'left',
      originY: 'top',
      scaleX: 1,
      scaleY: 1
    });

    // 保存关联信息
    blurImage.textObj = textObj;
    blurImage.mergedIndexes = mergedIndexes;
    blurImage.isBlurBackground = true;
    blurImage.mergedBounds = options.mergedBounds;
    blurImage.blurPadding = blurPadding;

    return blurImage;
  };
  
  // 应用模糊滤镜背景
  const applySmartFill = async (bgRect) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !window.fabric) return;
    
    try {
      // 对于合并的矩形，创建模糊背景
      if (bgRect.mergedIndexes && bgRect.mergedBounds) {
        const bounds = bgRect.mergedBounds;
        const blurImage = createBlurBackground({
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          textObj: bgRect.textObj,
          mergedIndexes: bgRect.mergedIndexes,
          mergedBounds: bounds
        });
        
        if (blurImage) {
          // 替换原矩形
          const index = canvas.getObjects().indexOf(bgRect);
          canvas.remove(bgRect);
          canvas.insertAt(blurImage, index);
          
          // 更新引用
          if (bgRect.textObj) {
            bgRect.textObj.bgRect = blurImage;
          }
        } else {
          // 如果创建失败，使用备用方案
          bgRect.set({
            fill: 'rgba(255, 255, 255, 0.95)',
            stroke: 'transparent',
            strokeWidth: 0
          });
        }
        
      } else {
        // 普通矩形使用简单填充
        bgRect.set({
          fill: 'rgba(255, 255, 255, 0.9)',
          stroke: 'transparent',
          strokeWidth: 0
        });
      }
      
      canvas.renderAll();
      
    } catch (error) {
      console.error('Smart fill error:', error);
      // 备用方案：使用半透明白色
      bgRect.set({ 
        fill: 'rgba(255, 255, 255, 0.95)',
        stroke: 'transparent',
        strokeWidth: 0
      });
      canvas.renderAll();
    }
  };
  
  // 切换区域显示状态
  const toggleRegion = (index) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    
    const bgRect = backgroundRectsRef.current[index];
    
    if (!bgRect) return;
    
    // 切换背景矩形的可见性
    bgRect.set({
      visible: !bgRect.visible
    });
    
    canvas.renderAll();
  };
  
  // 切换所有区域的显示状态
  const toggleAllRegions = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // 检查是否有任何区域是隐藏的
    const hasHidden = backgroundRectsRef.current.some(rect =>
      rect && !rect.visible
    );

    // 获取所有背景矩形（包括合并的）
    const allBgRects = canvas.getObjects().filter(obj =>
      obj.type === 'rect' && (obj.regionIndex !== undefined || obj.mergedIndexes)
    );

    // 如果有隐藏的，全部显示；否则全部隐藏
    allBgRects.forEach(bgRect => {
      bgRect.set({ visible: hasHidden });
    });

    canvas.renderAll();
  };

  // 切换遮罩层编辑模式
  const toggleMaskEditMode = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const newMode = !maskEditMode;
    setMaskEditMode(newMode);

    // 获取所有文本框和遮罩
    canvas.getObjects().forEach(obj => {
      if (obj.type === 'textbox') {
        // 切换文本框的可见性
        obj.set({
          visible: !newMode,
          selectable: !newMode,
          evented: !newMode
        });
      } else if (obj.type === 'rect' || obj.type === 'image') {
        // 检查是否是遮罩层（bgRect、blurBackground或自定义遮罩）
        const isMask = obj.isBlurBackground || (obj.regionIndex !== undefined) || obj.mergedIndexes || obj.isCustomMask;
        if (isMask) {
          // 在遮罩编辑模式下，让遮罩可选择和可编辑
          obj.set({
            selectable: newMode,
            evented: newMode,
            stroke: newMode ? '#FF6B6B' : 'transparent',
            strokeWidth: newMode ? 2 : 0
          });
        }
      }
    });

    canvas.discardActiveObject();
    canvas.renderAll();

    console.log(`遮罩编辑模式: ${newMode ? '开启' : '关闭'}`);
  };

  // 创建新遮罩层
  const createNewMask = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !imageRef.current) return;

    // 在画布中心创建一个新的白色遮罩矩形
    const centerX = imageRef.current.width / 2;
    const centerY = imageRef.current.height / 2;
    const defaultWidth = 200;
    const defaultHeight = 100;

    const newMask = new window.fabric.Rect({
      left: centerX - defaultWidth / 2,
      top: centerY - defaultHeight / 2,
      width: defaultWidth,
      height: defaultHeight,
      fill: 'rgba(255, 255, 255, 0.9)',
      stroke: '#FF6B6B',
      strokeWidth: 2,
      selectable: maskEditMode,
      evented: maskEditMode,
      originX: 'left',
      originY: 'top',
      isCustomMask: true // 标记为用户创建的自定义遮罩
    });

    canvas.add(newMask);

    // 确保新遮罩在文本框之下
    const objects = canvas.getObjects();
    const firstTextboxIndex = objects.findIndex(obj => obj.type === 'textbox');
    if (firstTextboxIndex !== -1) {
      canvas.moveTo(newMask, firstTextboxIndex);
    }

    canvas.setActiveObject(newMask);
    canvas.renderAll();
    saveHistory();

    console.log('创建新遮罩层');
  };

  // 删除选中的文本框和对应的遮罩
  const handleDeleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;

    let objectsToDelete = [];
    let masksToDelete = [];

    // 在遮罩编辑模式下，优先处理遮罩删除
    if (maskEditMode) {
      // 处理多选
      if (activeObject.type === 'activeSelection') {
        const selectedMasks = activeObject.getObjects().filter(obj => {
          return obj.type === 'rect' && (obj.isBlurBackground || obj.regionIndex !== undefined ||
                 obj.mergedIndexes || obj.isCustomMask || obj === obj.associatedTextbox?.bgRect);
        });

        selectedMasks.forEach(mask => {
          canvas.remove(mask);
        });

        if (selectedMasks.length > 0) {
          canvas.discardActiveObject();
          canvas.renderAll();
          saveHistory();
          console.log(`删除了 ${selectedMasks.length} 个遮罩层`);
          return;
        }
      }
      // 处理单选遮罩
      else if (activeObject.type === 'rect' || activeObject.type === 'image') {
        const isMask = activeObject.isBlurBackground || activeObject.regionIndex !== undefined ||
                      activeObject.mergedIndexes || activeObject.isCustomMask ||
                      activeObject === activeObject.associatedTextbox?.bgRect;
        if (isMask) {
          // 如果是关联的bgRect，断开关联
          if (activeObject.associatedTextbox) {
            activeObject.associatedTextbox.bgRect = null;
          }
          canvas.remove(activeObject);
          canvas.renderAll();
          saveHistory();
          console.log('删除遮罩层');
          return;
        }
      }
    }

    // 处理文本框删除
    if (activeObject.type === 'activeSelection') {
      // 多选
      objectsToDelete = activeObject.getObjects().filter(obj => obj.type === 'textbox');
    } else if (activeObject.type === 'textbox') {
      // 单选文本框
      objectsToDelete = [activeObject];
    }

    if (objectsToDelete.length === 0) return;

    // 收集要删除的遮罩
    objectsToDelete.forEach(textbox => {
      // 删除关联的背景遮罩（bgRect）
      if (textbox.bgRect) {
        masksToDelete.push(textbox.bgRect);
      }
      // 删除关联的模糊背景（blurBackground）
      if (textbox.blurBackground) {
        masksToDelete.push(textbox.blurBackground);
      }
    });

    // 删除文本框
    objectsToDelete.forEach(obj => {
      canvas.remove(obj);
      // 从引用数组中移除
      const index = textObjectsRef.current.indexOf(obj);
      if (index > -1) {
        textObjectsRef.current.splice(index, 1);
      }
    });

    // 删除遮罩
    masksToDelete.forEach(mask => {
      canvas.remove(mask);
    });

    canvas.discardActiveObject();
    canvas.renderAll();
    saveHistory();

    console.log(`已删除 ${objectsToDelete.length} 个文本框和 ${masksToDelete.length} 个遮罩`);
  };

  // 刷新选中文本框的白色遮罩
  const refreshAllBackgrounds = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();

    if (!activeObject) {
      alert('请先选择要刷新遮罩的文本框');
      return;
    }

    let refreshCount = 0;
    const textboxesToRefresh = [];

    // 如果是多选
    if (activeObject.type === 'activeSelection') {
      activeObject.forEachObject(obj => {
        if (obj.type === 'textbox') {
          textboxesToRefresh.push(obj);
        }
      });
    } else if (activeObject.type === 'textbox') {
      textboxesToRefresh.push(activeObject);
    }

    if (textboxesToRefresh.length === 0) {
      alert('当前选中的对象中没有文本框');
      return;
    }

    console.log(`开始刷新 ${textboxesToRefresh.length} 个文本框的白色遮罩...`);

    textboxesToRefresh.forEach(obj => {
      // 只处理普通文本框的白色遮罩（bgRect）
      if (obj.bgRect && !obj.isMerged && obj.bgRect.type === 'rect') {
        const scaleX = obj.scaleX || 1;
        const scaleY = obj.scaleY || 1;

        obj.bgRect.set({
          left: obj.left,
          top: obj.top,
          width: obj.width * scaleX,
          height: obj.height * scaleY,
          angle: obj.angle || 0
        });
        refreshCount++;

        console.log(`刷新文本框遮罩: left=${obj.left}, top=${obj.top}, width=${obj.width * scaleX}, height=${obj.height * scaleY}`);
      }
    });

    canvas.renderAll();
    console.log(`白色遮罩刷新完成，共刷新 ${refreshCount} 个遮罩`);

    // 保存历史
    saveHistory();
  };
  
  // 合并选中的文本
  const mergeSelectedObjects = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || selectedObjects.length < 2) return;
    
    // 筛选出文本对象
    const textObjects = selectedObjects.filter(obj => obj.type === 'textbox');
    if (textObjects.length < 2) return;
    
    // 收集要合并的区域索引和背景矩形
    const mergedIndexes = [];
    const bgRectsToRemove = [];
    
    textObjects.forEach(textObj => {
      if (textObj.regionIndex !== undefined) {
        mergedIndexes.push(textObj.regionIndex);
        if (backgroundRectsRef.current[textObj.regionIndex]) {
          bgRectsToRemove.push(backgroundRectsRef.current[textObj.regionIndex]);
        }
      }
    });
    
    // 计算合并区域的边界（使用原始区域的坐标）
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const texts = [];

    // 调试：打印所有选中的文本框信息
    console.log('=== 合并文本框调试信息 ===');
    console.log('选中的文本框数量:', textObjects.length);
    textObjects.forEach((textObj, idx) => {
      const bounds = textObj.getBoundingRect();
      console.log(`文本框 ${idx}:`, {
        text: textObj.text.substring(0, 20) + '...',
        left: textObj.left,
        top: textObj.top,
        width: textObj.width,
        height: textObj.height,
        scaleX: textObj.scaleX,
        scaleY: textObj.scaleY,
        boundingRect: bounds,
        regionIndex: textObj.regionIndex
      });
    });

    // 按位置排序文本
    const sortedTexts = textObjects.sort((a, b) => {
      const aY = a.top + a.height / 2;
      const bY = b.top + b.height / 2;
      
      if (Math.abs(aY - bY) < 20) {
        return a.left - b.left; // 同一行按X排序
      }
      return aY - bY; // 不同行按Y排序
    });
    
    // 收集文本并计算边界（使用每个文本对应的原始区域）
    let lastY = null;
    sortedTexts.forEach(textObj => {
      // 获取对应的原始区域
      const regionIndex = textObj.regionIndex;
      if (regionIndex !== undefined && regions[regionIndex]) {
        const region = regions[regionIndex];

        let regionMinX, regionMinY, regionMaxX, regionMaxY;

        // 处理不同格式的region
        if (region.x !== undefined && region.y !== undefined && region.width !== undefined && region.height !== undefined) {
          // 保存的格式
          regionMinX = region.x;
          regionMinY = region.y;
          regionMaxX = region.x + region.width;
          regionMaxY = region.y + region.height;
        } else if (region.points && region.points.length >= 4) {
          // 原始格式
          const points = region.points;
          regionMinX = Math.min(...points.map(p => p.x));
          regionMinY = Math.min(...points.map(p => p.y));
          regionMaxX = Math.max(...points.map(p => p.x));
          regionMaxY = Math.max(...points.map(p => p.y));
        } else {
          // 使用文本框自身的边界，考虑实际的边界框
          const bounds = textObj.getBoundingRect();
          regionMinX = bounds.left;
          regionMinY = bounds.top;
          regionMaxX = bounds.left + bounds.width;
          regionMaxY = bounds.top + bounds.height;
        }

        minX = Math.min(minX, regionMinX);
        minY = Math.min(minY, regionMinY);
        maxX = Math.max(maxX, regionMaxX);
        maxY = Math.max(maxY, regionMaxY);
      } else {
        // 没有region信息，使用文本框自身的边界，考虑实际的边界框
        const bounds = textObj.getBoundingRect();
        const regionMinX = bounds.left;
        const regionMinY = bounds.top;
        const regionMaxX = bounds.left + bounds.width;
        const regionMaxY = bounds.top + bounds.height;

        minX = Math.min(minX, regionMinX);
        minY = Math.min(minY, regionMinY);
        maxX = Math.max(maxX, regionMaxX);
        maxY = Math.max(maxY, regionMaxY);
      }
      
      // 每个区域独占一行（按你的要求修改）
      if (lastY !== null) {
        texts.push('\n' + textObj.text);
      } else {
        texts.push(textObj.text);
      }
      lastY = textObj.top + textObj.height / 2;
    });
    
    const mergedText = texts.join(' ').replace(/ \n /g, '\n');
    const width = maxX - minX;
    const height = maxY - minY;

    // 将合并矩形的坐标保存为独立变量
    const mergedBounds = {
      left: minX,
      top: minY,
      width: width,
      height: height
    };

    // 调试：打印合并后的边界
    console.log('=== 合并后的边界 ===');
    console.log('minX:', minX, 'minY:', minY);
    console.log('maxX:', maxX, 'maxY:', maxY);
    console.log('合并矩形:', mergedBounds);
    console.log('========================');

    // 创建模糊背景作为独立的canvas对象，而不是修改背景图像
    const blurBackground = createBlurBackground({
      left: mergedBounds.left,
      top: mergedBounds.top,
      width: mergedBounds.width,
      height: mergedBounds.height,
      textObj: null, // 稍后关联
      mergedIndexes: mergedIndexes,
      mergedBounds: mergedBounds
    });

    // 将模糊背景添加到canvas
    if (blurBackground) {
      canvas.add(blurBackground);
      // 确保遮罩层在所有文本框之下
      // 找到第一个文本框的位置
      const objects = canvas.getObjects();
      const firstTextboxIndex = objects.findIndex(obj => obj.type === 'textbox');

      if (firstTextboxIndex !== -1) {
        // 将遮罩层移到第一个文本框之前
        canvas.moveTo(blurBackground, firstTextboxIndex);
      } else {
        // 如果没有文本框，放到最上层（背景图之上）
        canvas.bringToFront(blurBackground);
      }
    }

    // 创建合并的文本，使用上一次的合并设置
    const mergedTextObj = new window.fabric.Textbox(mergedText, {
      left: mergedBounds.left,
      top: mergedBounds.top,
      width: mergedBounds.width,
      fontSize: lastMergeSettingsRef.current.fontSize,
      fontFamily: lastMergeSettingsRef.current.fontFamily,
      fill: selectedColor,
      textAlign: lastMergeSettingsRef.current.textAlign,
      lineHeight: lastMergeSettingsRef.current.lineSpacing,
      fontWeight: lastMergeSettingsRef.current.isBold ? 'bold' : 'normal',
      fontStyle: lastMergeSettingsRef.current.isItalic ? 'italic' : 'normal',
      splitByGrapheme: false, // 按单词换行，不截断英文单词
      borderColor: '#2196F3',
      cornerColor: '#2196F3',
      cornerSize: 10,
      transparentCorners: false,
      hasRotatingPoint: false,
      originX: 'left',
      originY: 'top',
      lockScalingFlip: true  // 防止翻转
    });

    // 关联模糊背景和文本对象
    if (blurBackground) {
      blurBackground.textObj = mergedTextObj;
      mergedTextObj.blurBackground = blurBackground;
    }
    
    // 保存原始边界信息和合并索引到文本对象
    mergedTextObj.mergedBounds = mergedBounds;
    mergedTextObj.mergedIndexes = mergedIndexes;
    mergedTextObj.isMerged = true;
    
    // 移除原始对象
    textObjects.forEach(text => {
      canvas.remove(text);
    });
    bgRectsToRemove.forEach(rect => {
      canvas.remove(rect);
    });
    
    // 添加合并后的文本对象
    canvas.add(mergedTextObj);
    canvas.setActiveObject(mergedTextObj);

    // 更新记忆的合并设置和当前UI状态
    lastMergeSettingsRef.current = {
      textAlign: mergedTextObj.textAlign,
      fontSize: mergedTextObj.fontSize,
      lineSpacing: mergedTextObj.lineHeight,
      fontFamily: mergedTextObj.fontFamily,
      isBold: mergedTextObj.fontWeight === 'bold',
      isItalic: mergedTextObj.fontStyle === 'italic'
    };

    // 更新UI状态以反映合并后的设置
    setTextAlign(mergedTextObj.textAlign);
    setFontSize(mergedTextObj.fontSize);
    setLineSpacing(mergedTextObj.lineHeight);
    setSelectedFont(mergedTextObj.fontFamily);
    setIsBold(mergedTextObj.fontWeight === 'bold');
    setIsItalic(mergedTextObj.fontStyle === 'italic');

    // 简化事件监听，只保留必要的缩放处理
    mergedTextObj.on('scaling', function() {
      // 计算新的宽度和高度
      const newWidth = this.width * this.scaleX;
      const newHeight = this.height * this.scaleY;
      
      // 更新文本框大小但保持字体大小不变
      this.set({
        width: newWidth,
        height: newHeight,
        scaleX: 1,
        scaleY: 1
      });
      
      canvas.renderAll();
    });
    
    canvas.renderAll();
    
    // 保存历史记录
    saveHistory();
  };

  // AI助手相关函数
  const updateAIButton = (selected) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // 筛选文本框
    const textboxes = selected.filter(obj => obj.type === 'textbox');

    if (textboxes.length === 0) {
      setSelectedTextboxes([]);
      setAiButtonPosition(null);
      return;
    }

    setSelectedTextboxes(textboxes);

    // 计算AI按钮位置
    const canvasEl = canvas.getElement();
    const rect = canvasEl.getBoundingClientRect();
    const vpt = canvas.viewportTransform; // [zoom, 0, 0, zoom, panX, panY]

    let targetX, targetY;

    // AI按钮与文本框的间距
    const aiButtonOffset = 20;

    if (textboxes.length === 1) {
      // 单选：右上角，增加20px间距
      const tb = textboxes[0];
      const boundingRect = tb.getBoundingRect(true); // 获取包含旋转和缩放的真实边界框

      // 将canvas坐标转换为屏幕坐标
      const screenX = boundingRect.left * vpt[0] + vpt[4];
      const screenY = boundingRect.top * vpt[3] + vpt[5];
      const screenRight = (boundingRect.left + boundingRect.width) * vpt[0] + vpt[4];

      targetX = rect.left + screenRight + aiButtonOffset;
      targetY = rect.top + screenY - aiButtonOffset;
    } else {
      // 多选：计算包围盒的右上角，增加20px间距
      let minX = Infinity, minY = Infinity, maxX = -Infinity;

      textboxes.forEach(tb => {
        const boundingRect = tb.getBoundingRect(true);
        minX = Math.min(minX, boundingRect.left);
        minY = Math.min(minY, boundingRect.top);
        maxX = Math.max(maxX, boundingRect.left + boundingRect.width);
      });

      // 将canvas坐标转换为屏幕坐标
      const screenX = maxX * vpt[0] + vpt[4];
      const screenY = minY * vpt[3] + vpt[5];

      targetX = rect.left + screenX + aiButtonOffset;
      targetY = rect.top + screenY - aiButtonOffset;
    }

    // 钳制位置到滚动容器的可见区域内
    const buttonWidth = 36;
    const buttonHeight = 36;
    const padding = 10;

    // 获取滚动容器的可见范围
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) {
      setAiButtonPosition({ x: targetX, y: targetY });
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();

    // 滚动容器的可见边界
    const visibleLeft = wrapperRect.left;
    const visibleRight = wrapperRect.right;
    const visibleTop = wrapperRect.top;
    const visibleBottom = wrapperRect.bottom;

    // 钳制X坐标到滚动容器水平可见范围
    let clampedX = targetX;
    if (targetX < visibleLeft + padding) {
      clampedX = visibleLeft + padding;
    } else if (targetX + buttonWidth > visibleRight - padding) {
      clampedX = visibleRight - buttonWidth - padding;
    }

    // 钳制Y坐标到滚动容器垂直可见范围
    let clampedY = targetY;
    if (targetY < visibleTop + padding) {
      clampedY = visibleTop + padding;
    } else if (targetY + buttonHeight > visibleBottom - padding) {
      clampedY = visibleBottom - buttonHeight - padding;
    }

    setAiButtonPosition({
      x: clampedX,
      y: clampedY
    });
  };

  const updateAIButtonFromCanvas = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const activeSelection = canvas.getActiveObject();
    if (!activeSelection) return;

    // 获取当前选中的对象
    let selected = [];
    if (activeSelection.type === 'activeSelection') {
      // 多选
      selected = activeSelection.getObjects();
    } else {
      // 单选
      selected = [activeSelection];
    }

    updateAIButton(selected);
  };

  // 处理AI修改应用
  const handleAIApply = (updates, textboxes, mode) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (mode === 'merge') {
      // 合并模式：合并文本框并应用新文本
      const mergedText = updates; // updates 在merge模式下是字符串
      mergeTextboxesWithText(textboxes, mergedText);
    } else {
      // unified 或 individual 模式：更新每个文本框
      updates.forEach(({ textbox, newText }) => {
        // 保存原有属性
        const originalProps = {
          textAlign: textbox.textAlign,
          fontFamily: textbox.fontFamily,
          fontSize: textbox.fontSize,
          fill: textbox.fill,
          lineHeight: textbox.lineHeight,
          fontWeight: textbox.fontWeight,
          fontStyle: textbox.fontStyle,
          underline: textbox.underline,
          linethrough: textbox.linethrough,
          charSpacing: textbox.charSpacing
        };

        // ========== Markdown 处理 ==========
        // AI返回的文本可能包含markdown标记，需要处理
        textbox._markdownText = newText; // 保存原始markdown文本

        // 移除markdown标记，得到纯文本
        const cleanText = removeMarkdownTags(newText);

        // 更新文本为纯文本，同时恢复原有属性
        textbox.set({
          text: cleanText,
          ...originalProps
        });

        // 应用markdown样式
        applyMarkdownStylesToCleanText(textbox, newText, cleanText);
      });
      canvas.renderAll();
      saveHistory();
    }
  };

  // 处理全局AI修改应用
  const handleGlobalAIApply = (updates) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    updates.forEach(({ textbox, newText }) => {
      // 保存原有属性
      const originalProps = {
        textAlign: textbox.textAlign,
        fontFamily: textbox.fontFamily,
        fontSize: textbox.fontSize,
        fill: textbox.fill,
        lineHeight: textbox.lineHeight,
        fontWeight: textbox.fontWeight,
        fontStyle: textbox.fontStyle,
        underline: textbox.underline,
        linethrough: textbox.linethrough,
        charSpacing: textbox.charSpacing
      };

      // ========== Markdown 处理 ==========
      // AI返回的文本可能包含markdown标记，需要处理
      textbox._markdownText = newText; // 保存原始markdown文本

      // 移除markdown标记，得到纯文本
      const cleanText = removeMarkdownTags(newText);

      // 更新文本为纯文本，同时恢复原有属性
      textbox.set({
        text: cleanText,
        ...originalProps
      });

      // 应用markdown样式
      applyMarkdownStylesToCleanText(textbox, newText, cleanText);
    });

    canvas.renderAll();
    saveHistory();
  };

  // 合并文本框并设置新文本
  const mergeTextboxesWithText = async (textboxes, newText) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || textboxes.length < 2) return;

    // 收集要合并的区域索引和背景矩形
    const mergedIndexes = [];
    const bgRectsToRemove = [];

    textboxes.forEach(textObj => {
      if (textObj.regionIndex !== undefined) {
        mergedIndexes.push(textObj.regionIndex);
        if (backgroundRectsRef.current[textObj.regionIndex]) {
          bgRectsToRemove.push(backgroundRectsRef.current[textObj.regionIndex]);
        }
      }
    });

    // 计算合并区域的边界
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    textboxes.forEach(textObj => {
      // 始终使用文本框的实际边界框（考虑旋转、缩放、移动等所有变换）
      // 不依赖 regions prop，因为它不会随 undo/redo 更新
      const bounds = textObj.getBoundingRect();
      const regionMinX = bounds.left;
      const regionMinY = bounds.top;
      const regionMaxX = bounds.left + bounds.width;
      const regionMaxY = bounds.top + bounds.height;

      minX = Math.min(minX, regionMinX);
      minY = Math.min(minY, regionMinY);
      maxX = Math.max(maxX, regionMaxX);
      maxY = Math.max(maxY, regionMaxY);
    });

    const width = maxX - minX;
    const height = maxY - minY;

    const mergedBounds = {
      left: minX,
      top: minY,
      width: width,
      height: height
    };

    // 创建模糊背景
    const blurBackground = createBlurBackground({
      left: mergedBounds.left,
      top: mergedBounds.top,
      width: mergedBounds.width,
      height: mergedBounds.height,
      textObj: null,
      mergedIndexes: mergedIndexes,
      mergedBounds: mergedBounds
    });

    if (blurBackground) {
      canvas.add(blurBackground);
      // 确保遮罩层在所有文本框之下
      // 找到第一个文本框的位置
      const objects = canvas.getObjects();
      const firstTextboxIndex = objects.findIndex(obj => obj.type === 'textbox');

      if (firstTextboxIndex !== -1) {
        // 将遮罩层移到第一个文本框之前
        canvas.moveTo(blurBackground, firstTextboxIndex);
      } else {
        // 如果没有文本框，放到最上层（背景图之上）
        canvas.bringToFront(blurBackground);
      }
    }

    // ========== Markdown 处理 ==========
    // 保存原始markdown文本
    const markdownText = newText;
    // 移除markdown标记
    const cleanText = removeMarkdownTags(newText);

    // 创建合并的文本框，使用记忆的设置
    const mergedTextObj = new window.fabric.Textbox(cleanText, {
      left: mergedBounds.left,
      top: mergedBounds.top,
      width: mergedBounds.width,
      fontSize: lastMergeSettingsRef.current.fontSize,
      fontFamily: lastMergeSettingsRef.current.fontFamily,
      fill: selectedColor,
      textAlign: lastMergeSettingsRef.current.textAlign,
      lineHeight: lastMergeSettingsRef.current.lineSpacing,
      fontWeight: lastMergeSettingsRef.current.isBold ? 'bold' : 'normal',
      fontStyle: lastMergeSettingsRef.current.isItalic ? 'italic' : 'normal',
      splitByGrapheme: false, // 按单词换行，不截断英文单词
      borderColor: '#2196F3',
      cornerColor: '#2196F3',
      cornerSize: 10,
      transparentCorners: false,
      hasRotatingPoint: false,
      originX: 'left',
      originY: 'top',
      lockScalingFlip: true
    });

    // 保存原始markdown文本
    mergedTextObj._markdownText = markdownText;

    // 应用markdown样式
    applyMarkdownStylesToCleanText(mergedTextObj, markdownText, cleanText);

    if (blurBackground) {
      blurBackground.textObj = mergedTextObj;
      mergedTextObj.blurBackground = blurBackground;
    }

    mergedTextObj.mergedBounds = mergedBounds;
    mergedTextObj.mergedIndexes = mergedIndexes;
    mergedTextObj.isMerged = true;

    // 移除原始对象
    textboxes.forEach(text => {
      canvas.remove(text);
      const index = textObjectsRef.current.indexOf(text);
      if (index > -1) {
        textObjectsRef.current.splice(index, 1);
      }
    });

    bgRectsToRemove.forEach(rect => {
      canvas.remove(rect);
    });

    // 添加合并后的文本
    canvas.add(mergedTextObj);
    textObjectsRef.current.push(mergedTextObj);

    // 更新记忆的合并设置
    lastMergeSettingsRef.current = {
      textAlign: mergedTextObj.textAlign,
      fontSize: mergedTextObj.fontSize,
      lineSpacing: mergedTextObj.lineHeight,
      fontFamily: mergedTextObj.fontFamily,
      isBold: mergedTextObj.fontWeight === 'bold',
      isItalic: mergedTextObj.fontStyle === 'italic'
    };

    canvas.renderAll();
    saveHistory();
  };

  // 处理缩放
  const handleZoom = (delta) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    
    const newZoom = zoomLevel + delta;
    const zoom = Math.max(25, Math.min(200, newZoom));
    setZoomLevel(zoom);
    
    canvas.setZoom(zoom / 100);
    canvas.setDimensions({
      width: imageRef.current.width * zoom / 100,
      height: imageRef.current.height * zoom / 100
    });
    canvas.renderAll();
  };
  
  // 更新选中文本的样式
  const updateSelectedStyle = (property, value) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();

    // 如果是单个文本框且有选中的文字
    if (activeObject && activeObject.type === 'textbox' && activeObject.isEditing &&
        activeObject.selectionStart !== undefined && activeObject.selectionEnd !== undefined &&
        activeObject.selectionStart !== activeObject.selectionEnd) {

      // 应用样式到选中的文字
      // Fabric.js 的 setSelectionStyles 可以直接处理选中范围
      activeObject.setSelectionStyles({ [property]: value });

      canvas.renderAll();
      saveHistory();
    } else {
      // 没有选中文字，应用到整个文本框
      const activeObjects = canvas.getActiveObjects();
      activeObjects.forEach(obj => {
        if (obj.type === 'textbox') {
          obj.set(property, value);
        }
      });

      canvas.renderAll();
      saveHistory();
    }
  };

  // ==================== Markdown 功能 ====================

  // 在选中文本周围插入 markdown 标记
  const insertMarkdownTag = (startTag, endTag) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();

    // 必须是文本框且正在编辑且有选中文字
    if (!activeObject || activeObject.type !== 'textbox' || !activeObject.isEditing) return;
    if (activeObject.selectionStart === activeObject.selectionEnd) return;

    const text = activeObject.text;
    const start = activeObject.selectionStart;
    const end = activeObject.selectionEnd;
    const selectedText = text.substring(start, end);

    // 检查是否已经有标记，如果有则移除，否则添加
    const beforeSelected = text.substring(Math.max(0, start - startTag.length), start);
    const afterSelected = text.substring(end, Math.min(text.length, end + endTag.length));

    let newText, newCursorPos;

    if (beforeSelected === startTag && afterSelected === endTag) {
      // 已有标记，移除
      newText = text.substring(0, start - startTag.length) +
                selectedText +
                text.substring(end + endTag.length);
      newCursorPos = start - startTag.length + selectedText.length;
    } else {
      // 没有标记，添加
      newText = text.substring(0, start) +
                startTag + selectedText + endTag +
                text.substring(end);
      newCursorPos = start + startTag.length + selectedText.length + endTag.length;
    }

    // 更新文本内容
    activeObject.text = newText;
    activeObject.setSelectionStart(newCursorPos);
    activeObject.setSelectionEnd(newCursorPos);
    activeObject.dirty = true;

    canvas.renderAll();
    saveHistory();
  };

  // 根据原始 markdown 文本，在移除标记后的文本上应用样式
  // 使用更稳健的方式：直接操作 Fabric.js styles 对象
  const applyMarkdownStylesToCleanText = (textbox, originalText, cleanText) => {
    if (!cleanText) return;

    console.log('=== Markdown样式应用（直接操作styles对象） ===');
    console.log('原文:', originalText);
    console.log('纯文本:', cleanText);

    // 1. 构建位置映射：原文字符位置 -> 纯文本字符位置
    const originalToCleanMap = new Map();
    let cleanPos = 0;

    for (let i = 0; i < originalText.length; i++) {
      const char = originalText[i];
      const next = originalText[i + 1] || '';
      const prev = originalText[i - 1] || '';

      // 判断是否是markdown标记
      const isMarkdownChar = (
        (char === '*' && next === '*') ||  // ** 开始
        (char === '*' && prev === '*') ||  // ** 结束
        (char === '*' && prev !== '*' && next !== '*') ||  // 单 *
        (char === '_') ||  // 下划线
        (char === '~' && next === '~') ||  // ~~ 开始
        (char === '~' && prev === '~')     // ~~ 结束
      );

      if (!isMarkdownChar) {
        // 这是内容字符，记录映射
        originalToCleanMap.set(i, cleanPos);
        cleanPos++;
      }
    }

    // 2. 初始化 styles 对象结构
    // Fabric.js 使用 styles[lineIndex][charIndex] = {样式} 的结构
    const lines = cleanText.split('\n');
    textbox.styles = {};

    // 初始化每一行的样式对象
    lines.forEach((_line, lineIndex) => {
      textbox.styles[lineIndex] = {};
    });

    // 3. 辅助函数：将全局字符位置转换为 (lineIndex, charIndex)
    const getLineAndCharIndex = (globalCharIndex) => {
      let currentPos = 0;
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineLength = lines[lineIndex].length;
        if (globalCharIndex < currentPos + lineLength) {
          // 在当前行
          return { lineIndex, charIndex: globalCharIndex - currentPos };
        }
        currentPos += lineLength + 1; // +1 for newline character
      }
      return null;
    };

    // 4. 应用粗体样式 **text**
    const boldRegex = /\*\*(.+?)\*\*/gs; // s flag for multiline
    let match;
    while ((match = boldRegex.exec(originalText)) !== null) {
      const contentStartInOriginal = match.index + 2;
      const content = match[1];

      console.log(`\n[粗体] 匹配: "${match[0]}"`);
      console.log(`  内容: "${content}"`);

      // 遍历内容的每个字符，应用样式
      for (let i = 0; i < content.length; i++) {
        const originalPos = contentStartInOriginal + i;
        const cleanPos = originalToCleanMap.get(originalPos);

        if (cleanPos !== undefined) {
          const pos = getLineAndCharIndex(cleanPos);
          if (pos) {
            if (!textbox.styles[pos.lineIndex]) {
              textbox.styles[pos.lineIndex] = {};
            }
            textbox.styles[pos.lineIndex][pos.charIndex] = {
              ...(textbox.styles[pos.lineIndex][pos.charIndex] || {}),
              fontWeight: 'bold'
            };
          }
        }
      }
    }

    // 5. 应用斜体样式 *text* (单星号，不能前后有星号)
    const italicRegex = /(?<!\*)\*([^*\n]+?)\*(?!\*)/g;
    while ((match = italicRegex.exec(originalText)) !== null) {
      const contentStartInOriginal = match.index + 1;
      const content = match[1];

      console.log(`\n[斜体*] 匹配: "${match[0]}"`);

      for (let i = 0; i < content.length; i++) {
        const originalPos = contentStartInOriginal + i;
        const cleanPos = originalToCleanMap.get(originalPos);

        if (cleanPos !== undefined) {
          const pos = getLineAndCharIndex(cleanPos);
          if (pos) {
            if (!textbox.styles[pos.lineIndex]) {
              textbox.styles[pos.lineIndex] = {};
            }
            textbox.styles[pos.lineIndex][pos.charIndex] = {
              ...(textbox.styles[pos.lineIndex][pos.charIndex] || {}),
              fontStyle: 'italic'
            };
          }
        }
      }
    }

    // 6. 应用斜体样式 _text_
    const underscoreItalicRegex = /_([^_\n]+?)_/g;
    while ((match = underscoreItalicRegex.exec(originalText)) !== null) {
      const contentStartInOriginal = match.index + 1;
      const content = match[1];

      console.log(`\n[斜体_] 匹配: "${match[0]}"`);

      for (let i = 0; i < content.length; i++) {
        const originalPos = contentStartInOriginal + i;
        const cleanPos = originalToCleanMap.get(originalPos);

        if (cleanPos !== undefined) {
          const pos = getLineAndCharIndex(cleanPos);
          if (pos) {
            if (!textbox.styles[pos.lineIndex]) {
              textbox.styles[pos.lineIndex] = {};
            }
            textbox.styles[pos.lineIndex][pos.charIndex] = {
              ...(textbox.styles[pos.lineIndex][pos.charIndex] || {}),
              fontStyle: 'italic'
            };
          }
        }
      }
    }

    // 7. 应用删除线样式 ~~text~~
    const strikethroughRegex = /~~(.+?)~~/gs;
    while ((match = strikethroughRegex.exec(originalText)) !== null) {
      const contentStartInOriginal = match.index + 2;
      const content = match[1];

      console.log(`\n[删除线] 匹配: "${match[0]}"`);

      for (let i = 0; i < content.length; i++) {
        const originalPos = contentStartInOriginal + i;
        const cleanPos = originalToCleanMap.get(originalPos);

        if (cleanPos !== undefined) {
          const pos = getLineAndCharIndex(cleanPos);
          if (pos) {
            if (!textbox.styles[pos.lineIndex]) {
              textbox.styles[pos.lineIndex] = {};
            }
            textbox.styles[pos.lineIndex][pos.charIndex] = {
              ...(textbox.styles[pos.lineIndex][pos.charIndex] || {}),
              linethrough: true
            };
          }
        }
      }
    }

    console.log('=== 样式应用完成 ===\n');
  };

  // 从文本中移除 markdown 标记（用于显示模式）
  const removeMarkdownTags = (text) => {
    if (!text) return '';

    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')  // 移除 **bold**
      .replace(/\*(.+?)\*/g, '$1')       // 移除 *italic*
      .replace(/_(.+?)_/g, '$1')         // 移除 _italic_
      .replace(/~~(.+?)~~/g, '$1');      // 移除 ~~strikethrough~~
  };

  // 解析 markdown 并返回样式数组（用于导出）
  const parseMarkdownToStyles = (text) => {
    const styles = [];
    let currentIndex = 0;

    // 创建一个临时数组来存储每个字符的样式
    const charStyles = new Array(text.length).fill(null).map(() => ({}));

    // 应用粗体样式 **text**
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    while ((match = boldRegex.exec(text)) !== null) {
      const contentStart = match.index + 2;
      const contentEnd = contentStart + match[1].length;
      for (let i = contentStart; i < contentEnd; i++) {
        charStyles[i].fontWeight = 'bold';
      }
    }

    // 应用斜体样式 *text* 或 _text_
    const italicRegex = /[*_](.+?)[*_]/g;
    while ((match = italicRegex.exec(text)) !== null) {
      // 跳过已经被识别为粗体的 **
      if (text[match.index - 1] === '*' || text[match.index + match[0].length] === '*') {
        continue;
      }
      const contentStart = match.index + 1;
      const contentEnd = contentStart + match[1].length;
      for (let i = contentStart; i < contentEnd; i++) {
        charStyles[i].fontStyle = 'italic';
      }
    }

    // 应用删除线样式 ~~text~~
    const strikeRegex = /~~(.+?)~~/g;
    while ((match = strikeRegex.exec(text)) !== null) {
      const contentStart = match.index + 2;
      const contentEnd = contentStart + match[1].length;
      for (let i = contentStart; i < contentEnd; i++) {
        charStyles[i].linethrough = true;
      }
    }

    return charStyles;
  };

  // 获取当前的regions状态（文本框的位置和内容）
  const getCurrentRegions = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return [];

    const currentRegions = [];
    let mergedId = 10000; // 为合并的文本框生成ID

    canvas.getObjects().forEach(obj => {
      if (obj.type === 'textbox') {
        // 处理所有文本框，包括原始的和合并的
        if (obj.regionId !== undefined) {
          // 原始文本框
          const regionData = {
            id: obj.regionId,
            src: obj.originalText || obj._markdownText || obj.text,
            // 保存原始 markdown 文本，而不是显示的纯文本
            dst: obj._markdownText || obj.text,
            x: obj.left,
            y: obj.top,
            width: obj.width * obj.scaleX,
            height: obj.height * obj.scaleY,
            angle: obj.angle || 0, // 保存旋转角度
            // 保存文本格式属性
            fontSize: obj.fontSize,
            fontFamily: obj.fontFamily,
            textAlign: obj.textAlign,
            lineHeight: obj.lineHeight,
            fill: obj.fill
          };

          // 保存遮罩的角度（所有文本框的遮罩都应该保存角度）
          if (obj.bgRect) {
            regionData.maskAngle = obj.bgRect.angle || 0;
          }

          // 如果有手动编辑过的遮罩，保存遮罩的位置和大小
          if (obj.bgRect && obj.bgRect.manuallyEdited) {
            regionData.maskManuallyEdited = true;
            regionData.maskX = obj.bgRect.left;
            regionData.maskY = obj.bgRect.top;
            regionData.maskWidth = obj.bgRect.width * obj.bgRect.scaleX;
            regionData.maskHeight = obj.bgRect.height * obj.bgRect.scaleY;
          }

          currentRegions.push(regionData);
        } else {
          // 合并的文本框（没有regionId）
          currentRegions.push({
            id: mergedId++, // 生成新的ID
            src: obj._markdownText || obj.text, // 合并的文本没有原文
            // 保存原始 markdown 文本
            dst: obj._markdownText || obj.text,
            x: obj.left,
            y: obj.top,
            width: obj.width * obj.scaleX,
            height: obj.height * obj.scaleY,
            angle: obj.angle || 0, // 保存旋转角度
            isMerged: true, // 标记为合并的文本
            mergedIndexes: obj.mergedIndexes || [], // 保存合并的索引信息
            // 保存文本格式属性
            fontSize: obj.fontSize,
            fontFamily: obj.fontFamily,
            textAlign: obj.textAlign,
            lineHeight: obj.lineHeight,
            fill: obj.fill
          });
        }
      }
    });
    return currentRegions;
  };

  // 导出图片（用于保存编辑状态）
  const handleExport = (includeText = false) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // 获取当前的regions状态
    const currentRegions = getCurrentRegions();

    let hiddenObjects = [];
    if (!includeText) {
      // 保存编辑状态时，隐藏文字但保留模糊背景
      canvas.getObjects().forEach(obj => {
        if (obj.type === 'textbox') {
          obj.visible = false;
          hiddenObjects.push(obj);
        }
      });
    }

    // 临时设置缩放为100%
    const currentZoom = canvas.getZoom();
    canvas.setZoom(1);
    canvas.setDimensions({
      width: imageRef.current.width,
      height: imageRef.current.height
    });

    // 导出图片
    const dataURL = canvas.toDataURL({
      format: 'jpeg',
      quality: 0.95,
      multiplier: 1
    });

    if (!includeText) {
      // 恢复文本框显示
      hiddenObjects.forEach(obj => {
        obj.visible = true;
      });
    }

    // 恢复缩放
    canvas.setZoom(currentZoom);
    canvas.setDimensions({
      width: imageRef.current.width * currentZoom,
      height: imageRef.current.height * currentZoom
    });

    canvas.renderAll();

    // 转换为blob
    fetch(dataURL)
      .then(res => res.blob())
      .then(blob => {
        if (onExport) {
          // 同时传递regions状态和导出类型
          onExport(dataURL, blob, currentRegions, includeText);
        }
      });
  };

  // 导出最终图片（包含文字）
  const handleFinalExport = () => {
    handleExport(true);
  };

  // 生成两个版本的图片：不带文字和带文字
  const generateBothVersions = () => {
    return new Promise((resolve) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) {
        resolve(null);
        return;
      }

      // 获取当前regions
      const currentRegions = getCurrentRegions();

      // 保存当前缩放和尺寸
      const currentZoom = canvas.getZoom();
      const currentWidth = canvas.getWidth();
      const currentHeight = canvas.getHeight();

      // 1. 生成不带文字的版本（隐藏文本框和模糊背景）
      let hiddenObjects = [];
      canvas.getObjects().forEach(obj => {
        if (obj.type === 'textbox' || obj.isBlurBackground) {
          obj.visible = false;
          hiddenObjects.push(obj);
        }
      });

      // 重置缩放为1:1
      canvas.setZoom(1);
      canvas.setDimensions({
        width: imageRef.current.width,
        height: imageRef.current.height
      });
      canvas.renderAll();

      const editedDataURL = canvas.toDataURL({
        format: 'jpeg',
        quality: 0.95,
        multiplier: 1
      });

      // 恢复文本和模糊背景显示
      hiddenObjects.forEach(obj => {
        obj.visible = true;
      });
      canvas.renderAll();

      // 2. 生成带文字的版本（显示所有内容）
      const finalDataURL = canvas.toDataURL({
        format: 'jpeg',
        quality: 0.95,
        multiplier: 1
      });

      // 恢复原始缩放和尺寸
      canvas.setZoom(currentZoom);
      canvas.setDimensions({
        width: currentWidth,
        height: currentHeight
      });
      canvas.renderAll();

      // 转换为blob
      Promise.all([
        fetch(editedDataURL).then(res => res.blob()),
        fetch(finalDataURL).then(res => res.blob())
      ]).then(([editedBlob, finalBlob]) => {
        resolve({
          edited: { url: editedDataURL, blob: editedBlob, regions: currentRegions },
          final: { url: finalDataURL, blob: finalBlob, regions: currentRegions }
        });
      });
    });
  };

  // ✅ 新增：只生成最终版本（带文字和遮罩）
  const generateFinalImage = () => {
    return new Promise((resolve) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) {
        resolve(null);
        return;
      }

      // 保存当前缩放和尺寸
      const currentZoom = canvas.getZoom();
      const currentWidth = canvas.getWidth();
      const currentHeight = canvas.getHeight();

      // 重置缩放为1:1
      canvas.setZoom(1);
      canvas.setDimensions({
        width: imageRef.current.width,
        height: imageRef.current.height
      });
      canvas.renderAll();

      // 生成带文字的版本
      const finalDataURL = canvas.toDataURL({
        format: 'jpeg',
        quality: 0.95,
        multiplier: 1
      });

      // 恢复原始缩放和尺寸
      canvas.setZoom(currentZoom);
      canvas.setDimensions({
        width: currentWidth,
        height: currentHeight
      });
      canvas.renderAll();

      // 转换为blob
      fetch(finalDataURL)
        .then(res => res.blob())
        .then(blob => {
          resolve({
            url: finalDataURL,
            blob: blob
          });
        });
    });
  };

  // 暴露必要的函数到全局或组件ref
  useEffect(() => {
    if (exposeHandlers) {
      window.currentFabricEditor = {
        handleExport,
        generateBothVersions,
        getCurrentRegions,  // ✅ 暴露getCurrentRegions函数
        generateFinalImage  // ✅ 暴露生成最终图片函数
      };
    }
    return () => {
      if (exposeHandlers) {
        window.currentFabricEditor = null;
      }
    };
  }, [exposeHandlers, handleExport]);
  
  if (!fabricLoaded) {
    return (
      <div className="image-editor">
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>加载 Fabric.js...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="image-editor">
      <div className="editor-toolbar">
        {/* 左侧：主要操作按钮 */}
        <div className="toolbar-left">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="undo-button"
            title={t('undoShortcut')}
          >
            ↶ {t('undo')}
          </button>

          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="redo-button"
            title={t('redoShortcut')}
          >
            ↷ {t('redo')}
          </button>

          <div className="toolbar-separator" style={{ borderLeft: '1px solid #ddd', height: '20px', margin: '0 10px' }} />

          <button
            onClick={toggleMaskEditMode}
            className={maskEditMode ? "process-button active" : "process-button"}
            title={maskEditMode ? t('exitMaskEditMode') : t('enterMaskEditMode')}
          >
            {maskEditMode ? `✓ ${t('maskEditMode')}` : t('maskEditMode')}
          </button>

          {maskEditMode && (
            <button
              onClick={createNewMask}
              className="process-button"
              title={t('addCustomMask')}
            >
              ➕ {t('addCustomMask')}
            </button>
          )}

          <button
            onClick={mergeSelectedObjects}
            disabled={selectedObjects.length < 2}
            className="merge-button"
          >
            {t('mergeTextboxes')} ({selectedObjects.filter(obj => obj && obj.type === 'textbox').length})
          </button>

          {/* 字体工具栏 - 常驻显示 */}
          <div className="merged-controls">
            <label>
              {t('fontFamily')}：
              <select
                value={selectedObjects.length > 0 ? selectedFont : ''}
                onChange={(e) => {
                  setSelectedFont(e.target.value);
                  updateSelectedStyle('fontFamily', e.target.value);
                }}
                disabled={selectedObjects.length === 0}
              >
                <option value="">{selectedObjects.length === 0 ? '--' : ''}</option>
                <option value="Arial">{t('fontArial')}</option>
                <option value="SimSun">{t('fontSimSun')}</option>
                <option value="SimHei">{t('fontSimHei')}</option>
                <option value="Microsoft YaHei">{t('fontMicrosoftYaHei')}</option>
                <option value="KaiTi">{t('fontKaiTi')}</option>
              </select>
            </label>

            <label>
              {t('textColor')}：
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => {
                  setSelectedColor(e.target.value);
                  updateSelectedStyle('fill', e.target.value);
                }}
                disabled={selectedObjects.length === 0}
              />
            </label>

            <label>
              {t('textAlign')}：
              <select
                value={selectedObjects.length > 0 ? textAlign : ''}
                onChange={(e) => {
                  setTextAlign(e.target.value);
                  updateSelectedStyle('textAlign', e.target.value);
                }}
                disabled={selectedObjects.length === 0}
              >
                <option value="">{selectedObjects.length === 0 ? '--' : ''}</option>
                <option value="left">{t('alignLeft')}</option>
                <option value="center">{t('alignCenter')}</option>
                <option value="right">{t('alignRight')}</option>
              </select>
            </label>

            <label>
              {t('fontSize')}：
              <input
                type="number"
                value={selectedObjects.length > 0 ? fontSize : ''}
                placeholder={selectedObjects.length === 0 ? '--' : ''}
                onChange={(e) => {
                  const size = parseInt(e.target.value) || 11;
                  setFontSize(size);

                  // 检查是否有选中的部分文字
                  const canvas = fabricCanvasRef.current;
                  const activeObject = canvas?.getActiveObject();
                  const hasTextSelection = activeObject?.type === 'textbox' &&
                                          activeObject.isEditing &&
                                          activeObject.selectionStart !== activeObject.selectionEnd;

                  if (hasTextSelection) {
                    // 提示：正在修改选中文字的字号
                    console.log('正在修改选中文字的字号');
                  }

                  updateSelectedStyle('fontSize', size);
                }}
                style={{ width: '60px' }}
                title={t('fontSizeTooltip')}
                disabled={selectedObjects.length === 0}
              />
            </label>

            <button
              className={`style-button ${isBold ? 'active' : ''}`}
              onClick={() => {
                // 使用 Markdown 标记模式：插入 **text**
                insertMarkdownTag('**', '**');
              }}
              title={t('boldTooltip') + ' (Markdown: **text**)'}
              disabled={selectedObjects.length === 0}
              style={{
                fontWeight: 'bold',
                fontSize: '16px',
                padding: '2px 8px',
                backgroundColor: isBold ? '#2196F3' : 'transparent',
                color: isBold ? 'white' : 'black',
                border: '1px solid #ccc',
                borderRadius: '3px',
                cursor: selectedObjects.length === 0 ? 'not-allowed' : 'pointer',
                opacity: selectedObjects.length === 0 ? 0.5 : 1
              }}
            >
              B
            </button>

            <button
              className={`style-button ${isItalic ? 'active' : ''}`}
              onClick={() => {
                // 使用 Markdown 标记模式：插入 *text*
                insertMarkdownTag('*', '*');
              }}
              title={t('italicTooltip') + ' (Markdown: *text*)'}
              disabled={selectedObjects.length === 0}
              style={{
                fontStyle: 'italic',
                fontSize: '16px',
                padding: '2px 8px',
                backgroundColor: isItalic ? '#2196F3' : 'transparent',
                color: isItalic ? 'white' : 'black',
                border: '1px solid #ccc',
                borderRadius: '3px',
                cursor: selectedObjects.length === 0 ? 'not-allowed' : 'pointer',
                opacity: selectedObjects.length === 0 ? 0.5 : 1
              }}
            >
              I
            </button>

            <label>
              行间距：
              <input
                type="number"
                value={selectedObjects.length > 0 ? lineSpacing : ''}
                placeholder={selectedObjects.length === 0 ? '--' : ''}
                min="0.8"
                max="2.0"
                step="0.1"
                onChange={(e) => {
                  const spacing = parseFloat(e.target.value) || 1.2;
                  setLineSpacing(spacing);
                  updateSelectedStyle('lineHeight', spacing);
                }}
                style={{ width: '60px' }}
                disabled={selectedObjects.length === 0}
              />
            </label>
          </div>
        </div>

        {/* 右侧：固定的缩放控件和全局AI */}
        <div className="toolbar-right">
          <button
            onClick={() => setShowGlobalAI(true)}
            className="global-ai-button"
            title={t('globalAssistantEdit')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2 L12 6 M12 18 L12 22 M4.93 4.93 L7.76 7.76 M16.24 16.24 L19.07 19.07 M2 12 L6 12 M18 12 L22 12 M4.93 19.07 L7.76 16.24 M16.24 7.76 L19.07 4.93"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            {t('globalAssistant')}
          </button>
          <div className="zoom-controls">
            <button onClick={() => handleZoom(-25)} className="zoom-button">-</button>
            <span className="zoom-level">{zoomLevel}%</span>
            <button onClick={() => handleZoom(25)} className="zoom-button">+</button>
          </div>
        </div>
      </div>
      
      <div className="canvas-container">
        <div ref={canvasWrapperRef} className="canvas-wrapper" style={{ flex: regionsCollapsed ? '1' : 'unset' }}>
          <canvas ref={canvasRef} id={`fabric-canvas-${editorKey}`} />
        </div>

        {!regionsCollapsed && (
          <div className="region-controls">
            <div className="region-controls-header">
              <h3>文字区域</h3>
              <button
                className="collapse-button"
                onClick={() => setRegionsCollapsed(true)}
                title="折叠文字区域"
              >
                ✕ 折叠
              </button>
            </div>
            {regions && regions.map((region, index) => (
              <div
                key={index}
                className="region-control-item"
                onClick={() => {
                  const canvas = fabricCanvasRef.current;
                  const textObj = textObjectsRef.current[index];
                  if (canvas && textObj) {
                    canvas.setActiveObject(textObj);
                    canvas.renderAll();
                  }
                }}
              >
                <span className="region-label">
                  {region.src} → {region.dst}
                </span>
                <div className="control-buttons">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRegion(index);
                    }}
                  >
                    切换
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI助手 */}
      {aiButtonPosition && (
        <div
          className="ai-assistant-container"
          style={{
            position: 'fixed',
            left: `${aiButtonPosition.x}px`,
            top: `${aiButtonPosition.y}px`,
            zIndex: 1000
          }}
        >
          <div
            className="ai-assistant-button"
            onClick={() => setShowAIModal(!showAIModal)}
            title="AI助手"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="10" rx="2"/>
              <circle cx="8" cy="15" r="1"/>
              <circle cx="16" cy="15" r="1"/>
              <path d="M9 7 L9 11 M15 7 L15 11"/>
              <circle cx="12" cy="4" r="1"/>
            </svg>
            {selectedTextboxes.length > 1 && (
              <span className="ai-badge">{selectedTextboxes.length}</span>
            )}
          </div>

          {/* AI助手小对话框 */}
          {showAIModal && (
            <div className="ai-assistant-panel">
              <AIAssistantModal
                isOpen={showAIModal}
                onClose={() => setShowAIModal(false)}
                selectedTextboxes={selectedTextboxes}
                onApply={handleAIApply}
              />
            </div>
          )}
        </div>
      )}

      {/* 全局AI助手对话框 */}
      <GlobalAIModal
        isOpen={showGlobalAI}
        onClose={() => setShowGlobalAI(false)}
        allTextboxes={textObjectsRef.current}
        onApply={handleGlobalAIApply}
      />
    </div>
  );
}

export default FabricImageEditor;