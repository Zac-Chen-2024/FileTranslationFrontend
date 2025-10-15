import React, { useRef, useEffect, useState } from 'react';
import AIAssistantModal from './AIAssistantModal';
import GlobalAIModal from './GlobalAIModal';
import './ImageEditor.css';

/* global fabric */

function FabricImageEditor({ imageSrc, regions, onExport, editorKey = 'default', exposeHandlers = false }) {
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

  // 检查 Fabric.js 是否已加载
  useEffect(() => {
    const checkFabric = () => {
      if (window.fabric) {
        console.log('Fabric.js loaded from CDN');
        setFabricLoaded(true);
      } else {
        console.log('Waiting for Fabric.js...');
        setTimeout(checkFabric, 100);
      }
    };
    checkFabric();
  }, []);

  // 初始化 Fabric.js canvas
  useEffect(() => {
    if (!fabricLoaded) return;
    if (!canvasRef.current) return;
    
    console.log('Initializing Fabric.js v5 canvas...');
    const canvas = new fabric.Canvas(canvasRef.current, {
      selection: true,
      preserveObjectStacking: true
    });
    
    fabricCanvasRef.current = canvas;
    
    // 事件监听
    canvas.on('selection:created', (e) => {
      const selected = e.selected || [];
      setSelectedObjects(selected);
      updateAIButton(selected);
    });

    canvas.on('selection:updated', (e) => {
      const selected = e.selected || [];
      setSelectedObjects(selected);
      updateAIButton(selected);
    });

    canvas.on('selection:cleared', () => {
      setSelectedObjects([]);
      setSelectedTextboxes([]);
      setAiButtonPosition(null);
    });

    // 监听对象移动/缩放，更新AI按钮位置
    canvas.on('object:moving', updateAIButtonFromCanvas);
    canvas.on('object:scaling', updateAIButtonFromCanvas);
    canvas.on('object:rotating', updateAIButtonFromCanvas);

    // 监听对象修改事件以保存历史
    canvas.on('object:modified', () => {
      if (!isHistoryOperationRef.current) {
        saveHistory();
      }
    });

    canvas.on('text:changed', () => {
      if (!isHistoryOperationRef.current) {
        saveHistory();
      }
    });

    // 监听键盘事件
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
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
  
  // 加载图片
  useEffect(() => {
    console.log('Image loading effect:', { fabricLoaded, imageSrc: !!imageSrc, canvas: !!fabricCanvasRef.current, initialized: initializedRef.current });
    if (!fabricLoaded || !imageSrc || !fabricCanvasRef.current) return;

    // 如果已经初始化过，且不是新的图片，则跳过
    if (initializedRef.current) {
      console.log('Already initialized, skipping...');
      return;
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
  }, [fabricLoaded, imageSrc]);

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
        bgRect = new window.fabric.Rect({
          left: minX,
          top: minY,
          width: width,
          height: height,
          fill: 'transparent',
          stroke: 'transparent',
          strokeWidth: 0,
          selectable: false,
          evented: false,
          regionIndex: index
        });
      } else {
        // 合并文本：创建模糊背景
        bgRect = createBlurBackground({
          left: minX,
          top: minY,
          width: width,
          height: height,
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
        // 使用保存的格式属性，如果没有则使用默认值
        fontSize: region.fontSize || calculatedFontSize,
        fontFamily: region.fontFamily || selectedFont,
        fill: region.fill || selectedColor,
        textAlign: region.textAlign || 'center',
        lineHeight: region.lineHeight || 1.2,
        splitByGrapheme: true, // 支持中文换行
        selectable: true,
        editable: true,
        originX: 'left',
        originY: 'top'
      });
      
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

      // 设置文本框样式
      text.set({
        borderColor: '#2196F3',
        cornerColor: '#2196F3',
        cornerSize: 8,
        transparentCorners: false,
        hasRotatingPoint: false
      });

      if (bgRect) {
        if (!region.isMerged) {
          // 只有非合并的文本才添加到背景矩形数组
          backgroundRectsRef.current.push(bgRect);
        }
        // 保存引用
        text.bgRect = bgRect;
        bgRect.textObj = text;
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
      text.on('moving', function() {
        if (this.bgRect) {
          this.bgRect.set({
            left: this.left,
            top: this.top
          });
          canvas.renderAll();
        }
      });
      
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
    const { left, top, width, height, textObj, mergedIndexes } = options;

    if (!imageRef.current) return null;

    console.log('Creating blur background at:', { left, top, width, height });

    const image = imageRef.current.getElement();

    // 扩展padding用于更好的边缘羽化效果
    const blurPadding = 30;

    // 计算扩展后的区域（确保不超出图像边界）
    const expandedLeft = Math.max(0, left - blurPadding);
    const expandedTop = Math.max(0, top - blurPadding);
    const expandedRight = Math.min(image.width, left + width + blurPadding);
    const expandedBottom = Math.min(image.height, top + height + blurPadding);

    const expandedWidth = expandedRight - expandedLeft;
    const expandedHeight = expandedBottom - expandedTop;

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

    // 2. 应用模糊滤镜
    ctx.filter = 'blur(15px)';
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.filter = 'none';

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
          // 使用文本框自身的边界
          regionMinX = textObj.left;
          regionMinY = textObj.top;
          regionMaxX = textObj.left + textObj.width * textObj.scaleX;
          regionMaxY = textObj.top + textObj.height * textObj.scaleY;
        }

        minX = Math.min(minX, regionMinX);
        minY = Math.min(minY, regionMinY);
        maxX = Math.max(maxX, regionMaxX);
        maxY = Math.max(maxY, regionMaxY);
      } else {
        // 没有region信息，使用文本框自身的边界
        const regionMinX = textObj.left;
        const regionMinY = textObj.top;
        const regionMaxX = textObj.left + textObj.width * textObj.scaleX;
        const regionMaxY = textObj.top + textObj.height * textObj.scaleY;

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
      // 确保模糊背景在文本下方
      canvas.sendToBack(blurBackground);
      // 如果有背景图像，将模糊背景置于背景图像之上
      if (canvas.backgroundImage) {
        canvas.bringToFront(blurBackground);
        canvas.sendBackwards(blurBackground);
      }
    }

    // 创建合并的文本
    const mergedTextObj = new window.fabric.Textbox(mergedText, {
      left: mergedBounds.left,
      top: mergedBounds.top,
      width: mergedBounds.width,
      fontSize: fontSize || calculateFontSize(width, height),
      fontFamily: selectedFont,
      fill: selectedColor,
      textAlign: textAlign,
      lineHeight: lineSpacing,
      splitByGrapheme: true,
      borderColor: '#4CAF50',
      cornerColor: '#4CAF50',
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

    if (textboxes.length === 1) {
      // 单选：右上角
      const tb = textboxes[0];
      const boundingRect = tb.getBoundingRect(true); // 获取包含旋转和缩放的真实边界框

      // 将canvas坐标转换为屏幕坐标
      const screenX = boundingRect.left * vpt[0] + vpt[4];
      const screenY = boundingRect.top * vpt[3] + vpt[5];
      const screenRight = (boundingRect.left + boundingRect.width) * vpt[0] + vpt[4];

      targetX = rect.left + screenRight;
      targetY = rect.top + screenY;
    } else {
      // 多选：计算包围盒的右上角
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

      targetX = rect.left + screenX;
      targetY = rect.top + screenY;
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

        // 更新文本，同时恢复原有属性
        textbox.set({
          text: newText,
          ...originalProps
        });
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

      // 更新文本，同时恢复原有属性
      textbox.set({
        text: newText,
        ...originalProps
      });
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
      const regionIndex = textObj.regionIndex;
      if (regionIndex !== undefined && regions[regionIndex]) {
        const region = regions[regionIndex];

        let regionMinX, regionMinY, regionMaxX, regionMaxY;

        if (region.x !== undefined && region.width !== undefined) {
          regionMinX = region.x;
          regionMinY = region.y;
          regionMaxX = region.x + region.width;
          regionMaxY = region.y + region.height;
        } else if (region.points && region.points.length >= 4) {
          const points = region.points;
          regionMinX = Math.min(...points.map(p => p.x));
          regionMinY = Math.min(...points.map(p => p.y));
          regionMaxX = Math.max(...points.map(p => p.x));
          regionMaxY = Math.max(...points.map(p => p.y));
        } else {
          regionMinX = textObj.left;
          regionMinY = textObj.top;
          regionMaxX = textObj.left + textObj.width * textObj.scaleX;
          regionMaxY = textObj.top + textObj.height * textObj.scaleY;
        }

        minX = Math.min(minX, regionMinX);
        minY = Math.min(minY, regionMinY);
        maxX = Math.max(maxX, regionMaxX);
        maxY = Math.max(maxY, regionMaxY);
      }
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
      canvas.sendToBack(blurBackground);
      if (canvas.backgroundImage) {
        canvas.bringToFront(blurBackground);
        canvas.sendBackwards(blurBackground);
      }
    }

    // 创建合并的文本框
    const mergedTextObj = new window.fabric.Textbox(newText, {
      left: mergedBounds.left,
      top: mergedBounds.top,
      width: mergedBounds.width,
      fontSize: fontSize || calculateFontSize(width, height),
      fontFamily: selectedFont,
      fill: selectedColor,
      textAlign: textAlign,
      lineHeight: lineSpacing,
      splitByGrapheme: true,
      borderColor: '#4CAF50',
      cornerColor: '#4CAF50',
      cornerSize: 10,
      transparentCorners: false,
      hasRotatingPoint: false,
      originX: 'left',
      originY: 'top',
      lockScalingFlip: true
    });

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
    
    const activeObjects = canvas.getActiveObjects();
    activeObjects.forEach(obj => {
      if (obj.type === 'textbox') {
        obj.set(property, value);
      }
    });
    
    canvas.renderAll();
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
          currentRegions.push({
            id: obj.regionId,
            src: obj.originalText || obj.text,
            dst: obj.text,
            x: obj.left,
            y: obj.top,
            width: obj.width * obj.scaleX,
            height: obj.height * obj.scaleY,
            // 保存文本格式属性
            fontSize: obj.fontSize,
            fontFamily: obj.fontFamily,
            textAlign: obj.textAlign,
            lineHeight: obj.lineHeight,
            fill: obj.fill
          });
        } else {
          // 合并的文本框（没有regionId）
          currentRegions.push({
            id: mergedId++, // 生成新的ID
            src: obj.text, // 合并的文本没有原文
            dst: obj.text,
            x: obj.left,
            y: obj.top,
            width: obj.width * obj.scaleX,
            height: obj.height * obj.scaleY,
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

      const results = {
        edited: null,  // 不带文字版本
        final: null    // 带文字版本
      };

      // 获取当前regions
      const currentRegions = getCurrentRegions();

      // 1. 生成不带文字的版本
      let hiddenObjects = [];
      canvas.getObjects().forEach(obj => {
        if (obj.type === 'textbox') {
          obj.visible = false;
          hiddenObjects.push(obj);
        }
      });

      const currentZoom = canvas.getZoom();
      canvas.setZoom(1);
      canvas.setDimensions({
        width: imageRef.current.width,
        height: imageRef.current.height
      });

      const editedDataURL = canvas.toDataURL({
        format: 'jpeg',
        quality: 0.95,
        multiplier: 1
      });

      // 恢复文本显示
      hiddenObjects.forEach(obj => {
        obj.visible = true;
      });
      canvas.renderAll();

      // 2. 生成带文字的版本
      const finalDataURL = canvas.toDataURL({
        format: 'jpeg',
        quality: 0.95,
        multiplier: 1
      });

      // 恢复缩放
      canvas.setZoom(currentZoom);
      canvas.setDimensions({
        width: imageRef.current.width * currentZoom,
        height: imageRef.current.height * currentZoom
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

  // 暴露handleExport和generateBothVersions到全局或组件ref
  useEffect(() => {
    if (exposeHandlers) {
      window.currentFabricEditor = {
        handleExport,
        generateBothVersions
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
            title="撤销 (Ctrl+Z)"
          >
            ↶ 撤销
          </button>

          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="redo-button"
            title="重做 (Ctrl+Y)"
          >
            ↷ 重做
          </button>

          <div className="toolbar-separator" style={{ borderLeft: '1px solid #ddd', height: '20px', margin: '0 10px' }} />

          <button
            onClick={toggleAllRegions}
            className="process-button"
          >
            切换显示/隐藏背景
          </button>

          <button
            onClick={mergeSelectedObjects}
            disabled={selectedObjects.length < 2}
            className="merge-button"
          >
            合并选中区域 ({selectedObjects.filter(obj => obj && obj.type === 'textbox').length})
          </button>

          {selectedObjects.length > 0 && (
            <div className="merged-controls">
              <label>
                字体：
                <select
                  value={selectedFont}
                  onChange={(e) => {
                    setSelectedFont(e.target.value);
                    updateSelectedStyle('fontFamily', e.target.value);
                  }}
                >
                  <option value="Arial">Arial</option>
                  <option value="SimSun">宋体</option>
                  <option value="SimHei">黑体</option>
                  <option value="Microsoft YaHei">微软雅黑</option>
                  <option value="KaiTi">楷体</option>
                </select>
              </label>

              <label>
                颜色：
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => {
                    setSelectedColor(e.target.value);
                    updateSelectedStyle('fill', e.target.value);
                  }}
                />
              </label>

              <label>
                对齐：
                <select
                  value={textAlign}
                  onChange={(e) => {
                    setTextAlign(e.target.value);
                    updateSelectedStyle('textAlign', e.target.value);
                  }}
                >
                  <option value="left">左对齐</option>
                  <option value="center">居中</option>
                  <option value="right">右对齐</option>
                </select>
              </label>

              <label>
                字号：
                <input
                  type="number"
                  value={fontSize}
                  onChange={(e) => {
                    const size = parseInt(e.target.value) || 11;
                    setFontSize(size);
                    updateSelectedStyle('fontSize', size);
                  }}
                  style={{ width: '60px' }}
                />
              </label>

              <label>
                行间距：
                <input
                  type="number"
                  value={lineSpacing}
                  min="0.8"
                  max="2.0"
                  step="0.1"
                  onChange={(e) => {
                    const spacing = parseFloat(e.target.value) || 1.2;
                    setLineSpacing(spacing);
                    updateSelectedStyle('lineHeight', spacing);
                  }}
                  style={{ width: '60px' }}
                />
              </label>
            </div>
          )}
        </div>

        {/* 右侧：固定的缩放控件和全局AI */}
        <div className="toolbar-right">
          <button
            onClick={() => setShowGlobalAI(true)}
            className="global-ai-button"
            title="全局辅助修改"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2 L12 6 M12 18 L12 22 M4.93 4.93 L7.76 7.76 M16.24 16.24 L19.07 19.07 M2 12 L6 12 M18 12 L22 12 M4.93 19.07 L7.76 16.24 M16.24 7.76 L19.07 4.93"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            全局辅助
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