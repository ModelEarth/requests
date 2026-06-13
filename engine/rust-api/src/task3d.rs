//! Generic, config-driven runner for task-based 3D generation APIs.
//!
//! Services like Meshy and Tripo all follow the same shape: POST a task, get a
//! task id, poll until the mesh is ready, then read model URLs from the result.
//! The differences (endpoints, request bodies, response JSON paths, status
//! values, error codes) are described by a `ThreeDGenerationRequest` spec that
//! the frontend builds from providers.js — so this runner contains no
//! provider-specific names or literals.

use serde_json::{json, Value};
use std::time::Duration;

use crate::models::{GenerationResponse, ThreeDGenerationRequest};

/// Submit a 3D task, poll it to completion, and return the model URLs.
pub async fn run(spec: ThreeDGenerationRequest, api_key: &str) -> anyhow::Result<GenerationResponse> {
    let client = reqwest::Client::new();
    let provider = spec.provider.clone().unwrap_or_else(|| "3d".to_string());

    // ---- submit ----
    tracing::info!("{provider} 3D POST {} body: {}", spec.submit_url, spec.submit_body);
    let resp = client
        .post(&spec.submit_url)
        .bearer_auth(api_key)
        .json(&spec.submit_body)
        .send()
        .await?;
    let status = resp.status();
    let data: Value = resp.json().await.unwrap_or_else(|_| json!({}));
    check_error(&spec, &status.to_string(), status.is_success(), &data)?;

    let task_id = get_path(&data, &spec.task_id_path)
        .and_then(|v| v.as_str())
        .map(ToString::to_string)
        .ok_or_else(|| {
            anyhow::anyhow!("{provider}: no task id at '{}' in {}", spec.task_id_path, data)
        })?;

    // ---- poll ({submit_url}/{task_id}) ----
    let status_url = format!("{}/{}", spec.submit_url.trim_end_matches('/'), task_id);
    let raw = poll(&client, api_key, &status_url, &spec, &provider).await?;
    let media_urls = extract_output(&raw, &spec);

    Ok(GenerationResponse {
        provider,
        model: spec.model.clone().unwrap_or_default(),
        status: if media_urls.is_empty() { "failed" } else { "completed" }.to_string(),
        id: Some(task_id),
        text: None,
        usage: None,
        media_urls,
        raw,
    })
}

/// Poll the status URL every 5s (up to ~5 minutes), classifying each response
/// against the spec's success/failure status values.
async fn poll(
    client: &reqwest::Client,
    api_key: &str,
    url: &str,
    spec: &ThreeDGenerationRequest,
    provider: &str,
) -> anyhow::Result<Value> {
    const MAX_ATTEMPTS: u32 = 60; // 60 × 5s = 5 minutes
    for _ in 0..MAX_ATTEMPTS {
        tokio::time::sleep(Duration::from_secs(5)).await;
        let resp = match client.get(url).bearer_auth(api_key).send().await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("{provider} poll error (will retry): {e}");
                continue;
            }
        };
        let http = resp.status();
        let data: Value = resp.json().await.unwrap_or_else(|_| json!({}));
        if !http.is_success() {
            tracing::warn!("{provider} poll HTTP {http}");
            continue;
        }
        let status = get_path(&data, &spec.status_value_path)
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if spec.status_success.iter().any(|s| s == status) {
            return Ok(data);
        }
        if spec.status_failure.iter().any(|s| s == status) {
            let msg = spec
                .error_message_path
                .as_deref()
                .and_then(|p| get_path(&data, p))
                .and_then(|v| v.as_str())
                .unwrap_or(status);
            anyhow::bail!("{provider} 3D generation failed: {msg}");
        }
    }
    anyhow::bail!("{provider} 3D generation timed out after 5 minutes")
}

/// Surface API errors. Some services (e.g. Tripo) report errors as a non-zero
/// numeric code, sometimes even in a 200 body. A configured "no credits" code
/// becomes the stable NO_CREDITS sentinel the frontend maps to its config message.
fn check_error(
    spec: &ThreeDGenerationRequest,
    status_str: &str,
    is_success: bool,
    data: &Value,
) -> anyhow::Result<()> {
    if let Some(code_path) = &spec.error_code_path {
        if let Some(code) = get_path(data, code_path).and_then(|v| v.as_i64()) {
            if code != 0 {
                if spec.no_credits_code == Some(code) {
                    anyhow::bail!("NO_CREDITS");
                }
                anyhow::bail!("3D API error ({status_str}): {data}");
            }
        }
    }
    if !is_success {
        anyhow::bail!("3D API error ({status_str}): {data}");
    }
    Ok(())
}

/// Read model URLs from the output object named by `output_path`, in the
/// preference order given by `output_keys`, skipping empty values.
fn extract_output(raw: &Value, spec: &ThreeDGenerationRequest) -> Vec<String> {
    let output = match get_path(raw, &spec.output_path) {
        Some(v) => v,
        None => return Vec::new(),
    };
    let mut urls = Vec::new();
    for key in &spec.output_keys {
        if let Some(u) = output.get(key).and_then(|v| v.as_str()) {
            if !u.is_empty() {
                urls.push(u.to_string());
            }
        }
    }
    urls
}

/// Traverse a dot-separated path (e.g. "data.output.model") through a JSON value.
fn get_path<'a>(v: &'a Value, path: &str) -> Option<&'a Value> {
    let mut cur = v;
    for seg in path.split('.') {
        cur = cur.get(seg)?;
    }
    Some(cur)
}
