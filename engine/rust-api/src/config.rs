use std::env;
use std::fs;
use std::path::{Path, PathBuf};

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
    pub anthropic_api_key: Option<String>,
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
            anthropic_api_key: get_optional("ANTHROPIC_API_KEY"),
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

/// Reads the env file the same way lib/env-loader.ts does: `automation/`'s
/// `paths.yaml` `env_file:` key, instead of a hardcoded docker/.env path. If
/// paths.yaml doesn't exist yet, or has no env_file: set, this is a no-op —
/// run automation/sync-config.sh once, or add env_file: by hand. Falls back
/// further to a plain `.env` file at a few candidate depths, for a
/// standalone checkout with no automation/ folder.
fn load_dotenv_candidates() {
    let automation_candidates = ["automation", "../automation", "../../automation", "../../../automation"];

    if let Some(automation_dir) = automation_candidates.iter().map(Path::new).find(|p| p.is_dir()) {
        let paths_yaml = automation_dir.join("paths.yaml");
        let env_file_setting = fs::read_to_string(&paths_yaml).ok().and_then(|raw| parse_env_file_setting(&raw));

        if let Some(env_file_setting) = env_file_setting {
            let env_path: PathBuf = automation_dir.join(env_file_setting);
            // Only stop here on an actual successful load. A file that
            // exists but fails to parse (bad encoding, malformed line) must
            // fall through to the plain .env candidates below instead of
            // silently leaving every env var unset.
            if env_path.exists() && dotenvy::from_path(&env_path).is_ok() {
                return;
            }
        }
    }

    let candidates = [".env", "../.env", "../../.env", "../../../.env"];
    for path in candidates {
        if Path::new(path).exists() {
            let _ = dotenvy::from_path(path);
            break;
        }
    }
}

// Strips a trailing, whitespace-preceded inline comment (e.g.
// "../foo.env  # laptop"), mirroring
// chat/lib/parse-env-file-setting.mjs's `.replace(/\s+#.*$/, '')` so a
// hand-edited paths.yaml line doesn't resolve to a bogus path with the
// comment text still attached.
fn strip_inline_comment(s: &str) -> &str {
    let mut prev_is_space = false;
    for (i, c) in s.char_indices() {
        if c == '#' && prev_is_space {
            return &s[..i];
        }
        prev_is_space = c.is_whitespace();
    }
    s
}

fn parse_env_file_setting(raw: &str) -> Option<String> {
    raw.lines().find_map(|line| {
        let trimmed = line.trim();
        let value = trimmed.strip_prefix("env_file:")?;
        let value = strip_inline_comment(value).trim().trim_matches(|c| c == '"' || c == '\'');
        if value.is_empty() { None } else { Some(value.to_string()) }
    })
}
