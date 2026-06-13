use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub provider: String,
    pub available_providers: Vec<String>,
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

/// Generic, config-driven spec for a task-based 3D generation API.
///
/// The frontend builds this from the provider's `task3d` settings in
/// providers.js, so the backend stays provider-agnostic: it submits a task,
/// polls until done, and extracts model URLs — all using the paths/values
/// described here. No Meshy/Tripo specifics live in backend code.
#[derive(Debug, Deserialize)]
pub struct ThreeDGenerationRequest {
    /// Endpoint to POST the task to. Status is polled at `{submit_url}/{task_id}`.
    pub submit_url: String,
    /// Fully-formed request body (placeholders already substituted by the frontend).
    pub submit_body: Value,
    /// Dot path to the task id in the submit response (e.g. "result", "data.task_id").
    pub task_id_path: String,
    /// Dot path to the status value in a poll response (e.g. "status", "data.status").
    pub status_value_path: String,
    /// Status values that mean the task finished successfully.
    pub status_success: Vec<String>,
    /// Status values that mean the task failed.
    pub status_failure: Vec<String>,
    /// Optional dot path to a failure message in a poll response.
    #[serde(default)]
    pub error_message_path: Option<String>,
    /// Dot path to the output object holding model URLs (e.g. "model_urls", "data.output").
    pub output_path: String,
    /// Keys to read from the output object, in preference order (e.g. ["glb","fbx"]).
    pub output_keys: Vec<String>,
    /// Optional dot path to a numeric API error code (e.g. Tripo's "code").
    #[serde(default)]
    pub error_code_path: Option<String>,
    /// Error code that means "no API credits" → surfaced as the NO_CREDITS sentinel.
    #[serde(default)]
    pub no_credits_code: Option<i64>,
    /// Optional labels echoed back in the response (not used for the API call).
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
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
