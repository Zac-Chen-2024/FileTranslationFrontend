# 实体识别 Modal 集成说明

**修改日期：** 2025-11-19
**修改目标：** 将实体识别结果展示从嵌入式 `EntityNotificationBar` 改为 Modal 层 `EntityResultModal`，实现强制步骤锁

---

## 📊 修改概述

### 修改前
- 使用 `EntityNotificationBar` 嵌入在预览区域内部显示实体识别结果
- 用户可以在查看实体结果的同时操作其他界面元素
- **不是强制步骤** - 用户可能跳过或忽略

### 修改后
- 使用 `EntityResultModal` 作为浮动 Modal 层显示实体识别结果
- 背景遮罩，用户无法操作其他界面元素
- **强制步骤锁** - 必须做出选择（跳过/编辑/AI优化）才能继续

---

## 🔧 技术修改

### 1. 导入 EntityResultModal

**文件：** `src/components/translation/PreviewSection.js`

```javascript
// 新增导入
import EntityResultModal from './EntityResultModal';
```

### 2. 添加状态管理

```javascript
// Entity Recognition states
const [showEntityModal, setShowEntityModal] = React.useState(false);
const [entityResults, setEntityResults] = React.useState([]);
const [entityResultModalMode, setEntityResultModalMode] = React.useState('fast_result'); // 新增
const [entityModalLoading, setEntityModalLoading] = React.useState(false); // 新增
```

**新增状态说明：**
- `entityResultModalMode`: Modal 模式
  - `'fast_result'` - 快速识别完成（显示识别到的实体列表）
  - `'edit'` - 编辑模式（用户手动输入英文翻译）
  - `'ai_result'` - AI优化完成（显示深度查询结果）
- `entityModalLoading`: AI优化加载状态

### 3. 实现回调函数

#### 3.1 `handleManualEdit` - 处理手动编辑/确认

```javascript
const handleManualEdit = useCallback(async (entities) => {
  // 智能判断：切换到编辑模式 OR 确认编辑后的实体
  const hasEnglishNames = entities && entities.length > 0 &&
    entities.some(e => e.english_name && e.english_name.trim() !== '');

  if (hasEnglishNames && entityResultModalMode !== 'fast_result') {
    // 确认编辑后的实体
    await materialAPI.confirmEntities(material.id, entities, translationGuidance);
    setEntityResults([]);
    setEntityResultModalMode('fast_result');
  } else {
    // 切换到编辑模式
    setEntityResultModalMode('edit');
    setEntityResults(entities);
  }
}, [entityResultModalMode, material, actions]);
```

#### 3.2 `handleAIOptimize` - AI优化（深度查询）

```javascript
const handleAIOptimize = useCallback(async () => {
  setEntityModalLoading(true);

  // 提取实体中文名称列表
  const entityNames = entityResults.map(e => e.chinese_name || e.entity);

  // 调用深度识别API（传入实体列表）
  const response = await materialAPI.entityRecognitionDeep(material.id, entityNames);

  if (response.success && response.result.entities) {
    setEntityResults(response.result.entities);
    setEntityResultModalMode('ai_result'); // 切换到AI结果模式
  }

  setEntityModalLoading(false);
}, [material, entityResults, actions]);
```

#### 3.3 `handleCancelEdit` - 取消编辑

```javascript
const handleCancelEdit = useCallback(() => {
  if (entityResultModalMode !== 'fast_result') {
    setEntityResultModalMode('fast_result'); // 返回到快速识别结果
  }
}, [entityResultModalMode]);
```

### 4. 替换组件使用

**修改前：**
```jsx
{material.processingStep === 'entity_pending_confirm' && entityResults.length > 0 && (
  <EntityNotificationBar    {/* 嵌入式 */}
    entities={entityResults}
    mode={material.entityRecognitionMode}
    onConfirm={handleConfirmEntities}
    onSkip={handleEntitySkip}
  />
)}
```

**修改后：**
```jsx
<EntityResultModal          {/* Modal层 */}
  isOpen={material.processingStep === 'entity_pending_confirm' && entityResults.length > 0}
  entities={entityResults}
  mode={entityResultModalMode}
  onClose={entityResultModalMode === 'fast_result' ? () => {} : handleCancelEdit}
  onManualEdit={handleManualEdit}
  onAIOptimize={handleAIOptimize}
  onSkip={handleEntitySkip}
  loading={entityModalLoading}
/>
```

### 5. 初始化Modal模式

```javascript
// 快速实体识别完成，显示结果让用户选择
if (step === 'entity_pending_confirm' && material.entityRecognitionResult) {
  // ... 解析结果
  if (result.entities && result.entities.length > 0) {
    setEntityResults(result.entities);
    setEntityResultModalMode('fast_result'); // 重置为快速识别结果模式
  }
}
```

---

## 🎯 用户工作流

### 标准模式（Fast/Identify）工作流

```
1. 用户选择"标准模式"实体识别
   ↓
2. 后端快速识别（~30秒）
   ↓
3. 【强制弹出 EntityResultModal - fast_result 模式】
   ┌─────────────────────────────────────┐
   │  快速识别完成                        │
   │                                     │
   │  识别到以下实体：                    │
   │  • 腾讯公司                         │
   │  • 阿里巴巴                         │
   │                                     │
   │  [跳过]  [人工编辑]  [AI优化]      │
   └─────────────────────────────────────┘
   ↓
   用户必须选择：

   A) 点击"跳过"
      → 关闭Modal
      → 禁用实体识别
      → 直接进入LLM翻译

   B) 点击"人工编辑"
      → 切换到 edit 模式
      ┌─────────────────────────────────────┐
      │  编辑实体翻译                        │
      │                                     │
      │  中文          英文翻译              │
      │  腾讯公司      [输入英文...]         │
      │  阿里巴巴      [输入英文...]         │
      │                                     │
      │  [取消]  [确认使用]                 │
      └─────────────────────────────────────┘
      → 用户输入英文翻译
      → 点击"确认使用"
      → 关闭Modal
      → 确认实体并触发LLM翻译

   C) 点击"AI优化"
      → 显示加载状态
      → 后端深度查询（1-2分钟）
      → 切换到 ai_result 模式
      ┌─────────────────────────────────────┐
      │  AI优化完成                         │
      │                                     │
      │  中文          英文翻译              │
      │  腾讯公司      Tencent Holdings...  │
      │  阿里巴巴      Alibaba Group...     │
      │                                     │
      │  [重新编辑]  [使用这些翻译]         │
      └─────────────────────────────────────┘
      → 点击"使用这些翻译"
      → 关闭Modal
      → 确认实体并触发LLM翻译
```

---

## 🔒 步骤锁实现

### 1. fast_result 模式
- **不允许关闭** - `onClose={() => {}}`
- 点击背景遮罩：无效果
- 点击右上角 × ：无效果
- **必须点击三个按钮之一才能继续**

### 2. edit 模式
- **允许取消** - `onClose={handleCancelEdit}`
- 点击"取消"按钮：返回 fast_result 模式
- 点击"确认使用"：确认实体并关闭Modal

### 3. ai_result 模式
- **允许取消** - `onClose={handleCancelEdit}`
- 点击"重新编辑"：切换到 edit 模式
- 点击"使用这些翻译"：确认实体并关闭Modal

---

## 📋 Modal 模式对比

| 模式 | 显示内容 | 按钮 | 关闭行为 |
|------|---------|------|---------|
| **fast_result** | 识别到的实体列表 | 跳过/人工编辑/AI优化 | 🔒 不允许关闭 |
| **edit** | 可编辑的实体表格 | 取消/确认使用 | ↩️ 返回 fast_result |
| **ai_result** | AI优化后的结果 | 重新编辑/使用这些翻译 | ↩️ 返回 fast_result |

---

## 🎨 UI/UX 改进

### 改进前（EntityNotificationBar）
- ❌ 嵌入在预览区域内
- ❌ 用户可能忽略
- ❌ 不阻止其他操作
- ❌ 不够醒目

### 改进后（EntityResultModal）
- ✅ 独立的 Modal 层
- ✅ 背景遮罩，强制关注
- ✅ 阻止其他操作（步骤锁）
- ✅ 更醒目，用户体验更清晰

---

## 🔗 API 调用流程

### Fast 模式（标准模式）

```
前端触发快速识别
  ↓
POST /api/materials/{id}/entity-recognition/fast
  ↓
后端调用 Entity API (identify 模式)
  ↓
返回实体名称列表（不含英文名）
  ↓
前端显示 EntityResultModal (fast_result 模式)
  ↓
用户选择"AI优化"
  ↓
POST /api/materials/{id}/entity-recognition/deep
Body: { entities: ["腾讯公司", "阿里巴巴"] }
  ↓
后端调用 Entity API (analyze 模式 + 两阶段查询)
  ↓
返回完整实体信息（含英文名、来源、置信度）
  ↓
前端显示 EntityResultModal (ai_result 模式)
  ↓
用户确认
  ↓
POST /api/materials/{id}/confirm-entities
Body: { entities: [...], translationGuidance: {...} }
  ↓
后端自动触发 LLM 翻译
```

---

## 🧪 测试场景

### 测试 1：快速识别 → 跳过
1. 上传包含公司名的PDF
2. 选择"标准模式"实体识别
3. 等待识别完成（~30秒）
4. **验证：** Modal 自动弹出，显示识别到的实体
5. **验证：** 点击背景遮罩无法关闭
6. **验证：** 点击 × 按钮无法关闭
7. 点击"跳过"
8. **验证：** Modal 关闭，直接进入LLM翻译

### 测试 2：快速识别 → 人工编辑
1. Modal 弹出后，点击"人工编辑"
2. **验证：** 切换到编辑模式，显示输入框
3. 输入英文翻译
4. 点击"取消"
5. **验证：** 返回到 fast_result 模式
6. 再次点击"人工编辑"
7. 输入英文翻译
8. 点击"确认使用"
9. **验证：** Modal 关闭，触发LLM翻译

### 测试 3：快速识别 → AI优化
1. Modal 弹出后，点击"AI优化"
2. **验证：** 显示加载状态（"AI优化中..."）
3. 等待深度查询完成（~1-2分钟）
4. **验证：** 切换到 ai_result 模式，显示完整信息
5. **验证：** 英文名称已自动填充
6. 点击"重新编辑"
7. **验证：** 切换到 edit 模式，可以修改
8. 修改后点击"确认使用"
9. **验证：** Modal 关闭，触发LLM翻译

### 测试 4：步骤锁验证
1. Modal 弹出（fast_result 模式）
2. 尝试点击背景遮罩
3. **验证：** 无法关闭
4. 尝试点击右上角 ×
5. **验证：** 无法关闭
6. 尝试切换到其他材料
7. **验证：** 无法切换（Modal 阻挡）
8. **验证：** 必须做出选择才能继续

---

## 📁 修改的文件

- ✅ `/home/translation/frontend/src/components/translation/PreviewSection.js` - 主要修改
  - 导入 EntityResultModal
  - 添加状态管理
  - 实现回调函数
  - 替换组件使用

---

## 🔄 回滚方案

如需回滚到 EntityNotificationBar，只需：

1. 移除 EntityResultModal 导入
2. 删除新增的状态（entityResultModalMode, entityModalLoading）
3. 删除新增的回调函数（handleManualEdit, handleAIOptimize, handleCancelEdit）
4. 恢复 EntityNotificationBar 的使用

```jsx
{material.processingStep === 'entity_pending_confirm' && entityResults.length > 0 && (
  <EntityNotificationBar
    entities={entityResults}
    mode={material.entityRecognitionMode}
    onConfirm={handleConfirmEntities}
    onSkip={handleEntitySkip}
  />
)}
```

---

## ✅ 完成状态

- ✅ EntityResultModal 导入
- ✅ 状态管理添加
- ✅ 回调函数实现
- ✅ 组件替换完成
- ✅ 步骤锁实现
- ✅ 取消逻辑处理
- ✅ 模式切换逻辑
- ⏳ 待测试验证

---

## 📝 注意事项

1. **EntityNotificationBar 仍然保留**
   - 代码中仍然导入了 EntityNotificationBar
   - 如果确认不再使用，可以移除导入

2. **后端 API 兼容性**
   - 确保 `materialAPI.entityRecognitionDeep` 支持传入实体列表
   - 确保 `materialAPI.confirmEntities` 接口正确

3. **深度查询超时**
   - AI优化可能需要 1-2 分钟
   - 已添加 loading 状态显示
   - 用户需要等待

4. **模式状态管理**
   - 确保每次显示 Modal 时模式重置为 'fast_result'
   - 已在接收后端结果时重置

---

## 🎯 下一步

1. **前端测试**
   - 在开发环境测试完整工作流
   - 验证步骤锁是否有效
   - 测试三种操作路径

2. **后端验证**
   - 确认深度查询API支持实体列表参数
   - 验证确认实体API工作正常

3. **用户验收**
   - 确认 Modal 的 UI/UX 符合预期
   - 收集用户反馈

---

**修改完成时间：** 2025-11-19
**修改状态：** ✅ 代码修改完成，待测试验证
