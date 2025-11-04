import io from 'socket.io-client';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket?.connected) {
      console.log('WebSocket 已连接');
      return;
    }

    console.log(`🔌 正在连接 WebSocket: ${API_URL}`);
    
    this.socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket 连接成功');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket 断开');
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket 连接错误:', error);
    });

    this.socket.on('connected', (data) => {
      console.log('📡 收到服务器连接确认:', data);
    });
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 断开 WebSocket');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // 加入客户端房间
  joinClient(clientId) {
    if (this.socket?.connected) {
      this.socket.emit('join_client', { client_id: clientId });
      console.log(`📥 加入客户端房间: ${clientId}`);
    }
  }

  // 离开客户端房间
  leaveClient(clientId) {
    if (this.socket?.connected) {
      this.socket.emit('leave_client', { client_id: clientId });
      console.log(`📤 离开客户端房间: ${clientId}`);
    }
  }

  // 监听事件
  on(event, callback) {
    if (!this.socket) {
      console.warn(`⚠️ WebSocket 未连接，无法监听事件: ${event}`);
      return;
    }
    
    this.socket.on(event, callback);
    
    // 保存监听器以便后续移除
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    console.log(`👂 开始监听事件: ${event}`);
  }

  // 移除事件监听
  off(event, callback) {
    if (!this.socket) return;
    
    this.socket.off(event, callback);
    
    // 从记录中移除
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
    console.log(`🔇 移除监听: ${event}`);
  }

  // 移除某个事件的所有监听器
  removeAllListeners(event) {
    if (!this.socket) return;
    
    this.socket.removeAllListeners(event);
    this.listeners.delete(event);
    console.log(`🔇 移除所有监听: ${event}`);
  }

  // 检查连接状态
  isConnected() {
    return this.socket?.connected || false;
  }
}

// 单例模式
const wsService = new WebSocketService();
export default wsService;



