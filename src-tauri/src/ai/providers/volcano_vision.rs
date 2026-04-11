use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::ai::error::AIError;
use crate::ai::{AIProvider, GenerateRequest, ProviderTaskHandle, ProviderTaskPollResult, ProviderTaskSubmission};

const BASE_URL: &str = "https://ark.cn-beijing.volces.com/api/v3";
const IMAGES_GENERATIONS_PATH: &str = "/images/generations";

pub struct VolcanoVisionProvider {
    client: Client,
    api_key: Arc<RwLock<Option<String>>>,
}

impl VolcanoVisionProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            api_key: Arc::new(RwLock::new(None)),
        }
    }

    fn decode_file_url_path(value: &str) -> String {
        let raw = value.trim_start_matches("file://");
        let decoded = urlencoding::decode(raw)
            .map(|result| result.into_owned())
            .unwrap_or_else(|_| raw.to_string());
        let normalized = if decoded.starts_with('/')
            && decoded.len() > 2
            && decoded.as_bytes().get(2) == Some(&b':')
        {
            &decoded[1..]
        } else {
            &decoded
        };
        normalized.to_string()
    }

    fn sanitize_model(model: &str) -> String {
        model
            .split_once('/')
            .map(|(_, bare)| bare.to_string())
            .unwrap_or_else(|| model.to_string())
    }

    fn source_to_bytes(source: &str) -> Result<Vec<u8>, String> {
        let trimmed = source.trim();
        if trimmed.is_empty() {
            return Err("source is empty".to_string());
        }

        if let Some((meta, payload)) = trimmed.split_once(',') {
            if meta.starts_with("data:") && meta.ends_with(";base64") && !payload.is_empty() {
                return STANDARD
                    .decode(payload)
                    .map_err(|err| format!("invalid data-url base64 payload: {}", err));
            }
        }

        let likely_base64 = trimmed.len() > 256
            && trimmed
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '/' || ch == '=');
        if likely_base64 {
            return STANDARD
                .decode(trimmed)
                .map_err(|err| format!("invalid base64 payload: {}", err));
        }

        if trimmed.starts_with("asset://")
            || trimmed.starts_with("tauri://")
            || trimmed.starts_with("app://")
        {
            return Err(format!("unsupported local protocol source: {}", trimmed));
        }

        let path = if trimmed.starts_with("file://") {
            PathBuf::from(Self::decode_file_url_path(trimmed))
        } else {
            PathBuf::from(trimmed)
        };
        
        // 检查文件是否存在
        if !path.exists() {
            return Err(format!("file does not exist: {}", path.to_string_lossy()));
        }
        
        // 检查是否是文件
        if !path.is_file() {
            return Err(format!("path is not a file: {}", path.to_string_lossy()));
        }
        
        std::fs::read(&path).map_err(|err| {
            format!(
                "failed to read path \"{}\" : {}",
                path.to_string_lossy(),
                err
            )
        })
    }
}

impl Default for VolcanoVisionProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AIProvider for VolcanoVisionProvider {
    fn name(&self) -> &str {
        "volcano-vision"
    }

    fn supports_model(&self, model: &str) -> bool {
        // 火山方舟视觉支持多种模型，这里简化处理
        true
    }

    fn list_models(&self) -> Vec<String> {
        vec![
            "volcano-vision/ep-20260409234726-bktdp".to_string(),
        ]
    }

    async fn set_api_key(&self, api_key: String) -> Result<(), AIError> {
        let mut key = self.api_key.write().await;
        *key = Some(api_key);
        Ok(())
    }

    fn supports_task_resume(&self) -> bool {
        false
    }

    async fn submit_task(&self, _request: GenerateRequest) -> Result<ProviderTaskSubmission, AIError> {
        Err(AIError::Provider("Volcano Ark Vision does not support task submission".to_string()))
    }

    async fn poll_task(&self, _handle: ProviderTaskHandle) -> Result<ProviderTaskPollResult, AIError> {
        Err(AIError::Provider("Volcano Ark Vision does not support task polling".to_string()))
    }

    async fn generate(&self, request: GenerateRequest) -> Result<String, AIError> {
        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| AIError::InvalidRequest("API key not set".to_string()))?;
        let model = Self::sanitize_model(&request.model);
        
        info!(
            "[Volcano Ark Vision Request] model: {}, prompt: {}, refs: {}",
            model,
            request.prompt,
            request.reference_images.as_ref().map(|refs| refs.len()).unwrap_or(0)
        );

        let endpoint = format!("{}{}", BASE_URL, IMAGES_GENERATIONS_PATH);
        
        // 构建图片生成请求
        let mut request_body = serde_json::json!({
            "model": model,
            "prompt": request.prompt,
            "size": request.size,
            "response_format": "url",
            "watermark": false
        });
        
        // 添加参考图片
        if let Some(reference_images) = &request.reference_images {
            if !reference_images.is_empty() {
                // 处理第一张参考图片
                let image_url = &reference_images[0];
                let image_bytes = Self::source_to_bytes(image_url)
                    .map_err(|err| AIError::Provider(err))?;
                
                // 限制图片大小
                if image_bytes.len() > 10 * 1024 * 1024 { // 10MB
                    return Err(AIError::Provider("Reference image too large, please upload a smaller image".to_string()));
                }
                
                let base64_image = STANDARD.encode(&image_bytes);
                
                // 添加参考图片到请求
                request_body["image"] = serde_json::Value::String(format!("data:image/jpeg;base64,{}", base64_image));
            }
        }
        
        info!("[Volcano Ark Vision] Generating image with model: {}", model);

        let response = self
            .client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await?;

        let status = response.status();
        let raw_response = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AIError::Provider(format!(
                "Volcano Ark Vision API failed {}: {}",
                status, raw_response
            )));
        }

        info!("[Volcano Ark Vision] Image generation response: {}", raw_response);

        // 解析响应
        let body: serde_json::Value = serde_json::from_str(&raw_response).map_err(|err| {
            AIError::Provider(format!(
                "Volcano Ark Vision invalid JSON response: {}; raw={}",
                err,
                raw_response
            ))
        })?;

        // 提取生成的图片URL
        if let Some(data) = body.get("data").and_then(|v| v.as_array()) {
            if let Some(first_image) = data.first() {
                if let Some(url) = first_image.get("url").and_then(|v| v.as_str()) {
                    return Ok(url.to_string());
                }
            }
            return Err(AIError::Provider(format!("Volcano Ark Vision response missing image URL in data: {:?}", data)));
        } else if let Some(error) = body.get("error") {
            let error_msg = error.to_string();
            return Err(AIError::Provider(format!("Volcano Ark Vision API error: {}", error_msg)));
        } else {
            return Err(AIError::Provider(format!("Volcano Ark Vision response missing data field: {:?}", body)));
        }
    }

    async fn analyze_image(&self, _image_url: &str, _model: &str, _prompt: &str) -> Result<String, AIError> {
        Err(AIError::Provider("Volcano Ark Vision does not support image analysis".to_string()))
    }

    async fn chat(&self, _request: crate::ai::ChatRequest) -> Result<String, AIError> {
        Err(AIError::Provider("Volcano Ark Vision does not support chat completion".to_string()))
    }
}
