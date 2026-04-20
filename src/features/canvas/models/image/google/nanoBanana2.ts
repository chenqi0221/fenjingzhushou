import type { ImageModelDefinition } from '../../types';
import { createFixedResolutionPricing } from '@/features/canvas/pricing';

export const GOOGLE_GEMINI_25_FLASH_NANO_BANANA_MODEL_ID = 'google/gemini-2.5-flash-image';

export const imageModel: ImageModelDefinition = {
  id: GOOGLE_GEMINI_25_FLASH_NANO_BANANA_MODEL_ID,
  mediaType: 'image',
  displayName: 'Nano Banana 2',
  providerId: 'google',
  description: 'Google Gemini 2.5 Flash Image (Nano Banana 2) 图像生成模型，支持文生图和图生图，高效快速',
  eta: '10s',
  expectedDurationMs: 10000,
  defaultAspectRatio: '1:1',
  defaultResolution: '1K',
  aspectRatios: [
    { value: '1:1', label: '1:1' },
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
    { value: '3:4', label: '3:4' },
    { value: '4:3', label: '4:3' },
  ],
  resolutions: [
    { value: '1K', label: '1K' },
  ],
  pricing: createFixedResolutionPricing({
    currency: 'CNY',
    standardRates: {
      '1K': 0.08,
    },
  }),
  resolveRequest: ({ referenceImageCount }) => ({
    requestModel: GOOGLE_GEMINI_25_FLASH_NANO_BANANA_MODEL_ID,
    modeLabel: referenceImageCount > 0 ? '图像编辑模式' : '文生图模式',
  }),
};
