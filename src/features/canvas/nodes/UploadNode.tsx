import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type SyntheticEvent,
} from 'react';
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  useViewport,
  type NodeProps,
} from '@xyflow/react';
import { Upload, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  CANVAS_NODE_TYPES,
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  type UploadImageNodeData,
} from '@/features/canvas/domain/canvasNodes';
import {
  resolveMinEdgeFittedSize,
  resolveResizeMinConstraintsByAspect,
} from '@/features/canvas/application/imageNodeSizing';
import {
  isNodeUsingDefaultDisplayName,
  resolveNodeDisplayName,
} from '@/features/canvas/domain/nodeDisplay';
import { canvasAiGateway, canvasEventBus } from '@/features/canvas/application/canvasServices';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import {
  prepareNodeImageFromFile,
  resolveImageDisplayUrl,
  shouldUseOriginalImageByZoom,
} from '@/features/canvas/application/imageData';
import { CanvasNodeImage } from '@/features/canvas/ui/CanvasNodeImage';
import { useCanvasStore } from '@/stores/canvasStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showErrorDialog } from '@/features/canvas/application/errorDialog';
import {
  DEFAULT_IMAGE_MODEL_ID,
  getImageModel,
  listImageModels,
} from '@/features/canvas/models';
import {
  NODE_CONTROL_CHIP_CLASS,
  NODE_CONTROL_MODEL_CHIP_CLASS,
  NODE_CONTROL_PARAMS_CHIP_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';
import { ModelParamsControls } from '@/features/canvas/ui/ModelParamsControls';

type UploadNodeProps = NodeProps & {
  id: string;
  data: UploadImageNodeData;
  selected?: boolean;
};

function resolveNodeDimension(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1) {
    return Math.round(value);
  }
  return fallback;
}

function resolveDroppedImageFile(event: DragEvent<HTMLElement>): File | null {
  const directFile = event.dataTransfer.files?.[0];
  if (directFile) {
    return directFile;
  }

  const item = Array.from(event.dataTransfer.items || []).find(
    (candidate) => candidate.kind === 'file' && candidate.type.startsWith('image/')
  );
  return item?.getAsFile() ?? null;
}

export const UploadNode = memo(({ id, data, selected, width, height }: UploadNodeProps) => {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const findNodePosition = useCanvasStore((state) => state.findNodePosition);
  const useUploadFilenameAsNodeTitle = useSettingsStore((state) => state.useUploadFilenameAsNodeTitle);
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const imageAnalysisPrompt = useSettingsStore((state) => state.imageAnalysisPrompt);
  const { zoom } = useViewport();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadSequenceRef = useRef(0);
  const uploadPerfRef = useRef<{
    sequence: number;
    name: string;
    size: number;
    startedAt: number;
    transientLoaded: boolean;
    stableLoaded: boolean;
  } | null>(null);
  const [transientPreviewUrl, setTransientPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 获取可用的图像模型列表
  const imageModels = useMemo(() => listImageModels(), []);
  const selectedModelId = data.model || DEFAULT_IMAGE_MODEL_ID;
  const selectedModel = useMemo(() => getImageModel(selectedModelId), [selectedModelId]);

  const handleModelChange = useCallback((modelId: string) => {
    updateNodeData(id, { model: modelId });
  }, [id, updateNodeData]);

  const resolvedAspectRatio = data.aspectRatio || '1:1';
  const compactSize = resolveMinEdgeFittedSize(resolvedAspectRatio, {
    minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
    minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
  });
  const resolvedWidth = resolveNodeDimension(width, compactSize.width);
  const resolvedHeight = resolveNodeDimension(height, compactSize.height);
  const resizeConstraints = resolveResizeMinConstraintsByAspect(resolvedAspectRatio, {
    minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
    minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
  });
  const resizeMinWidth = resizeConstraints.minWidth;
  const resizeMinHeight = resizeConstraints.minHeight;
  const resolvedTitle = useMemo(() => {
    const sourceFileName = typeof data.sourceFileName === 'string' ? data.sourceFileName.trim() : '';
    if (
      useUploadFilenameAsNodeTitle
      && sourceFileName
      && isNodeUsingDefaultDisplayName(CANVAS_NODE_TYPES.upload, data)
    ) {
      return sourceFileName;
    }

    return resolveNodeDisplayName(CANVAS_NODE_TYPES.upload, data);
  }, [data, useUploadFilenameAsNodeTitle]);

  const clearTransientPreview = useCallback(() => {
    setTransientPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      const sequence = uploadSequenceRef.current + 1;
      uploadSequenceRef.current = sequence;
      const started = performance.now();
      clearTransientPreview();
      const optimisticPreviewUrl = URL.createObjectURL(file);
      setTransientPreviewUrl(optimisticPreviewUrl);
      uploadPerfRef.current = {
        sequence,
        name: file.name,
        size: file.size,
        startedAt: started,
        transientLoaded: false,
        stableLoaded: false,
      };
      requestAnimationFrame(() => {
        const perf = uploadPerfRef.current;
        if (!perf || perf.sequence !== sequence) {
          return;
        }
        console.info(
          `[upload-perf][e2e] preview-state-committed nodeId=${id} name="${file.name}" elapsed=${Math.round(performance.now() - started)}ms`
        );
      });

      try {
        const prepared = await prepareNodeImageFromFile(file);
        const nextData: Partial<UploadImageNodeData> = {
          imageUrl: prepared.imageUrl,
          previewImageUrl: prepared.previewImageUrl,
          aspectRatio: prepared.aspectRatio || '1:1',
          sourceFileName: file.name,
        };
        if (useUploadFilenameAsNodeTitle) {
          nextData.displayName = file.name;
        }
        updateNodeData(id, nextData);

        console.info(
          `[upload-perf][node] processFile success nodeId=${id} name="${file.name}" size=${file.size}B elapsed=${Math.round(performance.now() - started)}ms`
        );
      } catch (error) {
        if (uploadSequenceRef.current === sequence) {
          clearTransientPreview();
        }
        console.error(
          `[upload-perf][node] processFile failed nodeId=${id} name="${file.name}" size=${file.size}B elapsed=${Math.round(performance.now() - started)}ms`,
          error
        );
        throw error;
      }
    },
    [clearTransientPreview, id, updateNodeData, useUploadFilenameAsNodeTitle]
  );

  const handleImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const perf = uploadPerfRef.current;
    if (!perf) {
      return;
    }

    const displayedSrc = event.currentTarget.currentSrc || event.currentTarget.src || '';
    const isTransient = displayedSrc.startsWith('blob:');
    const now = performance.now();

    if (isTransient && !perf.transientLoaded) {
      perf.transientLoaded = true;
      console.info(
        `[upload-perf][e2e] first-visible transient nodeId=${id} name="${perf.name}" size=${perf.size}B elapsed=${Math.round(now - perf.startedAt)}ms`
      );
      requestAnimationFrame(() => {
        const nextPerf = uploadPerfRef.current;
        if (!nextPerf || nextPerf.sequence !== perf.sequence) {
          return;
        }
        console.info(
          `[upload-perf][e2e] first-painted transient nodeId=${id} name="${nextPerf.name}" elapsed=${Math.round(performance.now() - nextPerf.startedAt)}ms`
        );
      });
      return;
    }

    if (!isTransient && !perf.stableLoaded) {
      perf.stableLoaded = true;
      console.info(
        `[upload-perf][e2e] stable-visible nodeId=${id} name="${perf.name}" size=${perf.size}B elapsed=${Math.round(now - perf.startedAt)}ms`
      );
      if (uploadSequenceRef.current === perf.sequence) {
        clearTransientPreview();
      }
      requestAnimationFrame(() => {
        const nextPerf = uploadPerfRef.current;
        if (!nextPerf || nextPerf.sequence !== perf.sequence) {
          return;
        }
        console.info(
          `[upload-perf][e2e] stable-painted nodeId=${id} name="${nextPerf.name}" elapsed=${Math.round(performance.now() - nextPerf.startedAt)}ms`
        );
      });
    }
  }, [clearTransientPreview, id]);

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const file = resolveDroppedImageFile(event);
      if (!file || !file.type.startsWith('image/')) {
        return;
      }

      await processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith('image/')) {
        return;
      }

      await processFile(file);
      event.target.value = '';
    },
    [processFile]
  );

  useEffect(() => {
    return canvasEventBus.subscribe('upload-node/reupload', ({ nodeId }) => {
      if (nodeId !== id) {
        return;
      }
      inputRef.current?.click();
    });
  }, [id]);

  useEffect(() => {
    return canvasEventBus.subscribe('upload-node/paste-image', ({ nodeId, file }) => {
      if (nodeId !== id || !file.type.startsWith('image/')) {
        return;
      }
      void processFile(file);
    });
  }, [id, processFile]);

  const handleAnalyzeImage = useCallback(async () => {
    if (!data.imageUrl) {
      return;
    }

    // 获取所有配置了API密钥的提供者
    const availableProviders = Object.entries(apiKeys)
      .filter(([_, key]) => key && key.trim())
      .map(([provider]) => provider);

    if (availableProviders.length === 0) {
      const errorMessage = '请在设置中填写至少一个 API Key';
      void showErrorDialog(errorMessage, '错误');
      return;
    }

    setIsAnalyzing(true);

    try {
      // 按优先级顺序尝试提供者
      const providerPriority = ['google'];
      const providersToTry = providerPriority.filter(p => availableProviders.includes(p));

      let lastError: any = null;

      for (const providerId of providersToTry) {
        const apiKey = apiKeys[providerId]!;

        try {
          // 设置API密钥
          console.log('[UploadNode] Setting API key for provider:', providerId, 'key prefix:', apiKey.substring(0, 8));
          await canvasAiGateway.setApiKey(providerId, apiKey);

          // 使用节点数据中选择的模型进行图像分析
          const analysisModel = data.model || DEFAULT_IMAGE_MODEL_ID;

          console.log('[UploadNode] Starting image analysis with model:', analysisModel, 'provider:', providerId);

          // 分析图像，使用指定的模型和提示词
          const analysisResult = await canvasAiGateway.analyzeImage(data.imageUrl, analysisModel, imageAnalysisPrompt);

          // 同时更新自己的 analysisResult 字段，供智能分镜节点引用
          updateNodeData(id, { analysisResult });

          // 创建文本注释节点
          const newNodePosition = findNodePosition(id, 300, 180);
          const textNodeId = addNode(
            CANVAS_NODE_TYPES.textAnnotation,
            newNodePosition,
            {
              displayName: '图像分析结果',
              content: analysisResult,
            }
          );
          
          // 连接到当前节点
          addEdge(id, textNodeId);

          // 成功后直接返回
          return;
        } catch (error) {
          console.error(`使用 ${providerId} 进行图像分析失败:`, error);
          lastError = error;
          // 继续尝试下一个提供者
        }
      }

      // 所有提供者都失败了，显示错误信息
      if (lastError) {
        console.error('所有API提供者都失败了:', lastError);
        // 获取更详细的错误信息
        let errorMessage = '图像分析失败，请检查API Key是否正确或网络连接是否正常';
        if (lastError instanceof Error) {
          errorMessage = lastError.message || errorMessage;
          if ('details' in lastError && lastError.details) {
            errorMessage += `\n详细信息: ${lastError.details}`;
          }
        }
        void showErrorDialog(errorMessage, '错误');
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [id, data.imageUrl, data.model, apiKeys, imageAnalysisPrompt, addNode, addEdge, findNodePosition]);

  const handleNodeClick = useCallback(() => {
    setSelectedNode(id);
    if (!data.imageUrl && !transientPreviewUrl) {
      inputRef.current?.click();
    }
  }, [data.imageUrl, id, setSelectedNode, transientPreviewUrl]);

  useEffect(() => () => {
    uploadPerfRef.current = null;
    clearTransientPreview();
  }, [clearTransientPreview]);

  const imageSource = useMemo(() => {
    if (transientPreviewUrl) {
      return transientPreviewUrl;
    }
    const preferOriginal = shouldUseOriginalImageByZoom(zoom);
    const picked = preferOriginal
      ? data.imageUrl || data.previewImageUrl
      : data.previewImageUrl || data.imageUrl;
    return picked ? resolveImageDisplayUrl(picked) : null;
  }, [data.imageUrl, data.previewImageUrl, transientPreviewUrl, zoom]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, resolvedHeight, resolvedWidth, updateNodeInternals]);

  return (
    <div
      className={`
        group relative flex h-full flex-col overflow-visible rounded-[var(--node-radius)] border bg-surface-dark/90 p-2 transition-colors duration-150
        ${selected
          ? 'border-accent shadow-[0_0_0_1px_rgba(59,130,246,0.32)]'
          : 'border-[rgba(15,23,42,0.22)] hover:border-[rgba(15,23,42,0.34)] dark:border-[rgba(255,255,255,0.22)] dark:hover:border-[rgba(255,255,255,0.34)]'}
      `}
      style={{ width: `${resolvedWidth}px`, height: `${resolvedHeight}px` }}
      onClick={handleNodeClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Upload className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
        rightSlot={
          data.imageUrl ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleAnalyzeImage();
              }}
              disabled={isAnalyzing}
              className="p-1 rounded hover:bg-bg-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('node.upload.analyzeImage')}
            >
              <Brain className="h-4 w-4 text-text-muted hover:text-text-dark" />
            </button>
          ) : undefined
        }
      />

      {/* 图片显示区域 */}
      <div className="relative min-h-0 flex-1 rounded-lg border border-[rgba(255,255,255,0.1)] bg-bg-dark/45 overflow-hidden">
        {data.imageUrl || transientPreviewUrl ? (
          <CanvasNodeImage
            src={imageSource ?? ''}
            viewerSourceUrl={data.imageUrl ? resolveImageDisplayUrl(data.imageUrl) : null}
            alt={t('node.upload.uploadedAlt')}
            className="h-full w-full object-contain"
            onLoad={handleImageLoad}
          />
        ) : (
          <label className="block h-full w-full cursor-pointer">
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted/85">
              <Upload className="h-7 w-7 opacity-60" />
              <span className="px-3 text-center text-[12px] leading-6">{t('node.upload.hint')}</span>
            </div>
          </label>
        )}
      </div>

      {/* 模型选择器 */}
      {data.imageUrl ? (
        <div className="mt-2 flex shrink-0 items-center gap-1">
          <ModelParamsControls
            imageModels={imageModels}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            hideResolutionAndRatio={true}
            triggerSize="sm"
            chipClassName={NODE_CONTROL_CHIP_CLASS}
            modelChipClassName={NODE_CONTROL_MODEL_CHIP_CLASS}
            paramsChipClassName={NODE_CONTROL_PARAMS_CHIP_CLASS}
          />
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-surface-dark !bg-accent"
      />
      <NodeResizeHandle
        minWidth={resizeMinWidth}
        minHeight={resizeMinHeight}
        maxWidth={1400}
        maxHeight={1400}
      />
    </div>
  );
});

UploadNode.displayName = 'UploadNode';
