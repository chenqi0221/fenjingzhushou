use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::Client;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::ai::error::AIError;
use crate::ai::{AIProvider, ChatRequest, GenerateRequest};

const BASE_URL: &str = "https://generativelanguage.googleapis.com";

pub struct GoogleProvider {
    client: Client,
    api_key: Arc<RwLock<Option<String>>>,
}

impl GoogleProvider {
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
        
        if !path.exists() {
            return Err(format!("file does not exist: {}", path.to_string_lossy()));
        }
        
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

    async fn analyze_image_with_model(
        &self,
        api_key: &str,
        image_url: &str,
        model: &str,
        prompt: &str,
    ) -> Result<String, AIError> {
        let endpoint = format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            BASE_URL, model, api_key
        );
        
        let image_bytes = Self::source_to_bytes(image_url)
            .map_err(|err| AIError::Provider(err))?;
        
        if image_bytes.len() > 10 * 1024 * 1024 {
            return Err(AIError::Provider("Image too large, please upload a smaller image".to_string()));
        }
        
        let base64_image = STANDARD.encode(&image_bytes);
        
        let request_body = serde_json::json!({
            "contents": [
                {
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": base64_image
                            }
                        },
                        {
                            "text": prompt
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 8192
            }
        });

        info!(
            "[Google AI] Analyzing image with model: {}, api_key length: {}, endpoint: {}",
            model,
            api_key.len(),
            endpoint
        );

        let response = self
            .client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await?;

        let status = response.status();
        let raw_response = response.text().await.unwrap_or_default();
        
        info!("[Google AI] API response status: {}, body: {}", status, raw_response);

        if !status.is_success() {
            return Err(AIError::Provider(format!(
                "Google AI API failed {}: {}",
                status, raw_response
            )));
        }

        let body: serde_json::Value = serde_json::from_str(&raw_response).map_err(|err| {
            AIError::Provider(format!(
                "Google AI invalid JSON response: {}; raw={}",
                err,
                raw_response
            ))
        })?;

        if let Some(candidates) = body.get("candidates").and_then(|v| v.as_array()) {
            if let Some(first_candidate) = candidates.first() {
                if let Some(content) = first_candidate.get("content").and_then(|v| v.get("parts")) {
                    if let Some(parts) = content.as_array() {
                        for part in parts {
                            if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                                return Ok(text.to_string());
                            }
                        }
                    }
                }
            }
            return Err(AIError::Provider(format!("Google AI response missing text in candidates: {:?}", body)));
        } else if let Some(error) = body.get("error") {
            let error_msg = error.to_string();
            return Err(AIError::Provider(format!("Google AI API error: {}", error_msg)));
        } else {
            return Err(AIError::Provider(format!("Google AI response format not recognized: {:?}", body)));
        }
    }
}

impl Default for GoogleProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AIProvider for GoogleProvider {
    fn name(&self) -> &str {
        "google"
    }

    fn supports_model(&self, model: &str) -> bool {
        model.starts_with("gemini")
    }

    fn list_models(&self) -> Vec<String> {
        vec![
            "google/gemini-2.5-flash".to_string(),
            "google/gemini-2.0-flash".to_string(),
            "google/gemini-3.1-flash-lite-preview".to_string(),
            "google/gemini-3.1-pro-preview".to_string(),
            "google/gemini-3.1-flash-image".to_string(),
            "google/gemini-3-pro-image-preview".to_string(),
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

    async fn submit_task(&self, _request: GenerateRequest) -> Result<crate::ai::ProviderTaskSubmission, AIError> {
        Err(AIError::Provider("Google AI does not support task submission".to_string()))
    }

    async fn poll_task(&self, _handle: crate::ai::ProviderTaskHandle) -> Result<crate::ai::ProviderTaskPollResult, AIError> {
        Err(AIError::Provider("Google AI does not support task polling".to_string()))
    }

    async fn generate(&self, request: GenerateRequest) -> Result<String, AIError> {
        info!(
            "[Google AI] Generating image - model: {}, size: {}, aspect_ratio: {}, refs: {}",
            request.model,
            request.size,
            request.aspect_ratio,
            request.reference_images.as_ref().map(|r| r.len()).unwrap_or(0)
        );

        let api_key = self
            .api_key
            .read()
            .await
            .clone()
            .ok_or_else(|| AIError::InvalidRequest("API key not set".to_string()))?;

        info!(
            "[Google AI] Generating image with model: {}, prompt: {}, refs: {}",
            request.model,
            request.prompt,
            request.reference_images.as_ref().map(|r| r.len()).unwrap_or(0)
        );

        let model = request.model.split('/').nth(1).unwrap_or(&request.model);
        
        let is_imagen_model = model.starts_with("imagen-");
        
        let (width, height) = match request.size.as_str() {
            "1024x1024" | "1:1" => (1024, 1024),
            "768x1024" | "3:4" => (768, 1024),
            "1024x768" | "4:3" => (1024, 768),
            "1024x1792" | "9:16" => (1024, 1792),
            "1792x1024" | "16:9" => (1792, 1024),
            _ => (1024, 1024),
        };
        
        if is_imagen_model {
            let endpoint = format!(
                "{}/v1beta/models/{}:predict?key={}",
                BASE_URL, model, api_key
            );

            let sample_count = 1;

            let mut request_body = serde_json::json!({
                "instances": [
                    {
                        "prompt": request.prompt
                    }
                ],
                "parameters": {
                    "sampleCount": sample_count,
                    "width": width,
                    "height": height
                }
            });

            if let Some(reference_images) = &request.reference_images {
                if !reference_images.is_empty() {
                    let image_url = &reference_images[0];
                    let image_bytes = Self::source_to_bytes(image_url)
                        .map_err(|err| AIError::Provider(err))?;

                    if image_bytes.len() > 10 * 1024 * 1024 {
                        return Err(AIError::Provider("Reference image too large, please upload a smaller image".to_string()));
                    }

                    let base64_image = STANDARD.encode(&image_bytes);

                    if let Some(instance) = request_body.get_mut("instances").and_then(|v| v.as_array_mut()).and_then(|arr| arr.first_mut()) {
                        instance["image"] = serde_json::json!({
                            "mimeType": "image/jpeg",
                            "data": base64_image
                        });
                    }
                }
            }

            info!("[Google AI] Sending request to endpoint: {}", endpoint);

            let response = self
                .client
                .post(&endpoint)
                .header("Content-Type", "application/json")
                .json(&request_body)
                .send()
                .await?;

            let status = response.status();
            let raw_response = response.text().await.unwrap_or_default();

            info!("[Google AI] API response status: {}, body: {}", status, raw_response);

            if !status.is_success() {
                return Err(AIError::Provider(format!(
                    "Google AI API failed {}: {}",
                    status, raw_response
                )));
            }

            let body: serde_json::Value = serde_json::from_str(&raw_response).map_err(|err| {
                AIError::Provider(format!(
                    "Google AI invalid JSON response: {}; raw={}",
                    err,
                    raw_response
                ))
            })?;

            if let Some(predictions) = body.get("predictions").and_then(|v| v.as_array()) {
                if let Some(first_prediction) = predictions.first() {
                    if let Some(b64_data) = first_prediction.get("bytesBase64Encoded").and_then(|v| v.as_str()) {
                        return Ok(format!("data:image/png;base64,{}", b64_data));
                    }

                    if let Some(b64_data) = first_prediction.get("binaryData").and_then(|v| v.as_str()) {
                        return Ok(format!("data:image/png;base64,{}", b64_data));
                    }

                    if let Some(mime_type) = first_prediction.get("mimeType").and_then(|v| v.as_str()) {
                        if mime_type.starts_with("image/") {
                            if let Some(b64_data) = first_prediction.get("binaryData").and_then(|v| v.as_str()) {
                                return Ok(format!("data:{};base64,{}", mime_type, b64_data));
                            }
                        }
                    }

                    if let Some(url) = first_prediction.get("url").and_then(|v| v.as_str()) {
                        return Ok(url.to_string());
                    }
                }
                return Err(AIError::Provider(format!("Google AI response missing image data in predictions: {:?}", body)));
            } else if let Some(error) = body.get("error") {
                let error_msg = error.to_string();
                return Err(AIError::Provider(format!("Google AI API error: {}", error_msg)));
            } else {
                return Err(AIError::Provider(format!("Google AI response format not recognized: {:?}", body)));
            }
        } else {
            let endpoint = format!(
                "{}/v1beta/models/{}:generateContent?key={}",
                BASE_URL, model, api_key
            );

            let mut contents: Vec<serde_json::Value> = Vec::new();
            
            let mut parts: Vec<serde_json::Value> = Vec::new();
            
            if let Some(reference_images) = &request.reference_images {
                for image_url in reference_images {
                    let image_bytes = Self::source_to_bytes(image_url)
                        .map_err(|err| AIError::Provider(err))?;

                    if image_bytes.len() > 10 * 1024 * 1024 {
                        return Err(AIError::Provider("Reference image too large, please upload a smaller image".to_string()));
                    }

                    let base64_image = STANDARD.encode(&image_bytes);
                    
                    parts.push(serde_json::json!({
                        "inlineData": {
                            "mimeType": "image/jpeg",
                            "data": base64_image
                        }
                    }));
                }
            }
            
            parts.push(serde_json::json!({
                "text": request.prompt
            }));

            contents.push(serde_json::json!({
                "role": "user",
                "parts": parts
            }));

            let generation_config = serde_json::json!({
                "responseModalities": ["TEXT", "IMAGE"]
            });
            
            let request_body = serde_json::json!({
                "contents": contents,
                "generationConfig": generation_config
            });

            info!("[Google AI] Sending Gemini generateContent request to endpoint: {}", endpoint);

            let response = self
                .client
                .post(&endpoint)
                .header("Content-Type", "application/json")
                .json(&request_body)
                .send()
                .await?;

            let status = response.status();
            let raw_response = response.text().await.unwrap_or_default();

            info!("[Google AI] Gemini API response status: {}, body: {}", status, raw_response);

            if !status.is_success() {
                return Err(AIError::Provider(format!(
                    "Google AI API failed {}: {}",
                    status, raw_response
                )));
            }

            let body: serde_json::Value = serde_json::from_str(&raw_response).map_err(|err| {
                AIError::Provider(format!(
                    "Google AI invalid JSON response: {}; raw={}",
                    err,
                    raw_response
                ))
            })?;

            if let Some(candidates) = body.get("candidates").and_then(|v| v.as_array()) {
                if let Some(first_candidate) = candidates.first() {
                    if let Some(content) = first_candidate.get("content").and_then(|v| v.get("parts")) {
                        if let Some(parts) = content.as_array() {
                            for part in parts {
                                if let Some(inline_data) = part.get("inlineData") {
                                    if let Some(mime_type) = inline_data.get("mimeType").and_then(|v| v.as_str()) {
                                        if let Some(b64_data) = inline_data.get("data").and_then(|v| v.as_str()) {
                                            return Ok(format!("data:{};base64,{}", mime_type, b64_data));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                return Err(AIError::Provider(format!("Google AI response missing image data: {:?}", body)));
            } else if let Some(error) = body.get("error") {
                let error_msg = error.to_string();
                return Err(AIError::Provider(format!("Google AI API error: {}", error_msg)));
            } else {
                return Err(AIError::Provider(format!("Google AI response format not recognized: {:?}", body)));
            }
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
        info!("[Google AI] analyze_image called, model: {}, api_key prefix: '{}'", model, key_prefix);
        
        self.analyze_image_with_model(&api_key, image_url, model, prompt).await
    }

    async fn chat(&self, request: ChatRequest) -> Result<String, AIError> {
        let api_key = self.api_key.read().await;
        let api_key = api_key.as_ref().ok_or_else(|| AIError::Provider("No API key set".to_string()))?;
        
        let model = &request.model;
        let endpoint = format!(
            "{}/v1beta/models/{}:generateContent?key={}",
            BASE_URL, model, api_key
        );
        
        // Google AI 不支持 system 角色，将 system 消息合并到第一个 user 消息中
        let mut system_prompt = String::new();
        let mut contents: Vec<serde_json::Value> = Vec::new();
        
        for msg in &request.messages {
            if msg.role == "system" {
                system_prompt = msg.content.clone();
            } else {
                let role = if msg.role == "assistant" { "model" } else { "user" };
                contents.push(serde_json::json!({
                    "role": role,
                    "parts": [{"text": msg.content.clone()}]
                }));
            }
        }
        
        // 如果有 system prompt，将其添加到第一个 user 消息的开头
        if !system_prompt.is_empty() && !contents.is_empty() {
            if let Some(first_msg) = contents.first_mut() {
                if let Some(parts) = first_msg.get_mut("parts").and_then(|v| v.as_array_mut()) {
                    if let Some(first_part) = parts.first_mut() {
                        if let Some(text_obj) = first_part.get_mut("text") {
                            if let Some(text) = text_obj.as_str().map(|s| s.to_string()) {
                                let new_text = format!("{}\n\n{}", system_prompt, text);
                                *text_obj = serde_json::json!(new_text);
                            }
                        }
                    }
                }
            }
        }
        
        let request_body = serde_json::json!({
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens.unwrap_or(4096)
            }
        });
        
        let response = self
            .client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await?;
        
        let status = response.status();
        let raw_response = response.text().await.unwrap_or_default();
        
        if !status.is_success() {
            return Err(AIError::Provider(format!(
                "Google AI API failed {}: {}",
                status, raw_response
            )));
        }
        
        let body: serde_json::Value = serde_json::from_str(&raw_response).map_err(|err| {
            AIError::Provider(format!(
                "Google AI invalid JSON response: {}; raw={}",
                err,
                raw_response
            ))
        })?;
        
        if let Some(candidates) = body.get("candidates").and_then(|v| v.as_array()) {
            if let Some(first_candidate) = candidates.first() {
                if let Some(content) = first_candidate.get("content") {
                    if let Some(parts) = content.get("parts").and_then(|v| v.as_array()) {
                        let text: String = parts.iter()
                            .filter_map(|part| part.get("text").and_then(|t| t.as_str()))
                            .collect();
                        return Ok(text);
                    }
                }
            }
        }
        
        Err(AIError::Provider("No response content from Google AI".to_string()))
    }
}
