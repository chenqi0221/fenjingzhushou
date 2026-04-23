import React, { useState } from 'react';
import { tauriAiGateway } from '../infrastructure/tauriAiGateway';
import { ArrowLeft } from 'lucide-react';

console.log('[ResolutionTest] Component module loading...');

interface GeneratedImage {
  id: string;
  resolution: string;
  imageUrl: string;
  width?: number;
  height?: number;
}

interface ResolutionTestProps {
  onExit?: () => void;
}

export const ResolutionTest: React.FC<ResolutionTestProps> = ({ onExit }) => {
  console.log('[ResolutionTest] Component rendering');
  
  const [prompt, setPrompt] = useState('A beautiful landscape with mountains and lake');
  const [model, setModel] = useState('google/gemini-3-pro-image-preview');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [generating1K, setGenerating1K] = useState(false);
  const [generating4K, setGenerating4K] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generateImage = async (resolution: '1K' | '4K') => {
    console.log(`[ResolutionTest] generateImage called for ${resolution}`);
    setError(null);
    
    try {
      const providerId = model.split('/')[0];
      console.log(`[ResolutionTest] Calling tauriAiGateway.generateImage with:`, {
        prompt,
        model,
        size: resolution,
        aspectRatio,
        providerId
      });

      const result = await tauriAiGateway.generateImage({
        prompt,
        model,
        size: resolution,
        aspectRatio,
        providerId,
        referenceImages: undefined,
        extraParams: undefined,
      });
      
      console.log(`[ResolutionTest] ${resolution} generation succeeded, result length: ${result.length}`);

      const nodeId = `${resolution}-${Date.now()}`;

      const img = new Image();
      img.onload = () => {
        console.log(`[ResolutionTest] ${resolution} image loaded: ${img.width}x${img.height}`);
        setGeneratedImages(prev => [...prev, {
          id: nodeId,
          resolution,
          imageUrl: result,
          width: img.width,
          height: img.height,
        }]);
        if (resolution === '1K') setGenerating1K(false);
        else setGenerating4K(false);
      };
      img.onerror = (e) => {
        console.error(`[ResolutionTest] ${resolution} image failed to load:`, e);
        setGeneratedImages(prev => [...prev, {
          id: nodeId,
          resolution,
          imageUrl: result,
          width: undefined,
          height: undefined,
        }]);
        if (resolution === '1K') setGenerating1K(false);
        else setGenerating4K(false);
      };
      img.src = result;

    } catch (err) {
      console.error(`[ResolutionTest] ${resolution} generation failed with error:`, err);
      setError(err instanceof Error ? err.message : `生成失败: ${String(err)}`);
      if (resolution === '1K') setGenerating1K(false);
      else setGenerating4K(false);
    }
  };

  const generateBothResolutions = async () => {
    console.log('[ResolutionTest] generateBothResolutions called');
    setGenerating1K(true);
    setGenerating4K(true);
    try {
      await generateImage('1K');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await generateImage('4K');
    } catch (err) {
      console.error('[ResolutionTest] generateBothResolutions error:', err);
      setGenerating1K(false);
      setGenerating4K(false);
    }
  };

  const handleExit = () => {
    console.log('[ResolutionTest] Exit button clicked');
    if (onExit) {
      onExit();
    }
  };

  return (
    <div className="p-6 bg-surface-dark rounded-lg shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-text-dark">分辨率测试</h2>
        <button
          onClick={handleExit}
          className="flex items-center gap-1 px-3 py-1 bg-bg-dark text-text-dark rounded hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          退出
        </button>
      </div>
      
      <div className="mb-4">
        <label className="block mb-2 text-text-muted">提示词</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full p-3 border border-border-dark rounded bg-bg-dark text-text-dark focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          placeholder="输入图片描述..."
        />
      </div>

      <div className="mb-4">
        <label className="block mb-2 text-text-muted">模型</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full p-3 border border-border-dark rounded bg-bg-dark text-text-dark focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="google/gemini-2.5-flash">Nano Banana 2 (Gemini 3.1 Flash Image)</option>
          <option value="google/gemini-3-pro-image-preview">Nano Banana Pro (Gemini 3 Pro Image)</option>
          <option value="google/gemini-3.1-pro">Google Gemini 3.1 Pro</option>
          <option value="google/gemini-3.1-flash-lite">Google Gemini 3.1 Flash Lite</option>
          <option value="google/gemini-2.5-flash-image">Google Gemini 2.5 Flash Image</option>
          <option value="google/gemini-2-flash">Google Gemini 2 Flash</option>
          <option value="google/imagen-3.0-generate-002">Google Imagen 3.0 Generate (支持指定尺寸)</option>
          <option value="google/imagen-2.0-fast-generate-001">Google Imagen 2.0 Fast Generate (支持指定尺寸)</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block mb-2 text-text-muted">宽高比</label>
        <select
          value={aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value)}
          className="w-full p-3 border border-border-dark rounded bg-bg-dark text-text-dark focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="1:1">1:1</option>
          <option value="4:3">4:3</option>
          <option value="16:9">16:9</option>
        </select>
      </div>

      <div className="mb-4">
        <button
          onClick={generateBothResolutions}
          disabled={generating1K || generating4K}
          className="w-full py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {generating1K || generating4K ? '生成中...' : '生成 1K 和 4K 图片'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 text-red-300 rounded">
          <strong>错误:</strong> {error}
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4 text-text-dark">生成结果</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {generatedImages.length === 0 && (
            <div className="text-text-muted col-span-full">暂无生成结果，请点击上方按钮生成</div>
          )}
          {generatedImages.map((img) => (
            <div key={img.id} className="border border-border-dark rounded p-4 bg-bg-dark">
              <div className="font-medium mb-2 text-text-dark">分辨率: {img.resolution}</div>
              <div className="text-sm text-text-muted mb-2">
                实际尺寸: {img.width ? `${img.width}x${img.height} 像素` : '加载中或加载失败'}
              </div>
              <img 
                src={img.imageUrl} 
                alt={`Generated ${img.resolution}`} 
                className="max-w-full h-auto rounded"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

console.log('[ResolutionTest] Component module loaded');