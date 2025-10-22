import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/design-tokens.css';
import './styles/globals.css';
import App from './App';
import { VERSION, BUILD_TIME, BUILD_NUMBER } from './version';

// 显示版本和构建信息
console.log('%c📦 文书翻译平台', 'color: #2196F3; font-size: 20px; font-weight: bold;');
console.log('%c版本信息', 'color: #4CAF50; font-size: 14px; font-weight: bold;');
console.log(`  版本号: v${VERSION}`);
console.log(`  构建时间: ${BUILD_TIME}`);
console.log(`  构建编号: ${BUILD_NUMBER}`);
console.log(`  环境: ${process.env.NODE_ENV}`);
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #999;');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);



