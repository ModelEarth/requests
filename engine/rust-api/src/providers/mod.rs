pub mod gemini;
pub mod stub;
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
        "openai" => Ok(Arc::new(stub::StubProvider::new(
            "openai",
            config.openai_api_key.is_some(),
        ))),
        "claude" => Ok(Arc::new(stub::StubProvider::new(
            "claude",
            config.claude_api_key.is_some(),
        ))),
        other => anyhow::bail!("Unsupported provider: {other}"),
    }
}

/// Build a provider dynamically from a name and key supplied per-request
/// (e.g. from the X-Provider-Name / X-Provider-Key headers set by the frontend
/// when it finds a key in localStorage aPro with priority over docker/.env).
pub fn build_provider_dynamic(
    name: &str,
    key: &str,
) -> anyhow::Result<Arc<dyn GenerativeModel>> {
    match name {
        "gemini" => Ok(Arc::new(gemini::GeminiProvider::new(key.to_string()))),
        "xai" => Ok(Arc::new(xai::XaiProvider::with_key(key.to_string())?)),
        other => anyhow::bail!("Unknown provider for dynamic build: {other}"),
    }
}
