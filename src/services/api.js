import axios from 'axios';

// 创建 axios 实例
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5010',
  timeout: 120000,  // 增加到120秒，对于大多数操作应该足够
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 在发送请求之前做些什么
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    // 对于blob类型的响应，返回完整的response对象以便访问headers
    if (response.config.responseType === 'blob') {
      return response;
    }
    return response.data;
  },
  (error) => {
    // 只在非登录/注册页面且401错误时才自动重定向
    const isAuthPage = window.location.pathname.includes('/signin') ||
                       window.location.pathname.includes('/signup');

    if (error.response?.status === 401 && !isAuthPage) {
      // 未授权，清除本地存储并重定向到登录页
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');

      // 使用 basename 确保路径正确
      // 从 package.json 的 homepage 获取基础路径
      const basename = process.env.PUBLIC_URL || '';
      window.location.href = `${basename}/signin`;
    }

    // 404错误处理 - 可能是路由问题或资源不存在
    if (error.response?.status === 404) {
      console.warn('404 Not Found:', error.config?.url);
      // 如果是API请求404，不需要重定向，只是记录警告
      // 页面路由的404由React Router处理
    }

    // 返回更友好的错误信息
    const errorMessage = error.response?.data?.message ||
                        error.response?.data?.error ||
                        error.message ||
                        '请求失败';

    return Promise.reject(new Error(errorMessage));
  }
);

// API 服务
export const authAPI = {
  // 登录
  signin: async (email, password) => {
    const response = await api.post('/api/auth/signin', { email, password });
    if (response.token) {
      localStorage.setItem('auth_token', response.token);
      localStorage.setItem('user_info', JSON.stringify(response.user));
    }
    return response;
  },

  // 注册
  signup: async (name, email, password) => {
    const response = await api.post('/api/auth/signup', { name, email, password });
    if (response.token) {
      localStorage.setItem('auth_token', response.token);
      localStorage.setItem('user_info', JSON.stringify(response.user));
    }
    return response;
  },

  // 登出
  logout: async () => {
    try {
      // 调用后端logout API
      await api.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout API failed:', error);
      // 即使API调用失败，也要清除本地存储
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    return Promise.resolve();
  },

  // 获取当前用户信息
  getCurrentUser: () => {
    const userInfo = localStorage.getItem('user_info');
    return userInfo ? JSON.parse(userInfo) : null;
  },
};

export const clientAPI = {
  // 获取客户列表
  getClients: async () => {
    return await api.get('/api/clients');
  },

  // 添加客户
  addClient: async (clientData) => {
    return await api.post('/api/clients', clientData);
  },

  // 更新客户信息
  updateClient: async (clientId, updates) => {
    return await api.put(`/api/clients/${clientId}`, updates);
  },

  // 删除客户
  deleteClient: async (clientId) => {
    return await api.delete(`/api/clients/${clientId}`);
  },

  // 归档客户
  archiveClient: async (clientId, reason) => {
    return await api.put(`/api/clients/${clientId}/archive`, { reason });
  },

  // 取消归档客户
  unarchiveClient: async (clientId) => {
    return await api.put(`/api/clients/${clientId}/unarchive`);
  },
};

export const materialAPI = {
  // 获取材料列表
  getMaterials: async (clientId) => {
    return await api.get(`/api/clients/${clientId}/materials`);
  },

  // 上传文件
  uploadFiles: async (clientId, files, onProgress) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    return await api.post(`/api/clients/${clientId}/materials/upload`, formData, {
      headers: {
        // 不设置Content-Type，让浏览器自动设置multipart/form-data边界
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentage = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentage);
        }
      },
    });
  },

  // 上传网址
  uploadUrls: async (clientId, urls) => {
    return await api.post(`/api/clients/${clientId}/materials/urls`, { urls });
  },

  // 更新材料状态
  updateMaterial: async (materialId, updates) => {
    return await api.put(`/api/materials/${materialId}`, updates);
  },

  // 确认材料
  confirmMaterial: async (materialId) => {
    return await api.post(`/api/materials/${materialId}/confirm`, {}, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // 取消确认材料
  unconfirmMaterial: async (materialId) => {
    return await api.post(`/api/materials/${materialId}/unconfirm`, {}, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // 编辑LaTeX
  editLatex: async (materialId, description) => {
    return await api.post(`/api/materials/${materialId}/edit`, { description }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // 选择翻译结果
  selectResult: async (materialId, resultType) => {
    return await api.post(`/api/materials/${materialId}/select`, { resultType }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },
  
  // 删除材料
  deleteMaterial: async (materialId) => {
    return await api.delete(`/api/materials/${materialId}`);
  },
  
  // 开始翻译
  startTranslation: async (clientId, materialIds = null) => {
    const config = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // 如果指定了materialIds，只翻译这些材料
    if (materialIds) {
      const ids = Array.isArray(materialIds) ? materialIds : [materialIds];
      return await api.post(
        `/api/clients/${clientId}/materials/translate`,
        { material_ids: ids },
        config
      );
    }

    // 否则翻译所有材料
    return await api.post(`/api/clients/${clientId}/materials/translate`);
  },
  
  // 重试LaTeX翻译
  retryLatexTranslation: async (materialId) => {
    return await api.post(`/api/materials/${materialId}/retry-latex`);
  },
  
  // 取消上传
  cancelUpload: async (clientId, materialIds) => {
    return await api.post(`/api/clients/${clientId}/materials/cancel`, {
      material_ids: materialIds
    });
  },

  // LLM翻译优化
  llmTranslateMaterial: async (materialId, translationGuidance = null) => {
    const body = translationGuidance ? { translationGuidance } : {};
    return await api.post(`/api/materials/${materialId}/llm-translate`, body, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // 实体识别 - 快速模式
  entityRecognitionFast: async (materialId) => {
    return await api.post(`/api/materials/${materialId}/entity-recognition/fast`, {}, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // 实体识别 - 深度模式
  entityRecognitionDeep: async (materialId) => {
    return await api.post(`/api/materials/${materialId}/entity-recognition/deep`, {}, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 150000, // 150秒超时
    });
  },

  // 实体识别 - AI优化
  entityRecognitionManualAdjust: async (materialId, fastResults) => {
    return await api.post(`/api/materials/${materialId}/entity-recognition/manual-adjust`, {
      fast_results: fastResults
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // PDF Session 整体实体识别 - 快速模式
  pdfSessionEntityRecognitionFast: async (sessionId) => {
    return await api.post(`/api/pdf-sessions/${sessionId}/entity-recognition/fast`, {}, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // PDF Session 整体实体识别 - 深度模式（AI优化）
  pdfSessionEntityRecognitionDeep: async (sessionId, entities) => {
    return await api.post(`/api/pdf-sessions/${sessionId}/entity-recognition/deep`, {
      entities
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 150000, // 150秒超时
    });
  },

  // PDF Session 确认实体
  pdfSessionConfirmEntities: async (sessionId, entities, translationGuidance) => {
    return await api.post(`/api/pdf-sessions/${sessionId}/confirm-entities`, {
      entities,
      translationGuidance
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // 确认实体
  confirmEntities: async (materialId, entities, translationGuidance) => {
    return await api.post(`/api/materials/${materialId}/confirm-entities`, {
      entities,
      translationGuidance
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // 启用/禁用实体识别
  enableEntityRecognition: async (materialId, enabled, mode = null) => {
    const body = { enabled };
    if (mode) {
      body.mode = mode;
    }
    return await api.post(`/api/materials/${materialId}/enable-entity-recognition`, body, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // 重新翻译单个材料
  retranslateMaterial: async (materialId) => {
    return await api.post(`/api/materials/${materialId}/retranslate`, {}, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // 旋转材料图片并重新翻译
  rotateMaterial: async (materialId) => {
    return await api.post(`/api/materials/${materialId}/rotate`, {}, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // ✅ 重构：只保存regions数据
  saveRegions: async (materialId, regions) => {
    return await api.post(`/api/materials/${materialId}/save-regions`, { regions }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  // ✅ 新增：保存最终图片（用于导出）
  saveFinalImage: async (materialId, imageBlob) => {
    const formData = new FormData();
    formData.append('final_image', imageBlob, `final_${materialId}.jpg`);

    return await api.post(`/api/materials/${materialId}/save-final-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export const translationAPI = {
  // LaTeX翻译 (更新命名)
  translateLatex: async (imageFile, onProgress) => {
    const formData = new FormData();
    formData.append('image', imageFile);

    return await api.post('/api/latex-translate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentage = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentage);
        }
      },
    });
  },

  // API翻译 (更新命名)
  translateApi: async (imageFile, fromLang, toLang, onProgress) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('from_lang', fromLang);
    formData.append('to_lang', toLang);
    formData.append('save_image', 'true');

    return await api.post('/api/api-translate', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentage = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentage);
        }
      },
    });
  },

  // 保持向后兼容的别名
  translatePoster: async (imageFile, onProgress) => {
    return translationAPI.translateLatex(imageFile, onProgress);
  },

  translateImage: async (imageFile, fromLang, toLang, onProgress) => {
    return translationAPI.translateApi(imageFile, fromLang, toLang, onProgress);
  },

  // 网页翻译（Google）
  translateWebpageGoogle: async (url) => {
    return await api.post('/api/webpage-google-translate', { url });
  },

  // 网页翻译（GPT）
  translateWebpageGPT: async (url) => {
    return await api.post('/api/webpage-gpt-translate', { url });
  },
};

export const exportAPI = {
  // 导出客户材料
  exportClientMaterials: async (clientId, filename = 'export.zip') => {
    // 使用原生axios来获取完整的响应对象
    // 移除超时限制，因为导出可能需要较长时间
    const response = await api.get(`/api/clients/${clientId}/export`, {
      responseType: 'blob',
      timeout: 0,  // 0表示没有超时限制
    });
    
    // 创建下载链接
    const blob = response.data;
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    console.log('导出文件名:', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return response;
  },
};

export const userAPI = {
  // 获取用户设置
  getSettings: async () => {
    return await api.get('/api/user/settings');
  },

  // 更新基本信息
  updateBasicInfo: async (info) => {
    return await api.put('/api/user/basic-info', info);
  },

  // 更新通知设置
  updateNotificationSettings: async (settings) => {
    return await api.put('/api/user/notification-settings', settings);
  },

  // 更新翻译偏好
  updateTranslationPreferences: async (preferences) => {
    return await api.put('/api/user/translation-preferences', preferences);
  },

  // 修改密码
  changePassword: async (currentPassword, newPassword) => {
    return await api.put('/api/user/change-password', {
      currentPassword,
      newPassword
    });
  },

  // 获取登录记录
  getLoginHistory: async () => {
    return await api.get('/api/user/login-history');
  },
};

export const utilsAPI = {
  // 测试后端连接
  testConnection: async () => {
    return await api.get('/health');
  },

  // 获取翻译进度
  getTranslationProgress: async (taskId) => {
    return await api.get(`/api/translation/progress/${taskId}`);
  },
};

export default api;



