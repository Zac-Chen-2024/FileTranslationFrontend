import { zh } from './zh';
import { en } from './en';

export const translations = {
  zh,
  en,
};

export const getTranslation = (lang, key, params = {}) => {
  const translation = translations[lang]?.[key] || key;

  // 支持参数替换，例如 "第 {current} / {total} 页"
  if (typeof translation === 'string' && Object.keys(params).length > 0) {
    return translation.replace(/\{(\w+)\}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match;
    });
  }

  return translation;
};
