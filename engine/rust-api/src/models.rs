use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub provider: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct TextGenerationRequest {
    pub prompt: String,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImageGenerationRequest {
    pub prompt: String,
    pub model: Option<String>,
    pub aspect_ratio: Option<String>,
    pub response_format: Option<String>,
    pub image_urls: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct VideoGenerationRequest {
    pub prompt: String,
    pub model: Option<String>,
    pub aspect_ratio: Option<String>,
    pub duration_seconds: Option<u32>,
    pub image_urls: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct UsageSummary {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelSummary {
    pub id: String,
    pub owned_by: String,
    pub created: u64,
}

#[derive(Debug, Serialize)]
pub struct ListModelsResponse {
    pub models: Vec<ModelSummary>,
}

#[derive(Debug, Serialize, Clone)]
pub struct GenerationResponse {
    pub provider: String,
    pub model: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageSummary>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub media_urls: Vec<String>,
    pub raw: Value,
}
