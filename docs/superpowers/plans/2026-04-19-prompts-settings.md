# 提示词设置功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页面中添加"提示词"标签页，集中管理上传图片节点、编剧大师节点、智能分镜节点的提示词模板，支持默认值设置和节点级覆盖。

**Architecture:** 采用"预览展开式编辑器"方案 - 默认显示摘要，点击展开编辑。设置中存储全局默认值，节点支持覆盖。

**Tech Stack:** React + TypeScript + Zustand

---

## 文件变更概览

| 文件 | 变更 |
|------|------|
| `src/features/settings/settingsEvents.ts` | 添加 `prompts` 到 SettingsCategory |
| `src/stores/settingsStore.ts` | 添加提示词配置项（5个字段） |
| `src/components/SettingsDialog.tsx` | 添加提示词标签页 UI |
| `src/features/canvas/nodes/UploadNode.tsx` | 支持节点级提示词覆盖 |
| `src/features/canvas/nodes/ScriptMasterNode.tsx` | 支持节点级提示词覆盖 |
| `src/features/canvas/nodes/SmartStoryboardNode.tsx` | 支持节点级提示词覆盖 |
| `src/i18n/locales/zh.json` | 添加国际化文案 |
| `src/i18n/locales/en.json` | 添加国际化文案 |

---

## 默认提示词模板

### 1. 上传图片 - 图像分析
```
请分析这张图片，描述其内容和主要元素。
```

### 2. 编剧大师 - 图片分析
```
请仔细分析这张图片，描述：
1. 图片中的产品和场景
2. 整体风格和色调
3. 光线氛围
4. 构图特点
5. 目标受众和用途

请用简洁专业的语言描述。
```

### 3. 编剧大师 - 脚本生成
```
# Role: 资深商业短视频广告编剧

## Profile
- language: 中文
- description: 拥有10年经验的商业广告编剧，擅长将静态视觉资产转化为兼具高端美学与商业逻辑的短视频叙事。
...

（完整模板约 100 行）
```

### 4. 智能分镜 - 文字转分镜
```
# Role: 故事线拆解型批量分镜提示词专家
...

（完整模板约 100 行）
```

### 5. 智能分镜 - 图片分析
```
# Role: 故事线拆解型批量分镜提示词专家
...

（完整模板约 100 行）
```

---

## 实现任务

### Task 1: 在 settingsEvents.ts 添加 prompts 类型

**Files:**
- Modify: `src/features/settings/settingsEvents.ts:1-7`

- [ ] **Step 1: 修改 SettingsCategory 类型**

```typescript
export type SettingsCategory =
  | 'providers'
  | 'pricing'
  | 'appearance'
  | 'general'
  | 'experimental'
  | 'prompts'  // 新增
  | 'about';
```

- [ ] **Step 2: 提交**

```bash
git add src/features/settings/settingsEvents.ts
git commit -m "feat: add prompts to SettingsCategory"
```

---

### Task 2: 在 settingsStore.ts 添加提示词配置

**Files:**
- Modify: `src/stores/settingsStore.ts:38-45`
- Modify: `src/stores/settingsStore.ts:185-195`
- Modify: `src/stores/settingsStore.ts:235-245`

- [ ] **Step 1: 添加 Zustand store 字段**

在 `settingsStore.ts` 的 interface 中添加：
```typescript
// 提示词配置
scriptMasterImageAnalysisPrompt: string;
scriptMasterScriptPrompt: string;
smartStoryboardTextPrompt: string;
smartStoryboardImagePrompt: string;
```

- [ ] **Step 2: 添加默认值**

在 `create<SettingsState>` 中添加：
```typescript
scriptMasterImageAnalysisPrompt: `请仔细分析这张图片，描述：
1. 图片中的产品和场景
2. 整体风格和色调
3. 光线氛围
4. 构图特点
5. 目标受众和用途

请用简洁专业的语言描述。`,
scriptMasterScriptPrompt: `# Role: 资深商业短视频广告编剧

## Profile
- language: 中文
- description: 拥有10年经验的商业广告编剧...

// ... 完整模板
`,
smartStoryboardTextPrompt: `# Role: 故事线拆解型批量分镜提示词专家
// ... 完整模板
`,
smartStoryboardImagePrompt: `# Role: 故事线拆解型批量分镜提示词专家
// ... 完整模板
`,
```

- [ ] **Step 3: 添加 setter 函数**

```typescript
setScriptMasterImageAnalysisPrompt: (prompt: string) => set({ scriptMasterImageAnalysisPrompt: prompt.trim() }),
setScriptMasterScriptPrompt: (prompt: string) => set({ scriptMasterScriptPrompt: prompt.trim() }),
setSmartStoryboardTextPrompt: (prompt: string) => set({ smartStoryboardTextPrompt: prompt.trim() }),
setSmartStoryboardImagePrompt: (prompt: string) => set({ smartStoryboardImagePrompt: prompt.trim() }),
```

- [ ] **Step 4: 提交**

```bash
git add src/stores/settingsStore.ts
git commit -m "feat: add prompt settings to store"
```

---

### Task 3: 在 SettingsDialog 添加提示词标签页 UI

**Files:**
- Modify: `src/components/SettingsDialog.tsx`
- Create: `src/components/PromptEditor.tsx` (新组件)

- [ ] **Step 1: 创建 PromptEditor 组件**

创建文件 `src/components/PromptEditor.tsx`：

```typescript
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface PromptEditorProps {
  title: string;
  description?: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  onReset: () => void;
}

export function PromptEditor({ title, description, value, defaultValue, onChange, onReset }: PromptEditorProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const preview = value.split('\n').slice(0, 3).join('\n');
  const isDefault = value === defaultValue;

  return (
    <div className="rounded-lg border border-border-dark bg-bg-dark p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-dark">{title}</h3>
          {description && <p className="mt-1 text-xs text-text-muted">{description}</p>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-accent hover:underline"
          >
            {expanded ? t('common.collapse') : t('common.expand')}
          </button>
          {!isDefault && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-text-muted hover:text-text-dark"
            >
              {t('common.resetToDefault')}
            </button>
          )}
        </div>
      </div>

      {!expanded ? (
        <div
          className="cursor-pointer rounded border border-border-dark bg-surface-dark px-3 py-2 text-xs text-text-muted font-mono"
          onClick={() => setExpanded(true)}
        >
          {preview}
          {value.split('\n').length > 3 && '...'}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-border-dark bg-surface-dark px-3 py-2 text-sm text-text-dark font-mono outline-none"
          rows={15}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 导入 PromptEditor 和新的 store 字段**

在 `SettingsDialog.tsx` 中添加：
```typescript
import { PromptEditor } from '@/components/PromptEditor';
import {
  // ... 现有字段
  scriptMasterImageAnalysisPrompt,
  scriptMasterScriptPrompt,
  smartStoryboardTextPrompt,
  smartStoryboardImagePrompt,
  setScriptMasterImageAnalysisPrompt,
  setScriptMasterScriptPrompt,
  setSmartStoryboardTextPrompt,
  setSmartStoryboardImagePrompt,
} from '@/stores/settingsStore';
```

- [ ] **Step 3: 添加本地状态**

```typescript
const [localScriptMasterImageAnalysisPrompt, setLocalScriptMasterImageAnalysisPrompt] = useState(scriptMasterImageAnalysisPrompt);
const [localScriptMasterScriptPrompt, setLocalScriptMasterScriptPrompt] = useState(scriptMasterScriptPrompt);
const [localSmartStoryboardTextPrompt, setLocalSmartStoryboardTextPrompt] = useState(smartStoryboardTextPrompt);
const [localSmartStoryboardImagePrompt, setLocalSmartStoryboardImagePrompt] = useState(smartStoryboardImagePrompt);
```

- [ ] **Step 4: 添加 prompts 分类 UI**

在 `renderCategoryContent` 函数中添加 `'prompts'` case：

```typescript
case 'prompts':
  return (
    <div className="space-y-4">
      <PromptEditor
        title={t('settings.prompts.uploadImageAnalysis')}
        description={t('settings.prompts.uploadImageAnalysisDesc')}
        value={localImageAnalysisPrompt}
        defaultValue={DEFAULT_IMAGE_ANALYSIS_PROMPT}
        onChange={setLocalImageAnalysisPrompt}
        onReset={() => setLocalImageAnalysisPrompt(DEFAULT_IMAGE_ANALYSIS_PROMPT)}
      />

      <PromptEditor
        title={t('settings.prompts.scriptMasterImageAnalysis')}
        value={localScriptMasterImageAnalysisPrompt}
        defaultValue={DEFAULT_SCRIPT_MASTER_IMAGE_ANALYSIS_PROMPT}
        onChange={setLocalScriptMasterImageAnalysisPrompt}
        onReset={() => setLocalScriptMasterImageAnalysisPrompt(DEFAULT_SCRIPT_MASTER_IMAGE_ANALYSIS_PROMPT)}
      />

      <PromptEditor
        title={t('settings.prompts.scriptMasterScript')}
        value={localScriptMasterScriptPrompt}
        defaultValue={DEFAULT_SCRIPT_MASTER_SCRIPT_PROMPT}
        onChange={setLocalScriptMasterScriptPrompt}
        onReset={() => setLocalScriptMasterScriptPrompt(DEFAULT_SCRIPT_MASTER_SCRIPT_PROMPT)}
      />

      <PromptEditor
        title={t('settings.prompts.smartStoryboardText')}
        value={localSmartStoryboardTextPrompt}
        defaultValue={DEFAULT_SMART_STORYBOARD_TEXT_PROMPT}
        onChange={setLocalSmartStoryboardTextPrompt}
        onReset={() => setLocalSmartStoryboardTextPrompt(DEFAULT_SMART_STORYBOARD_TEXT_PROMPT)}
      />

      <PromptEditor
        title={t('settings.prompts.smartStoryboardImage')}
        value={localSmartStoryboardImagePrompt}
        defaultValue={DEFAULT_SMART_STORYBOARD_IMAGE_PROMPT}
        onChange={setLocalSmartStoryboardImagePrompt}
        onReset={() => setLocalSmartStoryboardImagePrompt(DEFAULT_SMART_STORYBOARD_IMAGE_PROMPT)}
      />
    </div>
  );
```

- [ ] **Step 5: 在 handleSave 中保存提示词**

```typescript
setScriptMasterImageAnalysisPrompt(localScriptMasterImageAnalysisPrompt);
setScriptMasterScriptPrompt(localScriptMasterScriptPrompt);
setSmartStoryboardTextPrompt(localSmartStoryboardTextPrompt);
setSmartStoryboardImagePrompt(localSmartStoryboardImagePrompt);
```

- [ ] **Step 6: 提交**

```bash
git add src/components/SettingsDialog.tsx src/components/PromptEditor.tsx
git commit -m "feat: add prompts tab to settings dialog"
```

---

### Task 4: 修改 UploadNode 支持提示词覆盖

**Files:**
- Modify: `src/features/canvas/nodes/UploadNode.tsx`

- [ ] **Step 1: 导入新的 store 字段**

```typescript
import {
  // ... 现有
  scriptMasterImageAnalysisPrompt, // 复用这个作为默认值
} from '@/stores/settingsStore';
```

- [ ] **Step 2: 修改 handleAnalyzeImage 使用提示词**

```typescript
const analysisPrompt = data.promptOverride || imageAnalysisPrompt;
```

- [ ] **Step 3: 添加节点级提示词覆盖 UI（可选）**

在节点底部添加提示词编辑入口（可选功能，暂时跳过）

- [ ] **Step 4: 提交**

```bash
git add src/features/canvas/nodes/UploadNode.tsx
git commit -m "feat: support prompt override in UploadNode"
```

---

### Task 5: 修改 ScriptMasterNode 支持提示词覆盖

**Files:**
- Modify: `src/features/canvas/nodes/ScriptMasterNode.tsx`

- [ ] **Step 1: 导入 store**

```typescript
import {
  scriptMasterImageAnalysisPrompt,
  scriptMasterScriptPrompt,
} from '@/stores/settingsStore';
```

- [ ] **Step 2: 修改图片分析提示词**

在 `handleGenerate` 中：
```typescript
const analysisPrompt = data.promptOverride?.imageAnalysis || scriptMasterImageAnalysisPrompt;
```

- [ ] **Step 3: 修改脚本生成提示词**

```typescript
const scriptPrompt = data.promptOverride?.script || scriptMasterScriptPrompt;
```

- [ ] **Step 4: 提交**

```bash
git add src/features/canvas/nodes/ScriptMasterNode.tsx
git commit -m "feat: support prompt override in ScriptMasterNode"
```

---

### Task 6: 修改 SmartStoryboardNode 支持提示词覆盖

**Files:**
- Modify: `src/features/canvas/nodes/SmartStoryboardNode.tsx`

- [ ] **Step 1: 导入 store**

```typescript
import {
  smartStoryboardTextPrompt,
  smartStoryboardImagePrompt,
} from '@/stores/settingsStore';
```

- [ ] **Step 2: 修改文字转分镜提示词**

在 `generateFromText` 函数中：
```typescript
const scriptPrompt = data.promptOverride?.text || smartStoryboardTextPrompt;
```

- [ ] **Step 3: 修改图片分析提示词**

在 `generateFromImages` 函数中：
```typescript
const imagePrompt = data.promptOverride?.image || smartStoryboardImagePrompt;
```

- [ ] **Step 4: 提交**

```bash
git add src/features/canvas/nodes/SmartStoryboardNode.tsx
git commit -m "feat: support prompt override in SmartStoryboardNode"
```

---

### Task 7: 添加国际化文案

**Files:**
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`

- [ ] **Step 1: 添加中文文案**

```json
{
  "settings": {
    "prompts": {
      "title": "提示词设置",
      "uploadImageAnalysis": "上传图片 - 图像分析",
      "uploadImageAnalysisDesc": "上传图片节点用于分析图片内容的提示词",
      "scriptMasterImageAnalysis": "编剧大师 - 图片分析",
      "scriptMasterScript": "编剧大师 - 脚本生成",
      "smartStoryboardText": "智能分镜 - 文字转分镜",
      "smartStoryboardImage": "智能分镜 - 图片分析"
    }
  },
  "common": {
    "expand": "展开编辑",
    "collapse": "收起",
    "resetToDefault": "重置为默认"
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/i18n/locales/zh.json src/i18n/locales/en.json
git commit -f "feat: add i18n for prompts settings"
```

---

### Task 8: 完整测试

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: 构建测试**

```bash
npm run build
```

- [ ] **Step 3: 提交所有更改**

```bash
git add .
git commit -m "feat: add prompts settings page with override support"
```

---

## 验证标准

1. ✅ 设置页面显示"提示词"标签页
2. ✅ 五个提示词模板可编辑
3. ✅ 可重置为默认值
4. ✅ 上传图片节点使用提示词设置
5. ✅ 编剧大师节点使用提示词设置
6. ✅ 智能分镜节点使用提示词设置
7. ✅ 中文/英文语言切换正常
8. ✅ TypeScript 编译无错误

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-19-prompts-settings.md`. Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
