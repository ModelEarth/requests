use async_trait::async_trait;
use serde_json::{json, Value};

use crate::models::{
    GenerationResponse, ImageGenerationRequest, ModelSummary, TextGenerationRequest,
    VideoGenerationRequest,
};
use crate::providers::GenerativeModel;

pub struct GeminiProvider {
    api_key: String,
    http_client: reqwest::Client,
    text_model: String,
    image_model: String,
}

impl GeminiProvider {
    const BASE_URL: &'static str = "https://generativelanguage.googleapis.com/v1beta";
    /// Image-editing model ("Nano Banana"). Imagen's :predict endpoint is
    /// text-to-image only, so image-to-image requests route here instead.
    const IMAGE_EDIT_MODEL: &'static str = "gemini-2.5-flash-image";

    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http_client: reqwest::Client::new(),
            text_model: "gemini-1.5-flash".to_string(),
            image_model: "imagen-3.0-generate-002".to_string(),
        }
    }

    /// Split a `data:<mime>;base64,<data>` URL into (mime, base64-data).
    /// Returns None for non-data URLs (Gemini inline_data needs raw bytes).
    fn parse_data_url(url: &str) -> Option<(String, String)> {
        let rest = url.strip_prefix("data:")?;
        let (meta, data) = rest.split_once(',')?;
        let mime = meta.split(';').next().unwrap_or("image/png").to_string();
        Some((mime, data.to_string()))
    }

    /// Image-to-image / editing via gemini-2.5-flash-image's generateContent.
    /// Input images arrive as data: URLs (uploads or prior outputs) and are
    /// passed through as inline_data; the prompt becomes a text part.
    async fn generate_image_edit(
        &self,
        prompt: &str,
        image_urls: &[String],
    ) -> anyhow::Result<GenerationResponse> {
        let url = format!(
            "{}/models/{}:generateContent?key={}",
            Self::BASE_URL,
            Self::IMAGE_EDIT_MODEL,
            self.api_key
        );

        let mut parts: Vec<Value> = Vec::new();
        for u in image_urls {
            match Self::parse_data_url(u) {
                Some((mime, data)) => {
                    parts.push(json!({ "inline_data": { "mime_type": mime, "data": data } }));
                }
                None => anyhow::bail!(
                    "Gemini image editing needs an inline image; received a non-data URL"
                ),
            }
        }
        parts.push(json!({ "text": prompt }));

        let payload = json!({
            "contents": [{ "parts": parts }],
            "generationConfig": { "responseModalities": ["TEXT", "IMAGE"] }
        });

        let raw = self.post_json(&url, payload).await?;

        let media_urls: Vec<String> = raw["candidates"]
            .as_array()
            .map(|cands| {
                cands
                    .iter()
                    .flat_map(|c| {
                        c["content"]["parts"]
                            .as_array()
                            .map(|ps| {
                                ps.iter()
                                    .filter_map(|p| {
                                        let inline =
                                            p.get("inlineData").or_else(|| p.get("inline_data"))?;
                                        let data = inline["data"].as_str()?;
                                        let mime = inline["mimeType"]
                                            .as_str()
                                            .or_else(|| inline["mime_type"].as_str())
                                            .unwrap_or("image/png");
                                        Some(format!("data:{};base64,{}", mime, data))
                                    })
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default()
                    })
                    .collect()
            })
            .unwrap_or_default();

        let status = if media_urls.is_empty() { "failed" } else { "completed" }.to_string();
        Ok(GenerationResponse {
            provider: "google".to_string(),
            model: Self::IMAGE_EDIT_MODEL.to_string(),
            status,
            id: None,
            text: None,
            usage: None,
            media_urls,
            raw,
        })
    }

    async fn post_json(&self, url: &str, payload: Value) -> anyhow::Result<Value> {
        let resp = self
            .http_client
            .post(url)
            .json(&payload)
            .send()
            .await?;
        let status = resp.status();
        let body: Value = resp.json().await.unwrap_or_else(|_| json!({}));
        if !status.is_success() {
            let public_url = url.split('?').next().unwrap_or(url);
            anyhow::bail!("Gemini API error ({}) {}: {}", status, public_url, body);
        }
        Ok(body)
    }
}

#[async_trait]
impl GenerativeModel for GeminiProvider {
    fn provider_name(&self) -> &str {
        "google"
    }

    async fn list_models(&self) -> anyhow::Result<Vec<ModelSummary>> {
        Ok(vec![
            ModelSummary {
                id: "gemini-2.0-flash".to_string(),
                owned_by: "google".to_string(),
                created: 0,
            },
            ModelSummary {
                id: "gemini-2.0-flash-thinking-exp".to_string(),
                owned_by: "google".to_string(),
                created: 0,
            },
            ModelSummary {
                id: "imagen-3.0-generate-002".to_string(),
                owned_by: "google".to_string(),
                created: 0,
            },
        ])
    }

    async fn generate_text(
        &self,
        request: TextGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        let model = request.model.as_deref().unwrap_or(&self.text_model);
        let url = format!(
            "{}/models/{}:generateContent?key={}",
            Self::BASE_URL,
            model,
            self.api_key
        );

        let mut parts = Vec::new();
        if let Some(sys) = &request.system_prompt {
            if !sys.trim().is_empty() {
                parts.push(json!({ "text": sys }));
            }
        }
        parts.push(json!({ "text": request.prompt }));

        let payload = json!({
            "contents": [{ "parts": parts }],
            "generationConfig": {
                "maxOutputTokens": request.max_tokens.unwrap_or(1024)
            }
        });

        let raw = self.post_json(&url, payload).await?;

        let text = raw["candidates"]
            .as_array()
            .and_then(|c| c.first())
            .and_then(|c| c["content"]["parts"].as_array())
            .and_then(|p| p.first())
            .and_then(|p| p["text"].as_str())
            .unwrap_or("")
            .to_string();

        Ok(GenerationResponse {
            provider: "google".to_string(),
            model: model.to_string(),
            status: "completed".to_string(),
            id: None,
            text: Some(text),
            usage: None,
            media_urls: Vec::new(),
            raw,
        })
    }

    async fn generate_image(
        &self,
        request: ImageGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        // Image-to-image: when an input image is supplied, edit it with
        // gemini-2.5-flash-image instead of generating fresh from Imagen.
        if let Some(images) = request.image_urls.as_ref().filter(|v| !v.is_empty()) {
            return self.generate_image_edit(&request.prompt, images).await;
        }

        let url = format!(
            "{}/models/{}:predict?key={}",
            Self::BASE_URL,
            self.image_model,
            self.api_key
        );

        let aspect = request.aspect_ratio.as_deref().unwrap_or("1:1");
        let payload = json!({
            "instances": [{ "prompt": request.prompt }],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": aspect
            }
        });

        let raw = self.post_json(&url, payload).await?;

        // Imagen returns base64-encoded images; convert to data URLs so the
        // existing gallery renderer can display them without a separate upload step.
        let media_urls: Vec<String> = raw["predictions"]
            .as_array()
            .map(|preds| {
                preds
                    .iter()
                    .filter_map(|pred| {
                        let b64 = pred["bytesBase64Encoded"].as_str()?;
                        let mime = pred["mimeType"].as_str().unwrap_or("image/png");
                        Some(format!("data:{};base64,{}", mime, b64))
                    })
                    .collect()
            })
            .unwrap_or_default();

        let status = if media_urls.is_empty() {
            "failed".to_string()
        } else {
            "completed".to_string()
        };

        Ok(GenerationResponse {
            provider: "google".to_string(),
            model: self.image_model.clone(),
            status,
            id: None,
            text: None,
            usage: None,
            media_urls,
            raw,
        })
    }

    async fn generate_video(
        &self,
        _request: VideoGenerationRequest,
    ) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!(
            "Gemini video generation is not yet implemented — use xAI provider for video"
        )
    }

    async fn video_status(&self, _id: &str) -> anyhow::Result<GenerationResponse> {
        anyhow::bail!("Gemini video status is not yet implemented")
    }
}
