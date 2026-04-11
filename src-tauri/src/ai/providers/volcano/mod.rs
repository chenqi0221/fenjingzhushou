use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::multipart::{Form, Part};
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::info;
use uuid::Uuid;

use crate::ai::error::AIError;
use crate::ai::{
    AIProvider, ChatRequest, GenerateRequest, ProviderTaskHandle, ProviderTaskPollResult, ProviderTaskSubmission,
};

const BASE_URL: &str = "https://ark.cn-beijing.volces.com/api/v3";
const CHAT_COMPLETIONS_PATH: &str = "/chat/completions";
const POLL_INTERVAL_MS: u64 = 2500;

#[derive(Debug, Deserialize)]
struct VolcanoResponse {
    id: Option<String>,
    output: Option<Vec<Value>>,
    error: Option<Value>,
    status: Option<String>,
}

pub struct VolcanoProvider {
    client: Client,
    api_key: Arc<RwLock<Option<String>>>,
}

impl VolcanoProvider {
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

    fn is_http_url(value: &str) -> bool {
        value.starts_with("http://") || value.starts_with("https://")
    }

    async fn analyze_image_with_model(
        &self,
        api_key: &str,
        image_url: &str,
        model: &str,
        prompt: &str,
    ) -> Result<String, AIError> {
        // 使用 Responses API 进行图片理解
        // 参考文档: https://www.volcengine.com/docs/82379/1362931
        let endpoint = format!("{}{}", BASE_URL, "/responses");
        
        // 读取并转换图片为 base64
        let image_bytes = Self::source_to_bytes(image_url)
            .map_err(|err| AIError::Provider(err))?;
        
        // 限制图片大小，避免超过 API 限制
        if image_bytes.len() > 10 * 1024 * 1024 { // 10MB
            return Err(AIError::Provider("Image too large, please upload a smaller image".to_string()));
        }
        
        let base64_image = STANDARD.encode(&image_bytes);
        
        // 使用提供的 prompt 或默认值
        let analysis_prompt = if !prompt.is_empty() {
            prompt
        } else {
            "请分析这张图片，描述其内容和主要元素。"
        };
        
        // 构建火山方舟API请求格式，使用Responses API接口
        // 参考文档: https://www.volcengine.com/docs/82379/1362931
        let request_body = serde_json::json!({
            "model": model,
            "input": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_image",
                            "image_url": format!("data:image/jpeg;base64,{}", base64_image)
                        },
                        {
                            "type": "input_text",
                            "text": analysis_prompt
                        }
                    ]
                }
            ]
        });
        
        info!(
            "[Volcano Ark] Analyzing image with model: {}, api_key length: {}, endpoint: {}",
            model,
            api_key.len(),
            endpoint
        );

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
                "Volcano Ark API failed {}: {}",
                status, raw_response
            )));
        }

        info!("[Volcano Ark] API response: {}", raw_response);

        // 尝试解析响应
        let body: serde_json::Value = serde_json::from_str(&raw_response).map_err(|err| {
            AIError::Provider(format!(
                "Volcano Ark invalid JSON response: {}; raw={}",
                err,
                raw_response
            ))
        })?;

        // 提取分析结果 - Responses API 格式
        // 新格式: output 是一个数组，不是 choices 对象
        // 参考文档: https://www.volcengine.com/docs/82379/1362931
        if let Some(output) = body.get("output") {
            if let Some(output_array) = output.as_array() {
                // 遍历 output 数组，找到 message 类型的项
                for item in output_array {
                    if item.get("type").and_then(|v| v.as_str()) == Some("message") {
                        if let Some(content) = item.get("content").and_then(|v| v.as_array()) {
                            for content_item in content {
                                if content_item.get("type").and_then(|v| v.as_str()) == Some("output_text") {
                                    if let Some(text_content) = content_item.get("text").and_then(|v| v.as_str()) {
                                        return Ok(text_content.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
                return Err(AIError::Provider(format!("Volcano Ark response missing output_text in output: {:?}", output_array)));
            }
            // 兼容旧格式: output 有 choices 字段
            if let Some(choices) = output.get("choices").and_then(|v| v.as_array()) {
                if let Some(first_choice) = choices.first() {
                    if let Some(content) = first_choice.get("content").and_then(|v| v.as_array()) {
                        for item in content {
                            if let Some(text) = item.get("type").and_then(|v| v.as_str()) {
                                if text == "output_text" {
                                    if let Some(text_content) = item.get("text").and_then(|v| v.as_str()) {
                                        return Ok(text_content.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
                return Err(AIError::Provider(format!("Volcano Ark response missing text content in choices: {:?}", choices)));
            }
            return Err(AIError::Provider(format!("Volcano Ark response format not recognized: {:?}", output)));
        } else if let Some(error) = body.get("error") {
            let error_msg = error.to_string();
            return Err(AIError::Provider(format!("Volcano Ark API error: {}", error_msg)));
        } else {
            return Err(AIError::Provider(format!("Volcano Ark response missing output field: {:?}", body)));
        }
    }
}

impl Default for VolcanoProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AIProvider for VolcanoProvider {
    fn name(&self) -> &str {
        "volcano"
    }

    fn supports_model(&self, model: &str) -> bool {
        // 火山方舟支持多种模型，这里简化处理
        true
    }

    fn list_models(&self) -> Vec<String> {
        vec![
            "volcano/doubao-seed-2-0-lite-260215".to_string(),
            "volcano/ep-20260409234726-bktdp".to_string(),
            "volcano/ep-20260410002744-29gfm".to_string(),
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
        Err(AIError::Provider("Volcano Ark does not support task submission".to_string()))
    }

    async fn poll_task(&self, _handle: ProviderTaskHandle) -> Result<ProviderTaskPollResult, AIError> {
        Err(AIError::Provider("Volcano Ark does not support task polling".to_string()))
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
            "[Volcano Ark Request] model: {}, prompt: {}, refs: {}",
            model,
            request.prompt,
            request.reference_images.as_ref().map(|refs| refs.len()).unwrap_or(0)
        );

        let endpoint = format!("{}/images/generations", BASE_URL);
        
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
        
        info!("[Volcano Ark] Generating image with model: {}", model);

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
                "Volcano Ark API failed {}: {}",
                status, raw_response
            )));
        }

        info!("[Volcano Ark] Image generation response: {}", raw_response);

        // 解析响应
        let body: serde_json::Value = serde_json::from_str(&raw_response).map_err(|err| {
            AIError::Provider(format!(
                "Volcano Ark invalid JSON response: {}; raw={}",
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
            return Err(AIError::Provider(format!("Volcano Ark response missing image URL in data: {:?}", data)));
        } else if let Some(error) = body.get("error") {
            let error_msg = error.to_string();
            return Err(AIError::Provider(format!("Volcano Ark API error: {}", error_msg)));
        } else {
            return Err(AIError::Provider(format!("Volcano Ark response missing data field: {:?}", body)));
        }
    }

    async fn analyze_image(&self, image_url: &str, model: &str, prompt: &str) -> Result<String, AIError> {
        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| AIError::InvalidRequest("API key not set".to_string()))?;
        
        let key_prefix = if api_key.len() >= 8 { &api_key[..8] } else { &api_key };
        info!("[Volcano Ark] analyze_image called, model: {}, api_key prefix: '{}'", model, key_prefix);
        
        self.analyze_image_with_model(&api_key, image_url, model, prompt).await
    }

    async fn chat(&self, request: ChatRequest) -> Result<String, AIError> {
        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| AIError::InvalidRequest("API key not set".to_string()))?;

        let endpoint = format!("{}{}", BASE_URL, CHAT_COMPLETIONS_PATH);

        // 构建请求体
        let messages = request.messages.into_iter().map(|msg| {
            serde_json::json!({
                "role": msg.role,
                "content": msg.content
            })
        }).collect::<Vec<_>>();

        let request_body = serde_json::json!({
            "model": request.model,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "stream": request.stream
        });

        info!(
            "[Volcano Ark] Chat completion with model: {}",
            request.model
        );

        let response = self
            .client
            .post(&endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|err| AIError::Provider(format!("Volcano Ark API request failed: {}", err)))?;

        let status = response.status();
        let raw_response = response
            .text()
            .await
            .map_err(|err| AIError::Provider(format!("Volcano Ark API response read failed: {}", err)))?;

        info!(
            "[Volcano Ark] Chat response status: {}; body: {}",
            status,
            raw_response
        );

        if !status.is_success() {
            return Err(AIError::Provider(format!(
                "Volcano Ark API failed {}: {}",
                status,
                raw_response
            )));
        }

        let body: serde_json::Value = serde_json::from_str(&raw_response).map_err(|err| {
            AIError::Provider(format!(
                "Volcano Ark invalid JSON response: {}; raw={}",
                err,
                raw_response
            ))
        })?;

        // 提取响应内容
        if let Some(choices) = body.get("choices").and_then(|v| v.as_array()) {
            if let Some(first_choice) = choices.first() {
                if let Some(message) = first_choice.get("message") {
                    if let Some(content) = message.get("content").and_then(|v| v.as_str()) {
                        return Ok(content.to_string());
                    }
                }
            }
            return Err(AIError::Provider(format!("Volcano Ark response missing content in choices: {:?}", choices)));
        } else if let Some(error) = body.get("error") {
            let error_msg = error.to_string();
            return Err(AIError::Provider(format!("Volcano Ark API error: {}", error_msg)));
        } else {
            return Err(AIError::Provider(format!("Volcano Ark response missing choices: {:?}", body)));
        }
    }
}