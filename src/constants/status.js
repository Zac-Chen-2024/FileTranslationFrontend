/**
 * 翻译平台状态机定义
 *
 * 完整的状态转换系统，支持：
 * - 分支转换（基于条件选择不同路径）
 * - 跳过转换（某些步骤可选）
 * - 回退转换（重新翻译、旋转等）
 * - 重置转换（清空中间状态）
 *
 * 与后端 state_machine.py 保持同步
 */

// ============================================================
// 处理步骤枚举
// ============================================================

export const ProcessingStep = {
  // === 上传阶段 ===
  UPLOADED: 'uploaded',              // 已上传，等待处理
  SPLITTING: 'splitting',            // PDF拆分中
  SPLIT_COMPLETED: 'split_completed', // PDF拆分完成

  // === OCR翻译阶段 ===
  TRANSLATING: 'translating',        // 翻译中（百度API）
  TRANSLATED: 'translated',          // 翻译完成

  // === 实体识别阶段（可选流程）===
  ENTITY_RECOGNIZING: 'entity_recognizing',        // 实体识别中
  ENTITY_PENDING_CONFIRM: 'entity_pending_confirm', // 等待用户确认实体（卡关点）
  ENTITY_CONFIRMED: 'entity_confirmed',            // 实体已确认

  // === LLM优化阶段（可选流程）===
  LLM_TRANSLATING: 'llm_translating',  // LLM优化中
  LLM_TRANSLATED: 'llm_translated',    // LLM优化完成

  // === 最终状态 ===
  CONFIRMED: 'confirmed',            // 用户已确认完成
  FAILED: 'failed',                  // 处理失败
};

// ============================================================
// 状态显示映射
// ============================================================

export const STATUS_DISPLAY = {
  [ProcessingStep.UPLOADED]: '已上传',
  [ProcessingStep.SPLITTING]: '拆分中',
  [ProcessingStep.SPLIT_COMPLETED]: '拆分完成',
  [ProcessingStep.TRANSLATING]: '翻译中',
  [ProcessingStep.TRANSLATED]: '翻译完成',
  [ProcessingStep.ENTITY_RECOGNIZING]: '实体识别中',
  [ProcessingStep.ENTITY_PENDING_CONFIRM]: '待确认实体',
  [ProcessingStep.ENTITY_CONFIRMED]: '实体已确认',
  [ProcessingStep.LLM_TRANSLATING]: 'AI优化中',
  [ProcessingStep.LLM_TRANSLATED]: 'AI优化完成',
  [ProcessingStep.CONFIRMED]: '已确认',
  [ProcessingStep.FAILED]: '处理失败',
  // 兼容旧状态值
  '待处理': '待处理',
  '已上传': '已上传',
  '拆分中': '拆分中',
  '翻译中': '翻译中',
  '翻译完成': '翻译完成',
  '翻译失败': '处理失败',
  '已确认': '已确认',
  '已添加': '已上传',
  '正在翻译': '翻译中',
  '处理中': '处理中',
  '已翻译': '翻译完成',
};

// ============================================================
// 旧状态值映射（向后兼容）
// ============================================================

export const LEGACY_STATUS_MAP = {
  '待处理': ProcessingStep.UPLOADED,
  '已上传': ProcessingStep.UPLOADED,
  '已添加': ProcessingStep.UPLOADED,
  '拆分中': ProcessingStep.SPLITTING,
  '翻译中': ProcessingStep.TRANSLATING,
  '正在翻译': ProcessingStep.TRANSLATING,
  '处理中': ProcessingStep.TRANSLATING,
  '翻译完成': ProcessingStep.TRANSLATED,
  '已翻译': ProcessingStep.TRANSLATED,
  '翻译失败': ProcessingStep.FAILED,
  '已确认': ProcessingStep.CONFIRMED,
  'AI优化中': ProcessingStep.LLM_TRANSLATING,
  'AI优化完成': ProcessingStep.LLM_TRANSLATED,
};

// ============================================================
// 状态颜色配置
// ============================================================

export const STATUS_COLORS = {
  [ProcessingStep.UPLOADED]: { bg: '#e3f2fd', text: '#1976d2', label: 'info' },
  [ProcessingStep.SPLITTING]: { bg: '#fff3e0', text: '#f57c00', label: 'warning' },
  [ProcessingStep.SPLIT_COMPLETED]: { bg: '#e8f5e9', text: '#388e3c', label: 'success' },
  [ProcessingStep.TRANSLATING]: { bg: '#fff3e0', text: '#f57c00', label: 'warning' },
  [ProcessingStep.TRANSLATED]: { bg: '#e8f5e9', text: '#388e3c', label: 'success' },
  [ProcessingStep.ENTITY_RECOGNIZING]: { bg: '#f3e5f5', text: '#7b1fa2', label: 'processing' },
  [ProcessingStep.ENTITY_PENDING_CONFIRM]: { bg: '#fff8e1', text: '#ff8f00', label: 'pending' },
  [ProcessingStep.ENTITY_CONFIRMED]: { bg: '#e8f5e9', text: '#388e3c', label: 'success' },
  [ProcessingStep.LLM_TRANSLATING]: { bg: '#e8eaf6', text: '#3f51b5', label: 'processing' },
  [ProcessingStep.LLM_TRANSLATED]: { bg: '#e8f5e9', text: '#388e3c', label: 'success' },
  [ProcessingStep.CONFIRMED]: { bg: '#e8f5e9', text: '#2e7d32', label: 'confirmed' },
  [ProcessingStep.FAILED]: { bg: '#ffebee', text: '#c62828', label: 'error' },
};

// ============================================================
// 状态分类
// ============================================================

// 处理中状态（显示loading）
export const PROCESSING_STATES = new Set([
  ProcessingStep.SPLITTING,
  ProcessingStep.TRANSLATING,
  ProcessingStep.ENTITY_RECOGNIZING,
  ProcessingStep.LLM_TRANSLATING,
]);

// 等待用户操作状态（卡关点）
export const PENDING_ACTION_STATES = new Set([
  ProcessingStep.UPLOADED,
  ProcessingStep.SPLIT_COMPLETED,
  ProcessingStep.ENTITY_PENDING_CONFIRM,  // 关键卡关点
]);

// 完成状态（可确认）
export const COMPLETED_STATES = new Set([
  ProcessingStep.TRANSLATED,
  ProcessingStep.ENTITY_CONFIRMED,
  ProcessingStep.LLM_TRANSLATED,
  ProcessingStep.CONFIRMED,
]);

// 可跳过的状态
export const SKIPPABLE_STATES = new Set([
  ProcessingStep.ENTITY_RECOGNIZING,
  ProcessingStep.ENTITY_PENDING_CONFIRM,
  ProcessingStep.ENTITY_CONFIRMED,
  ProcessingStep.LLM_TRANSLATING,
  ProcessingStep.LLM_TRANSLATED,
]);

// 可确认的状态（可以点击确认按钮）
export const CONFIRMABLE_STATES = new Set([
  ProcessingStep.TRANSLATED,
  ProcessingStep.LLM_TRANSLATED,
]);

// ============================================================
// 状态转换定义
// ============================================================

export const STATE_TRANSITIONS = {
  // 上传阶段
  upload_image: {
    from: [null],
    to: ProcessingStep.UPLOADED,
    type: 'normal',
  },
  upload_pdf: {
    from: [null],
    to: ProcessingStep.SPLITTING,
    type: 'normal',
  },
  split_complete: {
    from: [ProcessingStep.SPLITTING],
    to: ProcessingStep.SPLIT_COMPLETED,
    type: 'auto',
  },

  // 翻译阶段
  start_translate: {
    from: [ProcessingStep.UPLOADED, ProcessingStep.SPLIT_COMPLETED],
    to: ProcessingStep.TRANSLATING,
    type: 'normal',
  },
  translate_success: {
    from: [ProcessingStep.TRANSLATING],
    to: ProcessingStep.TRANSLATED,
    type: 'auto',
  },
  translate_fail: {
    from: [ProcessingStep.TRANSLATING],
    to: ProcessingStep.FAILED,
    type: 'auto',
  },

  // 实体识别阶段
  start_entity_recognition: {
    from: [ProcessingStep.TRANSLATED],
    to: ProcessingStep.ENTITY_RECOGNIZING,
    type: 'normal',
  },
  entity_recognition_success: {
    from: [ProcessingStep.ENTITY_RECOGNIZING],
    to: ProcessingStep.ENTITY_PENDING_CONFIRM,
    type: 'auto',
  },
  entity_recognition_skip: {
    from: [ProcessingStep.ENTITY_RECOGNIZING],
    to: ProcessingStep.TRANSLATED,
    type: 'skip',
  },
  confirm_entities: {
    from: [ProcessingStep.ENTITY_PENDING_CONFIRM],
    to: ProcessingStep.ENTITY_CONFIRMED,
    type: 'normal',
    autoNext: ProcessingStep.LLM_TRANSLATING,
  },

  // LLM优化阶段
  start_llm_from_entity: {
    from: [ProcessingStep.ENTITY_CONFIRMED],
    to: ProcessingStep.LLM_TRANSLATING,
    type: 'auto',
  },
  start_llm_manual: {
    from: [ProcessingStep.TRANSLATED],
    to: ProcessingStep.LLM_TRANSLATING,
    type: 'normal',
  },
  llm_success: {
    from: [ProcessingStep.LLM_TRANSLATING],
    to: ProcessingStep.LLM_TRANSLATED,
    type: 'auto',
  },

  // 确认阶段
  confirm_from_translated: {
    from: [ProcessingStep.TRANSLATED],
    to: ProcessingStep.CONFIRMED,
    type: 'normal',
  },
  confirm_from_llm: {
    from: [ProcessingStep.LLM_TRANSLATED],
    to: ProcessingStep.CONFIRMED,
    type: 'normal',
  },
  unconfirm: {
    from: [ProcessingStep.CONFIRMED],
    to: [ProcessingStep.TRANSLATED, ProcessingStep.LLM_TRANSLATED],
    type: 'rollback',
  },

  // 重置/重试
  retranslate: {
    from: [
      ProcessingStep.TRANSLATED,
      ProcessingStep.ENTITY_PENDING_CONFIRM,
      ProcessingStep.ENTITY_CONFIRMED,
      ProcessingStep.LLM_TRANSLATED,
      ProcessingStep.CONFIRMED,
      ProcessingStep.FAILED,
    ],
    to: ProcessingStep.TRANSLATING,
    type: 'retry',
    clearsData: true,
  },
  rotate_reset: {
    from: [
      ProcessingStep.UPLOADED,
      ProcessingStep.SPLIT_COMPLETED,
      ProcessingStep.TRANSLATED,
      ProcessingStep.ENTITY_RECOGNIZING,
      ProcessingStep.ENTITY_PENDING_CONFIRM,
      ProcessingStep.ENTITY_CONFIRMED,
      ProcessingStep.LLM_TRANSLATING,
      ProcessingStep.LLM_TRANSLATED,
      ProcessingStep.CONFIRMED,
      ProcessingStep.FAILED,
    ],
    to: ProcessingStep.UPLOADED,
    type: 'reset',
    clearsData: true,
  },
};

// ============================================================
// 流程路径定义
// ============================================================

export const WORKFLOW_PATHS = {
  simple: {
    name: '简单流程',
    description: '上传 → 翻译 → 确认',
    steps: [
      ProcessingStep.UPLOADED,
      ProcessingStep.TRANSLATING,
      ProcessingStep.TRANSLATED,
      ProcessingStep.CONFIRMED,
    ],
  },
  with_llm: {
    name: 'AI优化流程',
    description: '上传 → 翻译 → AI优化 → 确认',
    steps: [
      ProcessingStep.UPLOADED,
      ProcessingStep.TRANSLATING,
      ProcessingStep.TRANSLATED,
      ProcessingStep.LLM_TRANSLATING,
      ProcessingStep.LLM_TRANSLATED,
      ProcessingStep.CONFIRMED,
    ],
  },
  with_entity: {
    name: '实体识别流程',
    description: '上传 → 翻译 → 实体识别 → 确认实体 → AI优化 → 确认',
    steps: [
      ProcessingStep.UPLOADED,
      ProcessingStep.TRANSLATING,
      ProcessingStep.TRANSLATED,
      ProcessingStep.ENTITY_RECOGNIZING,
      ProcessingStep.ENTITY_PENDING_CONFIRM,
      ProcessingStep.ENTITY_CONFIRMED,
      ProcessingStep.LLM_TRANSLATING,
      ProcessingStep.LLM_TRANSLATED,
      ProcessingStep.CONFIRMED,
    ],
  },
  pdf: {
    name: 'PDF流程',
    description: '上传PDF → 拆分 → 翻译 → 确认',
    steps: [
      ProcessingStep.SPLITTING,
      ProcessingStep.SPLIT_COMPLETED,
      ProcessingStep.TRANSLATING,
      ProcessingStep.TRANSLATED,
      ProcessingStep.CONFIRMED,
    ],
  },
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 标准化状态值（将旧状态映射到新枚举）
 * @param {string} status - 状态值
 * @returns {string} 标准化后的状态值
 */
export function normalizeStatus(status) {
  if (!status) return null;

  // 已经是标准枚举值
  if (Object.values(ProcessingStep).includes(status)) {
    return status;
  }

  // 尝试从旧状态映射
  if (LEGACY_STATUS_MAP[status]) {
    return LEGACY_STATUS_MAP[status];
  }

  return status;
}

/**
 * 获取状态的中文显示文本
 * @param {string} step - 处理步骤
 * @returns {string} 中文显示文本
 */
export function getStatusDisplay(step) {
  const normalized = normalizeStatus(step);
  return STATUS_DISPLAY[normalized] || step || '未知';
}

/**
 * 获取状态的颜色配置
 * @param {string} step - 处理步骤
 * @returns {object} 颜色配置 { bg, text, label }
 */
export function getStatusColor(step) {
  const normalized = normalizeStatus(step);
  return STATUS_COLORS[normalized] || { bg: '#f5f5f5', text: '#757575', label: 'default' };
}

/**
 * 判断是否为处理中状态
 * @param {string} step - 处理步骤
 * @returns {boolean}
 */
export function isProcessing(step) {
  const normalized = normalizeStatus(step);
  return PROCESSING_STATES.has(normalized);
}

/**
 * 判断是否为等待用户操作状态
 * @param {string} step - 处理步骤
 * @returns {boolean}
 */
export function isPendingAction(step) {
  const normalized = normalizeStatus(step);
  return PENDING_ACTION_STATES.has(normalized);
}

/**
 * 判断是否为完成状态
 * @param {string} step - 处理步骤
 * @returns {boolean}
 */
export function isCompleted(step) {
  const normalized = normalizeStatus(step);
  return COMPLETED_STATES.has(normalized);
}

/**
 * 判断是否为失败状态
 * @param {string} step - 处理步骤
 * @returns {boolean}
 */
export function isFailed(step) {
  const normalized = normalizeStatus(step);
  return normalized === ProcessingStep.FAILED;
}

/**
 * 判断是否为可跳过状态
 * @param {string} step - 处理步骤
 * @returns {boolean}
 */
export function isSkippable(step) {
  const normalized = normalizeStatus(step);
  return SKIPPABLE_STATES.has(normalized);
}

/**
 * 判断是否可以确认
 * @param {string} step - 处理步骤
 * @returns {boolean}
 */
export function isConfirmable(step) {
  const normalized = normalizeStatus(step);
  return CONFIRMABLE_STATES.has(normalized);
}

/**
 * 检查状态是否匹配（支持新旧状态值）
 * @param {string} status - 当前状态
 * @param {string|string[]} target - 目标状态或状态数组
 * @returns {boolean}
 */
export function statusMatches(status, target) {
  const normalized = normalizeStatus(status);
  if (Array.isArray(target)) {
    return target.some(t => normalizeStatus(t) === normalized);
  }
  return normalizeStatus(target) === normalized;
}

/**
 * 检查是否可以从当前状态转换到目标状态
 * @param {string} currentStatus - 当前状态
 * @param {string} targetStatus - 目标状态
 * @returns {boolean}
 */
export function canTransition(currentStatus, targetStatus) {
  const normalizedCurrent = normalizeStatus(currentStatus);
  const normalizedTarget = normalizeStatus(targetStatus);

  for (const transition of Object.values(STATE_TRANSITIONS)) {
    if (transition.to === normalizedTarget || (Array.isArray(transition.to) && transition.to.includes(normalizedTarget))) {
      if (transition.from.includes(normalizedCurrent) || (normalizedCurrent === null && transition.from.includes(null))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 获取当前状态可用的转换
 * @param {string} currentStatus - 当前状态
 * @returns {Array} 可用转换列表
 */
export function getAvailableTransitions(currentStatus) {
  const normalizedCurrent = normalizeStatus(currentStatus);
  const available = [];

  for (const [name, transition] of Object.entries(STATE_TRANSITIONS)) {
    if (transition.from.includes(normalizedCurrent)) {
      available.push({
        name,
        to: transition.to,
        toDisplay: Array.isArray(transition.to)
          ? transition.to.map(t => getStatusDisplay(t)).join(' / ')
          : getStatusDisplay(transition.to),
        type: transition.type,
      });
    }
  }

  return available;
}

export default ProcessingStep;
