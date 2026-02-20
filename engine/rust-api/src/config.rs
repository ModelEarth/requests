use std::env;
use std::path::Path;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub server_host: String,
    pub server_port: u16,
    pub provider: String,
    pub xai_api_key: String,
    pub xai_api_url: String,
    pub text_model: String,
    pub image_model: String,
    pub video_model: String,
    pub openai_api_key: Option<String>,
    pub gemini_api_key: Option<String>,
    pub claude_api_key: Option<String>,
}

impl AppConfig {
    pub fn load() -> anyhow::Result<Self> {
        load_dotenv_candidates();

        let provider = get_optional("GEN_MODEL_PROVIDER")
            .unwrap_or_else(|| "xai".to_string())
            .to_lowercase();

        let config = Self {
            server_host: get_optional("ARTS_ENGINE_HOST")
                .or_else(|| get_optional("SERVER_HOST"))
                .unwrap_or_else(|| "127.0.0.1".to_string()),
            server_port: get_optional("ARTS_ENGINE_PORT")
                .or_else(|| get_optional("SERVER_PORT"))
                .and_then(|v| v.parse::<u16>().ok())
                .unwrap_or(8082),
            provider,
            xai_api_key: get_optional("XAI_API_KEY")
                .or_else(|| get_optional("GROK_API_KEY"))
                .unwrap_or_default(),
            xai_api_url: get_optional("XAI_API_URL").unwrap_or_else(|| "https://api.x.ai/v1".to_string()),
            text_model: get_optional("XAI_TEXT_MODEL").unwrap_or_else(|| "grok-3-mini-beta".to_string()),
            image_model: get_optional("XAI_IMAGE_MODEL").unwrap_or_else(|| "grok-imagine-image".to_string()),
            video_model: get_optional("XAI_VIDEO_MODEL").unwrap_or_else(|| "grok-imagine-video".to_string()),
            openai_api_key: get_optional("OPENAI_API_KEY"),
            gemini_api_key: get_optional("GEMINI_API_KEY"),
            claude_api_key: get_optional("CLAUDE_API_KEY"),
        };

        if config.provider == "xai" && config.xai_api_key.is_empty() {
            anyhow::bail!("Missing XAI_API_KEY for xAI provider");
        }

        Ok(config)
    }
}

fn get_optional(key: &str) -> Option<String> {
    env::var(key).ok().map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
}

fn load_dotenv_candidates() {
    let candidates = [
        ".env",
        "../.env",
        "../../.env",
        "../../../docker/.env",
        "../../docker/.env",
        "../docker/.env",
        "docker/.env",
    ];

    for path in candidates {
        if Path::new(path).exists() {
            let _ = dotenvy::from_path(path);
            break;
        }
    }
}
