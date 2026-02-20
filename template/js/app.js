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

    // Preferences (persisted to localStorage with ae_ prefix)
    this.prefs = {
      ratio:      this.loadPref('ratio', 'square'),
      outputType: this.loadPref('outputType', 'image'),
      model:      this.loadPref('model', 'grok-3-mini-beta'),
      variations: parseInt(this.loadPref('variations', '1')),
    };

    this.init();
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  init() {
    // Use waitForElm from localsite.js — never use setTimeout for DOM waiting
    if (typeof waitForElm === 'function') {
      waitForElm('#generateBtn').then(() => this.setup());
    } else {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    }
  }

  setup() {
    this.bindEvents();
    this.restorePrefs();
    this.renderStoryboard();
    this.checkBackendStatus();
    this.initGitHubWidget();

    // Poll backend status every 30 seconds
    setInterval(() => this.checkBackendStatus(), 30000);
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
    const modelSel = document.getElementById('modelSelect');
    if (modelSel) modelSel.value = this.prefs.model;
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

    // Model selector
    document.getElementById('modelSelect')?.addEventListener('change', e => {
      this.prefs.model = e.target.value;
      this.savePref('model', this.prefs.model);
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
    const type = document.querySelector('.ae-type-btn.active')?.dataset?.type;
    const modelRow = document.getElementById('modelRow');
    if (modelRow) modelRow.style.display = (type === 'text') ? '' : 'none';
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
  // Generation
  // -------------------------------------------------------------------------

  async generate() {
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
            await this.generateImage(promptsToRun[i], i);
          } else {
            await this.generateText(promptsToRun[i], i);
          }
        }
      }
      this.setStatus('success', 'Generation complete!');
      document.getElementById('saveGithubBtn')?.classList.add('show');
    } catch (err) {
      this.setStatus('error', 'Error: ' + err.message);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: scene.prompt, aspect_ratio: this.ratioToApiString(ratio), n: this.prefs.variations, response_format: 'url' }),
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`); }
    const data = await resp.json();
    const images = data.media_urls?.map(url => ({ url, prompt: scene.prompt, aspect_ratio: ratio })) || (data.images || []);
    if (this.scenes[sceneIdx] && images.length) this.scenes[sceneIdx].image = images[0].url || null;
    this.renderStoryboard();
    this.renderGallery(images.map(img => ({ ...img, type: 'image' })));
  }

  async generateText(scene, sceneIdx) {
    const resp = await fetch(`${this.apiBase}/generate/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: scene.prompt, model: this.prefs.model, max_tokens: 1024 }),
    });
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`); }
    const data = await resp.json();
    if (this.scenes[sceneIdx]) this.scenes[sceneIdx].text = data.text || '';
    this.appendTextResult(scene.prompt, data.text || '');
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
      div.innerHTML = `
        <img src="${this.escapeHtml(item.url)}" alt="${this.escapeHtml(item.prompt)}" loading="lazy">
        <div class="ae-item-overlay">
          <button class="ae-item-btn" onclick="artsEngine.openLightbox('${this.escapeHtml(item.url)}')">View</button>
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

  openLightbox(url) {
    const box = document.getElementById('aeLightbox');
    const img = document.getElementById('aeLightboxImg');
    if (box && img) { img.src = url; box.classList.add('show'); }
  }

  closeLightbox() {
    document.getElementById('aeLightbox')?.classList.remove('show');
  }

  // -------------------------------------------------------------------------
  // Status bar
  // -------------------------------------------------------------------------

  setStatus(type, message) {
    const bar = document.getElementById('statusBar');
    if (!bar) return;
    if (!message) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    bar.className = `ae-panel statusbar ${type}`;
    bar.innerHTML = type === 'info'
      ? `<div class="ae-spinner"></div>${this.escapeHtml(message)}`
      : this.escapeHtml(message);
  }

  // -------------------------------------------------------------------------
  // Backend health check
  // -------------------------------------------------------------------------

  async checkBackendStatus() {
    const dot   = document.getElementById('backendDot');
    const label = document.getElementById('backendLabel');
    if (!dot) return;
    dot.className = 'ae-backend-dot checking';
    if (label) label.textContent = 'Checking…';
    try {
      const resp = await fetch(`${this.apiBase.replace('/api', '')}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        dot.className = 'ae-backend-dot online';
        if (label) label.textContent = data.provider ? `Backend online · ${data.provider} ready` : 'Backend online';
      } else throw new Error();
    } catch {
      dot.className = 'ae-backend-dot offline';
      if (label) label.textContent = 'Backend offline — run: cd rust-api && cargo run';
    }
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
