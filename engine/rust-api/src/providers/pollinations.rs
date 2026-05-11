/// Pollinations.ai provider — GET-based image generation API.
///
/// API: GET https://image.pollinations.ai/prompt/{url-encoded-prompt}
///   ?model=flux-schnell|z-image-turbo|...&width=&height=&nologo=true
///
/// Auth (optional): Authorization: Bearer <token>. Anonymous tier works
/// without a key but has stricter rate limits. Tokens come from auth.pollinations.ai.
///
/// The response body is raw image bytes (PNG/JPEG). We fetch server-side so the
/// API key never leaves the backend, then return a base64 data URL — the same
/// shape openai_compat uses for b64_json responses.
use async_trait::async_trait;
use serde_json::json;

use crate::models::{
    GenerationResponse, ImageGenerationRequest, ModelSummary, TextGenerationRequest,
    VideoGenerationRequest,
};
use crate::providers::GenerativeModel;

const BASE_URL: &str = "https://image.pollinations.ai/prompt/";
const DEFAULT_MODEL: &str = "flux-schnell";

pub struct PollinationsProvider {
    api_key: Option<String>,
    http_client: reqwest::Client,
}

impl PollinationsProvider {
    pub fn new(api_key: String) -> Self {
        let api_key = if api_key.trim().is_empty() {
            None
        } else {
            Some(api_key)
        };
        Self {
            api_key,
            http_client: reqwest::Client::new(),
        }
    }

    /// Map aspect_ratio API string to (width, height) for Pollinations.
    fn aspect_to_dims(aspect: &str) -> (u32, u32) {
        match aspect {
            "16:9" => (1280, 720),
            "9:16" => (720, 1280),
            "4:3" => (1152, 864),
            "3:4" => (864, 1152),
            _ => (1024, 1024),
        }
    }
}

#[async_trait]
impl GenerativeModel for PollinationsProvider {
    fn provider_name(&self) -> &str {
        "pollinations"
    }

    async fn list_models(&self) -> anyhow::Result<Vec<ModelSummary>> {
        Ok(vec![
            ModelSummary {
                id: "flux-schnell".to_string(),
                owned_by: "pollinations".to_string(),
                created: 0,
            },
            ModelSummary {
                id: "z-image-turbo".to_string(),
                owned_by: "pollinations".to_string(),
                created: 0,
            },
        ])
    }

    async fn generate_text(
        &self,
        _request: TextGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("pollinations does not support text generation via this provider")
    }

    async fn generate_image(
        &self,
        request: ImageGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        let model = request.model.as_deref().unwrap_or(DEFAULT_MODEL).to_string();
        let (width, height) =
            Self::aspect_to_dims(request.aspect_ratio.as_deref().unwrap_or("1:1"));

        let mut url = reqwest::Url::parse(BASE_URL)?;
        url.path_segments_mut()
            .map_err(|_| anyhow::anyhow!("invalid pollinations base url"))?
            .push(&request.prompt);
        url.query_pairs_mut()
            .append_pair("model", &model)
            .append_pair("width", &width.to_string())
            .append_pair("height", &height.to_string())
            .append_pair("nologo", "true");

        let mut req = self.http_client.get(url.clone());
        if let Some(key) = &self.api_key {
            req = req.bearer_auth(key);
        }

        let resp = req.send().await?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("pollinations API error ({status}): {body}");
        }

        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/png")
            .to_string();
        let bytes = resp.bytes().await?;

        use base64::Engine as _;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let data_url = format!("data:{content_type};base64,{b64}");

        Ok(GenerationResponse {
            provider: "pollinations".to_string(),
            model,
            status: "completed".to_string(),
            id: None,
            text: None,
            usage: None,
            media_urls: vec![data_url],
            raw: json!({
                "source_url": url.to_string(),
                "content_type": content_type,
                "byte_length": bytes.len(),
            }),
        })
    }

    async fn generate_video(
        &self,
        _request: VideoGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("pollinations does not support video generation")
    }

    async fn video_status(&self, _id: &str) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("pollinations does not support video generation")
    }
}
