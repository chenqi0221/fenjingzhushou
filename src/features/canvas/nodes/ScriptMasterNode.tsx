import {
  memo,
  useState,
  useCallback,
} from 'react';
import { type NodeProps, Handle, Position } from '@xyflow/react';
import { Film, Clapperboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  analyzeImage,
  ensureApiKey,
  chatCompletion,
} from '@/commands/ai';
import { imageUrlToDataUrl, compressImageForAIAnalysis } from '@/features/canvas/application/imageData';
import {
  CANVAS_NODE_TYPES,
  DEFAULT_NODE_WIDTH,
  type ScriptMasterNodeData,
  isUploadNode,
  isSmartStoryboardNode,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { useCanvasStore } from '@/stores/canvasStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showErrorDialog } from '@/features/canvas/application/errorDialog';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import {
  UiButton,
  UiTextAreaField,
  UiPanel,
  UiSelect,
} from '@/components/ui';
import {
  NODE_CONTROL_ICON_CLASS,
  NODE_CONTROL_PRIMARY_BUTTON_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';

const SCRIPT_MASTER_DEFAULT_MODEL = 'volcano/ep-20260410002744-29gfm';

const DURATION_OPTIONS = [
  { value: '5', label: '5秒' },
  { value: '10', label: '10秒' },
  { value: '15', label: '15秒' },
  { value: '20', label: '20秒' },
  { value: '25', label: '25秒' },
  { value: '30', label: '30秒' },
  { value: '35', label: '35秒' },
  { value: '40', label: '40秒' },
  { value: '45', label: '45秒' },
  { value: '50', label: '50秒' },
  { value: '55', label: '55秒' },
  { value: '60', label: '60秒' },
];

type ScriptMasterNodeProps = NodeProps & {
  id: string;
  data: ScriptMasterNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
};

const SCRIPT_MASTER_MIN_WIDTH = 320;
const SCRIPT_MASTER_MIN_HEIGHT = 420;
const SCRIPT_MASTER_MAX_WIDTH = 800;
const SCRIPT_MASTER_MAX_HEIGHT = 1200;
const SCRIPT_MASTER_HEADER_ADJUST = { x: 0, y: 0, scale: 1 };
const SCRIPT_MASTER_ICON_ADJUST = { x: 0, y: 0, scale: 0.95 };
const SCRIPT_MASTER_TITLE_ADJUST = { x: 0, y: 0, scale: 1 };

export const ScriptMasterNode = memo(({ id, data, selected, width, height }: ScriptMasterNodeProps) => {
  const { t } = useTranslation();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const edges = useCanvasStore((state) => state.edges);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const getNode = useCanvasStore((state) => state.getNode);
  const apiKeys = useSettingsStore((state) => state.apiKeys);

  const [isGenerating, setIsGenerating] = useState(false);

  const nodeData = data as ScriptMasterNodeData;

  const resolvedTitle = resolveNodeDisplayName(CANVAS_NODE_TYPES.scriptMaster, nodeData);

  const modelId = SCRIPT_MASTER_DEFAULT_MODEL;
  const duration = nodeData.duration || '10';

  const getUpstreamContent = useCallback(() => {
    const incomingEdges = edges.filter(edge => edge.target === id);
    const images: string[] = [];
    let text = '';

    for (const edge of incomingEdges) {
      const sourceNode = getNode(edge.source);
      if (!sourceNode) continue;

      if (isUploadNode(sourceNode) && sourceNode.data.imageUrl) {
        images.push(sourceNode.data.imageUrl);
      }

      if (isSmartStoryboardNode(sourceNode) && sourceNode.data.resultText) {
        text = sourceNode.data.resultText;
      }
    }

    return { images, text };
  }, [edges, id, getNode]);

  const handleGenerate = useCallback(async () => {
    const { images, text } = getUpstreamContent();

    if (!text && images.length === 0) {
      const errorMessage = t('scriptMaster.noContent');
      const errorTitle = t('scriptMaster.cannotGenerate');
      const errorDesc = t('scriptMaster.noContentDesc');
      showErrorDialog(errorMessage, errorTitle, errorDesc);
      return;
    }

    const provider = 'volcano';
    if (!apiKeys[provider] || !apiKeys[provider]?.trim()) {
      showErrorDialog(
        t('modelParams.providerKeyRequiredTitle'),
        t('modelParams.providerKeyRequiredTitle'),
        t('modelParams.providerKeyRequiredDesc', { provider }),
      );
      return;
    }

    await ensureApiKey(provider, apiKeys[provider]);

    setIsGenerating(true);

    try {
      let contextText = text;
      let imageAnalysis = '';

      if (!text && images.length > 0) {
        const imageForAnalysis = await compressImageForAIAnalysis(
          await imageUrlToDataUrl(images[0])
        );
        
        const analysisPrompt = `请仔细分析这张图片，描述：
1. 图片中的产品和场景
2. 整体风格和色调
3. 光线氛围
4. 构图特点
5. 目标受众和用途

请用简洁专业的语言描述。`;

        imageAnalysis = await analyzeImage(imageForAnalysis, modelId, analysisPrompt);
        contextText = imageAnalysis;
      }

      const scriptPrompt = `# Role: 资深商业短视频广告编剧

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
   - 拒绝推销感：严禁使用“大甩卖”、“买到就是赚到”等低端促销用语，保持品牌高级感。
   - 视觉优先：所有剧本必须基于输入的图片分析结果，确保文案与视觉高度契合。
   - 目标导向：内容必须针对目标受众（如设计师、批发商）的专业视角进行优化。
   - 情感共鸣：侧重于描述产品能为用户带来的生活质感提升，而非单纯的功能罗列。

2. 行为准则：
   - 逻辑严密：遵循“黄金三秒（钩子）-> 中部（价值/解决方案）-> 结尾（行动号召）”的结构。
   - 精准描述：如果图片中出现设计师或模特，必须设计合理的互动逻辑，使其成为品牌理念的传达者。
   - 极简表达：文案应留有空间感，配合画面留白，避免过度密集的旁白轰炸。

3. 限制条件：
   - 禁止术语：严禁在剧本中出现摄影器材或技术性指令（如“35mm镜头”、“大光圈”）。
   - 字数限制：严格控制在目标时长对应的语速内（通常15秒约60字，30秒约120字）。
   - 格式统一：仅输出“旁白/配音（Voiceover）”和“情景描述（Scene Description）”。

## Workflows

- 目标: 将静态视觉转化为具有感染力的商业广告剧本。
- 步骤 1: 分析输入的【图片描述】与【产品卖点】，提取视觉核心（如光影质感、材质细节）。
- 步骤 2: 构建钩子，将核心卖点转化为受众关注的审美诉求或痛点共鸣。
- 步骤 3: 撰写中部内容，将技术工艺升级为“品质生活”的描述。
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
${contextText}

请根据以上信息，创作一个${duration}秒的商业宣传视频脚本，使用纯文本格式输出，保持高端品牌调性。`;

      const result = await chatCompletion(
        [
          { role: 'system', content: scriptPrompt },
          { role: 'user', content: '请生成视频脚本' }
        ],
        modelId,
        { temperature: 0.7 }
      );

      updateNodeData(id, { 
        resultText: result,
        isGenerating: false,
      });
    } catch (error) {
      console.error('[ScriptMaster] Generation error:', error);
      showErrorDialog(
        t('scriptMaster.generateFailed'),
        t('scriptMaster.cannotGenerate'),
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsGenerating(false);
    }
  }, [getUpstreamContent, apiKeys, modelId, duration, id, updateNodeData, t]);

  const resolvedNodeWidth = Math.max(
    SCRIPT_MASTER_MIN_WIDTH,
    Math.min(SCRIPT_MASTER_MAX_WIDTH, width ?? DEFAULT_NODE_WIDTH)
  );
  const resolvedNodeHeight = Math.max(
    SCRIPT_MASTER_MIN_HEIGHT,
    Math.min(SCRIPT_MASTER_MAX_HEIGHT, height ?? 420)
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
      onClick={() => setSelectedNode(id)}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Film className="h-4 w-4" />}
        titleText={resolvedTitle}
        headerAdjust={SCRIPT_MASTER_HEADER_ADJUST}
        iconAdjust={SCRIPT_MASTER_ICON_ADJUST}
        titleAdjust={SCRIPT_MASTER_TITLE_ADJUST}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <div className="my-2 flex items-center gap-2">
        <span className="text-xs text-text-muted">{t('scriptMaster.duration')}:</span>
        <div className="flex-1">
          <UiSelect
            value={duration}
            onChange={(e) => updateNodeData(id, { duration: e.target.value })}
            className="h-7 text-xs"
          >
            {DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </UiSelect>
        </div>
      </div>

      <UiPanel className="flex-1 p-2 overflow-auto">
        <UiTextAreaField
          value={nodeData.resultText ?? ''}
          onChange={(e) => updateNodeData(id, { resultText: e.target.value })}
          placeholder={t('scriptMaster.placeholder')}
          className="h-full min-h-[180px] text-sm font-mono"
        />
      </UiPanel>

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
          <Clapperboard className={NODE_CONTROL_ICON_CLASS} strokeWidth={2.8} />
          {isGenerating ? t('ai.generating') : t('scriptMaster.generateButton')}
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
        minWidth={SCRIPT_MASTER_MIN_WIDTH}
        minHeight={SCRIPT_MASTER_MIN_HEIGHT}
        maxWidth={SCRIPT_MASTER_MAX_WIDTH}
        maxHeight={SCRIPT_MASTER_MAX_HEIGHT}
      />
    </div>
  );
});

ScriptMasterNode.displayName = 'ScriptMasterNode';
