import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import wsService from '../services/websocket';
import { ProcessingStep, getStatusDisplay } from '../constants/status';

// 初始状态
const initialState = {
  // 用户相关
  user: null,
  isAuthenticated: false,
  
  // 客户相关
  clients: [],
  currentClient: null,
  
  // 材料相关
  materials: [],
  currentMaterial: null,
  
  // UI状态
  loading: false,
  notification: null,
  modals: {
    addClient: false,
    addMaterial: false,
    progress: false,
  },
  
  // 进度相关
  progress: {
    percentage: 0,
    text: '',
  },
  
  // 上传状态
  uploadStatus: {
    isUploading: false,
    showModal: false, // 控制进度框显示/隐藏
    files: [],
    current: 0,
    total: 0,
    message: '',
    canCancel: true,
    uploadedMaterialIds: [], // 保存最近上传的材料ID
  },
  
  // 确认对话框状态
  confirmDialog: {
    isOpen: false,
    title: '',
    message: '',
    type: 'info', // 'info', 'warning', 'danger'
    confirmText: '确认',
    cancelText: '取消',
    onConfirm: null,
    onCancel: null,
  }
};

// Action 类型
export const ActionTypes = {
  // 用户相关
  SET_USER: 'SET_USER',
  LOGOUT: 'LOGOUT',
  
  // 客户相关
  SET_CLIENTS: 'SET_CLIENTS',
  ADD_CLIENT: 'ADD_CLIENT',
  SET_CURRENT_CLIENT: 'SET_CURRENT_CLIENT',
  
  // 材料相关
  SET_MATERIALS: 'SET_MATERIALS',
  ADD_MATERIALS: 'ADD_MATERIALS',
  UPDATE_MATERIAL: 'UPDATE_MATERIAL',
  SET_CURRENT_MATERIAL: 'SET_CURRENT_MATERIAL',
  
  // UI状态
  SET_LOADING: 'SET_LOADING',
  SET_NOTIFICATION: 'SET_NOTIFICATION',
  CLEAR_NOTIFICATION: 'CLEAR_NOTIFICATION',
  TOGGLE_MODAL: 'TOGGLE_MODAL',
  
  // 进度相关
  SET_PROGRESS: 'SET_PROGRESS',
  RESET_PROGRESS: 'RESET_PROGRESS',
  
  // 上传相关
  START_UPLOAD: 'START_UPLOAD',
  UPDATE_UPLOAD_PROGRESS: 'UPDATE_UPLOAD_PROGRESS',
  COMPLETE_UPLOAD: 'COMPLETE_UPLOAD',
  CANCEL_UPLOAD: 'CANCEL_UPLOAD',
  SET_UPLOADED_MATERIALS: 'SET_UPLOADED_MATERIALS',
  HIDE_UPLOAD_MODAL: 'HIDE_UPLOAD_MODAL',
  
  // 确认对话框相关
  OPEN_CONFIRM_DIALOG: 'OPEN_CONFIRM_DIALOG',
  CLOSE_CONFIRM_DIALOG: 'CLOSE_CONFIRM_DIALOG',
};

// Reducer
const appReducer = (state, action) => {
  switch (action.type) {
    case ActionTypes.SET_USER:
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
      };
      
    case ActionTypes.LOGOUT:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        clients: [],
        currentClient: null,
        materials: [],
        currentMaterial: null,
      };
      
    case ActionTypes.SET_CLIENTS:
      return {
        ...state,
        clients: action.payload,
      };
      
    case ActionTypes.ADD_CLIENT:
      return {
        ...state,
        clients: [...state.clients, action.payload],
      };
      
    case ActionTypes.SET_CURRENT_CLIENT:
      return {
        ...state,
        currentClient: action.payload,
        currentMaterial: null, // 切换客户时清空当前材料
      };
      
    case ActionTypes.SET_MATERIALS:
      return {
        ...state,
        materials: action.payload,
      };
      
    case ActionTypes.ADD_MATERIALS:
      return {
        ...state,
        materials: [...state.materials, ...action.payload],
      };
      
    case ActionTypes.UPDATE_MATERIAL:
      const updatedMaterials = state.materials.map(material =>
        material.id === action.payload.id
          ? { ...material, ...action.payload.updates }
          : material
      );
      
      // 如果更新的材料是当前选中的材料，也要更新currentMaterial
      const updatedCurrentMaterial = state.currentMaterial?.id === action.payload.id
        ? { ...state.currentMaterial, ...action.payload.updates }
        : state.currentMaterial;
      
      return {
        ...state,
        materials: updatedMaterials,
        currentMaterial: updatedCurrentMaterial,
      };
      
    case ActionTypes.SET_CURRENT_MATERIAL:
      return {
        ...state,
        currentMaterial: action.payload,
      };
      
    case ActionTypes.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
      };
      
    case ActionTypes.SET_NOTIFICATION:
      return {
        ...state,
        notification: action.payload,
      };
      
    case ActionTypes.CLEAR_NOTIFICATION:
      return {
        ...state,
        notification: null,
      };
      
    case ActionTypes.TOGGLE_MODAL:
      return {
        ...state,
        modals: {
          ...state.modals,
          [action.payload.modalName]: action.payload.isOpen,
        },
      };
      
    case ActionTypes.SET_PROGRESS:
      return {
        ...state,
        progress: action.payload,
      };
      
    case ActionTypes.RESET_PROGRESS:
      return {
        ...state,
        progress: { percentage: 0, text: '' },
      };
      
    case ActionTypes.START_UPLOAD:
      return {
        ...state,
        uploadStatus: {
          ...action.payload,
          isUploading: true,
          showModal: true,
        }
      };
      
    case ActionTypes.UPDATE_UPLOAD_PROGRESS:
      return {
        ...state,
        uploadStatus: {
          ...state.uploadStatus,
          ...action.payload,
        }
      };
      
    case ActionTypes.COMPLETE_UPLOAD:
      return {
        ...state,
        uploadStatus: {
          isUploading: false,
          showModal: false, // 关闭进度框
          files: [],
          current: 0,
          total: 0,
          message: '已关闭',
          canCancel: false,
          uploadedMaterialIds: [],
        }
      };
      
    case ActionTypes.CANCEL_UPLOAD:
      return {
        ...state,
        uploadStatus: {
          isUploading: false,
          showModal: false, // 关闭进度框
          files: [],
          current: 0,
          total: 0,
          message: '上传已取消',
          canCancel: false,
          uploadedMaterialIds: [],
        }
      };
      
    case ActionTypes.SET_UPLOADED_MATERIALS:
      return {
        ...state,
        uploadStatus: {
          ...state.uploadStatus,
          uploadedMaterialIds: action.payload,
        }
      };
      
    case ActionTypes.HIDE_UPLOAD_MODAL:
      return {
        ...state,
        uploadStatus: {
          ...state.uploadStatus,
          showModal: false,
        }
      };
      
    case ActionTypes.OPEN_CONFIRM_DIALOG:
      return {
        ...state,
        confirmDialog: {
          ...action.payload,
          isOpen: true,
        }
      };
      
    case ActionTypes.CLOSE_CONFIRM_DIALOG:
      return {
        ...state,
        confirmDialog: {
          ...state.confirmDialog,
          isOpen: false,
          onConfirm: null,
          onCancel: null,
        }
      };
      
    default:
      return state;
  }
};

// Context
const AppContext = createContext();

// Provider 组件
export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 自动清除通知
  useEffect(() => {
    if (state.notification) {
      const timer = setTimeout(() => {
        dispatch({ type: ActionTypes.CLEAR_NOTIFICATION });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [state.notification]);

  // Action creators - 使用 useMemo 确保 actions 对象稳定，避免不必要的重新渲染
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const actions = React.useMemo(() => ({
    // 用户相关
    setUser: (user) => {
      dispatch({ type: ActionTypes.SET_USER, payload: user });
    },
    
    updateUser: (user) => {
      dispatch({ type: ActionTypes.SET_USER, payload: user });
      // 同时更新localStorage中的用户信息
      localStorage.setItem('user_info', JSON.stringify(user));
    },
    
    logout: () => {
      dispatch({ type: ActionTypes.LOGOUT });
    },
    
    // 客户相关
    setClients: (clients) => {
      dispatch({ type: ActionTypes.SET_CLIENTS, payload: clients });
    },
    
    addClient: (client) => {
      dispatch({ type: ActionTypes.ADD_CLIENT, payload: client });
    },
    
    setCurrentClient: (client) => {
      dispatch({ type: ActionTypes.SET_CURRENT_CLIENT, payload: client });
    },
    
    // 材料相关
    setMaterials: (materials) => {
      dispatch({ type: ActionTypes.SET_MATERIALS, payload: materials });
    },
    
    addMaterials: (materials) => {
      dispatch({ type: ActionTypes.ADD_MATERIALS, payload: materials });
    },
    
    updateMaterial: (id, updates) => {
      dispatch({ type: ActionTypes.UPDATE_MATERIAL, payload: { id, updates } });
    },
    
    setCurrentMaterial: (material) => {
      dispatch({ type: ActionTypes.SET_CURRENT_MATERIAL, payload: material });
    },
    
    // UI状态
    setLoading: (loading) => {
      dispatch({ type: ActionTypes.SET_LOADING, payload: loading });
    },
    
    showNotification: (title, message, type = 'success') => {
      dispatch({ 
        type: ActionTypes.SET_NOTIFICATION, 
        payload: { title, message, type } 
      });
    },
    
    clearNotification: () => {
      dispatch({ type: ActionTypes.CLEAR_NOTIFICATION });
    },
    
    toggleModal: (modalName, isOpen) => {
      dispatch({ 
        type: ActionTypes.TOGGLE_MODAL, 
        payload: { modalName, isOpen } 
      });
    },
    
    // 进度相关
    setProgress: (percentage, text) => {
      dispatch({ 
        type: ActionTypes.SET_PROGRESS, 
        payload: { percentage, text } 
      });
    },
    
    resetProgress: () => {
      dispatch({ type: ActionTypes.RESET_PROGRESS });
    },
    
    // 上传相关
    startUpload: (files, message = '准备上传...', customTotal = null) => {
      dispatch({
        type: ActionTypes.START_UPLOAD,
        payload: {
          files: files,
          total: customTotal !== null ? customTotal : files.length,
          fileCount: files.length,  // 实际文件数量，用于显示
          current: 0,
          message: message,
          canCancel: true
        }
      });
    },
    
    updateUploadProgress: (current, message, canCancel = true, isUploading = null) => {
      const payload = { current, message, canCancel };
      if (isUploading !== null) {
        payload.isUploading = isUploading;
      }
      dispatch({ 
        type: ActionTypes.UPDATE_UPLOAD_PROGRESS, 
        payload 
      });
    },
    
    completeUpload: () => {
      dispatch({ type: ActionTypes.COMPLETE_UPLOAD });
    },
    
    cancelUpload: () => {
      dispatch({ type: ActionTypes.CANCEL_UPLOAD });
    },
    
    setUploadedMaterials: (materialIds) => {
      dispatch({ type: ActionTypes.SET_UPLOADED_MATERIALS, payload: materialIds });
    },
    
    hideUploadModal: () => {
      dispatch({ type: ActionTypes.HIDE_UPLOAD_MODAL });
    },
    
    // 确认对话框
    openConfirmDialog: (config) => {
      dispatch({ type: ActionTypes.OPEN_CONFIRM_DIALOG, payload: config });
    },
    
    closeConfirmDialog: () => {
      dispatch({ type: ActionTypes.CLOSE_CONFIRM_DIALOG });
    },
  }), []);

  // ✅ WebSocket 初始化
  useEffect(() => {
    wsService.connect();

    return () => {
      wsService.disconnect();
    };
  }, []);

  // ✅ WebSocket 事件处理函数
  // 🔧 修复：移除 state.currentMaterial 依赖，避免频繁重新创建回调导致事件监听器重新注册
  const handleMaterialUpdated = useCallback((data) => {
    // 更新材料状态
    if (data.material_id) {
      let updates = {};

      // ✅ 优先使用后端推送的完整material对象（包含所有字段）
      if (data.material) {
        updates = data.material;
      } else {
        // 兼容旧格式：手动提取字段
        if (data.status) updates.status = data.status;
        if (data.progress !== undefined) updates.processingProgress = data.progress;
        if (data.translated_path) updates.translatedImagePath = data.translated_path;
        if (data.translation_info) updates.translationTextInfo = data.translation_info;
        // 提取LLM翻译结果（支持两种命名格式）
        const llmResult = data.llm_translation_result || data.llmTranslationResult || data.translations;
        if (llmResult) updates.llmTranslationResult = llmResult;
        // 提取处理步骤
        if (data.processing_step) updates.processingStep = data.processing_step;
      }

      // ✅ 只需调用updateMaterial，Reducer会自动同步更新currentMaterial
      actions.updateMaterial(data.material_id, updates);
    }
  }, [actions]);

  const handleLLMStarted = useCallback((data) => {
    if (data.material_id) {
      // LLM 开始时更新状态
      actions.updateMaterial(data.material_id, {
        processingProgress: data.progress || 70,
        processingStep: ProcessingStep.LLM_TRANSLATING,
        status: getStatusDisplay(ProcessingStep.LLM_TRANSLATING)
      });
    }
  }, [actions]);

  const handleLLMCompleted = useCallback((data) => {
    if (data.material_id) {
      // 更新完整状态：progress, translations, status, processing_step
      actions.updateMaterial(data.material_id, {
        processingProgress: data.progress || 100,
        llmTranslationResult: data.translations,
        status: getStatusDisplay(ProcessingStep.LLM_TRANSLATED),
        processingStep: ProcessingStep.LLM_TRANSLATED
      });

      actions.showNotification('LLM优化完成', `成功优化 ${data.translations?.length || 0} 个翻译区域`, 'success');
    }
  }, [actions]);

  const handleTranslationStarted = useCallback((data) => {
    actions.showNotification('翻译开始', data.message || '正在翻译...', 'info');
  }, [actions]);

  const handleTranslationCompleted = useCallback(async (data) => {
    actions.showNotification('翻译完成', data.message || '翻译已完成', 'success');

    // 🔧 修复：翻译完成后主动刷新材料数据，确保 UI 更新
    // 这可以防止 WebSocket material_updated 事件丢失导致的 UI 不同步问题
    if (state.currentClient?.cid) {
      try {
        const { materialAPI } = await import('../services/api');
        const response = await materialAPI.getMaterials(state.currentClient.cid);
        if (response.success && response.materials) {
          actions.setMaterials(response.materials);
          console.log('[WebSocket] 翻译完成，已刷新材料列表');
        }
      } catch (error) {
        console.error('[WebSocket] 刷新材料列表失败:', error);
      }
    }
  }, [actions, state.currentClient?.cid]);

  const handleMaterialError = useCallback((data) => {
    if (data.material_id) {
      actions.updateMaterial(data.material_id, {
        status: getStatusDisplay(ProcessingStep.FAILED),
        processingStep: ProcessingStep.FAILED,
        translationError: data.error
      });
    }
    actions.showNotification('处理失败', data.error || '处理过程中发生错误', 'error');
  }, [actions]);

  // ✅ 监听当前客户端变化，加入对应房间
  useEffect(() => {
    if (state.currentClient?.cid) {
      const clientId = state.currentClient.cid;

      // ✅ 不再检查isConnected，WebSocket服务内部会处理连接状态
      wsService.joinClient(clientId);

      // 监听事件
      wsService.on('translation_started', handleTranslationStarted);
      wsService.on('material_updated', handleMaterialUpdated);
      wsService.on('translation_completed', handleTranslationCompleted);
      wsService.on('material_error', handleMaterialError);
      wsService.on('llm_started', handleLLMStarted); // 使用专门的LLM开始处理函数
      wsService.on('llm_completed', handleLLMCompleted);
      wsService.on('llm_error', handleMaterialError);

      return () => {
        wsService.leaveClient(clientId);
        wsService.off('translation_started', handleTranslationStarted);
        wsService.off('material_updated', handleMaterialUpdated);
        wsService.off('translation_completed', handleTranslationCompleted);
        wsService.off('material_error', handleMaterialError);
        wsService.off('llm_started', handleLLMStarted);
        wsService.off('llm_completed', handleLLMCompleted);
        wsService.off('llm_error', handleMaterialError);
      };
    }
  }, [state.currentClient?.cid, handleTranslationStarted, handleMaterialUpdated,
      handleTranslationCompleted, handleMaterialError, handleLLMStarted, handleLLMCompleted]);

  const value = {
    state,
    actions,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

// Hook
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};