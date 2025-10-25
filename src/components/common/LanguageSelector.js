import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import styles from './LanguageSelector.module.css';

const LanguageSelector = () => {
  const { language, switchLanguage, t } = useLanguage();

  const handleChange = (e) => {
    switchLanguage(e.target.value);
  };

  return (
    <div className={styles.languageSelectorContainer}>
      <select
        className={styles.languageSelect}
        value={language}
        onChange={handleChange}
        title={t('language')}
      >
        <option value="zh">{t('chinese')}</option>
        <option value="en">{t('english')}</option>
      </select>
    </div>
  );
};

export default LanguageSelector;
