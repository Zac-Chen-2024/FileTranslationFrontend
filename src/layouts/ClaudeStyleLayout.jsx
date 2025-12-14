import React, { useState } from 'react';
import styles from './ClaudeStyleLayout.module.css';

/**
 * Claude风格布局组件
 * 左侧可折叠侧边栏 + 右侧主内容区
 */
const ClaudeStyleLayout = ({
  sidebar,
  children,
  header,
  defaultCollapsed = false
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(defaultCollapsed);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className={styles.layout}>
      {/* 顶部Header */}
      {header && (
        <div className={styles.header}>
          {header}
        </div>
      )}

      {/* 主体区域 */}
      <div className={styles.body}>
        {/* 侧边栏 */}
        <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ''}`}>
          {/* 侧边栏内容 */}
          <div className={styles.sidebarContent}>
            {sidebar}
          </div>
        </aside>

        {/* 统一的收放按钮 - 始终在侧边栏右边缘 */}
        <button
          className={`${styles.toggleBtn} ${sidebarCollapsed ? styles.toggleCollapsed : ''}`}
          onClick={toggleSidebar}
          title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {sidebarCollapsed ? (
              <path d="M9 18l6-6-6-6"/>
            ) : (
              <path d="M15 18l-6-6 6-6"/>
            )}
          </svg>
        </button>

        {/* 主内容区 */}
        <main className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default ClaudeStyleLayout;
