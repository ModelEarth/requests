/// Anthropic Claude provider.
///
/// Diverges from the OpenAI wire format in four ways that make openai_compat.rs
/// unsuitable: `system` is a top-level string (not a message), `max_tokens` is
/// required, every request needs an `anthropic-version` header, and the response
/// content lives at `content[].text` rather than `choices[].message.content`.
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::models::{
    GenerationResponse, ImageGenerationRequest, ModelSummary, TextGenerationRequest,
    UsageSummary, VideoGenerationRequest,
};
use crate::providers::GenerativeModel;

const ANTHROPIC_VERSION: &str = "2023-06-01";
const BASE_URL: &str = "https://api.anthropic.com/v1";

pub struct ClaudeProvider {
    api_key: String,
    http_client: reqwest::Client,
    default_model: String,
}

impl ClaudeProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http_client: reqwest::Client::new(),
            default_model: "claude-sonnet-4-6".to_string(),
        }
    }

    async fn post(&self, path: &str, body: Value) -> anyhow::Result<Value> {
        let url = format!("{}/{}", BASE_URL, path.trim_start_matches('/'));
        let resp = self
            .http_client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;
        let status = resp.status();
        let data: Value = resp.json().await.unwrap_or_else(|_| json!({}));
        if !status.is_success() {
            anyhow::bail!("Claude API error ({}): {}", status, data);
        }
        Ok(data)
    }
}

#[async_trait]
impl GenerativeModel for ClaudeProvider {
    fn provider_name(&self) -> &str {
        "claude"
    }

    async fn list_models(&self) -> anyhow::Result<Vec<ModelSummary>> {
        Ok(vec![
            ModelSummary { id: "claude-opus-4-6".to_string(),           owned_by: "anthropic".to_string(), created: 0 },
            ModelSummary { id: "claude-sonnet-4-6".to_string(),         owned_by: "anthropic".to_string(), created: 0 },
            ModelSummary { id: "claude-haiku-4-5-20251001".to_string(), owned_by: "anthropic".to_string(), created: 0 },
        ])
    }

    async fn generate_text(
        &self,
        request: TextGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        let model = request.model.as_deref().unwrap_or(&self.default_model);

        let mut body = json!({
            "model": model,
            // max_tokens is required by the Anthropic API
            "max_tokens": request.max_tokens.unwrap_or(1024),
            "messages": [{"role": "user", "content": request.prompt}],
        });

        // system is a top-level field, not a message role
        if let Some(sys) = &request.system_prompt {
            if !sys.trim().is_empty() {
                body["system"] = json!(sys);
            }
        }
        if let Some(t) = request.temperature {
            body["temperature"] = json!(t);
        }

        let raw = self.post("/messages", body).await?;

        // content[].text, not choices[].message.content
        let text = raw["content"]
            .as_array()
            .and_then(|c| c.first())
            .and_then(|c| c["text"].as_str())
            .unwrap_or("")
            .to_string();

        let usage = raw["usage"].as_object().map(|u| UsageSummary {
            prompt_tokens:     u["input_tokens"].as_u64().unwrap_or(0) as u32,
            completion_tokens: u["output_tokens"].as_u64().unwrap_or(0) as u32,
            total_tokens:      (u["input_tokens"].as_u64().unwrap_or(0)
                              + u["output_tokens"].as_u64().unwrap_or(0)) as u32,
        });

        Ok(GenerationResponse {
            provider: "claude".to_string(),
            model: model.to_string(),
            status: "completed".to_string(),
            id: raw["id"].as_str().map(ToString::to_string),
            text: Some(text),
            usage,
            media_urls: Vec::new(),
            raw,
        })
    }

    async fn generate_image(
        &self,
        _request: ImageGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("Claude does not support image generation")
    }

    async fn generate_video(
        &self,
        _request: VideoGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("Claude does not support video generation")
    }

    async fn video_status(&self, _id: &str) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("Claude does not support video generation")
    }
}
