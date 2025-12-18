import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { VERSION, BUILD_TIME, BUILD_NUMBER } from './version';

// 页面组件
// import WelcomePage from './pages/WelcomePage'; // 已弃用
import WelcomePageV2 from './pages/WelcomePageV2';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
// 暂时禁用的页面（重定向到demo-v2）
// import DashboardPage from './pages/DashboardPage';
// import TranslationPage from './pages/TranslationPage';
// import ProfilePage from './pages/ProfilePage';
// import ArchivedClientsPage from './pages/ArchivedClientsPage';
import AdobeStyleImageSeparation from './pages/AdobeStyleImageSeparation';
import DemoClaudeLayout from './pages/DemoClaudeLayout';

// 通用组件
import Notification from './components/common/Notification';
import ProgressModal from './components/common/ProgressModal';
import GlobalUploadProgress from './components/common/GlobalUploadProgress';
import ProtectedRoute from './components/common/ProtectedRoute';
import GlobalConfirmDialog from './components/common/GlobalConfirmDialog';

// 版本信息显示组件
function VersionLogger() {
  const location = useLocation();

  useEffect(() => {
    // 生产环境使用保存的原始 console.log
    const log = window.__originalConsoleLog || console.log;
    log('%c📦 文书翻译平台', 'color: #2196F3; font-size: 20px; font-weight: bold;');
    log('%c版本信息', 'color: #4CAF50; font-size: 14px; font-weight: bold;');
    log(`  版本号: v${VERSION}`);
    log(`  构建时间: ${BUILD_TIME}`);
    log(`  构建编号: ${BUILD_NUMBER}`);
    log(`  环境: ${process.env.NODE_ENV}`);
    log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #999;');
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <LanguageProvider>
      <AppProvider>
        <NotificationProvider>
          <Router basename="/">
            <VersionLogger />
        <div className="App">
          <Routes>
            {/* 公开路由 */}
            <Route path="/" element={<WelcomePageV2 />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />

            {/* 隐藏工具路由 - 无导航入口，仅通过URL访问 */}
            <Route path="/image-separation" element={<AdobeStyleImageSeparation />} />

            {/* 受保护的路由 - 暂时禁用，重定向到demo-v2 */}
            <Route path="/dashboard" element={<Navigate to="/demo-v2" replace />} />
            <Route path="/client/:clientId" element={<Navigate to="/demo-v2" replace />} />
            <Route path="/profile" element={<Navigate to="/demo-v2" replace />} />
            <Route path="/archived-clients" element={<Navigate to="/demo-v2" replace />} />

            {/* Demo路由 - Claude风格布局 */}
            <Route
              path="/demo-v2"
              element={
                <ProtectedRoute>
                  <DemoClaudeLayout />
                </ProtectedRoute>
              }
            />
            <Route
              path="/demo-v2/:clientId"
              element={
                <ProtectedRoute>
                  <DemoClaudeLayout />
                </ProtectedRoute>
              }
            />

            {/* 重定向 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          
          {/* 全局组件 */}
          <Notification />
          <ProgressModal />
          <GlobalUploadProgress />
          <GlobalConfirmDialog />
        </div>
        </Router>
        </NotificationProvider>
      </AppProvider>
    </LanguageProvider>
  );
}

export default App;



