/**
 * Arts Engine API for Cloudflare Workers: a JavaScript port of
 * ../rust-api, serving the same routes and response shapes so
 * engine/index.html works against either one.
 *
 *   Locally:     the Rust backend (rust-api) on port 8082, as before.
 *   cloud.model.earth: this file, imported by CloudRoot's Worker
 *                (worker/src/index.js), on the page's own origin.
 *
 *   GET  /api/health
 *   GET  /api/models
 *   POST /api/generate/text | image | video | 3d
 *   GET  /api/generate/video/{id}
 *   POST /api/upload/tripo
 *   GET  /api/proxy/model?url=
 *
 * Unlike rust-api, this doesn't use keys held by the server on its own:
 * every generation request carries a key in the X-Provider-Name /
 * X-Provider-Key headers (X-Provider-URL for an unlisted OpenAI-compatible
 * service), which the page sends from its key manager. So /api/health
 * reports no server providers. The one exception: typing the site's
 * passphrase (ARTS_ENGINE_PASSPHRASE) as the Gemini key uses the server's
 * GEMINI_API_KEY instead, so people who know it can use Gemini without a
 * key of their own.
 *
 * Plain fetch, no dependencies. Kept within Cloudflare's free plan limit
 * of 50 outgoing requests per request (see run3dTask).
 */

const ENGINE_ROUTES = [
  "/api/health",
  "/api/models",
  "/api/generate/text",
  "/api/generate/image",
  "/api/generate/video",
  "/api/generate/3d",
  "/api/upload/tripo",
  "/api/proxy/model",
];

export function isEnginePath(path) {
  return ENGINE_ROUTES.includes(path) || path.startsWith("/api/generate/video/");
}

export async function handleEngine(request, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  try {
    if (path === "/api/health") {
      return json({ ok: true, provider: "", available_providers: [], message: "Arts Engine API is ready" });
    }
    if (path === "/api/models") {
      const provider = await providerFromHeaders(request.headers, env, { required: false });
      return json({ models: provider ? await provider.listModels() : [] });
    }
    if (path === "/api/proxy/model") {
      requireMethod(method, "GET");
      return await proxyModel(url.searchParams.get("url") || "");
    }
    if (path.startsWith("/api/generate/video/")) {
      requireMethod(method, "GET");
      const id = decodeURIComponent(path.slice("/api/generate/video/".length));
      return json(await (await providerFromHeaders(request.headers, env)).videoStatus(id));
    }

    requireMethod(method, "POST");
    const body = await request.json().catch(() => {
      throw new Error("Invalid JSON body");
    });

    if (path === "/api/upload/tripo") return json(await uploadTripoImage(body, requireKey(request.headers, "Tripo upload")));
    if (path === "/api/generate/3d") return json(await run3dTask(body, requireKey(request.headers, "3D generation")));

    requirePrompt(body);
    const provider = await providerFromHeaders(request.headers, env);
    if (path === "/api/generate/text") return json(await provider.generateText(body));
    if (path === "/api/generate/image") return json(await provider.generateImage(body));
    if (path === "/api/generate/video") return json(await provider.generateVideo(body));
    return json({ error: `No API at ${path}` }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}

// ---- requests and responses ------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

class MethodError extends Error {}

function requireMethod(method, expected) {
  if (method !== expected) throw new MethodError(`Method ${method} not allowed`);
}

// Same status rule as rust-api's AppError: messages about missing, invalid
// or required input are the caller's fault (400), anything else is 500.
function errorResponse(error) {
  const message = error?.message || String(error);
  if (error instanceof MethodError) return json({ error: message }, 405);
  const lowered = message.toLowerCase();
  const status = /missing|invalid|required/.test(lowered) ? 400 : 500;
  return json({ error: message }, status);
}

function requirePrompt(body) {
  if (typeof body?.prompt !== "string" || !body.prompt.trim()) throw new Error("Prompt is required");
}

function header(headers, name) {
  const value = (headers.get(name) || "").trim();
  return value || null;
}

function requireKey(headers, what) {
  const key = header(headers, "x-provider-key");
  if (!key) throw new Error(`${what} requires a provider API key (X-Provider-Key)`);
  return key;
}

// Result shape shared by every provider, as in rust-api's GenerationResponse:
// id, text, usage and media_urls are left out when empty.
function generation({ provider, model, status, id, text, usage, mediaUrls = [], raw }) {
  const out = { provider, model, status };
  if (id != null) out.id = id;
  if (text != null) out.text = text;
  if (usage) out.usage = usage;
  if (mediaUrls.length) out.media_urls = mediaUrls;
  out.raw = raw;
  return out;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function apiError(name, response, data) {
  return new Error(`${name} API error (${response.status} ${response.statusText}): ${JSON.stringify(data)}`);
}

// ---- images ----------------------------------------------------------------

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  let binary;
  try {
    binary = atob(base64.replace(/\s+/g, ""));
  } catch (error) {
    throw new Error(`invalid base64 image: ${error.message}`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// A `data:` URL (an upload or an earlier output) or a public http(s) URL,
// as { mime, bytes }.
async function decodeImage(src) {
  if (src.startsWith("data:")) {
    const comma = src.indexOf(",");
    if (comma < 0) throw new Error("malformed data URL");
    const meta = src.slice(5, comma);
    if (!meta.includes("base64")) throw new Error("only base64 data URLs are supported for image input");
    return { mime: meta.split(";")[0] || "image/png", bytes: base64ToBytes(src.slice(comma + 1)) };
  }
  const response = await fetch(src);
  return {
    mime: response.headers.get("Content-Type") || "image/png",
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

// ---- passphrase --------------------------------------------------------------
// ARTS_ENGINE_PASSPHRASE and GEMINI_API_KEY are Worker secrets, set from the
// local env file (automation/sync-config.sh -> GitHub secrets -> deploy).
// A passphrase shorter than 12 characters is ignored: nothing limits how
// often it can be guessed.

const PLACEHOLDER = /^(your[-_]|sk-your|<|example|placeholder|xxx|changeme|change_me|todo|dummy)/i;
const MIN_PASSPHRASE_LENGTH = 12;

function serverValue(env, name) {
  const value = String(env?.[name] || "").trim();
  if (!value || PLACEHOLDER.test(value) || value.includes("_here")) return null;
  return value;
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function sameText(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// For `key` typed in the page's Gemini key field, compared with the site's
// passphrase by hash, in constant time:
//   "match"    it's the passphrase, and the server has a Gemini key to use
//   "invalid"  it's the passphrase, but the passphrase contains a phrase
//              that marks placeholders (see PLACEHOLDER), so it's off
//   null       anything else; the key is used as typed
// Also used by the Worker's /api/validate-key.
export async function checkEnginePassphrase(env, provider, key) {
  if (provider !== "google" || !key) return null;
  const configured = String(env?.ARTS_ENGINE_PASSPHRASE || "").trim();
  if (!configured || !(await sameText(key, configured))) return null;
  if (!serverValue(env, "ARTS_ENGINE_PASSPHRASE")) return "invalid";
  if (configured.length < MIN_PASSPHRASE_LENGTH || !serverValue(env, "GEMINI_API_KEY")) return null;
  return "match";
}

// ---- providers -------------------------------------------------------------
// Each provider: { name, listModels, generateText, generateImage,
// generateVideo, videoStatus }, mirroring rust-api/src/providers.

const OPENAI_COMPAT = {
  openai: { baseUrl: "https://api.openai.com", textModel: "gpt-4o", imageModel: "dall-e-3" },
  groq: { baseUrl: "https://api.groq.com/openai", textModel: "llama-3.3-70b-versatile" },
  together: { baseUrl: "https://api.together.xyz", textModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  fireworks: { baseUrl: "https://api.fireworks.ai/inference", textModel: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
  mistral: { baseUrl: "https://api.mistral.ai", textModel: "mistral-large-latest" },
  perplexity: { baseUrl: "https://api.perplexity.ai", textModel: "llama-3.1-sonar-large-128k-online" },
  deepseek: { baseUrl: "https://api.deepseek.com", textModel: "deepseek-chat" },
  pollinations: { baseUrl: "https://gen.pollinations.ai", imageModel: "flux" },
};

async function providerFromHeaders(headers, env, { required = true } = {}) {
  const name = header(headers, "x-provider-name");
  const key = header(headers, "x-provider-key");
  if (!name || !key) {
    if (!required) return null;
    throw new Error("Missing provider key: add one under My Model Keys.");
  }
  if (name === "google") {
    const passphrase = await checkEnginePassphrase(env, name, key);
    if (passphrase === "invalid") throw new Error("Passkey contains invalid phrase.");
    return geminiProvider(passphrase === "match" ? serverValue(env, "GEMINI_API_KEY") : key);
  }
  if (name === "anthropic") return claudeProvider(key);
  if (name === "xai") return xaiProvider(key);
  if (OPENAI_COMPAT[name]) return openAICompatProvider(name, key, OPENAI_COMPAT[name]);
  const baseUrl = header(headers, "x-provider-url");
  if (baseUrl) return openAICompatProvider(name, key, { baseUrl });
  throw new Error(`Unknown provider '${name}': supply X-Provider-URL for OpenAI-compatible endpoints`);
}

function unsupported(message) {
  return async () => {
    throw new Error(message);
  };
}

// OpenAI wire format: /v1/chat/completions, /v1/images/generations and
// /v1/images/edits. OpenAI, Groq, Together, Fireworks, Mistral, Perplexity,
// DeepSeek, Pollinations, and any other compatible service.
function openAICompatProvider(name, apiKey, { baseUrl, textModel = "gpt-4o-mini", imageModel = null }) {
  const base = baseUrl.replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${apiKey}` };

  async function post(path, body) {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await readJson(response);
    if (!response.ok) throw apiError(name, response, data);
    return data;
  }

  // DALL-E 3 supports 1024x1024, 1792x1024 and 1024x1792 only.
  const aspectToSize = (aspect) => ({ "16:9": "1792x1024", "9:16": "1024x1792" })[aspect] || "1024x1024";

  const imageUrls = (raw) =>
    (Array.isArray(raw.data) ? raw.data : [])
      .map((item) => item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : null))
      .filter(Boolean);

  async function generateImageEdit(request, model, images) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", request.prompt);
    form.append("size", aspectToSize(request.aspect_ratio || "1:1"));
    form.append("response_format", request.response_format || "url");
    for (const [i, image] of images.entries()) {
      const { mime, bytes } = await decodeImage(image);
      const ext = mime.split("/").pop() || "png";
      form.append("image", new Blob([bytes], { type: mime }), `image_${i}.${ext}`);
    }
    const response = await fetch(`${base}/v1/images/edits`, { method: "POST", headers: auth, body: form });
    const raw = await readJson(response);
    if (!response.ok) throw new Error(`${name} image edit error (${response.status} ${response.statusText}): ${JSON.stringify(raw)}`);
    const mediaUrls = imageUrls(raw);
    return generation({ provider: name, model, status: mediaUrls.length ? "completed" : "failed", mediaUrls, raw });
  }

  return {
    name,
    async listModels() {
      // /v1/models is optional; not every compatible service has it.
      try {
        const response = await fetch(`${base}/v1/models`, { headers: auth });
        if (response.ok) {
          const data = await readJson(response);
          return (data.data || [])
            .filter((m) => typeof m.id === "string")
            .map((m) => ({ id: m.id, owned_by: m.owned_by || "", created: m.created || 0 }));
        }
      } catch {}
      return [{ id: textModel, owned_by: name, created: 0 }];
    },
    async generateText(request) {
      const model = request.model || textModel;
      const messages = [];
      if (request.system_prompt?.trim()) messages.push({ role: "system", content: request.system_prompt });
      messages.push({ role: "user", content: request.prompt });
      const body = { model, messages };
      if (request.temperature != null) body.temperature = request.temperature;
      if (request.max_tokens != null) body.max_tokens = request.max_tokens;
      const raw = await post("/v1/chat/completions", body);
      const usage = raw.usage
        ? {
            prompt_tokens: raw.usage.prompt_tokens || 0,
            completion_tokens: raw.usage.completion_tokens || 0,
            total_tokens: raw.usage.total_tokens || 0,
          }
        : null;
      return generation({
        provider: name,
        model,
        status: "completed",
        id: typeof raw.id === "string" ? raw.id : null,
        text: raw.choices?.[0]?.message?.content || "",
        usage,
        raw,
      });
    },
    async generateImage(request) {
      const model = request.model || imageModel;
      if (!model) throw new Error(`${name}: no image model configured`);
      if (request.image_urls?.length) return generateImageEdit(request, model, request.image_urls);
      const raw = await post("/v1/images/generations", {
        model,
        prompt: request.prompt,
        n: 1,
        size: aspectToSize(request.aspect_ratio || "1:1"),
        response_format: request.response_format || "url",
      });
      const mediaUrls = imageUrls(raw);
      return generation({ provider: name, model, status: mediaUrls.length ? "completed" : "failed", mediaUrls, raw });
    },
    generateVideo: unsupported(`${name} does not support video generation via the OpenAI-compatible API`),
    videoStatus: unsupported(`${name} video status not supported`),
  };
}

// Anthropic: `system` is a top-level string, max_tokens is required, every
// request carries anthropic-version, and the text is at content[].text.
function claudeProvider(apiKey) {
  const defaultModel = "claude-sonnet-4-6";
  return {
    name: "anthropic",
    async listModels() {
      return ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"].map((id) => ({
        id,
        owned_by: "anthropic",
        created: 0,
      }));
    },
    async generateText(request) {
      const model = request.model || defaultModel;
      const body = {
        model,
        max_tokens: request.max_tokens || 1024,
        messages: [{ role: "user", content: request.prompt }],
      };
      if (request.system_prompt?.trim()) body.system = request.system_prompt;
      if (request.temperature != null) body.temperature = request.temperature;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await readJson(response);
      if (!response.ok) throw apiError("Claude", response, raw);
      const input = raw.usage?.input_tokens || 0;
      const output = raw.usage?.output_tokens || 0;
      return generation({
        provider: "anthropic",
        model,
        status: "completed",
        id: typeof raw.id === "string" ? raw.id : null,
        text: raw.content?.[0]?.text || "",
        usage: raw.usage ? { prompt_tokens: input, completion_tokens: output, total_tokens: input + output } : null,
        raw,
      });
    },
    generateImage: unsupported("Claude does not support image generation"),
    generateVideo: unsupported("Claude does not support video generation"),
    videoStatus: unsupported("Claude does not support video generation"),
  };
}

// Gemini: text through :generateContent, text-to-image through Imagen's
// :predict, and image editing through gemini-2.5-flash-image.
function geminiProvider(apiKey) {
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const textModel = "gemini-2.5-flash";
  const imageModel = "imagen-4.0-generate-001";
  const imageEditModel = "gemini-2.5-flash-image";

  async function post(model, action, payload) {
    const response = await fetch(`${base}/models/${model}:${action}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await readJson(response);
    if (!response.ok) {
      throw new Error(`Gemini API error (${response.status} ${response.statusText}) ${base}/models/${model}:${action}: ${JSON.stringify(raw)}`);
    }
    return raw;
  }

  return {
    name: "google",
    async listModels() {
      return ["gemini-2.0-flash", "gemini-2.0-flash-thinking-exp", "imagen-3.0-generate-002"].map((id) => ({
        id,
        owned_by: "google",
        created: 0,
      }));
    },
    async generateText(request) {
      const model = request.model || textModel;
      const parts = [];
      if (request.system_prompt?.trim()) parts.push({ text: request.system_prompt });
      parts.push({ text: request.prompt });
      const raw = await post(model, "generateContent", {
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: request.max_tokens || 1024 },
      });
      return generation({
        provider: "google",
        model,
        status: "completed",
        text: raw.candidates?.[0]?.content?.parts?.[0]?.text || "",
        raw,
      });
    },
    async generateImage(request) {
      if (request.image_urls?.length) {
        // The model ids the page lists can't output images, so editing always
        // uses the image-output model.
        const parts = [{ text: request.prompt }];
        for (const image of request.image_urls) {
          const { mime, bytes } = await decodeImage(image);
          parts.push({ inline_data: { mime_type: mime, data: bytesToBase64(bytes) } });
        }
        const raw = await post(imageEditModel, "generateContent", {
          contents: [{ parts }],
          generationConfig: { responseModalities: ["IMAGE"] },
        });
        const mediaUrls = (raw.candidates || [])
          .flatMap((c) => c.content?.parts || [])
          .map((part) => part.inlineData || part.inline_data)
          .filter((inline) => inline?.data)
          .map((inline) => `data:${inline.mimeType || inline.mime_type || "image/png"};base64,${inline.data}`);
        return generation({ provider: "google", model: imageEditModel, status: mediaUrls.length ? "completed" : "failed", mediaUrls, raw });
      }
      const raw = await post(imageModel, "predict", {
        instances: [{ prompt: request.prompt }],
        parameters: { sampleCount: 1, aspectRatio: request.aspect_ratio || "1:1" },
      });
      // Imagen returns base64; data URLs let the gallery show them directly.
      const mediaUrls = (raw.predictions || [])
        .filter((p) => p.bytesBase64Encoded)
        .map((p) => `data:${p.mimeType || "image/png"};base64,${p.bytesBase64Encoded}`);
      return generation({ provider: "google", model: imageModel, status: mediaUrls.length ? "completed" : "failed", mediaUrls, raw });
    },
    generateVideo: unsupported("Gemini video generation is not yet implemented — use xAI provider for video"),
    videoStatus: unsupported("Gemini video status is not yet implemented"),
  };
}

// xAI: OpenAI-style chat, plus its own image and video endpoints. Media URLs
// are every http(s) string anywhere in the response.
function xaiProvider(apiKey) {
  const base = "https://api.x.ai/v1";
  const defaults = { text: "grok-3-mini-beta", image: "grok-imagine-image", video: "grok-imagine-video" };
  const auth = { Authorization: `Bearer ${apiKey}` };

  async function call(path, init = {}) {
    const response = await fetch(`${base}/${path}`, {
      ...init,
      headers: { ...auth, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
    const body = await response.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      data = { text: body };
    }
    if (!response.ok) throw new Error(`xAI API error (${response.status} ${response.statusText}): ${JSON.stringify(data)}`);
    return data;
  }

  function mediaUrls(raw) {
    const urls = new Set();
    (function collect(value) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) urls.add(trimmed);
      } else if (Array.isArray(value)) {
        value.forEach(collect);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(collect);
      }
    })(raw);
    return [...urls].sort();
  }

  const first = (raw) => (Array.isArray(raw.data) ? raw.data[0] : null);
  const str = (value) => (typeof value === "string" ? value : null);
  const responseId = (raw) => str(raw.id) || str(raw.request_id) || str(raw.video_id) || str(first(raw)?.id);
  const responseStatus = (raw, urls) => str(raw.status) || str(first(raw)?.status) || (urls.length ? "completed" : "submitted");

  function mediaResult(model, raw) {
    const urls = mediaUrls(raw);
    return generation({
      provider: "xai",
      model,
      status: responseStatus(raw, urls),
      id: responseId(raw),
      text: str(raw.message),
      mediaUrls: urls,
      raw,
    });
  }

  return {
    name: "xai",
    async listModels() {
      const data = await call("models");
      return (data.data || []).map((m) => ({ id: m.id, owned_by: m.owned_by || "", created: m.created || 0 }));
    },
    async generateText(request) {
      const model = request.model || defaults.text;
      const messages = [];
      if (request.system_prompt?.trim()) messages.push({ role: "system", content: request.system_prompt });
      messages.push({ role: "user", content: request.prompt });
      const body = { model, messages };
      if (request.temperature != null) body.temperature = request.temperature;
      if (request.max_tokens != null) body.max_tokens = request.max_tokens;
      const raw = await call("chat/completions", { method: "POST", body: JSON.stringify(body) });
      const usage = raw.usage || {};
      return generation({
        provider: "xai",
        model,
        status: "completed",
        id: str(raw.id),
        text: (raw.choices || []).map((c) => c.message?.content).filter((t) => t != null).join("\n"),
        usage: {
          prompt_tokens: usage.prompt_tokens || 0,
          completion_tokens: usage.completion_tokens || 0,
          total_tokens: usage.total_tokens || 0,
        },
        raw,
      });
    },
    async generateImage(request) {
      const model = request.model || defaults.image;
      const payload = {
        model,
        prompt: request.prompt,
        aspect_ratio: request.aspect_ratio || "16:9",
        response_format: request.response_format || "url",
      };
      if (request.image_urls) payload.image_urls = request.image_urls;
      return mediaResult(model, await call("images/generations", { method: "POST", body: JSON.stringify(payload) }));
    },
    async generateVideo(request) {
      const model = request.model || defaults.video;
      const payload = {
        model,
        prompt: request.prompt,
        aspect_ratio: request.aspect_ratio || "16:9",
        duration: request.duration_seconds || 8,
      };
      if (request.image_urls) payload.image_urls = request.image_urls;
      return mediaResult(model, await call("videos/generations", { method: "POST", body: JSON.stringify(payload) }));
    },
    async videoStatus(id) {
      if (!id.trim()) throw new Error("Video generation id is required");
      const result = mediaResult(defaults.video, await call(`videos/${encodeURIComponent(id)}`));
      if (result.id == null) result.id = id;
      return result;
    },
  };
}

// ---- 3D (task APIs such as Meshy and Tripo) -----------------------------------
// The request is the provider's task spec from providers.js, so nothing here
// is provider-specific: submit, poll {submit_url}/{task_id}, read the model
// URLs. See rust-api/src/task3d.rs.

// rust-api polls every 5 s for 5 minutes (60 polls). Cloudflare's free plan
// allows 50 outgoing requests per request, so poll every 7 s, 42 times.
const POLL_INTERVAL_MS = 7000;
const POLL_ATTEMPTS = 42;

function getPath(value, path) {
  let current = value;
  for (const segment of path.split(".")) {
    if (current == null || typeof current !== "object" || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function check3dError(spec, response, data) {
  const status = `${response.status} ${response.statusText}`;
  if (spec.error_code_path) {
    const code = getPath(data, spec.error_code_path);
    if (Number.isInteger(code) && code !== 0) {
      if (spec.no_credits_code === code) throw new Error("NO_CREDITS");
      throw new Error(`3D API error (${status}): ${JSON.stringify(data)}`);
    }
  }
  if (!response.ok) throw new Error(`3D API error (${status}): ${JSON.stringify(data)}`);
}

async function run3dTask(spec, apiKey) {
  for (const field of ["submit_url", "task_id_path", "status_value_path", "output_path"]) {
    if (typeof spec?.[field] !== "string") throw new Error(`3D spec is missing ${field}`);
  }
  const provider = spec.provider || "3d";
  const auth = { Authorization: `Bearer ${apiKey}` };

  const submitted = await fetch(spec.submit_url, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(spec.submit_body),
  });
  const data = await readJson(submitted);
  check3dError(spec, submitted, data);

  const taskId = getPath(data, spec.task_id_path);
  if (typeof taskId !== "string") throw new Error(`${provider}: no task id at '${spec.task_id_path}' in ${JSON.stringify(data)}`);

  const statusUrl = `${spec.submit_url.replace(/\/+$/, "")}/${taskId}`;
  let raw = null;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !raw; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    let polled;
    try {
      polled = await fetch(statusUrl, { headers: auth });
    } catch {
      continue;
    }
    const result = await readJson(polled);
    if (!polled.ok) continue;
    const status = getPath(result, spec.status_value_path);
    if ((spec.status_success || []).includes(status)) raw = result;
    else if ((spec.status_failure || []).includes(status)) {
      const message = (spec.error_message_path && getPath(result, spec.error_message_path)) || status;
      throw new Error(`${provider} 3D generation failed: ${message}`);
    }
  }
  if (!raw) throw new Error(`${provider} 3D generation timed out after 5 minutes`);

  const output = getPath(raw, spec.output_path);
  const mediaUrls = (spec.output_keys || [])
    .map((key) => output?.[key])
    .filter((value) => typeof value === "string" && value);
  return generation({
    provider,
    model: spec.model || "",
    status: mediaUrls.length ? "completed" : "failed",
    id: taskId,
    mediaUrls,
    raw,
  });
}

async function uploadTripoImage(body, apiKey) {
  const image = typeof body?.image === "string" ? body.image : "";
  if (!image.startsWith("data:")) throw new Error("Tripo upload requires a data URL");
  const comma = image.indexOf(",");
  if (comma < 0) throw new Error("malformed image data URL");
  const meta = image.slice(5, comma);
  if (!meta.includes("base64")) throw new Error("image data URL must be base64");
  const mime = meta.split(";")[0] || "image/jpeg";
  const extension = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg" }[mime];
  if (!extension) throw new Error("Tripo supports JPEG or PNG input");
  const bytes = base64ToBytes(image.slice(comma + 1));
  if (bytes.length > 20 * 1024 * 1024) throw new Error("Tripo image input exceeds 20 MB");

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), `node-input.${extension}`);
  const response = await fetch("https://api.tripo3d.ai/v2/openapi/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const raw = await readJson(response);
  if (!response.ok || (raw.code ?? 0) !== 0) throw new Error(`Tripo upload failed: ${JSON.stringify(raw)}`);
  const token = raw.data?.image_token;
  if (typeof token !== "string") throw new Error("Tripo upload returned no image token");
  return { file_token: token, file_type: extension };
}

// ---- model proxy -------------------------------------------------------------
// Fetches a generated 3D model so the page's viewer isn't blocked by the
// provider storage's CORS policy. Public http(s) hosts only, up to 100 MB.

const MAX_MODEL_BYTES = 100 * 1024 * 1024;

function isPrivateHost(host) {
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (host.startsWith("[")) {
    const v6 = host.slice(1, -1).toLowerCase();
    return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
  }
  return false;
}

async function proxyModel(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new Error("invalid model URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid model URL: must use http or https");
  if (isPrivateHost(url.hostname.toLowerCase())) throw new Error("invalid model host");

  const upstream = await fetch(url);
  if (!upstream.ok) throw new Error(`model host returned HTTP ${upstream.status}`);
  if (Number(upstream.headers.get("Content-Length") || 0) > MAX_MODEL_BYTES) {
    throw new Error("model exceeds 100 MB proxy limit");
  }

  // Stream it through, stopping at 100 MB when the host gave no length.
  let received = 0;
  const limit = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_MODEL_BYTES) controller.error(new Error("model exceeds 100 MB proxy limit"));
      else controller.enqueue(chunk);
    },
  });
  return new Response(upstream.body.pipeThrough(limit), {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "model/gltf-binary",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
