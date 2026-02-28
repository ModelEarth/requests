# API Provider Architecture

Each file in this directory implements the `GenerativeModel` trait for one AI Agent
backend. The trait defines a uniform interface — `generate_text`, `generate_image`,
`generate_video`, `video_status` — so `main.rs` handlers never know which
provider is active at runtime.

| File | Covers |
|------|--------|
| `openai_compat.rs` | OpenAI, Groq, Fireworks AI, Together AI, Mistral, any OpenAI-wire-format service |
| `claude.rs` | Anthropic Claude — own wire format, see divergences below |
| `gemini.rs` | Google Gemini (text) and Imagen (image) |
| `xai.rs` | [xAI](https://console.x.ai) Grok via the `api_xai` crate |
<br>

## Multiple providers use openai_compat.rs

A large and growing set of inference services implement the same OpenAI REST
wire-format: `POST /v1/chat/completions` for text and `POST /v1/images/generations`
for images. The request and response shapes are identical; only the `base_url`
and `api_key` differ. `OpenAICompatProvider` is constructed with those two values
plus optional model overrides:

```rust
OpenAICompatProvider::new("groq", "https://api.groq.com/openai", key)
    .with_text_model("llama-3.3-70b-versatile")
```

## Default Provider List (includes URLs)

| Provider      | X-Provider-URL Hardcoded | Default text model |
|---------------|----------|--------------------|
| `openai`      | `https://api.openai.com` | `gpt-4o` |
| `groq`        | `https://api.groq.com/openai` | `llama-3.3-70b-versatile` |
| `together`    | `https://api.together.xyz` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| `fireworks`   | `https://api.fireworks.ai/inference` | `accounts/fireworks/models/llama-v3p3-70b-instruct` |
| `mistral`     | `https://api.mistral.ai` | `mistral-large-latest` |
| `perplexity`  | `https://api.perplexity.ai` | `llama-3.1-sonar-large-128k-online` |
| `deepseek`    | `https://api.deepseek.com` | `deepseek-chat` |
| `claude`      | *(own file — see below)* | `claude-sonnet-4-6` |
| `gemini`      | *(own file — see below)* | `gemini-2.0-flash` |
| `xai`         | *(own crate — see below)* | `grok-3-mini-beta` |

<br>

**Add OpenAI-compatible services** by providing their `X-Provider-URL` since `openai_compat.rs` is used automatically.


## Why Gemini, Claude and xAI  have their own files

**Gemini** uses a different request structure. Text generation goes to
`/v1beta/models/{model}:generateContent` with a `contents[].parts[]` nesting
rather than a flat `messages[]` array. Image generation (`Imagen`) goes to a
separate `:predict` endpoint and returns base64-encoded bytes rather than URLs.
Video generation (Veo) is a long-running operation polled via a separate status
call. These shapes can't be expressed as simple field substitutions in a shared
struct without closures that become as long as a dedicated file.

**Claude** diverges at the system prompt: the Anthropic API takes `system` as a
top-level string field, not as a message with `role: "system"` inside the
messages array. It also uses `max_tokens` as a required field (not optional),
has its own versioned header (`anthropic-version`), and returns content as
`content[].text` rather than `choices[].message.content`. A generic adapter
would need enough special-casing that a separate `claude.rs` is clearer.

**xAI** The `api_xai` Rust crate wraps the xAI HTTP layer entirely, providing typed
structs for chat completions and model listing. Using it means skipping the
`reqwest` layer for text generation, which gives compile-time request validation.
That crate-level integration can't be expressed as a URL + header substitution,
so `xai.rs` remains its own file regardless of how many other providers share
`openai_compat.rs`.

## Provider selection at runtime

`build_provider` (startup, reads `docker/.env`) and `build_provider_dynamic`
(per-request, reads `X-Provider-Name` / `X-Provider-Key` / `X-Provider-URL`
headers from the frontend) both match on a provider name string and return
`Arc<dyn GenerativeModel>`.
