import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/design-tokens.css';
import './styles/globals.css';
import App from './App';

// 生产环境禁用 console 输出，但 pro 测试环境保留
if (process.env.NODE_ENV === 'production') {
  const isProEnv = window.location.hostname === 'ft.pro.zacchen.win';
  // 保存原始 console.log 用于版本信息
  window.__originalConsoleLog = console.log.bind(console);
  if (!isProEnv) {
    // 只在非 pro 环境禁用 console
    console.log = () => {};
    console.debug = () => {};
    console.info = () => {};
    console.warn = () => {};
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);



