use std::collections::BTreeSet;

use anyhow::Context;
use async_trait::async_trait;
use serde_json::{json, Value};

use api_xai::{
    ChatCompletionRequest, Client as XaiClient, ClientApiAccessors, Message, Secret,
    XaiEnvironmentImpl,
};

use crate::config::AppConfig;
use crate::models::{
    GenerationResponse, ImageGenerationRequest, ModelSummary, TextGenerationRequest,
    UsageSummary, VideoGenerationRequest,
};
use crate::providers::GenerativeModel;

pub struct XaiProvider {
    api_client: XaiClient<XaiEnvironmentImpl>,
    http_client: reqwest::Client,
    api_key: String,
    base_url: String,
    default_text_model: String,
    default_image_model: String,
    default_video_model: String,
}

impl XaiProvider {
    pub fn new(config: &AppConfig) -> anyhow::Result<Self> {
        let secret = Secret::new(config.xai_api_key.clone())?;
        let env = XaiEnvironmentImpl::new(secret)?;
        let api_client = XaiClient::build(env)?;

        Ok(Self {
            api_client,
            http_client: reqwest::Client::new(),
            api_key: config.xai_api_key.clone(),
            base_url: config.xai_api_url.trim_end_matches('/').to_string(),
            default_text_model: config.text_model.clone(),
            default_image_model: config.image_model.clone(),
            default_video_model: config.video_model.clone(),
        })
    }

    /// Build an XaiProvider from a bare API key (for per-request local storage key override).
    pub fn with_key(api_key: String) -> anyhow::Result<Self> {
        let secret = Secret::new(api_key.clone())?;
        let env = XaiEnvironmentImpl::new(secret)?;
        let api_client = XaiClient::build(env)?;
        Ok(Self {
            api_client,
            http_client: reqwest::Client::new(),
            api_key,
            base_url: "https://api.x.ai/v1".to_string(),
            default_text_model: "grok-3-mini-beta".to_string(),
            default_image_model: "grok-imagine-image".to_string(),
            default_video_model: "grok-imagine-video".to_string(),
        })
    }

    fn require_prompt(prompt: &str) -> anyhow::Result<()> {
        if prompt.trim().is_empty() {
            anyhow::bail!("Prompt is required");
        }
        Ok(())
    }

    fn to_usage(prompt_tokens: u32, completion_tokens: u32, total_tokens: u32) -> UsageSummary {
        UsageSummary {
            prompt_tokens,
            completion_tokens,
            total_tokens,
        }
    }

    async fn post_json(&self, path: &str, payload: Value) -> anyhow::Result<Value> {
        let url = format!("{}/{}", self.base_url, path.trim_start_matches('/'));
        tracing::info!("xAI POST {} payload: {}", url, payload);

        let response = self
            .http_client
            .post(url)
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await
            .context("xAI request failed")?;

        self.handle_response(response).await
    }

    async fn get_json(&self, path: &str) -> anyhow::Result<Value> {
        let url = format!("{}/{}", self.base_url, path.trim_start_matches('/'));

        let response = self
            .http_client
            .get(url)
            .bearer_auth(&self.api_key)
            .send()
            .await
            .context("xAI request failed")?;

        self.handle_response(response).await
    }

    async fn handle_response(&self, response: reqwest::Response) -> anyhow::Result<Value> {
        let status = response.status();
        let body = response.text().await.context("xAI response read failed")?;

        let json_value = serde_json::from_str::<Value>(&body).unwrap_or_else(|_| json!({ "text": body }));

        if !status.is_success() {
            anyhow::bail!("xAI API error ({status}): {}", json_value);
        }

        Ok(json_value)
    }

    fn find_string(raw: &Value, key: &str) -> Option<String> {
        raw.get(key).and_then(Value::as_str).map(ToString::to_string)
    }

    fn extract_media_urls(raw: &Value) -> Vec<String> {
        fn collect(value: &Value, urls: &mut BTreeSet<String>) {
            match value {
                Value::String(value) => {
                    let trimmed = value.trim();
                    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                        urls.insert(trimmed.to_string());
                    }
                }
                Value::Array(values) => {
                    values.iter().for_each(|entry| collect(entry, urls));
                }
                Value::Object(map) => {
                    map.values().for_each(|entry| collect(entry, urls));
                }
                _ => {}
            }
        }

        let mut urls = BTreeSet::new();
        collect(raw, &mut urls);
        urls.into_iter().collect()
    }

    fn response_id(raw: &Value) -> Option<String> {
        Self::find_string(raw, "id")
            .or_else(|| Self::find_string(raw, "request_id"))
            .or_else(|| Self::find_string(raw, "video_id"))
            .or_else(|| {
                raw.get("data")
                    .and_then(Value::as_array)
                    .and_then(|list| list.first())
                    .and_then(|entry| entry.get("id"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
    }

    fn response_status(raw: &Value, media_urls: &[String]) -> String {
        Self::find_string(raw, "status")
            .or_else(|| {
                raw.get("data")
                    .and_then(Value::as_array)
                    .and_then(|list| list.first())
                    .and_then(|entry| entry.get("status"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
            .unwrap_or_else(|| {
                if media_urls.is_empty() {
                    "submitted".to_string()
                } else {
                    "completed".to_string()
                }
            })
    }
}

#[async_trait]
impl GenerativeModel for XaiProvider {
    fn provider_name(&self) -> &str {
        "xai"
    }

    async fn list_models(&self) -> anyhow::Result<Vec<ModelSummary>> {
        let models = self.api_client.models().list().await?;

        let summaries = models
            .data
            .into_iter()
            .map(|model| ModelSummary {
                id: model.id,
                owned_by: model.owned_by,
                created: model.created,
            })
            .collect();

        Ok(summaries)
    }

    async fn generate_text(&self, request: TextGenerationRequest) -> anyhow::Result<GenerationResponse> {
        Self::require_prompt(&request.prompt)?;

        let model = request
            .model
            .unwrap_or_else(|| self.default_text_model.clone());

        let mut messages = Vec::new();
        if let Some(system_prompt) = request.system_prompt {
            if !system_prompt.trim().is_empty() {
                messages.push(Message::system(system_prompt));
            }
        }
        messages.push(Message::user(request.prompt));

        let chat_request = ChatCompletionRequest {
            model: model.clone(),
            messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            top_p: None,
            frequency_penalty: None,
            presence_penalty: None,
            stream: None,
            tools: None,
        };

        let response = self.api_client.chat().create(chat_request).await?;

        let text = response
            .choices
            .iter()
            .filter_map(|choice| choice.message.content.clone())
            .collect::<Vec<_>>()
            .join("\n");

        let usage = Self::to_usage(
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            response.usage.total_tokens,
        );

        Ok(GenerationResponse {
            provider: "xai".to_string(),
            model,
            status: "completed".to_string(),
            id: Some(response.id.clone()),
            text: Some(text),
            usage: Some(usage),
            media_urls: Vec::new(),
            raw: serde_json::to_value(&response)?,
        })
    }

    async fn generate_image(&self, request: ImageGenerationRequest) -> anyhow::Result<GenerationResponse> {
        Self::require_prompt(&request.prompt)?;

        let model = request
            .model
            .unwrap_or_else(|| self.default_image_model.clone());
        let selected_model = model.clone();

        let mut payload = json!({
            "model": model,
            "prompt": request.prompt,
            "aspect_ratio": request.aspect_ratio.unwrap_or_else(|| "16:9".to_string()),
            "response_format": request.response_format.unwrap_or_else(|| "url".to_string())
        });

        if let Some(image_urls) = request.image_urls {
            payload["image_urls"] = json!(image_urls);
        }

        let raw = self.post_json("images/generations", payload).await?;
        let media_urls = Self::extract_media_urls(&raw);

        Ok(GenerationResponse {
            provider: "xai".to_string(),
            model: selected_model,
            status: Self::response_status(&raw, &media_urls),
            id: Self::response_id(&raw),
            text: Self::find_string(&raw, "message"),
            usage: None,
            media_urls,
            raw,
        })
    }

    async fn generate_video(&self, request: VideoGenerationRequest) -> anyhow::Result<GenerationResponse> {
        Self::require_prompt(&request.prompt)?;

        let model = request
            .model
            .unwrap_or_else(|| self.default_video_model.clone());
        let selected_model = model.clone();

        let duration_seconds = request.duration_seconds.unwrap_or(8);

        let mut payload = json!({
            "model": model,
            "prompt": request.prompt,
            "aspect_ratio": request.aspect_ratio.unwrap_or_else(|| "16:9".to_string()),
            "duration": duration_seconds
        });

        if let Some(image_urls) = request.image_urls {
            payload["image_urls"] = json!(image_urls);
        }

        let raw = self.post_json("videos/generations", payload).await?;
        let media_urls = Self::extract_media_urls(&raw);

        Ok(GenerationResponse {
            provider: "xai".to_string(),
            model: selected_model,
            status: Self::response_status(&raw, &media_urls),
            id: Self::response_id(&raw),
            text: Self::find_string(&raw, "message"),
            usage: None,
            media_urls,
            raw,
        })
    }

    async fn video_status(&self, id: &str) -> anyhow::Result<GenerationResponse> {
        if id.trim().is_empty() {
            anyhow::bail!("Video generation id is required");
        }

        let raw = self.get_json(&format!("videos/{id}")).await?;
        let media_urls = Self::extract_media_urls(&raw);

        Ok(GenerationResponse {
            provider: "xai".to_string(),
            model: self.default_video_model.clone(),
            status: Self::response_status(&raw, &media_urls),
            id: Self::response_id(&raw).or_else(|| Some(id.to_string())),
            text: Self::find_string(&raw, "message"),
            usage: None,
            media_urls,
            raw,
        })
    }
}
