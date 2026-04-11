import type { ImageModelDefinition } from '../../types';

const VOLCANO_SEEDREAM45_MODEL_ID = 'volcano/ep-20260409234726-bktdp';

const VOLCANO_ASPECT_RATIOS = [
  '21:9',
  '16:9',
  '3:2',
  '4:3',
  '5:4',
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '9:16',
] as const;

export const imageModel: ImageModelDefinition = {
  id: VOLCANO_SEEDREAM45_MODEL_ID,
  mediaType: 'image',
  displayName: 'Seedream 4.5 (Volcano Ark)',
  providerId: 'volcano',
  description: '火山方舟 · Seedream 4.5 视觉模型',
  eta: '30s',
  expectedDurationMs: 30000,
  defaultAspectRatio: '1:1',
  defaultResolution: '2K',
  aspectRatios: VOLCANO_ASPECT_RATIOS.map((value) => ({ value, label: value })),
  resolutions: [
    { value: '0.5K', label: '0.5K' },
    { value: '1K', label: '1K' },
    { value: '2K', label: '2K' },
    { value: '4K', label: '4K' },
  ],
  extraParamsSchema: [
    {
      key: 'temperature',
      label: 'Temperature',
      labelKey: 'modelParams.temperature',
      type: 'number',
      defaultValue: 0.7,
      min: 0,
      max: 1,
      step: 0.1,
    },
    {
      key: 'max_tokens',
      label: 'Max Tokens',
      labelKey: 'modelParams.maxTokens',
      type: 'number',
      defaultValue: 1024,
      min: 1,
      max: 4096,
      step: 1,
    },
  ],
  defaultExtraParams: {
    temperature: 0.7,
    max_tokens: 1024,
  },
  resolveRequest: ({ referenceImageCount }) => ({
    requestModel: VOLCANO_SEEDREAM45_MODEL_ID,
    modeLabel: referenceImageCount > 0 ? '编辑模式' : '生成模式',
  }),
};