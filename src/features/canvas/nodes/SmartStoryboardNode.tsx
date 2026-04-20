import {
  memo,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { Handle, Position } from '@xyflow/react';
import { Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  analyzeImage,
  ensureApiKey,
} from '@/commands/ai';
import { imageUrlToDataUrl, compressImageForAIAnalysis } from '@/features/canvas/application/imageData';
import {
  CANVAS_NODE_TYPES,
  type SmartStoryboardNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { useCanvasStore } from '@/stores/canvasStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { resolveErrorContent, showErrorDialog } from '@/features/canvas/application/errorDialog';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import {
  UiButton,
  UiTextAreaField,
  UiPanel,
} from '@/components/ui';
import {
  NODE_CONTROL_ICON_CLASS,
  NODE_CONTROL_PRIMARY_BUTTON_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';
import { ModelParamsControls } from '@/features/canvas/ui/ModelParamsControls';
import {
  DEFAULT_IMAGE_MODEL_ID,
  getImageModel,
  listImageModels,
} from '@/features/canvas/models';

type SmartStoryboardNodeProps = {
  id: string;
  data: SmartStoryboardNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
};

const SMART_STORYBOARD_MIN_WIDTH = 280;
const SMART_STORYBOARD_MIN_HEIGHT = 360;
const SMART_STORYBOARD_MAX_WIDTH = 800;
const SMART_STORYBOARD_MAX_HEIGHT = 1200;
const SMART_STORYBOARD_HEADER_ADJUST = { x: 0, y: 0, scale: 1 };
const SMART_STORYBOARD_ICON_ADJUST = { x: 0, y: 0, scale: 0.95 };
const SMART_STORYBOARD_TITLE_ADJUST = { x: 0, y: 0, scale: 1 };

export const SmartStoryboardNode = memo(({ id, data, selected, width, height }: SmartStoryboardNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const edges = useCanvasStore((state) => state.edges);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const getNode = useCanvasStore((state) => state.getNode);
  const apiKeys = useSettingsStore((state) => state.apiKeys);

  const [isGenerating, setIsGenerating] = useState(false);

  const nodeData = data as SmartStoryboardNodeData;

  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.smartStoryboard, nodeData);

  const imageModels = useMemo(() => listImageModels(), []);
  const selectedModel = useMemo(() => {
    const modelId = nodeData.model ?? DEFAULT_IMAGE_MODEL_ID;
    return getImageModel(modelId);
  }, [nodeData.model]);
  const providerApiKey = apiKeys[selectedModel.providerId] ?? '';
  const modelId = selectedModel.id;

  // 递归查找上游节点，直到找到图片或分析结果
  const findUpstreamContent = useCallback((startNodeId: string): { images: string[], analysisResult: string | null } => {
    const visited = new Set<string>();
    const images: string[] = [];
    let analysisResult: string | null = null;

    function search(nodeId: string) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = getNode(nodeId);
      if (!node) return;

      // 检查当前节点是否有图片
      if (node.data?.imageUrl && typeof node.data.imageUrl === 'string') {
        images.push(node.data.imageUrl);
      }

      // 检查当前节点是否有分析结果
      if (!analysisResult && node.data?.analysisResult && typeof node.data.analysisResult === 'string') {
        analysisResult = node.data.analysisResult;
      }

      // 查找当前节点的入边，继续向上搜索
      const incomingEdges = edges.filter(edge => edge.target === nodeId);
      for (const edge of incomingEdges) {
        search(edge.source);
      }
    }

    search(startNodeId);
    return { images, analysisResult };
  }, [edges, getNode]);

  // 获取输入图片（所有上游节点的图片）
  const incomingImages = useCallback(() => {
    return findUpstreamContent(id).images;
  }, [id, findUpstreamContent]);

  // 获取上游节点的图片分析结果
  const getSourceAnalysisResult = useCallback(() => {
    return findUpstreamContent(id).analysisResult;
  }, [id, findUpstreamContent]);

  // 查找输出连接的分镜生成节点，获取格子总数
  const getTargetStoryboardGen = useCallback(() => {
    const outgoingEdges = edges.filter(edge => edge.source === id);
    for (const edge of outgoingEdges) {
      const targetNode = getNode(edge.target);
      if (targetNode?.type === CANVAS_NODE_TYPES.storyboardGen) {
        // 这是分镜生成节点
        const gridRows = (targetNode.data as any).gridRows ?? 3;
        const gridCols = (targetNode.data as any).gridCols ?? 3;
        return {
          totalFrames: gridRows * gridCols,
          nodeId: edge.target,
          frames: (targetNode.data as any).frames ?? [],
        };
      }
    }
    return null;
  }, [edges, id, getNode]);

  // 递归查找上游节点的文字描述（优先读取 resultText 或 content 字段）
  const getSourceText = useCallback(() => {
    const visited = new Set<string>();

    function search(nodeId: string): string | null {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);

      const node = getNode(nodeId);
      if (!node) return null;

      // 优先读取 resultText（智能分镜节点或编剧大师节点的分析结果）
      if (node.data?.resultText && typeof node.data.resultText === 'string') {
        return node.data.resultText;
      }
      // 然后读取 content（文本注释节点的分析结果）
      if (node.data?.content && typeof node.data.content === 'string') {
        return node.data.content;
      }

      // 查找当前节点的入边，继续向上搜索
      const incomingEdges = edges.filter(edge => edge.target === nodeId);
      for (const edge of incomingEdges) {
        const result = search(edge.source);
        if (result) return result;
      }

      return null;
    }

    return search(id);
  }, [edges, id, getNode]);

  const handleGenerate = useCallback(async () => {
    // 优先尝试获取上游节点的文字描述
    const sourceText = getSourceText();
    const sourceAnalysisResult = getSourceAnalysisResult();
    const images = incomingImages();

    // 需要有文字描述或图片才能继续
    if (!sourceText && !sourceAnalysisResult && images.length === 0) {
      const errorMessage = t('smartStoryboard.noImageConnected');
      const errorTitle = t('smartStoryboard.cannotGenerate');
      const errorDesc = t('smartStoryboard.noImageConnectedDesc');
      showErrorDialog(errorMessage, errorTitle, errorDesc);
      return;
    }

    // 检查选中的模型是否有 API key
    if (!providerApiKey || !providerApiKey.trim()) {
      showErrorDialog(
        t('modelParams.providerKeyRequiredTitle'),
        t('modelParams.providerKeyRequiredTitle'),
        t('modelParams.providerKeyRequiredDesc', { provider: selectedModel.providerId }),
      );
      return;
    }

    const targetStoryboard = getTargetStoryboardGen();
    const totalFrames = targetStoryboard?.totalFrames ?? 9;

    setIsGenerating(true);

    try {
      // 使用选中的模型
      await ensureApiKey(selectedModel.providerId, providerApiKey);

      let result: string;

      if (sourceText) {
            // 有上游文字描述，基于它生成分镜框架
            console.log('[SmartStoryboard] Using source text from upstream node, generating storyboard frames');
            const scriptPrompt = `# Role: 故事线拆解型批量分镜提示词专家

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

根据以下脚本内容，生成 ${totalFrames} 个分镜描述：

脚本内容：
${sourceText}

输出格式：
### Scene 1/${totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

### Scene 2/${totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

...

### Scene ${totalFrames}/${totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

注意：严格按照Markdown格式输出，确保每个分镜都包含阶段名称、中文剧情描述和英文提示词。`;

            // 使用第一张图片作为参考图
            if (images.length > 0) {
              const imageForAnalysis = await compressImageForAIAnalysis(await imageUrlToDataUrl(images[0]));
              result = await analyzeImage(imageForAnalysis, modelId, scriptPrompt);
            } else {
              // 如果没有图片，直接使用文本分析
              // 创建一个简单的占位图片
              const createPlaceholderImage = async (): Promise<string> => {
                const canvas = document.createElement('canvas');
                canvas.width = 512;
                canvas.height = 512;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#f0f0f0';
                  ctx.fillRect(0, 0, 512, 512);
                  ctx.fillStyle = '#666';
                  ctx.font = '24px Arial';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText('No Image Provided', 256, 256);
                }
                return canvas.toDataURL('image/png');
              };
              const imageForAnalysis = await compressImageForAIAnalysis(await createPlaceholderImage());
              result = await analyzeImage(imageForAnalysis, modelId, scriptPrompt);
            }
          } else if (sourceAnalysisResult) {
            // 有上游图片分析结果，基于它生成分镜框架
            console.log('[SmartStoryboard] Using existing image analysis result from upstream node');
            const analysisPrompt = `# Role: 故事线拆解型批量分镜提示词专家

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
遵守上述Rules，按Workflows执行任务。

根据以下图片分析结果，生成 ${totalFrames} 个分镜描述：

图片分析结果：
${sourceAnalysisResult}

输出格式：
### Scene 1/${totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

### Scene 2/${totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

...

### Scene ${totalFrames}/${totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

注意：严格按照Markdown格式输出，确保每个分镜都包含阶段名称、中文剧情描述和英文提示词。`;

            const imageForAnalysis = await compressImageForAIAnalysis(await imageUrlToDataUrl(images[0]));
            result = await analyzeImage(imageForAnalysis, modelId, analysisPrompt);
          } else {
            // 没有文字描述也没有分析结果，重新分析图片
            console.log('[SmartStoryboard] No existing analysis result, analyzing image');
            const referenceImageUrl = images[0];

            // 构建系统提示词
            const systemPrompt = `# Role: 故事线拆解型批量分镜提示词专家

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

这是一张宣传视频的分镜参考图，需要生成 ${totalFrames} 个分镜描述。

输出格式：
### Scene 1/${totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

### Scene 2/${totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

...

### Scene ${totalFrames}/${totalFrames} - 阶段：[阶段名称]
- 中文剧情描述：[剧情描述]
- 英文提示词：[详细的英文提示词]

注意：严格按照Markdown格式输出，确保每个分镜都包含阶段名称、中文剧情描述和英文提示词。`;

            // 调用 AI 分析图片
            const imageForAnalysis = await compressImageForAIAnalysis(await imageUrlToDataUrl(referenceImageUrl));
            result = await analyzeImage(imageForAnalysis, modelId, systemPrompt);
          }

          // 更新结果文本
          updateNodeData(id, {
            resultText: result,
            isGenerating: false,
          });

          // 如果连接了分镜生成节点，自动把提示词填入分镜节点
          if (targetStoryboard) {
            // 解析结果 - 从Markdown格式中提取每个Scene的英文提示词
            const lines = result.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const prompts: string[] = [];
            let currentScene = false;

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              
              // 检查是否是Scene标题
              if (line.startsWith('### Scene')) {
                currentScene = true;
              }
              // 检查是否是英文提示词行
              else if (currentScene && line.startsWith('- 英文提示词：')) {
                const prompt = line.replace('- 英文提示词：', '').trim();
                if (prompt.length > 0) {
                  prompts.push(prompt);
                }
                currentScene = false; // 一个Scene只提取一个英文提示词
              }
            }

            // 更新分镜生成节点的 frames
            // 如果 frames 数组存在（不管长度是否为0），我们都尝试更新
            if (targetStoryboard.frames) {
              const updatedFrames = targetStoryboard.frames.map((frame: any, index: number) => {
                if (index < prompts.length && prompts[index].length > 0) {
                  return {
                    ...frame,
                    description: prompts[index],
                  };
                }
                return frame;
              });

              // 如果 frames 是空的，根据 gridRows x gridCols 创建空 frames 然后填入 prompts
              if (updatedFrames.length === 0 && prompts.length > 0) {
                // 得到正确的行数和列数
                const targetNode = getNode(targetStoryboard.nodeId);
                const gridRows = (targetNode?.data as any).gridRows ?? 3;
                const gridCols = (targetNode?.data as any).gridCols ?? 3;
                // 创建 frames，每个 frame 填入 prompt
                for (let i = 0; i < gridRows * gridCols && i < prompts.length; i++) {
                  updatedFrames.push({
                    id: `frame-${i}`,
                    description: prompts[i] ?? '',
                    referenceIndex: null,
                  });
                }
              }

              updateNodeData(targetStoryboard.nodeId, {
                frames: updatedFrames,
              });
            }
          }

          // 更新结果文本
          updateNodeData(id, {
            resultText: result,
            isGenerating: false,
          });

          // 如果连接了分镜生成节点，自动把提示词填入分镜节点
          if (targetStoryboard) {
            // 解析结果 - 从Markdown格式中提取每个Scene的英文提示词
            const lines = result.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const prompts: string[] = [];
            let currentScene = false;

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              
              // 检查是否是Scene标题
              if (line.startsWith('### Scene')) {
                currentScene = true;
              }
              // 检查是否是英文提示词行
              else if (currentScene && line.startsWith('- 英文提示词：')) {
                const prompt = line.replace('- 英文提示词：', '').trim();
                if (prompt.length > 0) {
                  prompts.push(prompt);
                }
                currentScene = false; // 一个Scene只提取一个英文提示词
              }
            }

            // 更新分镜生成节点的 frames
            // 如果 frames 数组存在（不管长度是否为0），我们都尝试更新
            if (targetStoryboard.frames) {
              const updatedFrames = targetStoryboard.frames.map((frame: any, index: number) => {
                if (index < prompts.length && prompts[index].length > 0) {
                  return {
                    ...frame,
                    description: prompts[index],
                  };
                }
                return frame;
              });

              // 如果 frames 是空的，根据 gridRows x gridCols 创建空 frames 然后填入 prompts
              if (updatedFrames.length === 0 && prompts.length > 0) {
                // 得到正确的行数和列数
                const targetNode = getNode(targetStoryboard.nodeId);
                const gridRows = (targetNode?.data as any).gridRows ?? 3;
                const gridCols = (targetNode?.data as any).gridCols ?? 3;
                // 创建 frames，每个 frame 填入 prompt
                for (let i = 0; i < gridRows * gridCols && i < prompts.length; i++) {
                  updatedFrames.push({
                    id: `frame-${i}`,
                    description: prompts[i] ?? '',
                    referenceIndex: null,
                  });
                }
              }

              updateNodeData(targetStoryboard.nodeId, {
                frames: updatedFrames,
              });
            }
          }
        } catch (error) {
          console.error(`智能分镜生成失败:`, error);
          const resolvedError = resolveErrorContent(error, t('smartStoryboard.generateFailed'));
          showErrorDialog(resolvedError.message, t('smartStoryboard.generateFailed'), resolvedError.details);
          updateNodeData(id, {
            isGenerating: false,
          });
        } finally {
          setIsGenerating(false);
        }
  }, [getSourceText, getSourceAnalysisResult, incomingImages, getTargetStoryboardGen, id, updateNodeData, t, getNode, selectedModel, providerApiKey]);

  const resolvedNodeWidth = Math.max(
    SMART_STORYBOARD_MIN_WIDTH,
    Math.min(SMART_STORYBOARD_MAX_WIDTH, width ?? SMART_STORYBOARD_MIN_WIDTH)
  );
  const resolvedNodeHeight = Math.max(
    SMART_STORYBOARD_MIN_HEIGHT,
    Math.min(SMART_STORYBOARD_MAX_HEIGHT, height ?? SMART_STORYBOARD_MIN_HEIGHT)
  );

  return (
    <div
      className={`
        group relative flex h-full flex-col overflow-visible rounded-[var(--node-radius)] border bg-surface-dark/95 p-3 transition-colors duration-150
        ${selected
          ? 'border-accent shadow-[0_0_0_1px_rgba(59,130,246,0.32)]'
          : 'border-[rgba(15,23,42,0.22)] hover:border-[rgba(15,23,42,0.34)] dark:border-[rgba(255,255,255,0.22)] dark:hover:border-[rgba(255,255,255,0.34)]'
        }
      `}
      style={{
        width: `${resolvedNodeWidth}px`,
        height: `${resolvedNodeHeight}px`,
      }}
    >
      {/* Title */}
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Brain className="h-4 w-4" />}
        titleText={resolvedTitle}
        headerAdjust={SMART_STORYBOARD_HEADER_ADJUST}
        iconAdjust={SMART_STORYBOARD_ICON_ADJUST}
        titleAdjust={SMART_STORYBOARD_TITLE_ADJUST}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
        rightSlot={
          <div
            className="cursor-grab active:cursor-grabbing"
            onClick={() => setSelectedNode(id)}
          />
        }
      />

      <UiPanel className="flex-1 p-2 my-2 overflow-hidden">
        <UiTextAreaField
          value={nodeData.resultText ?? ''}
          onChange={(e) => updateNodeData(id, { resultText: e.target.value })}
          placeholder={t('smartStoryboard.placeholder')}
          className="h-full min-h-[180px] text-sm"
        />
      </UiPanel>

      <div className="mb-2 flex items-center gap-1">
        <ModelParamsControls
          imageModels={imageModels}
          selectedModel={selectedModel}
          onModelChange={(modelId) => {
            updateNodeData(id, { model: modelId });
          }}
        />
      </div>

      <div className="mt-auto pt-2">
        <UiButton
          onClick={(e) => {
            e.stopPropagation();
            void handleGenerate();
          }}
          variant="primary"
          size="sm"
          disabled={isGenerating}
          className={`w-full ${NODE_CONTROL_PRIMARY_BUTTON_CLASS}`}
        >
          <Brain className={NODE_CONTROL_ICON_CLASS} strokeWidth={2.8} />
          {isGenerating ? t('ai.generating') : t('smartStoryboard.generateButton')}
        </UiButton>
      </div>

      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-surface-dark !bg-accent"
      />
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-surface-dark !bg-accent"
      />
      <NodeResizeHandle
        minWidth={SMART_STORYBOARD_MIN_WIDTH}
        minHeight={SMART_STORYBOARD_MIN_HEIGHT}
        maxWidth={SMART_STORYBOARD_MAX_WIDTH}
        maxHeight={SMART_STORYBOARD_MAX_HEIGHT}
      />
    </div>
  );
});

SmartStoryboardNode.displayName = 'SmartStoryboardNode';
