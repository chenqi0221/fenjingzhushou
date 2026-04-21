import type { ImageModelDefinition } from '../../types';
import { createFixedResolutionPricing } from '@/features/canvas/pricing';

export const GOOGLE_GEMINI_3_PRO_IMAGE_MODEL_ID = 'google/gemini-3-pro-image-preview';

export const imageModel: ImageModelDefinition = {
  id: GOOGLE_GEMINI_3_PRO_IMAGE_MODEL_ID,
  mediaType: 'image',
  displayName: 'Nano Banana Pro',
  providerId: 'google',
  description: 'Google Gemini 3 Pro Image 最高画质图像生成模型，支持 4K 分辨率和精细控制',
  eta: '60s',
  expectedDurationMs: 60000,
  defaultAspectRatio: '1:1',
  defaultResolution: '2K',
  aspectRatios: [
    { value: '1:1', label: '1:1' },
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
    { value: '3:4', label: '3:4' },
    { value: '4:3', label: '4:3' },
    { value: '21:9', label: '21:9' },
  ],
  resolutions: [
    { value: '1K', label: '1K' },
    { value: '2K', label: '2K' },
    { value: '4K', label: '4K' },
  ],
  pricing: createFixedResolutionPricing({
    currency: 'CNY',
    standardRates: {
      '1K': 0.15,
      '2K': 0.25,
      '4K': 0.40,
    },
  }),
  resolveRequest: ({ referenceImageCount }) => ({
    requestModel: GOOGLE_GEMINI_3_PRO_IMAGE_MODEL_ID,
    modeLabel: referenceImageCount > 0 ? '图像编辑模式' : '文生图模式',
  }),
};
