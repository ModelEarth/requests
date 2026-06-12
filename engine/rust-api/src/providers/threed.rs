/// 3D model generation provider — supports Meshy and Tripo, the two
/// text/image-to-3D services configured in chat/keys/providers.js.
///
/// Both services are task-based: a generation request returns a task id, and
/// the resulting model URLs become available only after the task finishes.
/// To keep the frontend contract identical to image generation (one request →
/// media_urls), this provider submits the task and then polls the service
/// server-side until the model is ready (or a timeout is reached).
use async_trait::async_trait;
use serde_json::{json, Value};
use std::time::Duration;

use crate::models::{
    GenerationResponse, ImageGenerationRequest, ModelSummary, TextGenerationRequest,
    ThreeDGenerationRequest, VideoGenerationRequest,
};
use crate::providers::GenerativeModel;

/// Which 3D service this provider targets.
#[derive(Clone, Copy, PartialEq)]
enum Service {
    Meshy,
    Tripo,
}

pub struct ThreeDProvider {
    service: Service,
    name: String,
    api_key: String,
    http_client: reqwest::Client,
}

impl ThreeDProvider {
    pub fn meshy(api_key: String) -> Self {
        Self {
            service: Service::Meshy,
            name: "meshy".to_string(),
            api_key,
            http_client: reqwest::Client::new(),
        }
    }

    pub fn tripo(api_key: String) -> Self {
        Self {
            service: Service::Tripo,
            name: "tripo".to_string(),
            api_key,
            http_client: reqwest::Client::new(),
        }
    }

    async fn post(&self, url: &str, body: Value) -> anyhow::Result<Value> {
        tracing::info!("{} POST {} payload: {}", self.name, url, body);
        let resp = self
            .http_client
            .post(url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;
        let status = resp.status();
        let data: Value = resp.json().await.unwrap_or_else(|_| json!({}));
        if !status.is_success() {
            anyhow::bail!("{} API error ({}): {}", self.name, status, data);
        }
        Ok(data)
    }

    async fn get(&self, url: &str) -> anyhow::Result<Value> {
        let resp = self
            .http_client
            .get(url)
            .bearer_auth(&self.api_key)
            .send()
            .await?;
        let status = resp.status();
        let data: Value = resp.json().await.unwrap_or_else(|_| json!({}));
        if !status.is_success() {
            anyhow::bail!("{} API error ({}): {}", self.name, status, data);
        }
        Ok(data)
    }

    // ---- Meshy ------------------------------------------------------------

    async fn meshy_generate(
        &self,
        request: ThreeDGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        let mode = request.model.as_deref().unwrap_or("text-to-3d");
        let image_url = request
            .image_urls
            .as_ref()
            .and_then(|urls| urls.first().cloned());

        // Select endpoint + submit body from the chosen mode.
        let (submit_url, status_base, body) = match mode {
            "image-to-3d" | "multiimage-to-3d" => {
                let img = image_url.clone().ok_or_else(|| {
                    anyhow::anyhow!("Meshy {mode} requires a reference image URL")
                })?;
                (
                    "https://api.meshy.ai/openapi/v1/image-to-3d",
                    "https://api.meshy.ai/openapi/v1/image-to-3d",
                    json!({ "image_url": img, "should_texture": true }),
                )
            }
            _ => (
                "https://api.meshy.ai/openapi/v2/text-to-3d",
                "https://api.meshy.ai/openapi/v2/text-to-3d",
                json!({
                    "mode": "preview",
                    "prompt": request.prompt,
                    "art_style": request.art_style.as_deref().unwrap_or("realistic"),
                    "should_remesh": true
                }),
            ),
        };

        let submit = self.post(submit_url, body).await?;
        let task_id = submit["result"]
            .as_str()
            .map(ToString::to_string)
            .ok_or_else(|| anyhow::anyhow!("Meshy did not return a task id: {submit}"))?;

        // Poll until the mesh is ready.
        let status_url = format!("{status_base}/{task_id}");
        let raw = self
            .poll(&status_url, |data| {
                let status = data["status"].as_str().unwrap_or("");
                match status {
                    "SUCCEEDED" => PollOutcome::Done,
                    "FAILED" | "CANCELED" | "EXPIRED" => PollOutcome::Failed(
                        data["task_error"]["message"]
                            .as_str()
                            .unwrap_or(status)
                            .to_string(),
                    ),
                    _ => PollOutcome::Pending,
                }
            })
            .await?;

        let media_urls = meshy_model_urls(&raw);
        Ok(GenerationResponse {
            provider: self.name.clone(),
            model: mode.to_string(),
            status: if media_urls.is_empty() { "failed" } else { "completed" }.to_string(),
            id: Some(task_id),
            text: None,
            usage: None,
            media_urls,
            raw,
        })
    }

    // ---- Tripo ------------------------------------------------------------

    async fn tripo_generate(
        &self,
        request: ThreeDGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        let model = request.model.as_deref().unwrap_or("v3.0");
        let version = tripo_model_version(model);
        if request.image_urls.as_ref().is_some_and(|u| !u.is_empty()) {
            anyhow::bail!(
                "Tripo image-to-3D requires uploading the image first; use the Meshy provider for image-to-3D"
            );
        }

        let submit = self
            .post(
                "https://api.tripo3d.ai/v2/openapi/task",
                json!({
                    "type": "text_to_model",
                    "prompt": request.prompt,
                    "model_version": version
                }),
            )
            .await?;
        let task_id = submit["data"]["task_id"]
            .as_str()
            .map(ToString::to_string)
            .ok_or_else(|| anyhow::anyhow!("Tripo did not return a task id: {submit}"))?;

        let status_url = format!("https://api.tripo3d.ai/v2/openapi/task/{task_id}");
        let raw = self
            .poll(&status_url, |data| {
                let status = data["data"]["status"].as_str().unwrap_or("");
                match status {
                    "success" => PollOutcome::Done,
                    "failed" | "cancelled" | "banned" | "expired" => {
                        PollOutcome::Failed(status.to_string())
                    }
                    _ => PollOutcome::Pending,
                }
            })
            .await?;

        let media_urls = tripo_model_urls(&raw);
        Ok(GenerationResponse {
            provider: self.name.clone(),
            model: version.to_string(),
            status: if media_urls.is_empty() { "failed" } else { "completed" }.to_string(),
            id: Some(task_id),
            text: None,
            usage: None,
            media_urls,
            raw,
        })
    }

    /// Poll a status URL every 5s (up to ~5 minutes), letting the caller decide
    /// from each response whether the task is done, failed, or still pending.
    async fn poll<F>(&self, status_url: &str, classify: F) -> anyhow::Result<Value>
    where
        F: Fn(&Value) -> PollOutcome,
    {
        const MAX_ATTEMPTS: u32 = 60; // 60 × 5s = 5 minutes
        for _ in 0..MAX_ATTEMPTS {
            tokio::time::sleep(Duration::from_secs(5)).await;
            let data = match self.get(status_url).await {
                Ok(d) => d,
                Err(e) => {
                    tracing::warn!("{} poll error (will retry): {e}", self.name);
                    continue;
                }
            };
            match classify(&data) {
                PollOutcome::Done => return Ok(data),
                PollOutcome::Failed(msg) => anyhow::bail!("{} 3D generation failed: {msg}", self.name),
                PollOutcome::Pending => {}
            }
        }
        anyhow::bail!("{} 3D generation timed out after 5 minutes", self.name)
    }
}

enum PollOutcome {
    Done,
    Pending,
    Failed(String),
}

/// Meshy returns model_urls as an object keyed by format (glb, fbx, obj, usdz).
/// Prefer glb (web/AR friendly) first, then fall back to other formats.
fn meshy_model_urls(raw: &Value) -> Vec<String> {
    let urls = &raw["model_urls"];
    let mut out = Vec::new();
    for key in ["glb", "usdz", "fbx", "obj"] {
        if let Some(u) = urls[key].as_str() {
            if !u.is_empty() {
                out.push(u.to_string());
            }
        }
    }
    out
}

/// Map the friendly model id from providers.js to the date-stamped
/// `model_version` string Tripo's API requires. A value that already looks
/// date-stamped (contains '-') is passed through unchanged so newer versions
/// work without a code change.
fn tripo_model_version(model: &str) -> &str {
    match model {
        "v3.1" => "v3.1-20260211",
        "v3.0" => "v3.0-20250812",
        "v2.5" => "v2.5-20250123",
        "v2.0" => "v2.0-20240919",
        "p1" | "P1" => "P1-20260311",
        "turbo" | "Turbo" => "Turbo-v1.0-20250506",
        other if other.contains('-') => other, // already a full version string
        _ => "v3.0-20250812",                   // sensible default
    }
}

/// Tripo returns output.model (and pbr_model) as direct URLs.
fn tripo_model_urls(raw: &Value) -> Vec<String> {
    let output = &raw["data"]["output"];
    let mut out = Vec::new();
    for key in ["pbr_model", "model"] {
        if let Some(u) = output[key].as_str() {
            if !u.is_empty() {
                out.push(u.to_string());
            }
        }
    }
    out
}

#[async_trait]
impl GenerativeModel for ThreeDProvider {
    fn provider_name(&self) -> &str {
        &self.name
    }

    async fn list_models(&self) -> anyhow::Result<Vec<ModelSummary>> {
        let ids: &[&str] = match self.service {
            Service::Meshy => &["text-to-3d", "image-to-3d", "multiimage-to-3d", "ai-texturing"],
            Service::Tripo => &["v3.0", "v3.1", "p1"],
        };
        Ok(ids
            .iter()
            .map(|id| ModelSummary {
                id: id.to_string(),
                owned_by: self.name.clone(),
                created: 0,
            })
            .collect())
    }

    async fn generate_text(&self, _: TextGenerationRequest) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("{} only supports 3D generation", self.name)
    }

    async fn generate_image(&self, _: ImageGenerationRequest) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("{} only supports 3D generation", self.name)
    }

    async fn generate_video(&self, _: VideoGenerationRequest) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("{} only supports 3D generation", self.name)
    }

    async fn video_status(&self, _: &str) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("{} only supports 3D generation", self.name)
    }

    async fn generate_3d(
        &self,
        request: ThreeDGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        if request.prompt.trim().is_empty()
            && request.image_urls.as_ref().is_none_or(|u| u.is_empty())
        {
            anyhow::bail!("A prompt or reference image is required for 3D generation");
        }
        match self.service {
            Service::Meshy => self.meshy_generate(request).await,
            Service::Tripo => self.tripo_generate(request).await,
        }
    }
}
