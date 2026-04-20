import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_GRSAI_CREDIT_TIER_ID,
  PRICE_DISPLAY_CURRENCY_MODES,
  type GrsaiCreditTierId,
  type PriceDisplayCurrencyMode,
} from '@/features/canvas/pricing/types';

export type UiRadiusPreset = 'compact' | 'default' | 'large';
export type ThemeTonePreset = 'neutral' | 'warm' | 'cool';
export type CanvasEdgeRoutingMode = 'spline' | 'orthogonal' | 'smartOrthogonal';
export type ProviderApiKeys = Record<string, string>;
export const DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL = 'nano-banana-pro';

interface SettingsState {
  isHydrated: boolean;
  apiKeys: ProviderApiKeys;
  grsaiNanoBananaProModel: string;
  hideProviderGuidePopover: boolean;
  downloadPresetPaths: string[];
  useUploadFilenameAsNodeTitle: boolean;
  storyboardGenKeepStyleConsistent: boolean;
  storyboardGenDisableTextInImage: boolean;
  storyboardGenAutoInferEmptyFrame: boolean;
  ignoreAtTagWhenCopyingAndGenerating: boolean;
  enableStoryboardGenGridPreviewShortcut: boolean;
  showStoryboardGenAdvancedRatioControls: boolean;
  showNodePrice: boolean;
  priceDisplayCurrencyMode: PriceDisplayCurrencyMode;
  usdToCnyRate: number;
  preferDiscountedPrice: boolean;
  grsaiCreditTierId: GrsaiCreditTierId;
  uiRadiusPreset: UiRadiusPreset;
  themeTonePreset: ThemeTonePreset;
  accentColor: string;
  canvasEdgeRoutingMode: CanvasEdgeRoutingMode;
  autoCheckAppUpdateOnLaunch: boolean;
  enableUpdateDialog: boolean;
  imageAnalysisPrompt: string;
  scriptMasterImageAnalysisPrompt: string;
  scriptMasterScriptPrompt: string;
  smartStoryboardTextPrompt: string;
  smartStoryboardImagePrompt: string;
  setProviderApiKey: (providerId: string, key: string) => void;
  setGrsaiNanoBananaProModel: (model: string) => void;
  setHideProviderGuidePopover: (hide: boolean) => void;
  setDownloadPresetPaths: (paths: string[]) => void;
  setUseUploadFilenameAsNodeTitle: (enabled: boolean) => void;
  setStoryboardGenKeepStyleConsistent: (enabled: boolean) => void;
  setStoryboardGenDisableTextInImage: (enabled: boolean) => void;
  setStoryboardGenAutoInferEmptyFrame: (enabled: boolean) => void;
  setIgnoreAtTagWhenCopyingAndGenerating: (enabled: boolean) => void;
  setEnableStoryboardGenGridPreviewShortcut: (enabled: boolean) => void;
  setShowStoryboardGenAdvancedRatioControls: (enabled: boolean) => void;
  setShowNodePrice: (enabled: boolean) => void;
  setPriceDisplayCurrencyMode: (mode: PriceDisplayCurrencyMode) => void;
  setUsdToCnyRate: (rate: number) => void;
  setPreferDiscountedPrice: (enabled: boolean) => void;
  setGrsaiCreditTierId: (tierId: GrsaiCreditTierId) => void;
  setUiRadiusPreset: (preset: UiRadiusPreset) => void;
  setThemeTonePreset: (preset: ThemeTonePreset) => void;
  setAccentColor: (color: string) => void;
  setCanvasEdgeRoutingMode: (mode: CanvasEdgeRoutingMode) => void;
  setAutoCheckAppUpdateOnLaunch: (enabled: boolean) => void;
  setEnableUpdateDialog: (enabled: boolean) => void;
  setImageAnalysisPrompt: (prompt: string) => void;
  setScriptMasterImageAnalysisPrompt: (prompt: string) => void;
  setScriptMasterScriptPrompt: (prompt: string) => void;
  setSmartStoryboardTextPrompt: (prompt: string) => void;
  setSmartStoryboardImagePrompt: (prompt: string) => void;
}

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function normalizeHexColor(input: string): string {
  const trimmed = input.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return '#3B82F6';
  }
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function normalizeApiKey(input: string): string {
  return input.trim();
}

function normalizePriceDisplayCurrencyMode(
  input: PriceDisplayCurrencyMode | string | null | undefined
): PriceDisplayCurrencyMode {
  return PRICE_DISPLAY_CURRENCY_MODES.includes(input as PriceDisplayCurrencyMode)
    ? (input as PriceDisplayCurrencyMode)
    : 'auto';
}

function normalizeUsdToCnyRate(input: number | string | null | undefined): number {
  const numeric = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 7.2;
  }

  return Math.min(100, Math.max(0.01, Math.round(numeric * 100) / 100));
}

function normalizeGrsaiCreditTierId(
  input: GrsaiCreditTierId | string | null | undefined
): GrsaiCreditTierId {
  switch (input) {
    case 'tier-10':
    case 'tier-20':
    case 'tier-49':
    case 'tier-99':
    case 'tier-499':
    case 'tier-999':
      return input;
    default:
      return DEFAULT_GRSAI_CREDIT_TIER_ID;
  }
}

function normalizeGrsaiNanoBananaProModel(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim().toLowerCase();
  if (trimmed === DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL || trimmed.startsWith('nano-banana-pro-')) {
    return trimmed;
  }
  return DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL;
}

function normalizeCanvasEdgeRoutingMode(
  input: CanvasEdgeRoutingMode | string | null | undefined
): CanvasEdgeRoutingMode {
  if (input === 'orthogonal' || input === 'smartOrthogonal' || input === 'spline') {
    return input;
  }
  return 'spline';
}

function normalizeApiKeys(input: ProviderApiKeys | null | undefined): ProviderApiKeys {
  if (!input) {
    return {};
  }

  return Object.entries(input).reduce<ProviderApiKeys>((acc, [providerId, key]) => {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) {
      return acc;
    }

    acc[normalizedProviderId] = normalizeApiKey(key);
    return acc;
  }, {});
}

export function hasConfiguredApiKey(apiKeys: ProviderApiKeys): boolean {
  return getConfiguredApiKeyCount(apiKeys) > 0;
}

export function getConfiguredApiKeyCount(
  apiKeys: ProviderApiKeys,
  providerIds?: readonly string[]
): number {
  const keysToCount = providerIds
    ? providerIds.map((providerId) => apiKeys[providerId] ?? '')
    : Object.values(apiKeys);

  return keysToCount.reduce((count, key) => {
    return normalizeApiKey(key).length > 0 ? count + 1 : count;
  }, 0);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isHydrated: false,
      apiKeys: {},
      grsaiNanoBananaProModel: DEFAULT_GRSAI_NANO_BANANA_PRO_MODEL,
      hideProviderGuidePopover: false,
      downloadPresetPaths: [],
      useUploadFilenameAsNodeTitle: true,
      storyboardGenKeepStyleConsistent: true,
      storyboardGenDisableTextInImage: true,
      storyboardGenAutoInferEmptyFrame: true,
      ignoreAtTagWhenCopyingAndGenerating: true,
      enableStoryboardGenGridPreviewShortcut: false,
      showStoryboardGenAdvancedRatioControls: false,
      showNodePrice: true,
      priceDisplayCurrencyMode: 'auto',
      usdToCnyRate: 7.2,
      preferDiscountedPrice: false,
      grsaiCreditTierId: DEFAULT_GRSAI_CREDIT_TIER_ID,
      uiRadiusPreset: 'default',
      themeTonePreset: 'neutral',
      accentColor: '#3B82F6',
      canvasEdgeRoutingMode: 'spline',
      autoCheckAppUpdateOnLaunch: true,
      enableUpdateDialog: true,
      imageAnalysisPrompt: '请分析这张图片，描述其内容和主要元素。',
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
- description: 拥有10年经验的商业广告编剧，擅长将静态视觉资产转化为兼具高端美学与商业逻辑的短视频叙事。
- background: 长期服务于家居、时尚及轻奢行业，精通品牌视觉叙事与受众心理博弈。
- personality: 追求极致的语言美感，严谨且敏锐，擅长捕捉产品与受众之间的情感共鸣点。
- expertise: 广告脚本创作、产品视觉文案化、品牌调性把控、短视频营销叙事。
- target_audience: 品牌方、短视频内容策划人、寻求高质量视觉输出的营销团队。

## Skills

1. 创意叙事技能
   - 视觉转化：将静态图像的构图与光影转化为流畅的叙事语言。
   - 情感锚定：在短时间内精准构建品牌氛围，激发用户的情感认同。
   - 钩子设计：运用黄金三秒定律，通过感官描述瞬间抓住受众注意力。

2. 文案优化技能
   - 商业逻辑融合：将产品卖点内化为用户痛点的解决方案，而非生硬堆砌参数。
   - 语感雕琢：使用高端、诗意且克制的语言，剔除推销感的廉价词汇。
   - 节奏把控：根据视频时长（如15-30秒）精确分配文案字数与节奏起伏。

## Rules

1. 基本原则：
   - 拒绝推销感：严禁使用"大甩卖"、"买到就是赚到"等低端促销用语，保持品牌高级感。
   - 视觉优先：所有剧本必须基于输入的图片分析结果，确保文案与视觉高度契合。
   - 目标导向：内容必须针对目标受众（如设计师、批发商）的专业视角进行优化。
   - 情感共鸣：侧重于描述产品能为用户带来的生活质感提升，而非单纯的功能罗列。

2. 行为准则：
   - 逻辑严密：遵循"黄金三秒（钩子）-> 中部（价值/解决方案）-> 结尾（行动号召）"的结构。
   - 精准描述：如果图片中出现设计师或模特，必须设计合理的互动逻辑，使其成为品牌理念的传达者。
   - 极简表达：文案应留有空间感，配合画面留白，避免过度密集的旁白轰炸。

3. 限制条件：
   - 禁止术语：严禁在剧本中出现摄影器材或技术性指令（如"35mm镜头"、"大光圈"）。
   - 字数限制：严格控制在目标时长对应的语速内（通常15秒约60字，30秒约120字）。
   - 格式统一：仅输出"旁白/配音（Voiceover）"和"情景描述（Scene Description）"。

## Workflows

- 目标: 将静态视觉转化为具有感染力的商业广告剧本。
- 步骤 1: 分析输入的【图片描述】与【产品卖点】，提取视觉核心（如光影质感、材质细节）。
- 步骤 2: 构建钩子，将核心卖点转化为受众关注的审美诉求或痛点共鸣。
- 步骤 3: 撰写中部内容，将技术工艺升级为"品质生活"的描述。
- 步骤 4: 设定结尾行动号召（CTA），强化品牌印记或诱导商业洽谈。
- 预期结果: 一份兼具高端美感、逻辑清晰且符合短视频节奏的专业脚本。

## Output Format
请严格按照以下格式输出内容，确保逻辑清晰：

剧本概况

核心主题：[用一句话概括视频想要传达的灵魂]

情绪基调：[例如：冷峻、优雅、科技感、温馨等]

剧本文案（Script Body）
请按叙事阶段横向排列，确保文案与画面描述对应：

[开头：吸引注意]

画面内容描述：(描述该阶段对应的视觉重点)

旁白/字幕文案：(富有张力的第一句话)

[主体：价值传达]

画面内容描述：(结合图片分析中的材质、细节或人物动作)

旁白/字幕文案：(解释产品卖点或品牌理念)

[结尾：品牌收尾]

画面内容描述：(Logo出现或品牌标志性画面的呈现)

旁白/字幕文案：(行动号召或品牌口号)

核心视觉意象（Visual Keynotes）

提取3-5个必须在后续分镜中体现的关键词（如：不锈钢的拉丝质感、柔和的顶光、设计师的专业眼神等）。

## Initialization
作为资深商业广告编剧，我已准备就绪。

用户产品信息：
{contextText}

请根据以上信息，创作一个{duration}秒的商业宣传视频脚本，使用纯文本格式输出，保持高端品牌调性。`,
      smartStoryboardTextPrompt: `# Role: 故事线拆解型批量分镜提示词专家

## Profile
- language: 中文/英文
- description: 精通影视视觉语言、AI绘画提示词工程与叙事节奏把控的专家。擅长将复杂文案转化为具有连贯性、叙事张力与视觉美感的关键帧序列。
- background: 拥有多年电影分镜脚本绘制及商业短片执导经验，深入理解Stable Diffusion/Midjourney等AI绘画工具的权重控制与风格迁移机制。
- personality: 严谨、逻辑缜密、审美高级、追求极致的视觉连贯性。
- expertise: 剧本结构拆解、视觉符号转译、AI提示词工程(Prompt Engineering)、影视光影布局、材质一致性调控。
- target_audience: 短视频创作者、广告导演、视频剪辑师、AI视觉设计师。

## Skills

1. 剧本结构化拆解
   - 节奏把控: 将长文案按叙事逻辑平滑切分为N个关键节点。
   - 核心锚点: 提炼各阶段的叙事核心与视觉焦点，确保分镜无冗余。
   - 逻辑映射: 自动匹配悬念、转折、高潮及收尾的叙事节奏。

2. AI视觉一致性调控
   - 风格锁定: 基于参考图DNA，深度解构光影、色调、构图与材质特征。
   - 材质映射: 精准复现不锈钢等特定材质在不同场景下的高光、漫反射及环境色。
   - 提示词优化: 运用标准化的摄影术语和光影描述，增强AI输出的稳定性和电影质感。

## Rules

1. 基本原则：
   - 逻辑完整性：确保N个分镜构成的故事链条完整，无叙事断层。
   - 视觉连贯性：所有分镜必须共享同一视觉 DNA，严禁出现材质、画风突变。
   - 提示词专业性：使用标准的电影摄影术语（如焦距、光圈、电影灯光布局）优化提示词。
   - 用户导向：输出格式应直接适配主流AI绘画软件，减少用户后期修改工作量。

2. 行为准则：
   - 深度阅读：仔细分析每一段剧本，识别其视觉关键词。
   - 差异化处理：在保持整体风格统一的同时，确保不同分镜间的视觉构成具有层次感。
   - 迭代反馈：若用户对某分镜不满意，提供针对性的修正建议。

3. 限制条件：
   - 严格遵守N的约束：生成的场景数量必须与用户设定的N相等。
   - 材质锁定：必须将"不锈钢"材质及相关光影特性置于Prompt核心权重位置。
   - 拒绝模糊：不使用含糊不清的形容词，尽量使用具体的空间词、质感词和镜头语言。

## Workflows

- 目标: 将剧本转化为可直接执行的N个分镜AI绘画提示词。
- 步骤 1: 读取输入内容，分析视觉DNA特征并建立风格锚点库。
- 步骤 2: 对剧本进行语义切分，匹配至N个故事阶段。
- 步骤 3: 结合参考图，撰写并优化每个场景的详细英文Prompt。
- 步骤 4: 检查并校对所有Prompt的连贯性，确保风格与材质描述一致。
- 预期结果: 一份结构清晰、可直接复制使用的N个关键帧提示词列表。

## OutputFormat

1. 输出规范：
   - format: Markdown
   - structure: 以"Scene X/N"为标题，包含中文剧情描述与英文Prompt。
   - style: 专业、简洁、电影感。
   - special_requirements: 每个英文Prompt必须包含主体描述、材质特性、环境光影、摄影参数四个维度。

2. 格式规范：
   - indentation: 每段落保持统一缩进。
   - sections: 分级清晰，便于阅读和复制。
   - highlighting: 关键提示词使用加粗或强调格式。

3. 验证规则：
   - validation: 检查N值匹配度，核对材质的一致性描写。
   - constraints: 提示词内必须包含对"不锈钢"材质的刻画。
   - error_handling: 无法拆解或缺少核心输入时，会主动提示用户补充信息。

4. 示例说明：
   1. 示例1：
      - 标题: 结构示例
      - 格式类型: Markdown
      - 说明: 展示典型的分镜输出结构
      - 示例内容: |
          ### Scene 1/5 - 阶段：悬念引子
          - 中文剧情描述：不锈钢机身在暗室中缓缓显现，极具工业科技感。
          - 英文提示词：Extreme close-up, brushed stainless steel texture, cinematic rim lighting, volumetric shadows, 85mm lens, f/1.8, photorealistic, high-end commercial aesthetic.

## Initialization
作为"故事线拆解型"批量分镜提示词专家，我已准备就绪。

根据以下脚本内容，生成 {totalFrames} 个分镜描述

输出格式：
### Scene 1/{totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

注意：严格按照Markdown格式输出，确保每个分镜都包含阶段名称、中文剧情描述和英文提示词。`,
      smartStoryboardImagePrompt: `# Role: 故事线拆解型批量分镜提示词专家

## Profile
- language: 中文/英文
- description: 精通影视视觉语言、AI绘画提示词工程与叙事节奏把控的专家。擅长将复杂文案转化为具有连贯性、叙事张力与视觉美感的关键帧序列。
- background: 拥有多年电影分镜脚本绘制及商业短片执导经验，深入理解Stable Diffusion/Midjourney等AI绘画工具的权重控制与风格迁移机制。
- personality: 严谨、逻辑缜密、审美高级、追求极致的视觉连贯性。
- expertise: 剧本结构拆解、视觉符号转译、AI提示词工程(Prompt Engineering)、影视光影布局、材质一致性调控。
- target_audience: 短视频创作者、广告导演、视频剪辑师、AI视觉设计师。

## Skills

1. 剧本结构化拆解
   - 节奏把控: 将长文案按叙事逻辑平滑切分为N个关键节点。
   - 核心锚点: 提炼各阶段的叙事核心与视觉焦点，确保分镜无冗余。
   - 逻辑映射: 自动匹配悬念、转折、高潮及收尾的叙事节奏。

2. AI视觉一致性调控
   - 风格锁定: 基于参考图DNA，深度解构光影、色调、构图与材质特征。
   - 材质映射: 精准复现不锈钢等特定材质在不同场景下的高光、漫反射及环境色。
   - 提示词优化: 运用标准化的摄影术语和光影描述，增强AI输出的稳定性和电影质感。

## Rules

1. 基本原则：
   - 逻辑完整性：确保N个分镜构成的故事链条完整，无叙事断层。
   - 视觉连贯性：所有分镜必须共享同一视觉 DNA，严禁出现材质、画风突变。
   - 提示词专业性：使用标准的电影摄影术语（如焦距、光圈、电影灯光布局）优化提示词。
   - 用户导向：输出格式应直接适配主流AI绘画软件，减少用户后期修改工作量。

2. 行为准则：
   - 深度阅读：仔细分析每一段剧本，识别其视觉关键词。
   - 差异化处理：在保持整体风格统一的同时，确保不同分镜间的视觉构成具有层次感。
   - 迭代反馈：若用户对某分镜不满意，提供针对性的修正建议。

3. 限制条件：
   - 严格遵守N的约束：生成的场景数量必须与用户设定的N相等。
   - 材质锁定：必须将"不锈钢"材质及相关光影特性置于Prompt核心权重位置。
   - 拒绝模糊：不使用含糊不清的形容词，尽量使用具体的空间词、质感词和镜头语言。

## Workflows

- 目标: 将剧本转化为可直接执行的N个分镜AI绘画提示词。
- 步骤 1: 读取输入内容，分析视觉DNA特征并建立风格锚点库。
- 步骤 2: 对剧本进行语义切分，匹配至N个故事阶段。
- 步骤 3: 结合参考图，撰写并优化每个场景的详细英文Prompt。
- 步骤 4: 检查并校对所有Prompt的连贯性，确保风格与材质描述一致。
- 预期结果: 一份结构清晰、可直接复制使用的N个关键帧提示词列表。

## OutputFormat

1. 输出规范：
   - format: Markdown
   - structure: 以"Scene X/N"为标题，包含中文剧情描述与英文Prompt。
   - style: 专业、简洁、电影感。
   - special_requirements: 每个英文Prompt必须包含主体描述、材质特性、环境光影、摄影参数四个维度。

2. 格式规范：
   - indentation: 每段落保持统一缩进。
   - sections: 分级清晰，便于阅读和复制。
   - highlighting: 关键提示词使用加粗或强调格式。

3. 验证规则：
   - validation: 检查N值匹配度，核对材质的一致性描写。
   - constraints: 提示词内必须包含对"不锈钢"材质的刻画。
   - error_handling: 无法拆解或缺少核心输入时，会主动提示用户补充信息。

4. 示例说明：
   1. 示例1：
      - 标题: 结构示例
      - 格式类型: Markdown
      - 说明: 展示典型的分镜输出结构
      - 示例内容: |
          ### Scene 1/5 - 阶段：悬念引子
          - 中文剧情描述：不锈钢机身在暗室中缓缓显现，极具工业科技感。
          - 英文提示词：Extreme close-up, brushed stainless steel texture, cinematic rim lighting, volumetric shadows, 85mm lens, f/1.8, photorealistic, high-end commercial aesthetic.

## Initialization
作为"故事线拆解型"批量分镜提示词专家，我已准备就绪。

这是一张宣传视频的分镜参考图，需要生成 {totalFrames} 个分镜描述。

输出格式：
### Scene 1/{totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

注意：严格按照Markdown格式输出，确保每个分镜都包含阶段名称、中文剧情描述和英文提示词。`,
      setProviderApiKey: (providerId, key) =>
        set((state) => ({
          apiKeys: {
            ...state.apiKeys,
            [providerId]: normalizeApiKey(key),
          },
        })),
      setGrsaiNanoBananaProModel: (model) =>
        set({
          grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(model),
        }),
      setHideProviderGuidePopover: (hide) => set({ hideProviderGuidePopover: hide }),
      setDownloadPresetPaths: (paths) => {
        const uniquePaths = Array.from(
          new Set(paths.map((path) => path.trim()).filter((path) => path.length > 0))
        ).slice(0, 8);
        set({ downloadPresetPaths: uniquePaths });
      },
      setUseUploadFilenameAsNodeTitle: (enabled) => set({ useUploadFilenameAsNodeTitle: enabled }),
      setStoryboardGenKeepStyleConsistent: (enabled) =>
        set({ storyboardGenKeepStyleConsistent: enabled }),
      setStoryboardGenDisableTextInImage: (enabled) =>
        set({ storyboardGenDisableTextInImage: enabled }),
      setStoryboardGenAutoInferEmptyFrame: (enabled) =>
        set({ storyboardGenAutoInferEmptyFrame: enabled }),
      setIgnoreAtTagWhenCopyingAndGenerating: (enabled) =>
        set({ ignoreAtTagWhenCopyingAndGenerating: enabled }),
      setEnableStoryboardGenGridPreviewShortcut: (enabled) =>
        set({ enableStoryboardGenGridPreviewShortcut: enabled }),
      setShowStoryboardGenAdvancedRatioControls: (enabled) =>
        set({ showStoryboardGenAdvancedRatioControls: enabled }),
      setShowNodePrice: (enabled) => set({ showNodePrice: enabled }),
      setPriceDisplayCurrencyMode: (priceDisplayCurrencyMode) =>
        set({
          priceDisplayCurrencyMode:
            normalizePriceDisplayCurrencyMode(priceDisplayCurrencyMode),
        }),
      setUsdToCnyRate: (usdToCnyRate) =>
        set({ usdToCnyRate: normalizeUsdToCnyRate(usdToCnyRate) }),
      setPreferDiscountedPrice: (enabled) => set({ preferDiscountedPrice: enabled }),
      setGrsaiCreditTierId: (grsaiCreditTierId) =>
        set({ grsaiCreditTierId: normalizeGrsaiCreditTierId(grsaiCreditTierId) }),
      setUiRadiusPreset: (uiRadiusPreset) => set({ uiRadiusPreset }),
      setThemeTonePreset: (themeTonePreset) => set({ themeTonePreset }),
      setAccentColor: (color) => set({ accentColor: normalizeHexColor(color) }),
      setCanvasEdgeRoutingMode: (canvasEdgeRoutingMode) =>
        set({ canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(canvasEdgeRoutingMode) }),
      setAutoCheckAppUpdateOnLaunch: (enabled) => set({ autoCheckAppUpdateOnLaunch: enabled }),
      setEnableUpdateDialog: (enabled) => set({ enableUpdateDialog: enabled }),
      setImageAnalysisPrompt: (prompt) => set({ imageAnalysisPrompt: prompt.trim() }),
      setScriptMasterImageAnalysisPrompt: (prompt) => set({ scriptMasterImageAnalysisPrompt: prompt.trim() }),
      setScriptMasterScriptPrompt: (prompt) => set({ scriptMasterScriptPrompt: prompt.trim() }),
      setSmartStoryboardTextPrompt: (prompt) => set({ smartStoryboardTextPrompt: prompt.trim() }),
      setSmartStoryboardImagePrompt: (prompt) => set({ smartStoryboardImagePrompt: prompt.trim() }),
    }),
    {
      name: 'settings-storage',
      version: 10,
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.error('failed to hydrate settings storage', error);
          }
          // 延迟设置isHydrated为true，避免初始化顺序问题
          setTimeout(() => {
            try {
              useSettingsStore.setState({ isHydrated: true });
            } catch (e) {
              console.error('Failed to set isHydrated', e);
            }
          }, 0);
        };
      },
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as {
          apiKey?: string;
          apiKeys?: ProviderApiKeys;
          ignoreAtTagWhenCopyingAndGenerating?: boolean;
          grsaiNanoBananaProModel?: string;
          hideProviderGuidePopover?: boolean;
          canvasEdgeRoutingMode?: CanvasEdgeRoutingMode | string;
          autoCheckAppUpdateOnLaunch?: boolean;
          enableUpdateDialog?: boolean;
          enableStoryboardGenGridPreviewShortcut?: boolean;
          showStoryboardGenAdvancedRatioControls?: boolean;
          storyboardGenAutoInferEmptyFrame?: boolean;
          showNodePrice?: boolean;
          priceDisplayCurrencyMode?: PriceDisplayCurrencyMode | string;
          usdToCnyRate?: number | string;
          preferDiscountedPrice?: boolean;
          grsaiCreditTierId?: GrsaiCreditTierId | string;
        };

        const migratedApiKeys = normalizeApiKeys(state.apiKeys);
        const ignoreAtTagWhenCopyingAndGenerating =
          state.ignoreAtTagWhenCopyingAndGenerating ?? true;
        if (Object.keys(migratedApiKeys).length > 0) {
          return {
            ...(persistedState as object),
            isHydrated: true,
            apiKeys: migratedApiKeys,
            ignoreAtTagWhenCopyingAndGenerating,
            grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(
              state.grsaiNanoBananaProModel
            ),
            hideProviderGuidePopover: state.hideProviderGuidePopover ?? false,
            canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(state.canvasEdgeRoutingMode),
            autoCheckAppUpdateOnLaunch: state.autoCheckAppUpdateOnLaunch ?? true,
            enableUpdateDialog: state.enableUpdateDialog ?? true,
            enableStoryboardGenGridPreviewShortcut:
              state.enableStoryboardGenGridPreviewShortcut ?? false,
            showStoryboardGenAdvancedRatioControls:
              state.showStoryboardGenAdvancedRatioControls ?? false,
            storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame ?? true,
            showNodePrice: state.showNodePrice ?? true,
            priceDisplayCurrencyMode: normalizePriceDisplayCurrencyMode(
              state.priceDisplayCurrencyMode
            ),
            usdToCnyRate: normalizeUsdToCnyRate(state.usdToCnyRate),
            preferDiscountedPrice: state.preferDiscountedPrice ?? false,
            grsaiCreditTierId: normalizeGrsaiCreditTierId(state.grsaiCreditTierId),
          };
        }

        return {
          ...(persistedState as object),
          isHydrated: true,
          apiKeys: state.apiKey ? { google: normalizeApiKey(state.apiKey) } : {},
          ignoreAtTagWhenCopyingAndGenerating,
          grsaiNanoBananaProModel: normalizeGrsaiNanoBananaProModel(
            state.grsaiNanoBananaProModel
          ),
          hideProviderGuidePopover: state.hideProviderGuidePopover ?? false,
          canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(state.canvasEdgeRoutingMode),
          autoCheckAppUpdateOnLaunch: state.autoCheckAppUpdateOnLaunch ?? true,
          enableUpdateDialog: state.enableUpdateDialog ?? true,
          enableStoryboardGenGridPreviewShortcut:
            state.enableStoryboardGenGridPreviewShortcut ?? false,
          showStoryboardGenAdvancedRatioControls:
            state.showStoryboardGenAdvancedRatioControls ?? false,
          storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame ?? true,
          showNodePrice: state.showNodePrice ?? true,
          priceDisplayCurrencyMode: normalizePriceDisplayCurrencyMode(
            state.priceDisplayCurrencyMode
          ),
          usdToCnyRate: normalizeUsdToCnyRate(state.usdToCnyRate),
          preferDiscountedPrice: state.preferDiscountedPrice ?? false,
          grsaiCreditTierId: normalizeGrsaiCreditTierId(state.grsaiCreditTierId),
        };
      },
    }
  )
);
