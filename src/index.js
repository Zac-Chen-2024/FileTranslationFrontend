import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/design-tokens.css';
import './styles/globals.css';
import App from './App';

// 生产环境禁用 console 输出，但保留版本信息输出
if (process.env.NODE_ENV === 'production') {
  // 保存原始 console.log 用于版本信息
  window.__originalConsoleLog = console.log.bind(console);
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  console.warn = () => {};
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);



