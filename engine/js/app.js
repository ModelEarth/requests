/**
 * Arts Engine — X.ai Image & Text Generation
 * Frontend JavaScript — template reference copy.
 *
 * Agents: copy this file to your subfolder as js/app.js and customize.
 *
 * API backend defaults to http://localhost:8091 (set in template/config.yaml).
 * Override at runtime by setting window.AE_API_BASE before this script runs,
 * or by providing an api_base value in your local config.yaml.
 *
 * Uses localsite.js utilities: waitForElm, getHash, goHash (no setTimeout).
 */

class ArtsEngine {
  constructor() {
    this.apiBase = (window.AE_API_BASE || 'http://localhost:8091') + '/api';
    this.scenes = [];         // Array of {scene, prompt, industry, naics, count, image, text}
    this.results = [];        // Generated images/text
    this.generating = false;
    this.lastRaw = null;
    this._healthRunning = false;
    this._lastActivity = Date.now();
    this._healthProvider = '';

    // Preferences (persisted to localStorage with ae_ prefix)
    this.prefs = {
      ratio:      this.loadPref('ratio', 'square'),
      outputType: this.loadPref('outputType', 'image'),
      provider:   this.loadPref('provider', 'gemini'),
      model:      this.loadPref('model', 'gemini-2.0-flash'),
      variations: parseInt(this.loadPref('variations', '1')),
    };

    this.init();
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  init() {
    const runCheck = async () => {
      this._healthRunning = true;
      const online = await this.checkBackendStatus();
      if (!online) {
        // Offline: retry every 1s until back up
        setTimeout(runCheck, 1000);
      } else if (Date.now() - this._lastActivity < 60000) {
        // Online and active within last minute: recheck in 10s
        setTimeout(runCheck, 10000);
      } else {
        // Online but idle > 1 minute: pause, go grey
        this._healthRunning = false;
        this._pauseHealth();
      }
    };

    setTimeout(runCheck, 50);

    // Track activity; restart health check if it had paused
    document.addEventListener('click', () => {
      this._lastActivity = Date.now();
      if (!this._healthRunning) runCheck();
    });

    // UI setup waits for DOM elements via waitForElm from localsite.js
    if (typeof waitForElm === 'function') {
      waitForElm('#generateBtn').then(() => this.setup());
    } else {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    }
  }

  _pauseHealth() {
    const dot = document.getElementById('backendDot');
    const label = document.getElementById('backendLabel');
    if (dot) dot.className = 'ae-backend-dot';
    if (label) label.textContent = `Click to ping ${this._healthProvider || 'API'}`;
  }

  setup() {
    this.initProviderSelector(); // populates selects before restorePrefs reads them
    this.bindEvents();
    this.restorePrefs();
    this.renderStoryboard();
    this.initGitHubWidget();
  }

  // -------------------------------------------------------------------------
  // LocalStorage preferences (all keys prefixed ae_)
  // -------------------------------------------------------------------------

  loadPref(key, defaultVal) {
    return localStorage.getItem('ae_' + key) || defaultVal;
  }

  savePref(key, val) {
    localStorage.setItem('ae_' + key, String(val));
  }

  restorePrefs() {
    document.querySelectorAll('.ae-ratio-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ratio === this.prefs.ratio);
    });
    document.querySelectorAll('.ae-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === this.prefs.outputType);
    });
    // providerSelect and modelSelect are managed by initProviderSelector()
    const varInput = document.getElementById('variationsInput');
    if (varInput) varInput.value = this.prefs.variations;
  }

  // -------------------------------------------------------------------------
  // Event binding
  // -------------------------------------------------------------------------

  bindEvents() {
    document.getElementById('generateBtn')?.addEventListener('click', () => this.generate());

    // Ctrl+Enter / Cmd+Enter triggers generation from textarea
    document.getElementById('promptInput')?.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') this.generate();
    });

    // CSV file upload
    document.getElementById('csvFileInput')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) this.handleCSVUpload(file);
    });

    // CSV drag-and-drop on prompt panel
    const promptPanel = document.getElementById('promptPanel');
    if (promptPanel) {
      promptPanel.addEventListener('dragover', e => {
        e.preventDefault();
        promptPanel.style.borderColor = '#4a90e2';
      });
      promptPanel.addEventListener('dragleave', () => {
        promptPanel.style.borderColor = '';
      });
      promptPanel.addEventListener('drop', e => {
        e.preventDefault();
        promptPanel.style.borderColor = '';
        const file = e.dataTransfer?.files?.[0];
        if (file && file.name.endsWith('.csv')) this.handleCSVUpload(file);
      });
    }

    // Aspect ratio buttons
    document.querySelectorAll('.ae-ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ae-ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.prefs.ratio = btn.dataset.ratio;
        this.savePref('ratio', this.prefs.ratio);
      });
    });

    // Output type buttons (skip disabled)
    document.querySelectorAll('.ae-type-btn').forEach(btn => {
      if (btn.classList.contains('disabled')) return;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ae-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.prefs.outputType = btn.dataset.type;
        this.savePref('outputType', this.prefs.outputType);
        this.updateModelRowVisibility();
      });
    });

    // Model selector — save per-provider so each provider remembers its last model
    document.getElementById('modelSelect')?.addEventListener('change', e => {
      this.prefs.model = e.target.value;
      this.savePref('model_' + (this.prefs.provider || 'gemini'), e.target.value);
    });

    // Variations input (clamp 1–4)
    document.getElementById('variationsInput')?.addEventListener('input', e => {
      let val = Math.max(1, Math.min(4, parseInt(e.target.value) || 1));
      e.target.value = val;
      this.prefs.variations = val;
      this.savePref('variations', val);
    });

    // Add scene button
    document.getElementById('addSceneBtn')?.addEventListener('click', () => this.addScene());

    // Clear prompts button
    document.getElementById('clearPromptsBtn')?.addEventListener('click', () => this.clearScenes());

    // Save to GitHub button
    document.getElementById('saveGithubBtn')?.addEventListener('click', () => this.saveToGitHub());

    // Lightbox close
    document.getElementById('aeLightbox')?.addEventListener('click', e => {
      if (e.target === e.currentTarget || e.target.classList.contains('ae-lightbox-close')) {
        this.closeLightbox();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.closeLightbox();
    });

    // Backend URL override in settings
    document.getElementById('apiBaseInput')?.addEventListener('change', e => {
      this.apiBase = e.target.value.trim().replace(/\/$/, '') + '/api';
    });
  }

  updateModelRowVisibility() {
    // model select is always visible; retained for type-btn change events
  }

  // -------------------------------------------------------------------------
  // CSV upload & parsing
  // -------------------------------------------------------------------------

  async handleCSVUpload(file) {
    const nameEl = document.getElementById('csvFileName');
    if (nameEl) nameEl.textContent = file.name;
    this.setStatus('info', `Loading ${file.name}…`);
    try {
      const text = await file.text();
      const parsed = this.parseCSVClientSide(text);
      this.scenes = parsed;
      this.renderPromptList();
      this.renderStoryboard();
      this.setStatus('success', `Loaded ${parsed.length} prompt${parsed.length !== 1 ? 's' : ''} from ${file.name}`);
    } catch (err) {
      this.setStatus('error', 'Failed to parse CSV: ' + err.message);
    }
  }

  parseCSVClientSide(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = this.parseCSVRow(lines[0]).map(h => h.trim().toLowerCase());
    const col = name => headers.indexOf(name);
    const promptIdx   = col('prompt');
    const industryIdx = col('industry');
    const countIdx    = col('count');
    const naicsIdx    = col('naics');
    const ratioIdx    = col('aspect_ratio');
    const styleIdx    = col('style');
    const sceneIdx    = col('scene');
    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCSVRow(lines[i]);
      if (!row.length) continue;
      const promptText = (promptIdx >= 0 ? row[promptIdx] : row[0])?.trim();
      if (!promptText) continue;
      results.push({
        scene:        sceneIdx >= 0 ? row[sceneIdx]?.trim() : String(i),
        prompt:       promptText,
        industry:     industryIdx >= 0 ? row[industryIdx]?.trim() : '',
        count:        countIdx >= 0    ? row[countIdx]?.trim()    : '',
        naics:        naicsIdx >= 0    ? row[naicsIdx]?.trim()    : '',
        aspect_ratio: ratioIdx >= 0    ? row[ratioIdx]?.trim()    : '',
        style:        styleIdx >= 0    ? row[styleIdx]?.trim()    : '',
        image: null, text: null,
      });
    }
    return results;
  }

  parseCSVRow(line) {
    const result = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(field); field = '';
      } else {
        field += ch;
      }
    }
    result.push(field);
    return result;
  }

  // -------------------------------------------------------------------------
  // Prompt list UI
  // -------------------------------------------------------------------------

  renderPromptList() {
    const list = document.getElementById('promptList');
    if (!list) return;
    if (!this.scenes.length) { list.innerHTML = ''; return; }
    list.innerHTML = this.scenes.map((s, idx) => `
      <div class="prompt-item" data-idx="${idx}" onclick="artsEngine.selectScene(${idx})">
        <div class="prompt-item-num">${s.scene || idx + 1}</div>
        <div style="flex:1">
          <div class="prompt-item-text">${this.escapeHtml(s.prompt)}</div>
          ${s.industry ? `<div class="prompt-item-industry">${this.escapeHtml(s.industry)}</div>` : ''}
        </div>
        <button class="ae-csv-btn" style="padding:2px 8px;font-size:0.8rem"
          onclick="event.stopPropagation();artsEngine.removeScene(${idx})" title="Remove">×</button>
      </div>`).join('');
  }

  selectScene(idx) {
    const scene = this.scenes[idx];
    if (!scene) return;
    const ta = document.getElementById('promptInput');
    if (ta) ta.value = scene.prompt;
    document.querySelectorAll('.prompt-item').forEach((el, i) =>
      el.classList.toggle('selected', i === idx));

    // Apply scene's aspect_ratio if specified
    if (scene.aspect_ratio) {
      const mapped = this.ratioAlias(scene.aspect_ratio);
      if (mapped) {
        document.querySelectorAll('.ae-ratio-btn').forEach(btn =>
          btn.classList.toggle('active', btn.dataset.ratio === mapped));
        this.prefs.ratio = mapped;
        this.savePref('ratio', mapped);
      }
    }

    // Scroll to node in storyboard
    const node = document.querySelector(`.ae-node-card[data-idx="${idx}"]`);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  removeScene(idx) {
    this.scenes.splice(idx, 1);
    this.renderPromptList();
    this.renderStoryboard();
  }

  addScene() {
    const prompt = document.getElementById('promptInput')?.value.trim();
    if (!prompt) { this.setStatus('error', 'Enter a prompt first, then click Add Scene'); return; }
    this.scenes.push({
      scene: String(this.scenes.length + 1), prompt,
      industry: '', count: '', naics: '', aspect_ratio: '', style: '',
      image: null, text: null,
    });
    this.renderPromptList();
    this.renderStoryboard();
    const ta = document.getElementById('promptInput');
    if (ta) ta.value = '';
  }

  clearScenes() {
    this.scenes = [];
    this.renderPromptList();
    this.renderStoryboard();
    const ta = document.getElementById('promptInput');
    if (ta) ta.value = '';
    this.setStatus('', '');
  }

  // -------------------------------------------------------------------------
  // Storyboard flowchart (ComfyUI-style horizontal node row)
  // -------------------------------------------------------------------------

  renderStoryboard() {
    const container = document.getElementById('storyboardContainer');
    if (!container) return;

    if (!this.scenes.length) {
      container.innerHTML = `
        <div class="ae-flow-empty">
          <span class="material-icons" style="font-size:2rem;opacity:0.3">movie_filter</span>
          <p>Load a CSV or add scenes to build a storyboard</p>
        </div>`;
      return;
    }

    const nodes = this.scenes.map((scene, idx) => {
      const hasImage = !!scene.image;
      const thumbHtml = hasImage
        ? `<img class="ae-node-thumb" src="${this.escapeHtml(scene.image)}" alt="Scene ${idx+1}" loading="lazy">`
        : `<div class="ae-node-thumb" style="display:flex;align-items:center;justify-content:center;">
             <span class="material-icons" style="opacity:0.3;font-size:1.8rem">image</span>
           </div>`;
      const arrow = idx < this.scenes.length - 1
        ? `<div class="ae-node-arrow"><span class="material-icons">arrow_forward</span></div>` : '';
      return `
        <div class="ae-scene-node">
          <div class="ae-node-card" data-idx="${idx}" onclick="artsEngine.selectScene(${idx})">
            <div class="ae-node-num">Scene ${scene.scene || idx + 1}</div>
            ${thumbHtml}
            <div class="ae-node-prompt">${this.escapeHtml(scene.prompt)}</div>
            ${scene.style ? `<div class="ae-node-label">${this.escapeHtml(scene.style)}</div>` : ''}
          </div>
        </div>${arrow}`;
    }).join('');

    container.innerHTML = `
      <div class="ae-flow-wrapper">
        ${nodes}
        <button class="ae-add-scene-btn" onclick="artsEngine.addScene()" title="Add scene">
          <span class="material-icons">add</span>
        </button>
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Provider selector — localStorage aPro keys take priority over docker/.env
  // -------------------------------------------------------------------------

  static get PROVIDER_MODELS() {
    return {
      claude: [
        { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6' },
        { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      ],
      gemini: [
        { value: 'gemini-2.0-flash',              label: 'Gemini 2.0 Flash' },
        { value: 'gemini-2.0-flash-thinking-exp', label: 'Gemini 2.0 Flash Thinking' },
        { value: 'gemini-1.5-pro',                label: 'Gemini 1.5 Pro' },
        { value: 'gemini-1.5-flash',              label: 'Gemini 1.5 Flash' },
      ],
      openai: [
        { value: 'gpt-4o',      label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      ],
      xai: [
        { value: 'grok-3-mini-beta', label: 'Grok 3 Mini' },
        { value: 'grok-3',           label: 'Grok 3' },
        { value: 'grok-2-1212',      label: 'Grok 2' },
      ],
      groq: [
        { value: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B' },
        { value: 'llama-3.1-8b-instant',     label: 'Llama 3.1 8B' },
        { value: 'mixtral-8x7b-32768',       label: 'Mixtral 8x7B' },
      ],
      together: [
        { value: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',     label: 'Llama 3.3 70B Turbo' },
        { value: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B Turbo' },
      ],
      fireworks: [
        { value: 'accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B' },
        { value: 'accounts/fireworks/models/qwen2p5-72b-instruct',    label: 'Qwen 2.5 72B' },
      ],
      mistral: [
        { value: 'mistral-large-latest', label: 'Mistral Large' },
        { value: 'mistral-small-latest', label: 'Mistral Small' },
        { value: 'codestral-latest',     label: 'Codestral' },
      ],
      perplexity: [
        { value: 'llama-3.1-sonar-large-128k-online', label: 'Sonar Large (online)' },
        { value: 'llama-3.1-sonar-small-128k-online', label: 'Sonar Small (online)' },
      ],
      deepseek: [
        { value: 'deepseek-chat',     label: 'DeepSeek Chat' },
        { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
      ],
      env: [
        { value: 'grok-3-mini-beta', label: 'Grok 3 Mini (default)' },
        { value: 'grok-3',           label: 'Grok 3' },
      ],
    };
  }

  initProviderSelector() {
    const KEY_MAP = {
      'CLAUDE_API_KEY':      { id: 'claude',     label: 'Claude' },
      'GEMINI_API_KEY':      { id: 'gemini',     label: 'Gemini' },
      'OPENAI_API_KEY':      { id: 'openai',     label: 'OpenAI' },
      'XAI_API_KEY':         { id: 'xai',        label: 'xAI' },
      'GROQ_API_KEY':        { id: 'groq',       label: 'Groq' },
      'TOGETHER_API_KEY':    { id: 'together',   label: 'Together AI' },
      'FIREWORKS_API_KEY':   { id: 'fireworks',  label: 'Fireworks AI' },
      'MISTRAL_API_KEY':     { id: 'mistral',    label: 'Mistral' },
      'PERPLEXITY_API_KEY':  { id: 'perplexity', label: 'Perplexity' },
      'DEEPSEEK_API_KEY':    { id: 'deepseek',   label: 'DeepSeek' },
    };

    let aPro = {};
    try { aPro = JSON.parse(localStorage.getItem('aPro') || '{}'); } catch (_) {}

    const sel = document.getElementById('providerSelect');
    if (!sel) return;

    sel.innerHTML = '';
    for (const [keyName, { id, label }] of Object.entries(KEY_MAP)) {
      if (aPro[keyName]) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = label;
        sel.appendChild(opt);
      }
    }
    // Backend (.env) fallback — label updated to actual provider once health check resolves
    const envOpt = document.createElement('option');
    envOpt.id    = 'providerEnvOpt';
    envOpt.value = 'env';
    envOpt.textContent = 'Backend (.env)';
    sel.appendChild(envOpt);

    // Restore saved provider; default to gemini if available
    const saved = this.prefs.provider;
    const match = [...sel.options].find(o => o.value === saved);
    sel.value = match ? saved : sel.options[0].value;
    this.prefs.provider = sel.value;

    sel.addEventListener('change', () => {
      this.prefs.provider = sel.value;
      this.savePref('provider', sel.value);
      this.updateModelOptions();
    });

    this.updateModelOptions();
  }

  updateModelOptions() {
    const providerId = this.prefs.provider || 'gemini';
    const models = ArtsEngine.PROVIDER_MODELS[providerId] || ArtsEngine.PROVIDER_MODELS.env;
    const modelSel = document.getElementById('modelSelect');
    if (!modelSel) return;
    modelSel.innerHTML = models.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
    // Restore per-provider saved model
    const saved = this.loadPref('model_' + providerId, models[0].value);
    modelSel.value = [...modelSel.options].find(o => o.value === saved) ? saved : models[0].value;
    this.prefs.model = modelSel.value;
  }

  getActiveProvider() {
    const KEY_NAMES = {
      claude:     'CLAUDE_API_KEY',
      gemini:     'GEMINI_API_KEY',
      openai:     'OPENAI_API_KEY',
      xai:        'XAI_API_KEY',
      groq:       'GROQ_API_KEY',
      together:   'TOGETHER_API_KEY',
      fireworks:  'FIREWORKS_API_KEY',
      mistral:    'MISTRAL_API_KEY',
      perplexity: 'PERPLEXITY_API_KEY',
      deepseek:   'DEEPSEEK_API_KEY',
    };
    const providerId = document.getElementById('providerSelect')?.value || this.prefs.provider;
    if (!providerId || providerId === 'env') return null; // use backend .env
    let aPro = {};
    try { aPro = JSON.parse(localStorage.getItem('aPro') || '{}'); } catch (_) {}
    const key = aPro[KEY_NAMES[providerId]];
    return key ? { provider: providerId, key } : null;
  }

  buildProviderHeaders() {
    const active = this.getActiveProvider();
    if (!active) return {};
    if (active.provider === 'gemini') {
      alert('Using GEMINI_API_KEY from local storage (#apiProvider1).');
    }
    return { 'X-Provider-Name': active.provider, 'X-Provider-Key': active.key };
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  async generate() {
    if (window.AE_API_BASE) this.apiBase = window.AE_API_BASE.replace(/\/$/, '') + '/api';
    if (this.generating) return;
    const singlePrompt = document.getElementById('promptInput')?.value.trim();
    const promptsToRun = this.scenes.length
      ? this.scenes.map(s => ({ ...s }))
      : singlePrompt
        ? [{ scene: '1', prompt: singlePrompt, aspect_ratio: '', style: '', image: null, text: null }]
        : null;

    if (!promptsToRun) { this.setStatus('error', 'Enter a prompt or load a CSV file first'); return; }

    this.generating = true;
    const btn = document.getElementById('generateBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ae-spinner"></span> Generating…'; }

    try {
      if (promptsToRun.length > 1 && this.prefs.outputType === 'image') {
        await this.generateStoryboard(promptsToRun);
      } else {
        for (let i = 0; i < promptsToRun.length; i++) {
          this.setStatus('info', `Generating ${i + 1} of ${promptsToRun.length}…`);
          if (this.prefs.outputType === 'image') {
            for (let v = 0; v < this.prefs.variations; v++) {
              if (this.prefs.variations > 1)
                this.setStatus('info', `Scene ${i + 1}, variation ${v + 1} of ${this.prefs.variations}…`);
              await this.generateImage(promptsToRun[i], i);
            }
          } else if (this.prefs.outputType === 'video') {
            for (let v = 0; v < this.prefs.variations; v++) {
              if (this.prefs.variations > 1)
                this.setStatus('info', `Submitting video variation ${v + 1} of ${this.prefs.variations}…`);
              await this.generateVideo(promptsToRun[i], i);
            }
          } else {
            await this.generateText(promptsToRun[i], i);
          }
        }
      }
      this.setStatus('success', 'Generation complete!');
      document.getElementById('saveGithubBtn')?.classList.add('show');
    } catch (err) {
      const msg = err.message || '';
      const bar = document.getElementById('statusBar');
      if (bar) {
        bar.style.display = 'flex';
        bar.className = 'ae-panel statusbar error';
        if (msg.includes('unavailable') || msg.includes('503')) {
          bar.innerHTML = 'X.ai API temporarily unavailable — check <a href="https://status.x.ai/" target="_blank" style="color:inherit;text-decoration:underline">status.x.ai</a>';
        } else if (msg.toLowerCase().includes('fetch') || msg.includes('network') || msg.includes('refused')) {
          bar.innerHTML = `Backend unreachable at ${this.apiBase.replace('/api', '')} — run: <code>cd rust-api &amp;&amp; cargo run</code>`;
        } else {
          bar.textContent = 'Error: ' + msg;
        }
      }
      this._showRawPanel();
    } finally {
      this.generating = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons">auto_awesome</span> Generate';
      }
    }
  }

  async generateImage(scene, sceneIdx) {
    const ratio = this.ratioAlias(scene.aspect_ratio) || this.prefs.ratio;
    const resp = await fetch(`${this.apiBase}/generate/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.buildProviderHeaders() },
      body: JSON.stringify({ prompt: scene.prompt, aspect_ratio: this.ratioToApiString(ratio), response_format: 'url' }),
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`); }
    const data = await resp.json();
    this.lastRaw = data;
    this.renderRawPanel();
    const images = data.media_urls?.map(url => ({ url, prompt: scene.prompt, aspect_ratio: ratio })) || (data.images || []);
    if (this.scenes[sceneIdx] && images.length) this.scenes[sceneIdx].image = images[0].url || null;
    this.renderStoryboard();
    this.renderGallery(images.map(img => ({ ...img, type: 'image' })));
  }

  async generateText(scene, sceneIdx) {
    const resp = await fetch(`${this.apiBase}/generate/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.buildProviderHeaders() },
      body: JSON.stringify({ prompt: scene.prompt, model: this.prefs.model, max_tokens: 1024 }),
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`); }
    const data = await resp.json();
    this.lastRaw = data;
    this.renderRawPanel();
    if (this.scenes[sceneIdx]) this.scenes[sceneIdx].text = data.text || '';
    this.appendTextResult(scene.prompt, data.text || '');
  }

  async generateVideo(scene, sceneIdx) {
    const ratio = this.ratioAlias(scene.aspect_ratio) || this.prefs.ratio;
    const prompt = scene.prompt || '';
    this.setStatus('info', `Submitting video: "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}"`);
    const resp = await fetch(`${this.apiBase}/generate/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.buildProviderHeaders() },
      body: JSON.stringify({ prompt, aspect_ratio: this.ratioToApiString(ratio) }),
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`); }
    const data = await resp.json();
    this.lastRaw = data;
    this.renderRawPanel();
    this._showRawPanel();
    if (data.media_urls?.length) {
      if (this.scenes[sceneIdx]) this.scenes[sceneIdx].image = data.media_urls[0];
      this.renderStoryboard();
      this.renderGallery(data.media_urls.map(url => ({ url, prompt: scene.prompt, aspect_ratio: ratio, type: 'video' })));
      return;
    }
    const jobId = data.id || data.raw?.request_id;
    if (!jobId) throw new Error('Video job submitted but no ID returned');
    this.setStatus('info', `Video submitted (id: ${jobId}) — polling for completion…`);
    await this.pollVideoStatus(jobId, scene, sceneIdx, ratio);
  }

  async pollVideoStatus(id, scene, sceneIdx, ratio) {
    const maxAttempts = 120; // 10 minutes at 5s intervals
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const elapsed = Math.round((attempt + 1) * 5);
      const resp = await fetch(`${this.apiBase}/generate/video/${id}`);
      if (!resp.ok) {
        this.setStatus('info', `Video generating… ${elapsed}s elapsed, waiting for xAI (attempt ${attempt + 1}/${maxAttempts})`);
        continue;
      }
      const data = await resp.json();
      this.lastRaw = data;
      this.renderRawPanel();
      const status = data.status || 'processing';
      this.setStatus('info', `Video status: ${status} — ${elapsed}s elapsed (up to 10 min)`);
      if (data.status === 'failed') throw new Error('Video generation failed: ' + (data.text || 'unknown error'));
      if (data.media_urls?.length) {
        this._showRawPanel();
        if (this.scenes[sceneIdx]) this.scenes[sceneIdx].image = data.media_urls[0];
        this.renderStoryboard();
        this.renderGallery(data.media_urls.map(url => ({ url, prompt: scene.prompt, aspect_ratio: ratio, type: 'video' })));
        return;
      }
    }
    throw new Error(`Video generation timed out after 10 minutes (id: ${id})`);
  }

  async generateStoryboard(scenes) {
    const resp = await fetch(`${this.apiBase}/generate/storyboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompts: scenes.map(s => s.prompt),
        aspect_ratio: this.ratioToApiString(this.prefs.ratio),
        n: this.prefs.variations,
      }),
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`); }
    const data = await resp.json();
    const allImages = [];
    (data.scenes || []).forEach((s, idx) => {
      const urls = s.media_urls || (s.images?.map(i => i.url) || []);
      if (this.scenes[idx] && urls.length) this.scenes[idx].image = urls[0];
      urls.forEach(url => allImages.push({ url, prompt: s.prompt, aspect_ratio: this.prefs.ratio, type: 'image' }));
    });
    this.renderStoryboard();
    this.renderGallery(allImages);
  }

  /** Map internal ratio key to the string the X.ai API expects */
  ratioToApiString(ratio) {
    const map = { 'square': '1:1', 'landscape-wide': '16:9', 'landscape': '4:3', 'portrait-tall': '9:16', 'portrait': '3:4' };
    return map[ratio] || '1:1';
  }

  /** Normalize CSV aspect_ratio aliases to internal key */
  ratioAlias(raw) {
    if (!raw) return null;
    const map = {
      'square': 'square', '1:1': 'square', '1/1': 'square',
      'landscape-wide': 'landscape-wide', '16:9': 'landscape-wide', '16/9': 'landscape-wide',
      'landscape': 'landscape', '4:3': 'landscape', '4/3': 'landscape',
      'portrait-tall': 'portrait-tall', '9:16': 'portrait-tall', '9/16': 'portrait-tall',
      'portrait': 'portrait', '3:4': 'portrait', '3/4': 'portrait',
    };
    return map[raw.toLowerCase()] || null;
  }

  // -------------------------------------------------------------------------
  // Gallery
  // -------------------------------------------------------------------------

  renderGallery(items) {
    const panel = document.getElementById('galleryPanel');
    const gallery = document.getElementById('gallery');
    if (!panel || !gallery) return;
    panel.classList.add('show');
    items.forEach(item => {
      if (!item.url) return;
      const div = document.createElement('div');
      div.className = 'ae-gallery-item';
      div.style.aspectRatio = this.ratioToCSS(item.aspect_ratio);
      const media = item.type === 'video'
        ? `<video src="${this.escapeHtml(item.url)}" controls playsinline style="width:100%;height:100%;object-fit:cover"></video>`
        : `<img src="${this.escapeHtml(item.url)}" alt="${this.escapeHtml(item.prompt)}" loading="lazy">`;
      div.innerHTML = `
        ${media}
        <div class="ae-item-overlay">
          <button class="ae-item-btn" onclick="artsEngine.openLightbox('${this.escapeHtml(item.url)}','${item.type||'image'}')">View</button>
          <a class="ae-item-btn" href="${this.escapeHtml(item.url)}" download style="text-decoration:none">Save</a>
        </div>`;
      gallery.prepend(div);
    });
    this.results.push(...items);
  }

  appendTextResult(prompt, text) {
    const panel = document.getElementById('galleryPanel');
    const gallery = document.getElementById('gallery');
    if (!panel || !gallery) return;
    panel.classList.add('show');
    const div = document.createElement('div');
    div.style.gridColumn = '1 / -1';
    div.innerHTML = `
      <div style="font-size:0.8rem;color:#888;margin-bottom:6px">${this.escapeHtml(prompt)}</div>
      <div class="ae-text-output">${this.escapeHtml(text)}</div>`;
    gallery.prepend(div);
  }

  ratioToCSS(ratio) {
    const map = { 'square': '1/1', 'landscape-wide': '16/9', 'landscape': '4/3', 'portrait-tall': '9/16', 'portrait': '3/4' };
    return map[ratio] || '1/1';
  }

  // -------------------------------------------------------------------------
  // Lightbox
  // -------------------------------------------------------------------------

  openLightbox(url, type = 'image') {
    const box = document.getElementById('aeLightbox');
    if (!box) return;
    const img = document.getElementById('aeLightboxImg');
    let vid = document.getElementById('aeLightboxVid');
    if (!vid) {
      vid = document.createElement('video');
      vid.id = 'aeLightboxVid';
      vid.controls = true;
      vid.style.cssText = 'max-width:90vw;max-height:90vh;display:none';
      box.appendChild(vid);
    }
    if (type === 'video') {
      if (img) img.style.display = 'none';
      vid.src = url;
      vid.style.display = '';
    } else {
      vid.style.display = 'none';
      vid.src = '';
      if (img) { img.src = url; img.style.display = ''; }
    }
    box.classList.add('show');
  }

  closeLightbox() {
    const box = document.getElementById('aeLightbox');
    if (!box) return;
    box.classList.remove('show');
    const vid = document.getElementById('aeLightboxVid');
    if (vid) { vid.pause(); vid.src = ''; }
  }

  // -------------------------------------------------------------------------
  // Raw API response panel
  // -------------------------------------------------------------------------

  renderRawPanel() {
    const panel = document.getElementById('rawPanel');
    if (panel && this.lastRaw) {
      panel.textContent = JSON.stringify(this.lastRaw, null, 2);
    }
  }

  _showRawPanel() {
    const panel = document.getElementById('rawPanel');
    if (panel) panel.style.display = '';
  }

  toggleRaw() {
    const panel = document.getElementById('rawPanel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  }

  // -------------------------------------------------------------------------
  // Status bar
  // -------------------------------------------------------------------------

  setStatus(type, message) {
    const bar = document.getElementById('statusBar');
    if (!bar) return;
    if (!message) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.className = `ae-panel statusbar ${type}`;
    bar.innerHTML = type === 'info'
      ? `<div class="ae-spinner"></div>${this.escapeHtml(message)}`
      : this.escapeHtml(message);
  }

  // -------------------------------------------------------------------------
  // Backend health check
  // -------------------------------------------------------------------------

  async checkBackendStatus() {
    if (window.AE_API_BASE) this.apiBase = window.AE_API_BASE.replace(/\/$/, '') + '/api';
    const dot   = document.getElementById('backendDot');
    const label = document.getElementById('backendLabel');
    try {
      const resp = await fetch(`${this.apiBase.replace('/api', '')}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (resp.ok) {
        const data = await resp.json();
        if (dot) dot.className = 'ae-backend-dot online';
        if (label) label.textContent = data.provider ? `Backend online · ${data.provider} ready` : 'Backend online';
        if (data.provider) {
          this._healthProvider = data.provider;
          const LABELS = {
            claude: 'Claude', gemini: 'Gemini', openai: 'OpenAI', xai: 'xAI',
            groq: 'Groq', together: 'Together AI', fireworks: 'Fireworks AI',
            mistral: 'Mistral', perplexity: 'Perplexity', deepseek: 'DeepSeek',
          };
          const envOpt = document.getElementById('providerEnvOpt');
          if (envOpt) envOpt.textContent = (LABELS[data.provider] || data.provider) + ' (.env)';
        }
        return true;
      }
    } catch { /* offline */ }
    if (dot) dot.className = 'ae-backend-dot offline';
    if (label) label.textContent = 'Backend offline — run: cd rust-api && cargo run';
    return false;
  }

  // -------------------------------------------------------------------------
  // GitHub token widget (reuses projects/js/issues.js)
  // -------------------------------------------------------------------------

  initGitHubWidget() {
    if (typeof GitHubIssuesManager === 'undefined') return;
    try {
      window.issuesManager = new GitHubIssuesManager('issues-root', {
        githubToken: localStorage.getItem('github_token') || '',
        githubOwner: 'modelearth',
        defaultRepo: 'requests',
        showProject: false,
      });
    } catch (e) {
      console.warn('GitHubIssuesManager init failed:', e);
    }
  }

  // -------------------------------------------------------------------------
  // Save to GitHub
  // -------------------------------------------------------------------------

  async saveToGitHub() {
    const token = localStorage.getItem('github_token');
    if (!token) { alert('Enter your GitHub token in the GitHub widget on the right to save results.'); return; }
    if (!this.results.length) { alert('No results yet — generate some images first.'); return; }
    const repo   = prompt('GitHub repo (e.g. your-org/your-repo):', 'modelearth/requests');
    const folder = prompt('Folder path in repo:', 'generated/' + new Date().toISOString().slice(0, 10));
    if (!repo || !folder) return;
    this.setStatus('info', 'Saving to GitHub…');
    let saved = 0; const errors = [];
    for (const item of this.results) {
      if (!item.url) continue;
      try {
        const blob = await (await fetch(item.url)).blob();
        const b64 = (await this.blobToBase64(blob)).split(',')[1];
        const filename = `scene-${Date.now()}-${saved + 1}.jpg`;
        const r = await fetch(`https://api.github.com/repos/${repo}/contents/${folder}/${filename}`, {
          method: 'PUT',
          headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Arts Engine: add generated image', content: b64 }),
        });
        if (r.ok) saved++; else { const e = await r.json(); errors.push(e.message || 'Error'); }
      } catch (e) { errors.push(e.message); }
    }
    if (errors.length) this.setStatus('error', `Saved ${saved} with ${errors.length} error(s): ${errors[0]}`);
    else this.setStatus('success', `Saved ${saved} image(s) to ${repo}/${folder}`);
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
}

// Initialize
let artsEngine;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { artsEngine = new ArtsEngine(); });
} else {
  artsEngine = new ArtsEngine();
}
