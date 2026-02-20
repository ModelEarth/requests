# "Arts Engine" with X.ai Rust API — Claude Agent

**Start time:** 2026-02-20
**End time:** 2026-02-20
**Total time:** < 1 session

---

Develop a high-performance text, image, and video generation tool using the **X.ai (Grok) API** via a standalone Rust backend. The application serves a JamStack static frontend from either the `requests/codex` or `requests/claude` subfolder depending on which CLI is building it.

---

## AI Agent Folders

[your-agent-name] is the current CLI name: claude, codex, gemini, etc

1. **Copy this plan file** to your own subfolder — `requests/[your-agent-name]/PLAN.md` — and work from that copy going forward. Record your start time, end time, and total time in the copy.

2. **Copy the template** — copy all files from `requests/template/` into your agent subfolder as your starting point:
   ```
   cp -r requests/template/* requests/[your-agent-name]/
   ```
   The template provides: `index.html`, `css/app.css`, `js/app.js`, `config.yaml`

3. **Do not place Rust files at the `requests/` root.** Your Rust backend lives entirely inside your subfolder at `[your-agent-name]/rust-api/`.

4. **Update your PLAN.md copy** as you build — fill in checkboxes, add endpoint details, record findings. When prompted to resume, re-read your copy first.

5. **Title is loaded from config.yaml** — do not hardcode "Arts Engine" in HTML or JS. Read `template/config.yaml` (with local `./config.yaml` as an optional override).

---

## Progress Checkboxes

Track progress in your copy in case of interruption:

- [x] Subfolder created (`requests/claude/`)
- [x] Template files copied from `requests/template/`
- [x] `PLAN.md` copied and timestamps recorded
- [x] `config.yaml` reviewed (local override if needed)
- [x] `css/app.css` reviewed and customized if needed
- [x] `js/app.js` written (ArtsEngine class)
- [x] `prompts.csv` added (sample storyboard scenes)
- [x] `rust-api/Cargo.toml` created
- [x] `rust-api/src/config.rs` written
- [x] `rust-api/src/error.rs` written
- [x] `rust-api/src/models.rs` written
- [x] `rust-api/src/providers/mod.rs` written
- [x] `rust-api/src/providers/xai.rs` written
- [x] `rust-api/src/providers/stub.rs` written
- [x] `rust-api/src/main.rs` written
- [x] `docker/.env.example` updated with `XAI_API_KEY`, `XAI_API_URL`
- [x] `cargo check` passes
- [ ] End time and total time recorded

---

## File Hierarchy (within your agent subfolder)

All paths below are relative to your agent subfolder (e.g. `requests/claude/`):

```
index.html                        ← from template; loads config.yaml, css/app.css, js/app.js
config.yaml                       ← optional local override of template/config.yaml
prompts.csv                       ← sample storyboard scenes (scene,prompt,aspect_ratio,style)
PLAN.md                           ← this file, copied and updated by agent
rust-api/
├── Cargo.toml
├── .env.example                  ← XAI_API_KEY, XAI_API_URL, SERVER_PORT
└── src/
    ├── main.rs                   ← axum router, AppState, handler functions
    ├── config.rs                 ← AppConfig::load() with multi-path .env discovery
    ├── error.rs                  ← AppError + IntoResponse impl + AppResult<T> alias
    ├── models.rs                 ← all request/response structs (Deserialize/Serialize)
    └── providers/
        ├── mod.rs                ← GenerativeModel trait + build_provider() factory
        ├── xai.rs                ← XaiProvider: api_xai for text, reqwest for image/video
        └── stub.rs               ← StubProvider reused for openai/gemini/claude stubs
css/
└── app.css                       ← from template; full panel/dark-mode/storyboard styles
js/
└── app.js                        ← agent writes this: ArtsEngine class
```

---

## Port Configuration

This claude agent uses `ARTS_ENGINE_PORT=8082` (from `docker/.env.example`).

The `config.rs` reads `ARTS_ENGINE_HOST`/`ARTS_ENGINE_PORT` first, falling back to `SERVER_HOST`/`SERVER_PORT`, defaulting to `127.0.0.1:8082`. This avoids conflicts with the team server on port 8081.

---

## Template Folder (shared, do not modify)

`requests/template/` contains the shared starting point for all agent builds:

| File | Purpose |
|------|---------|
| `index.html` | Full Arts Engine page structure with config.yaml loading |
| `css/app.css` | Complete stylesheet — panels, dark mode, storyboard, gallery, lightbox |
| `js/app.js` | Reference ArtsEngine JS implementation |
| `config.yaml` | Shared title, subtitle, icon, api_base defaults |

The `index.html` tries `./config.yaml` first (agent-local), then `/requests/template/config.yaml`. This lets agents override the title without modifying the shared template.

---

## Frontend UX Guide

The Claude build's frontend was judged significantly better than the Codex build's. The following design patterns produced that result. Future agents should follow them closely.

### Overall Layout

Two-column responsive flex layout. Left column: 65% (`flex: 65`). Right column: 35% (`flex: 35`, `container-type: inline-size`). Gap: 24px. On mobile (`max-width: 767px`): stack vertically, right column first (GitHub widget at top).

### Panel System

Every section is an `.ae-panel`:
- `background: #fff` / dark: `#2a2a2a`
- `border-radius: 12px`
- `box-shadow: 0 1px 4px rgba(0,0,0,0.08)` — subtle, no border
- `padding: 20px`, `margin-bottom: 20px`
- `h3` header: `font-size: 0.95rem`, `text-transform: uppercase`, `letter-spacing: 0.04em`, `color: #555` / dark: `#aaa`

### Page Heading

```html
<h1 id="ae-title">
  <span class="material-icons" style="color:#4a90e2">auto_awesome</span>Arts Engine
</h1>
<p id="ae-subtitle">Image & text generation via X.ai Grok API · Storyboard builder</p>
```

Both `id="ae-title"` and `id="ae-subtitle"` are populated from `config.yaml` by the inline script in `<head>`. The inline text is the instant fallback. Never hardcode the title in a way that can't be overridden by `config.yaml`.

Below the subtitle: a backend status row — a small animated dot (green/red/amber) with a label and health-check link.

### Prompt Input Panel

- `<textarea id="promptInput">`: `min-height: 110px`, `resize: vertical`, border turns blue on focus
- `Ctrl+Enter` / `Cmd+Enter` triggers generation
- **CSV upload**: a `<label>` styled as a dashed-border button wrapping `<input type="file" accept=".csv">`. Shows filename when loaded. The panel also accepts drag-and-drop `.csv` files.
- **Prompt list**: scrollable (`max-height: 220px`) list of loaded scenes. Each row: numbered circle, prompt text (truncated), optional industry label, × remove button. Clicking a row populates the textarea and highlights the corresponding storyboard node.

### Aspect Ratio Selector (5 ratios)

Five pill buttons in a flex row. Each contains a proportional visual box and a label. The box dimensions visually represent the ratio — do not use text alone:

| Key | Label | Box size | API string |
|-----|-------|----------|------------|
| `square` | Square 1:1 | 32×32px | `"1:1"` |
| `landscape-wide` | Wide 16:9 | 48×27px | `"16:9"` |
| `landscape` | Landscape 4:3 | 40×30px | `"4:3"` |
| `portrait-tall` | Tall 9:16 | 18×32px | `"9:16"` |
| `portrait` | Portrait 3:4 | 24×32px | `"3:4"` |

**Critical**: pass the API string (e.g. `"16:9"`) directly to the X.ai images/generations endpoint as `aspect_ratio`. Do not convert to pixel dimensions.

Active state: `border: 1.5px solid #4a90e2`, box fills `#4a90e2`. Preference saved to `localStorage` as `ae_ratio`.

### Output Type + Generate

Pill toggle buttons: **Image** | **Text** | **Video** (disabled, `opacity: 0.45`, tooltip "coming soon"). Model selector (`<select>`) visible only when Text is active.

**Generate button**: gradient `linear-gradient(135deg, #4a90e2 0%, #5ba3f5 100%)`, `material-icons auto_awesome` icon to left of "Generate" text. On hover: `translateY(-1px)` + stronger shadow. During generation: disabled, shows spinner + "Generating…".

Variations input: number field 1–4, saved to `localStorage` as `ae_variations`.

### Storyboard Flowchart

ComfyUI-style horizontal node flow. Built entirely with HTML/CSS — no canvas or SVG library.

```
[Scene 1 node] → [Scene 2 node] → [Scene 3 node] → [+]
```

Each scene node card (`.ae-node-card`): `width: 150px`, `min-height: 120px`, `border-radius: 10px`, subtle border.

Node contents (top to bottom):
1. Scene label (e.g. "Scene 1") — tiny blue caps text
2. Thumbnail: `70px` tall, `object-fit: cover`, rounded. Placeholder shows `image` material icon at 30% opacity before generation.
3. Prompt text: 2-line `-webkit-line-clamp`, `font-size: 0.75rem`
4. Style label if present from CSV

Between nodes: `material-icons arrow_forward` in a centered flex div.

At the end: a `+` button (dashed border, 44×44px) to add the current textarea prompt as a new scene.

Empty state: `movie_filter` icon at low opacity with "Load a CSV or add scenes to build a storyboard".

Clicking any node: selects that scene's prompt into the textarea and highlights the node.

After generation: thumbnail fills in with the generated image and the storyboard updates live.

### Gallery

CSS grid: `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`, `gap: 14px`.

Each `.ae-gallery-item`: `border-radius: 10px`, `overflow: hidden`, `aspect-ratio` set from the generation ratio. On hover: `translateY(-2px)` + shadow + overlay slides in with **View** and **Save** buttons.

**View** → opens lightbox (fixed full-screen overlay, `background: rgba(0,0,0,0.85)`). Close on click outside, on overlay click, or `Escape` key.

**Save** → `<a download>` link pointing to the image URL.

New results are prepended (`gallery.prepend(div)`) so newest appears first.

Text generation output: full-width `<pre>`-style div with prompt label above, prepended to gallery.

### Right Column Panels

1. **GitHub Output** — `new GitHubIssuesManager('issues-root', { showProject: false })`. Token stored in `localStorage` as `github_token`. "Save to GitHub" button revealed after generation — downloads each image as base64 and commits to a user-specified repo/path via GitHub Contents API.

2. **Settings** — Backend URL text input (updates `artsEngine.apiBase` on change). Default from `config.yaml` `api_base`. Cargo run instructions for the Rust backend.

3. **Sample Prompts** — download link to `prompts.csv`. Note that the CSV is also compatible with the NAICS industry format (`ME-prompts-2021.csv`).

4. **API Reference** — links to X.ai docs, api_xai Rust crate, FloraFauna.ai.

### Dark Mode

All components have `.dark` selectors. localsite.js applies `.dark` to the body when the user toggles dark mode in the localsite navigation. Panel backgrounds, borders, text, inputs, buttons, status indicators, and storyboard nodes all respond correctly.

### Localsite.js Requirements

- Include `/localsite/css/base.css` and `/localsite/js/localsite.js?showheader=true`
- **Never use `setTimeout()` to wait for DOM elements.** Use `waitForElm(selector).then(...)` from localsite.js.
- `material-icons` are available once localsite.js is loaded — use them freely.
- Use `getHash()` / `goHash()` / `updateHash()` for any URL-state management.

### Preferences (localStorage, `ae_` prefix)

| Key | Default | Values |
|-----|---------|--------|
| `ae_ratio` | `square` | `square`, `landscape-wide`, `landscape`, `portrait-tall`, `portrait` |
| `ae_outputType` | `image` | `image`, `text` |
| `ae_model` | `grok-3-mini-beta` | any X.ai text model ID |
| `ae_variations` | `1` | `1`–`4` |

---

## Config YAML Specification

`requests/template/config.yaml` (shared) and optional `[agent]/config.yaml` (local override):

```yaml
title: "Arts Engine"
subtitle: "Image & text generation via X.ai Grok API · Storyboard builder"
icon: "auto_awesome"
api_base: "http://localhost:8082"
```

The inline `<script>` in `index.html` fetches `./config.yaml` first, then `/requests/template/config.yaml`. Sets `window.AE_API_BASE` so `app.js` reads the correct backend URL without hardcoding it. The `icon` value is a `material-icons` glyph name.

---

## Rust Backend Architecture

Build a **standalone Rust backend** inside `claude/rust-api/`. Do not reference or depend on any other Rust code in the repository.

### Framework: axum

Use `axum` (not actix-web). axum is more idiomatic for new Rust projects, has cleaner extractor-based handlers, and lighter dependencies.

### Dependencies (`Cargo.toml`)

```toml
[package]
name = "arts_engine_api"
version = "0.1.0"
edition = "2021"

[dependencies]
anyhow = "1"
api_xai = { version = "0.3", default-features = false, features = ["enabled", "integration"] }
async-trait = "0.1"
axum = "0.8"
dotenvy = "0.15"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
tower-http = { version = "0.6", features = ["cors", "trace"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

### `src/config.rs` — AppConfig

Fields: `server_host`, `server_port` (default 8082 for claude agent), `provider` (from `GEN_MODEL_PROVIDER`, default `"xai"`), `xai_api_key`, `xai_api_url`, `text_model`, `image_model`, `video_model`, `openai_api_key: Option<String>`, `gemini_api_key: Option<String>`, `claude_api_key: Option<String>`.

**Port resolution:** Reads `ARTS_ENGINE_HOST`/`ARTS_ENGINE_PORT` first, falls back to `SERVER_HOST`/`SERVER_PORT`, defaults to `127.0.0.1:8082`. This prevents `SERVER_PORT=8081` (the team server) from overriding the arts engine port.

**Multi-path `.env` discovery** — try each candidate in order, stop at first found:
```rust
let candidates = [".env", "../.env", "../../.env", "../../../docker/.env",
                  "../../docker/.env", "../docker/.env", "docker/.env"];
for path in candidates {
    if Path::new(path).exists() { let _ = dotenvy::from_path(path); break; }
}
```

Model defaults (all overridable via env):
- `XAI_TEXT_MODEL` → `"grok-3-mini-beta"`
- `XAI_IMAGE_MODEL` → `"grok-imagine-image"`
- `XAI_VIDEO_MODEL` → `"grok-imagine-video"`

### `src/error.rs` — Error handling

```rust
pub type AppResult<T> = Result<T, AppError>;
pub struct AppError(pub anyhow::Error);
// IntoResponse: keywords "missing"/"invalid"/"required" → 400, else → 500
// Response body: { "error": "message" }
```

### `src/models.rs` — Request/Response types

Request types (Deserialize): `TextGenerationRequest`, `ImageGenerationRequest`, `VideoGenerationRequest`

Unified response (Serialize): `GenerationResponse { provider, model, status, id?, text?, usage?, media_urls, raw }`

`media_urls: Vec<String>` — extracted recursively from the raw API response.

### `src/providers/mod.rs` — Trait

```rust
#[async_trait]
pub trait GenerativeModel: Send + Sync {
    fn provider_name(&self) -> &str;
    async fn list_models(&self) -> anyhow::Result<Vec<ModelSummary>>;
    async fn generate_text(&self, req: TextGenerationRequest) -> anyhow::Result<GenerationResponse>;
    async fn generate_image(&self, req: ImageGenerationRequest) -> anyhow::Result<GenerationResponse>;
    async fn generate_video(&self, req: VideoGenerationRequest) -> anyhow::Result<GenerationResponse>;
    async fn video_status(&self, id: &str) -> anyhow::Result<GenerationResponse>;
}
```

`build_provider(&config) -> Arc<dyn GenerativeModel>` — matches `config.provider` string to return `XaiProvider` or `StubProvider`.

### `src/providers/xai.rs` — XaiProvider

Holds both `api_client: XaiClient<XaiEnvironmentImpl>` (api_xai) and `http_client: reqwest::Client`.

**Critical: use `Secret::new(key)` to create the api_xai secret from a string — do not manipulate env vars:**
```rust
let secret = Secret::new(config.xai_api_key.clone())?;
let env = XaiEnvironmentImpl::new(secret)?;
let api_client = XaiClient::build(env)?;
```

**Text generation** — use `api_xai` crate (`ChatCompletionRequest` is a struct with direct fields, not a builder):
```rust
let chat_request = ChatCompletionRequest {
    model: model.clone(),
    messages,          // Vec<Message> built with Message::system() / Message::user()
    temperature: request.temperature,
    max_tokens: request.max_tokens,
    top_p: None, frequency_penalty: None, presence_penalty: None, stream: None, tools: None,
};
let response = self.api_client.chat().create(chat_request).await?;
// message.content is Option<String>
let text = response.choices.iter()
    .filter_map(|c| c.message.content.clone())
    .collect::<Vec<_>>().join("\n");
```

**Models listing** — use api_xai:
```rust
let models = self.api_client.models().list().await?;
```

**Image generation** — use `reqwest` (api_xai does not support image/video endpoints):
```rust
// POST {base_url}/images/generations
// aspect_ratio is passed as a string: "1:1", "16:9", "4:3", "9:16", "3:4"
let payload = json!({
    "model": model,
    "prompt": request.prompt,
    "aspect_ratio": request.aspect_ratio.unwrap_or_else(|| "16:9".to_string()),
    "response_format": request.response_format.unwrap_or_else(|| "url".to_string())
});
```

**Video generation** — use `reqwest`, POST to `/videos/generations`. Video is **async** — the response contains a job `id`. Provide a separate `video_status(id)` handler that GETs `/videos/generations/{id}`.

**`extract_media_urls`** — recursively walk the raw JSON response and collect all `https://` strings. This works for both image and video responses regardless of their exact shape:
```rust
fn extract_media_urls(raw: &Value) -> Vec<String> {
    // Recursively walk strings/arrays/objects, collect https:// values
}
```

**`response_status`** — infer `"completed"` if `media_urls` is non-empty, else `"submitted"`.

### `src/providers/stub.rs` — StubProvider

Single reusable struct for openai, gemini, and claude stubs:
```rust
pub struct StubProvider { name: String, has_api_key: bool }
// Error messages distinguish "not implemented yet" from "API key missing"
```

### `src/main.rs` — axum Router

```rust
Router::new()
    .route("/api/health",               get(health))
    .route("/api/models",               get(list_models))
    .route("/api/generate/text",        post(generate_text))
    .route("/api/generate/image",       post(generate_image))
    .route("/api/generate/video",       post(generate_video))
    .route("/api/generate/video/:id",   get(video_status))   // async poll
    .route("/api/upload/csv",           post(upload_csv))
    .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
    .layer(TraceLayer::new_for_http())
```

---

## X.ai API Reference

| Endpoint | Method | Notes |
|----------|--------|-------|
| `/v1/chat/completions` | POST | Text — use via api_xai crate |
| `/v1/models` | GET | Model list — use via api_xai crate |
| `/v1/images/generations` | POST | Image — use reqwest, pass `aspect_ratio` as string |
| `/v1/videos/generations` | POST | Video — async, returns job `id` |
| `/v1/videos/generations/{id}` | GET | Poll video job status |

Base URL: `https://api.x.ai/v1` (override with `XAI_API_URL` in `.env`)

### Environment Variables

Add to `docker/.env` (webroot-level, shared across all tools):

```bash
XAI_API_KEY=your-key-from-console.x.ai
XAI_API_URL=https://api.x.ai/v1
XAI_TEXT_MODEL=grok-3-mini-beta
XAI_IMAGE_MODEL=grok-imagine-image
XAI_VIDEO_MODEL=grok-imagine-video
GEN_MODEL_PROVIDER=xai           # switch to openai/gemini/claude when stubs are implemented
ARTS_ENGINE_PORT=8082             # claude agent arts engine API port
```

Also update `docker/.env.example` with placeholder values for all new keys.

---

## prompts.csv Format

Compatible with the existing `ME-prompts-2021.csv` NAICS format. Required column: `Prompt`. Optional columns:

```csv
scene,prompt,aspect_ratio,style,notes,Naics,Industry,Count
1,"A honey bee near wildflowers at golden hour",square,photorealistic,Opening shot,7225,Restaurants,1
2,"Forest canopy with sunlight rays",landscape-wide,cinematic,Wide shot,,,
```

---

## Implementation Steps

1. Copy template files into your agent subfolder
2. Review and optionally customize `config.yaml`
3. Implement `js/app.js` (ArtsEngine class per UX guide above)
4. Build `rust-api/` following the module structure above
5. Run `cargo check` from `rust-api/` — fix any errors before proceeding
6. Add `XAI_API_KEY` to `docker/.env`
7. Start backend: `cd rust-api && cargo run`
8. Verify: `curl http://localhost:8082/api/health`
9. Open `http://localhost:8887/requests/claude/` in browser
10. Test: enter a prompt → Generate → image appears in gallery and storyboard node

### Usage Flow

1. User enters a prompt or loads a `.csv` file
2. User selects aspect ratio, output type (image/text), variations
3. User clicks Generate (or Ctrl+Enter)
4. Frontend POSTs to `/api/generate/image` or `/api/generate/text`
5. Rust backend authenticates with `XAI_API_KEY` and calls X.ai API
6. Response `media_urls` or `text` returned to frontend
7. Gallery and storyboard update live
8. User optionally saves results to their GitHub repo using the token widget

---

## Guidance and References

- **localsite/AGENTS.md** — JamStack UI conventions, hash management, waitForElm
- **X.ai API Docs**: https://docs.x.ai/docs
- **api_xai Rust crate**: https://docs.rs/api_xai/latest/api_xai/
- **FloraFauna.ai** — storyboard flowchart style reference
- **docker/.env** — API keys and server config (webroot-level, gitignored)
- **projects/js/issues.js** — GitHub token widget (reuse `GitHubIssuesManager`)
- **projects/css/issues.css** — widget styles (include in page)
