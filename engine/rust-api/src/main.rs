mod config;
mod error;
mod models;
mod providers;

use std::io::Write;
use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::{info, Level};
use tracing_subscriber::EnvFilter;

use chrono;

use crate::config::AppConfig;
use crate::error::{AppError, AppResult};
use crate::models::{
    HealthResponse, ListModelsResponse, TextGenerationRequest, ImageGenerationRequest,
    VideoGenerationRequest,
};
use crate::providers::{build_provider, build_provider_dynamic, GenerativeModel};

#[derive(Clone)]
struct AppState {
    provider: Arc<dyn GenerativeModel>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .with_max_level(Level::INFO)
        .init();

    let config = AppConfig::load()?;
    let provider = build_provider(&config)?;

    let app_state = AppState { provider };

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/models", get(list_models))
        .route("/api/generate/text", post(generate_text))
        .route("/api/generate/image", post(generate_image))
        .route("/api/generate/video", post(generate_video))
        .route("/api/generate/video/{id}", get(video_status))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    let bind = format!("{}:{}", config.server_host, config.server_port);
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    info!("arts_engine_api listening on http://{bind}");
    axum::serve(listener, app).await?;

    Ok(())
}

/// Return a per-request provider when the frontend supplies X-Provider-Name and
/// X-Provider-Key headers (local storage key takes priority over docker/.env).
/// Falls back to the default AppState provider when headers are absent.
fn resolve_request_provider(
    state: &AppState,
    headers: &HeaderMap,
) -> anyhow::Result<Arc<dyn GenerativeModel>> {
    let name = headers
        .get("x-provider-name")
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty());
    let key = headers
        .get("x-provider-key")
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty());
    match (name, key) {
        (Some(n), Some(k)) => {
            info!("Using per-request provider '{}' from request headers", n);
            build_provider_dynamic(n, k)
        }
        _ => Ok(Arc::clone(&state.provider)),
    }
}

async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        provider: state.provider.provider_name().to_string(),
        message: "Arts Engine API is ready".to_string(),
    })
}

async fn list_models(State(state): State<AppState>) -> AppResult<Json<ListModelsResponse>> {
    let models = state.provider.list_models().await?;
    Ok(Json(ListModelsResponse { models }))
}

async fn generate_text(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TextGenerationRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = resolve_request_provider(&state, &headers)?;
    let response = provider.generate_text(payload).await?;
    Ok(Json(serde_json::to_value(response)?))
}

async fn generate_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ImageGenerationRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = resolve_request_provider(&state, &headers)?;
    let response = provider.generate_image(payload).await?;
    Ok(Json(serde_json::to_value(response)?))
}

async fn generate_video(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<VideoGenerationRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = resolve_request_provider(&state, &headers)?;
    let prompt = payload.prompt.clone();
    let response = provider.generate_video(payload).await?;
    if let Some(id) = &response.id {
        append_mycontent_csv(&prompt, id);
    }
    Ok(Json(serde_json::to_value(response)?))
}

fn append_mycontent_csv(prompt: &str, request_id: &str) {
    let path = "../mycontent.csv";
    let needs_header = !std::path::Path::new(path).exists();
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path);
    if let Ok(mut f) = file {
        if needs_header {
            let _ = writeln!(f, "DateTime,Prompt,URLPath");
        }
        let dt = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
        let url_path = format!("/v1/videos/generations/{}", request_id);
        let escaped = prompt.replace('"', "\"\"");
        let _ = writeln!(f, "{},\"{}\",{}", dt, escaped, url_path);
    }
}

async fn video_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let response = state.provider.video_status(&id).await?;
    Ok(Json(serde_json::to_value(response)?))
}
