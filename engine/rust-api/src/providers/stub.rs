use async_trait::async_trait;
use serde_json::json;

use crate::models::{
    GenerationResponse, ImageGenerationRequest, ModelSummary, TextGenerationRequest,
    VideoGenerationRequest,
};
use crate::providers::GenerativeModel;

pub struct StubProvider {
    name: String,
    has_api_key: bool,
}

impl StubProvider {
    pub fn new(name: &str, has_api_key: bool) -> Self {
        Self {
            name: name.to_string(),
            has_api_key,
        }
    }

    fn message(&self) -> String {
        if self.has_api_key {
            format!(
                "Provider '{}' is configured for future integration but not implemented in this service yet.",
                self.name
            )
        } else {
            format!(
                "Provider '{}' selected, but no API key found. Set the key in docker/.env and implement this provider.",
                self.name
            )
        }
    }
}

#[async_trait]
impl GenerativeModel for StubProvider {
    fn provider_name(&self) -> &str {
        &self.name
    }

    async fn list_models(&self) -> anyhow::Result<Vec<ModelSummary>> {
        anyhow::bail!(self.message())
    }

    async fn generate_text(&self, _request: TextGenerationRequest) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!(self.message())
    }

    async fn generate_image(&self, _request: ImageGenerationRequest) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!(self.message())
    }

    async fn generate_video(&self, _request: VideoGenerationRequest) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!(self.message())
    }

    async fn video_status(&self, id: &str) -> anyhow::Result<GenerationResponse> {
        Ok(GenerationResponse {
            provider: self.name.clone(),
            model: self.name.clone(),
            status: "unimplemented".to_string(),
            id: Some(id.to_string()),
            text: Some(self.message()),
            usage: None,
            media_urls: Vec::new(),
            raw: json!({ "message": self.message() }),
        })
    }
}
