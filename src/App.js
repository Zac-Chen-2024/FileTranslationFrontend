import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { NotificationProvider } from './contexts/NotificationContext';

// 页面组件
import WelcomePage from './pages/WelcomePage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import DashboardPage from './pages/DashboardPage';
import TranslationPage from './pages/TranslationPage';
import ProfilePage from './pages/ProfilePage';
import ArchivedClientsPage from './pages/ArchivedClientsPage';
import PDFTestPage from './pages/PDFTestPage';

// 通用组件
import Notification from './components/common/Notification';
import ProgressModal from './components/common/ProgressModal';
import GlobalUploadProgress from './components/common/GlobalUploadProgress';
import ProtectedRoute from './components/common/ProtectedRoute';
import GlobalConfirmDialog from './components/common/GlobalConfirmDialog';

function App() {
  return (
    <AppProvider>
      <NotificationProvider>
        <Router basename="/FileTranslationFrontend">
        <div className="App">
          <Routes>
            {/* 公开路由 */}
            <Route path="/" element={<WelcomePage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />

            {/* 测试路由 */}
            <Route path="/pdf-test" element={<PDFTestPage />} />
            
            {/* 受保护的路由 */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/client/:clientId" 
              element={
                <ProtectedRoute>
                  <TranslationPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/archived-clients" 
              element={
                <ProtectedRoute>
                  <ArchivedClientsPage />
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
  );
}

export default App;



