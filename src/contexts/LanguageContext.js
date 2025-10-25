import React, { createContext, useContext, useState, useEffect } from 'react';
import { getTranslation } from '../locales';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  // 从localStorage读取保存的语言偏好，默认中文
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('app_language') || 'zh';
  });

  // 当语言改变时，保存到localStorage
  useEffect(() => {
    localStorage.setItem('app_language', language);
  }, [language]);

  // 翻译函数
  const t = (key, params) => {
    return getTranslation(language, key, params);
  };

  // 切换语言
  const switchLanguage = (lang) => {
    if (lang === 'zh' || lang === 'en') {
      setLanguage(lang);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, t, switchLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

// 自定义Hook方便使用
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
