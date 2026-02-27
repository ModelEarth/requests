pub mod claude;
pub mod gemini;
pub mod openai_compat;
pub mod xai;

use std::sync::Arc;

use async_trait::async_trait;

use crate::config::AppConfig;
use crate::models::{
    GenerationResponse, ImageGenerationRequest, ModelSummary, TextGenerationRequest,
    VideoGenerationRequest,
};

#[async_trait]
pub trait GenerativeModel: Send + Sync {
    fn provider_name(&self) -> &str;
    async fn list_models(&self) -> anyhow::Result<Vec<ModelSummary>>;
    async fn generate_text(&self, request: TextGenerationRequest) -> anyhow::Result<GenerationResponse>;
    async fn generate_image(&self, request: ImageGenerationRequest) -> anyhow::Result<GenerationResponse>;
    async fn generate_video(&self, request: VideoGenerationRequest) -> anyhow::Result<GenerationResponse>;
    async fn video_status(&self, id: &str) -> anyhow::Result<GenerationResponse>;
}

pub fn build_provider(config: &AppConfig) -> anyhow::Result<Arc<dyn GenerativeModel>> {
    match config.provider.as_str() {
        "xai" => Ok(Arc::new(xai::XaiProvider::new(config)?)),
        "gemini" => {
            let key = config
                .gemini_api_key
                .clone()
                .filter(|k| !k.is_empty())
                .ok_or_else(|| anyhow::anyhow!("Missing GEMINI_API_KEY for gemini provider"))?;
            Ok(Arc::new(gemini::GeminiProvider::new(key)))
        }
        "openai" => {
            let key = config
                .openai_api_key
                .clone()
                .filter(|k| !k.is_empty())
                .ok_or_else(|| anyhow::anyhow!("Missing OPENAI_API_KEY for openai provider"))?;
            Ok(Arc::new(
                openai_compat::OpenAICompatProvider::new("openai", "https://api.openai.com", key)
                    .with_text_model("gpt-4o")
                    .with_image_model("dall-e-3"),
            ))
        }
        "claude" => {
            let key = config
                .claude_api_key
                .clone()
                .filter(|k| !k.is_empty())
                .ok_or_else(|| anyhow::anyhow!("Missing CLAUDE_API_KEY for claude provider"))?;
            Ok(Arc::new(claude::ClaudeProvider::new(key)))
        }
        other => anyhow::bail!("Unsupported provider: {other}"),
    }
}

/// Build a provider dynamically from a name and key supplied per-request
/// (e.g. from the X-Provider-Name / X-Provider-Key / X-Provider-URL headers
/// set by the frontend when it finds a key in localStorage aPro).
/// Unknown provider names fall through to openai_compat when X-Provider-URL is supplied.
pub fn build_provider_dynamic(
    name: &str,
    key: &str,
    base_url: Option<&str>,
) -> anyhow::Result<Arc<dyn GenerativeModel>> {
    match name {
        "gemini" => Ok(Arc::new(gemini::GeminiProvider::new(key.to_string()))),
        "xai" => Ok(Arc::new(xai::XaiProvider::with_key(key.to_string())?)),
        "openai" => Ok(Arc::new(
            openai_compat::OpenAICompatProvider::new("openai", "https://api.openai.com", key.to_string())
                .with_text_model("gpt-4o")
                .with_image_model("dall-e-3"),
        )),
        "claude" => Ok(Arc::new(claude::ClaudeProvider::new(key.to_string()))),
        "groq" => Ok(Arc::new(
            openai_compat::OpenAICompatProvider::new("groq", "https://api.groq.com/openai", key.to_string())
                .with_text_model("llama-3.3-70b-versatile"),
        )),
        "together" => Ok(Arc::new(
            openai_compat::OpenAICompatProvider::new("together", "https://api.together.xyz", key.to_string())
                .with_text_model("meta-llama/Llama-3.3-70B-Instruct-Turbo"),
        )),
        "fireworks" => Ok(Arc::new(
            openai_compat::OpenAICompatProvider::new("fireworks", "https://api.fireworks.ai/inference", key.to_string())
                .with_text_model("accounts/fireworks/models/llama-v3p3-70b-instruct"),
        )),
        "mistral" => Ok(Arc::new(
            openai_compat::OpenAICompatProvider::new("mistral", "https://api.mistral.ai", key.to_string())
                .with_text_model("mistral-large-latest"),
        )),
        "perplexity" => Ok(Arc::new(
            openai_compat::OpenAICompatProvider::new("perplexity", "https://api.perplexity.ai", key.to_string())
                .with_text_model("llama-3.1-sonar-large-128k-online"),
        )),
        "deepseek" => Ok(Arc::new(
            openai_compat::OpenAICompatProvider::new("deepseek", "https://api.deepseek.com", key.to_string())
                .with_text_model("deepseek-chat"),
        )),
        other => match base_url {
            Some(url) => {
                tracing::info!("Unknown provider '{other}' — routing via openai_compat at {url}");
                Ok(Arc::new(openai_compat::OpenAICompatProvider::new(other, url, key.to_string())))
            }
            None => anyhow::bail!(
                "Unknown provider '{other}': supply X-Provider-URL for OpenAI-compatible endpoints"
            ),
        },
    }
}
