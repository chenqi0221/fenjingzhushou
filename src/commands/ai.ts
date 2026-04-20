import { invoke, isTauri } from '@tauri-apps/api/core';

export interface GenerateRequest {
  prompt: string;
  model: string;
  size: string;
  aspect_ratio: string;
  reference_images?: string[];
  extra_params?: Record<string, unknown>;
}

export type GenerationJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'not_found';

export interface GenerationJobStatus {
  job_id: string;
  status: GenerationJobState;
  result?: string | null;
  error?: string | null;
}

const BASE64_PREVIEW_HEAD = 96;
const BASE64_PREVIEW_TAIL = 24;

function truncateText(value: string, max = 200): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...(${value.length} chars)`;
}

function truncateBase64Like(value: string): string {
  if (!value) {
    return value;
  }

  if (value.startsWith('data:')) {
    const [meta, payload = ''] = value.split(',', 2);
    if (payload.length <= BASE64_PREVIEW_HEAD + BASE64_PREVIEW_TAIL) {
      return value;
    }
    return `${meta},${payload.slice(0, BASE64_PREVIEW_HEAD)}...${payload.slice(-BASE64_PREVIEW_TAIL)}(${payload.length} chars)`;
  }

  const base64Like = /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 256;
  if (!base64Like) {
    return truncateText(value, 280);
  }

  return `${value.slice(0, BASE64_PREVIEW_HEAD)}...${value.slice(-BASE64_PREVIEW_TAIL)}(${value.length} chars)`;
}

function sanitizeGenerateRequestForLog(request: GenerateRequest): Record<string, unknown> {
  return {
    prompt: truncateText(request.prompt, 240),
    model: request.model,
    size: request.size,
    aspect_ratio: request.aspect_ratio,
    reference_images_count: request.reference_images?.length ?? 0,
    reference_images_preview: (request.reference_images ?? []).map((item) =>
      truncateBase64Like(item)
    ),
    extra_params: request.extra_params ?? {},
  };
}

interface ErrorWithDetails extends Error {
  details?: string;
}

function normalizeInvokeError(error: unknown): { message: string; details?: string } {
  if (error instanceof Error) {
    const detailsText =
      'details' in error
        ? typeof (error as { details?: unknown }).details === 'string'
          ? (error as { details?: string }).details
          : undefined
        : undefined;
    return { message: error.message || 'Generation failed', details: detailsText };
  }

  if (typeof error === 'string') {
    return { message: error || 'Generation failed', details: error || undefined };
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message =
      (typeof record.message === 'string' && record.message) ||
      (typeof record.error === 'string' && record.error) ||
      (typeof record.msg === 'string' && record.msg) ||
      'Generation failed';
    let details: string | undefined;
    try {
      details = truncateText(JSON.stringify(record, null, 2), 2000);
    } catch {
      details = truncateText(String(record), 2000);
    }
    return { message, details };
  }

  return { message: 'Generation failed' };
}

function createErrorWithDetails(message: string, details?: string): ErrorWithDetails {
  const error: ErrorWithDetails = new Error(message);
  if (details) {
    error.details = details;
  }
  return error;
}

export async function setApiKey(provider: string, apiKey: string): Promise<void> {
  console.info('[AI] set_api_key', {
    provider,
    apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}***${apiKey.slice(-2)}` : '',
    tauri: isTauri(),
  });
  if (!isTauri()) {
    // 在非Tauri环境中，API密钥设置会被忽略
    console.warn('[AI] Running in non-Tauri environment, API key setting will be ignored');
    return;
  }
  return await invoke('set_api_key', { provider, apiKey });
}

// 缓存已同步的 API key，避免重复调用
const syncedApiKeys = new Map<string, string>();

export async function ensureApiKey(provider: string, apiKey: string): Promise<void> {
  const cachedKey = syncedApiKeys.get(provider);
  if (cachedKey === apiKey) {
    return; // 已经同步过了
  }
  if (apiKey && apiKey.trim()) {
    try {
      await invoke('set_api_key', { provider, apiKey });
      syncedApiKeys.set(provider, apiKey);
      console.info(`[AI] Synced API key for ${provider}`);
    } catch (e) {
      console.warn(`[AI] Failed to sync API key for ${provider}:`, e);
    }
  }
}

export async function generateImage(request: GenerateRequest): Promise<string> {
  const startedAt = performance.now();
  console.info('[AI] generate_image request', {
    ...sanitizeGenerateRequestForLog(request),
    tauri: isTauri(),
  });

  if (!isTauri()) {
    throw new Error('当前不是 Tauri 容器环境，请使用 `npm run tauri dev` 启动');
  }

  try {
    const rawResult = await invoke<unknown>('generate_image', { request });
    if (typeof rawResult !== 'string') {
      throw createErrorWithDetails(
        'Generation returned non-string payload',
        truncateText(
          (() => {
            try {
              return JSON.stringify(rawResult, null, 2);
            } catch {
              return String(rawResult);
            }
          })(),
          2000
        )
      );
    }
    const result = rawResult.trim();
    if (!result) {
      throw createErrorWithDetails('Generation returned empty image source');
    }
    const elapsedMs = Math.round(performance.now() - startedAt);
    console.info('[AI] generate_image success', {
      elapsedMs,
      resultPreview: truncateText(result, 220),
    });
    return result;
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    const normalizedError = normalizeInvokeError(error);
    console.error('[AI] generate_image failed', {
      elapsedMs,
      request: sanitizeGenerateRequestForLog(request),
      error,
      normalizedError,
    });
    const commandError: ErrorWithDetails = new Error(normalizedError.message);
    commandError.details = normalizedError.details;
    throw commandError;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  max_tokens?: number;
}

export async function chatCompletion(
  messages: ChatMessage[],
  model?: string,
  options?: ChatCompletionOptions
): Promise<string> {
  console.info('[AI] chat_completion request', {
    model,
    messages: messages.map(m => ({ role: m.role, content: truncateText(m.content, 100) })),
    options,
    tauri: isTauri(),
  });

  if (!isTauri()) {
    console.warn('[AI] Running in non-Tauri environment, returning mock chat result');
    return JSON.stringify({
      title: "模拟视频脚本",
      duration: 10,
      scenes: [
        { scene: 1, seconds: 3, shot: "全景开场", content: "展示产品全景", voiceover: "欢迎观看" },
        { scene: 2, seconds: 4, shot: "特写展示", content: "产品细节", voiceover: "精心打造" },
        { scene: 3, seconds: 3, shot: "结束画面", content: "品牌logo", voiceover: "感谢观看" }
      ],
      music: "温暖抒情",
      mood: "专业高端"
    }, null, 2);
  }

  try {
    const result = await invoke<string>('chat_completion', { 
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      model,
      options: options ? {
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens,
      } : null,
    });
    if (typeof result !== 'string') {
      throw createErrorWithDetails('Chat completion returned non-string payload');
    }
    return result;
  } catch (error) {
    const normalizedError = normalizeInvokeError(error);
    console.error('[AI] chat_completion failed', {
      error,
      normalizedError,
    });
    const commandError: ErrorWithDetails = new Error(normalizedError.message);
    commandError.details = normalizedError.details;
    throw commandError;
  }
}

export async function submitGenerateImageJob(request: GenerateRequest): Promise<string> {
  console.info('[AI] submit_generate_image_job request', {
    ...sanitizeGenerateRequestForLog(request),
    tauri: isTauri(),
  });

  if (!isTauri()) {
    throw new Error('当前不是 Tauri 容器环境，请使用 `npm run tauri dev` 启动');
  }

  const jobId = await invoke<string>('submit_generate_image_job', { request });
  if (typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('submit_generate_image_job returned invalid job id');
  }
  return jobId.trim();
}

export async function getGenerateImageJob(jobId: string): Promise<GenerationJobStatus> {
  if (!isTauri()) {
    throw new Error('当前不是 Tauri 容器环境，请使用 `npm run tauri dev` 启动');
  }

  const result = await invoke<GenerationJobStatus>('get_generate_image_job', { jobId });
  if (!result || typeof result !== 'object' || typeof result.status !== 'string') {
    throw new Error('get_generate_image_job returned invalid payload');
  }
  return result;
}

export async function listModels(): Promise<string[]> {
  if (!isTauri()) {
    // 在非Tauri环境中返回模拟的模型列表
    console.warn('[AI] Running in non-Tauri environment, returning mock model list');
    return [
      'google/gemini-2.5-flash-image',
    ];
  }
  return await invoke('list_models');
}

export async function analyzeImage(imageUrl: string, model?: string, prompt?: string): Promise<string> {
  console.info('[AI] analyze_image request', {
    imageUrl: truncateBase64Like(imageUrl),
    model,
    prompt: prompt ? truncateText(prompt, 100) : undefined,
    tauri: isTauri(),
  });

  if (!isTauri()) {
    // 在非Tauri环境中返回模拟的分析结果
    console.warn('[AI] Running in non-Tauri environment, returning mock analysis result');
    return '这是一个模拟的图像分析结果。\n\n在实际的 Tauri 环境中，系统会使用 AI 模型对图像进行分析，并返回详细的分析结果。\n\n要体验完整的图像分析功能，请使用 `npm run tauri dev` 启动项目。';
  }

  try {
    const result = await invoke<string>('analyze_image', { imageUrl, model, prompt });
    if (typeof result !== 'string') {
      throw createErrorWithDetails('Analysis returned non-string payload');
    }
    return result;
  } catch (error) {
    const normalizedError = normalizeInvokeError(error);
    console.error('[AI] analyze_image failed', {
      error,
      normalizedError,
    });
    const commandError: ErrorWithDetails = new Error(normalizedError.message);
    commandError.details = normalizedError.details;
    throw commandError;
  }
}
