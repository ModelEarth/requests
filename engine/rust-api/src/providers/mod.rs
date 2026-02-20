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
        "openai" => Ok(Arc::new(stub::StubProvider::new(
            "openai",
            config.openai_api_key.is_some(),
        ))),
        "gemini" => Ok(Arc::new(stub::StubProvider::new(
            "gemini",
            config.gemini_api_key.is_some(),
        ))),
        "claude" => Ok(Arc::new(stub::StubProvider::new(
            "claude",
            config.claude_api_key.is_some(),
        ))),
        other => anyhow::bail!("Unsupported provider: {other}"),
    }
}
