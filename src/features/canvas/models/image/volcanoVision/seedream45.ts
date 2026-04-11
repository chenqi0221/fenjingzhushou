import type { ImageModelDefinition } from '../../types';

export const imageModel: ImageModelDefinition = {
  id: 'volcano-vision/ep-20260409234726-bktdp',
  providerId: 'volcano-vision',
  mediaType: 'image',
  displayName: 'Seedream 4.5',
  description: '火山方舟视觉 Seedream 4.5 模型，支持文生图和图生图',
  eta: '30s',
  resolutions: [
    { value: '0.5K', label: '0.5K' },
    { value: '1K', label: '1K' },
    { value: '2K', label: '2K' },
    { value: '4K', label: '4K' },
  ],
  defaultResolution: '2K',
  aspectRatios: [
    { value: '1:1', label: '1:1' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' },
  ],
  defaultAspectRatio: '1:1',
  expectedDurationMs: 30000,
  resolveRequest: () => {
    return {
      requestModel: 'ep-20260409234726-bktdp',
      modeLabel: '标准模式',
    };
  },
};
