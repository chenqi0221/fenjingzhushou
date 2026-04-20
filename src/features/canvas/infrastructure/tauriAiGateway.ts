import {
  generateImage,
  getGenerateImageJob,
  setApiKey,
  submitGenerateImageJob,
  analyzeImage,
} from '@/commands/ai';
import { imageUrlToDataUrl, compressImageForAIAnalysis } from '@/features/canvas/application/imageData';

import type { AiGateway, GenerateImagePayload } from '../application/ports';

async function normalizeReferenceImages(payload: GenerateImagePayload): Promise<string[] | undefined> {
  return payload.referenceImages
    ? await Promise.all(
      payload.referenceImages.map(async (imageUrl) => {
        const normalized = await imageUrlToDataUrl(imageUrl);
        return normalized;
      })
    )
    : undefined;
}

export const tauriAiGateway: AiGateway = {
  setApiKey,
  generateImage: async (payload: GenerateImagePayload) => {
    const normalizedReferenceImages = await normalizeReferenceImages(payload);

    return await generateImage({
      prompt: payload.prompt,
      model: payload.model,
      size: payload.size,
      aspect_ratio: payload.aspectRatio,
      reference_images: normalizedReferenceImages,
      extra_params: payload.extraParams,
    });
  },
  submitGenerateImageJob: async (payload: GenerateImagePayload) => {
    const normalizedReferenceImages = await normalizeReferenceImages(payload);
    return await submitGenerateImageJob({
      prompt: payload.prompt,
      model: payload.model,
      size: payload.size,
      aspect_ratio: payload.aspectRatio,
      reference_images: normalizedReferenceImages,
      extra_params: payload.extraParams,
    });
  },
  getGenerateImageJob,
  analyzeImage: async (imageUrl: string, model?: string, prompt?: string) => {
    // 将本地路径转换为 base64 格式，并压缩大图
    const normalizedImageUrl = await imageUrlToDataUrl(imageUrl);
    const compressedImageUrl = await compressImageForAIAnalysis(normalizedImageUrl);
    return await analyzeImage(compressedImageUrl, model, prompt);
  },
};
