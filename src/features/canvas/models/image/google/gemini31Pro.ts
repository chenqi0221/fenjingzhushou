import type { ImageModelDefinition } from '../../types';
import { createFixedResolutionPricing } from '@/features/canvas/pricing';

export const GOOGLE_GEMINI_31_PRO_MODEL_ID = 'google/gemini-3.1-pro-preview';

export const imageModel: ImageModelDefinition = {
  id: GOOGLE_GEMINI_31_PRO_MODEL_ID,
  mediaType: 'image',
  displayName: 'Gemini 3.1 Pro',
  providerId: 'google',
  description: 'Google Gemini 3.1 Pro 预览版，高性能，支持图像理解和分析',
  eta: '45s',
  expectedDurationMs: 45000,
  defaultAspectRatio: '1:1',
  defaultResolution: '2K',
  aspectRatios: [
    { value: '1:1', label: '1:1' },
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
    { value: '3:4', label: '3:4' },
    { value: '4:3', label: '4:3' },
  ],
  resolutions: [
    { value: '1K', label: '1K' },
    { value: '2K', label: '2K' },
  ],
  pricing: createFixedResolutionPricing({
    currency: 'CNY',
    standardRates: {
      '1K': 0.2,
      '2K': 0.3,
    },
  }),
  resolveRequest: ({ referenceImageCount }) => ({
    requestModel: GOOGLE_GEMINI_31_PRO_MODEL_ID,
    modeLabel: referenceImageCount > 0 ? '图像理解模式' : '文本模式',
  }),
};
