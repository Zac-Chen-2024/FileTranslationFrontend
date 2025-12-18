import io from 'socket.io-client';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5010';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.currentClientId = null;  // ✅ 记录当前加入的房间
    this.pendingJoin = null;      // ✅ 等待连接后加入的房间
  }

  connect() {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,  // ✅ 无限重试
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,      // ✅ 最大重连间隔5秒
    });

    // ✅ 连接成功
    this.socket.on('connect', () => {
      console.log('[WebSocket] 连接成功, socket.id:', this.socket.id);

      // ✅ 重连后自动重新加入房间
      if (this.currentClientId) {
        console.log('[WebSocket] 重新加入房间:', this.currentClientId);
        this.socket.emit('join_client', { client_id: this.currentClientId });
      }
      // ✅ 处理等待中的加入请求
      if (this.pendingJoin) {
        console.log('[WebSocket] 处理等待中的加入请求:', this.pendingJoin);
        this.socket.emit('join_client', { client_id: this.pendingJoin });
        this.currentClientId = this.pendingJoin;
        this.pendingJoin = null;
      }
    });

    // ✅ 断开连接
    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] 断开连接, 原因:', reason);
    });

    // ✅ 重连中
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('[WebSocket] 重连尝试 #' + attemptNumber);
    });

    // ✅ 重连成功
    this.socket.on('reconnect', (attemptNumber) => {
      console.log('[WebSocket] 重连成功, 尝试次数:', attemptNumber);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WebSocket] 连接错误:', error.message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentClientId = null;
    this.pendingJoin = null;
  }

  // 加入客户端房间
  joinClient(clientId) {
    if (!clientId) return;

    if (this.socket?.connected) {
      console.log('[WebSocket] 加入房间:', clientId);
      this.socket.emit('join_client', { client_id: clientId });
      this.currentClientId = clientId;
      this.pendingJoin = null;
    } else {
      // ✅ 如果还没连接，记录下来等连接后加入
      console.log('[WebSocket] 连接未就绪，等待连接后加入房间:', clientId);
      this.pendingJoin = clientId;
    }
  }

  // 离开客户端房间
  leaveClient(clientId) {
    if (this.socket?.connected) {
      console.log('[WebSocket] 离开房间:', clientId);
      this.socket.emit('leave_client', { client_id: clientId });
    }
    if (this.currentClientId === clientId) {
      this.currentClientId = null;
    }
    if (this.pendingJoin === clientId) {
      this.pendingJoin = null;
    }
  }

  // 监听事件
  on(event, callback) {
    if (!this.socket) {
      return;
    }

    this.socket.on(event, callback);

    // 保存监听器以便后续移除
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
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
  }

  // 移除某个事件的所有监听器
  removeAllListeners(event) {
    if (!this.socket) return;

    this.socket.removeAllListeners(event);
    this.listeners.delete(event);
  }

  // 检查连接状态
  isConnected() {
    return this.socket?.connected || false;
  }
}

// 单例模式
const wsService = new WebSocketService();
export default wsService;






