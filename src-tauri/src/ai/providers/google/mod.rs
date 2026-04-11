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
            "{}/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
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
                "maxOutputTokens": 2048
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
            "google/gemini-2.0-flash".to_string(),
            "google/gemini-1.5-flash".to_string(),
            "google/gemini-pro-vision".to_string(),
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

    async fn generate(&self, _request: GenerateRequest) -> Result<String, AIError> {
        Err(AIError::Provider("Google AI image generation not yet implemented".to_string()))
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

    async fn chat(&self, _request: ChatRequest) -> Result<String, AIError> {
        Err(AIError::Provider("Google AI chat completion not yet implemented".to_string()))
    }
}
