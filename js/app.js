'use strict';

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeMarkdown(text) {
  const html = marked.parse(text);
  return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_DEFAULTS = {
  anthropic: { placeholder: 'sk-ant-...', model: 'claude-sonnet-4-20250514' },
  openai:    { placeholder: 'sk-...',     model: 'gpt-4o' },
  custom:    { placeholder: 'Your API key', model: '' },
};

const MODEL_SUGGESTIONS = {
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  custom:    [],
};

const QUICK_PROMPTS = {
  summarise: [
    "What does this customer's system do in plain English?",
    'What are the main business processes?',
    'What integrations does this customer use?',
    'What are the key configuration options?',
  ],
  translate: [
    'Translate the main business logic to plain English',
    'What business rules are enforced in this code?',
    'What does this script do step by step?',
    'Explain this in terms a non-technical manager would understand',
  ],
  feature: [
    'Which customers have automated invoicing?',
    'Which customers use email notifications?',
    'Which customers have multi-currency support?',
    'Which customers have scheduled batch jobs?',
  ],
  compare: [
    'How does their business logic differ?',
    'Which customer has more automation?',
    "What features does one have that the other doesn't?",
    'How do their configurations compare?',
  ],
};

// ── ConfigManager ─────────────────────────────────────────────────────────────

class ConfigManager {
  constructor() {
    this._visible = true;
  }

  save() {
    localStorage.setItem('ci_anthropic', this._el('anthropic-key').value);
    localStorage.setItem('ci_github',    this._el('github-token').value);
    localStorage.setItem('ci_org',       this._el('github-org').value);
    localStorage.setItem('ci_provider',  this._el('provider').value);
    localStorage.setItem('ci_model',     this._el('model-name').value);
    localStorage.setItem('ci_base_url',  this._el('base-url').value);
    this._updateStatus();
  }

  load() {
    this._el('anthropic-key').value = localStorage.getItem('ci_anthropic') || '';
    this._el('github-token').value  = localStorage.getItem('ci_github')    || '';
    this._el('github-org').value    = localStorage.getItem('ci_org')       || '';
    this._el('provider').value      = localStorage.getItem('ci_provider')  || 'anthropic';
    this._el('model-name').value    = localStorage.getItem('ci_model')     || '';
    this._el('base-url').value      = localStorage.getItem('ci_base_url')  || '';
    this.onProviderChange(false);
    this._updateStatus();
  }

  async loadFromServer() {
    try {
      const res = await fetch('config.json');
      if (!res.ok) return false;
      const cfg = await res.json();
      if (!cfg.anthropicKey && !cfg.githubToken && !cfg.githubOrg) return false;
      if (cfg.apiKey || cfg.anthropicKey) this._el('anthropic-key').value = cfg.apiKey || cfg.anthropicKey;
      if (cfg.githubToken)  this._el('github-token').value  = cfg.githubToken;
      if (cfg.githubOrg)    this._el('github-org').value    = cfg.githubOrg;
      if (cfg.provider)     this._el('provider').value      = cfg.provider;
      if (cfg.model)        this._el('model-name').value    = cfg.model;
      if (cfg.baseUrl)      this._el('base-url').value      = cfg.baseUrl;
      this.onProviderChange(false);
      this._updateStatus();
      this.collapsePanel();
      return true;
    } catch {
      return false;
    }
  }

  onProviderChange(doSave = true) {
    const provider = this._el('provider').value;
    const def      = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;

    this._el('base-url-group').style.display  = provider === 'custom' ? 'block' : 'none';
    this._el('anthropic-key').placeholder     = def.placeholder;

    const modelInput = this._el('model-name');
    if (!modelInput.value) modelInput.placeholder = def.model || 'model-name';

    const datalist = this._el('model-suggestions');
    datalist.innerHTML = (MODEL_SUGGESTIONS[provider] || []).map(m => `<option value="${escapeHtml(m)}">`).join('');

    if (doSave) this.save();
  }

  togglePanel() {
    this._visible = !this._visible;
    this._el('config-body').classList.toggle('hidden', !this._visible);
    this._el('config-chevron').textContent = this._visible ? '▼' : '▶';
  }

  collapsePanel() {
    this._visible = false;
    this._el('config-body').classList.add('hidden');
    this._el('config-chevron').textContent = '▶';
  }

  setStatus(text, state = 'loading') {
    this._el('status-dot').className = `dot ${state}`;
    this._el('status-text').textContent = text;
  }

  _updateStatus() {
    const ok = !!this._el('anthropic-key').value
            && !!this._el('github-token').value
            && !!this._el('github-org').value;
    this._el('status-dot').className  = ok ? 'dot ready' : 'dot';
    this._el('status-text').textContent = ok ? 'configured' : 'not configured';
  }

  get provider()    { return this._el('provider').value; }
  get apiKey()      { return this._el('anthropic-key').value; }
  get githubToken() { return this._el('github-token').value; }
  get githubOrg()   { return this._el('github-org').value.trim(); }
  get model()       { return this._el('model-name').value.trim() || PROVIDER_DEFAULTS[this.provider]?.model || ''; }
  get baseUrl()     { return this._el('base-url').value.trim().replace(/\/$/, ''); }

  _el(id) { return document.getElementById(id); }
}

// ── GitHubClient ──────────────────────────────────────────────────────────────

class GitHubClient {
  constructor(config) {
    this._config = config;
  }

  get _headers() {
    return {
      Authorization: `Bearer ${this._config.githubToken}`,
      Accept: 'application/vnd.github+json',
    };
  }

  async fetchWithRetry(url, opts, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try { return await fetch(url, opts); }
      catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 800 * (i + 1)));
      }
    }
  }

  checkRateLimit(response) {
    const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '');
    if (isNaN(remaining)) return;
    const indicator = document.getElementById('rate-limit-status');
    const countEl   = document.getElementById('rate-limit-count');
    if (remaining < 100) {
      const reset     = response.headers.get('X-RateLimit-Reset');
      const resetTime = reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString() : '';
      countEl.textContent = remaining < 10
        ? `⚠ ${remaining} GitHub requests left${resetTime ? ' · resets ' + resetTime : ''}`
        : `${remaining} GitHub requests left`;
      indicator.style.display = 'inline-flex';
      indicator.className = 'rate-limit-status ' + (remaining < 10 ? 'critical' : 'warning');
    } else {
      indicator.style.display = 'none';
    }
    if (response.status === 403 || response.status === 429) {
      const reset     = response.headers.get('X-RateLimit-Reset');
      const resetTime = reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString() : 'soon';
      throw new Error(`GitHub rate limit exceeded. Resets at ${resetTime}.`);
    }
  }

  async loadRepos() {
    const { githubToken, githubOrg } = this._config;
    if (!githubToken || !githubOrg) {
      alert('Enter GitHub token and org/user name first.');
      return [];
    }

    const list = document.getElementById('repo-list');
    list.innerHTML = '<div class="loading-repos">⟳ Loading repositories...</div>';
    document.getElementById('load-btn').disabled = true;

    const repos = [];
    try {
      let page = 1;
      while (true) {
        // Try org endpoint first, fall back to user endpoint
        const orgUrl  = `https://api.github.com/orgs/${encodeURIComponent(githubOrg)}/repos?per_page=100&page=${page}&type=all`;
        const userUrl = `https://api.github.com/user/repos?per_page=100&page=${page}`;

        const res = await this.fetchWithRetry(orgUrl, { headers: this._headers });
        this.checkRateLimit(res);

        let data;
        if (!res.ok) {
          const res2 = await this.fetchWithRetry(userUrl, { headers: this._headers });
          this.checkRateLimit(res2);
          if (!res2.ok) throw new Error(`GitHub API error: ${res2.status}`);
          data = await res2.json();
        } else {
          data = await res.json();
        }

        repos.push(...data);
        if (data.length < 100) break;
        page++;
      }
    } catch (e) {
      list.innerHTML = `<div class="repo-empty" style="color:#c0392b">Error: ${escapeHtml(e.message)}</div>`;
    } finally {
      document.getElementById('load-btn').disabled = false;
    }

    repos.sort((a, b) => a.name.localeCompare(b.name));
    return repos;
  }

  async fetchRepoFiles(repoName, maxFiles = 20, pathFilter = '') {
    const org = this._config.githubOrg;

    const PRIORITY = [/\.py$/, /\.js$/, /\.ts$/, /\.java$/, /\.cs$/, /\.rb$/, /\.php$/, /config/i, /settings/i, /business/i, /logic/i, /process/i, /rules/i, /\.sql$/];
    const SKIP     = [/node_modules/, /\.min\.js/, /dist\//, /build\//, /package-lock/, /yarn\.lock/, /\.lock$/, /\.map$/, /\.png/, /\.jpg/, /\.ico/, /\.svg/];

    const treeUrl = `https://api.github.com/repos/${encodeURIComponent(org)}/${encodeURIComponent(repoName)}/git/trees/HEAD?recursive=1`;
    const treeRes = await this.fetchWithRetry(treeUrl, { headers: this._headers });
    this.checkRateLimit(treeRes);
    if (!treeRes.ok) throw new Error(`Could not read repo: ${repoName}`);
    const tree = await treeRes.json();

    const files = (tree.tree || [])
      .filter(f => f.type === 'blob')
      .filter(f => !SKIP.some(p => p.test(f.path)))
      .filter(f => !pathFilter || f.path.toLowerCase().includes(pathFilter.toLowerCase()))
      .sort((a, b) => PRIORITY.filter(p => p.test(b.path)).length - PRIORITY.filter(p => p.test(a.path)).length)
      .slice(0, maxFiles);

    const failedFiles = [];
    const contents = await Promise.all(files.map(async f => {
      try {
        const url = `https://api.github.com/repos/${encodeURIComponent(org)}/${encodeURIComponent(repoName)}/contents/${f.path}`;
        const r   = await this.fetchWithRetry(url, { headers: this._headers });
        this.checkRateLimit(r);
        if (!r.ok) { failedFiles.push(f.path); return null; }
        const d = await r.json();
        if (d.encoding === 'base64') {
          const text = atob(d.content.replace(/\n/g, ''));
          return `\n\n### FILE: ${f.path}\n\`\`\`\n${text.slice(0, 5000)}\n\`\`\``;
        }
        return null;
      } catch { failedFiles.push(f.path); return null; }
    }));

    let result = contents.filter(Boolean).join('');
    if (failedFiles.length) {
      result += `\n\n[${failedFiles.length} file(s) could not be read: ${failedFiles.slice(0, 5).join(', ')}${failedFiles.length > 5 ? '…' : ''}]`;
    }
    return result;
  }
}

// ── LLMClient ─────────────────────────────────────────────────────────────────

class LLMClient {
  constructor(config) {
    this._config = config;
  }

  async ask(systemPrompt, messages, onChunk, onComplete) {
    const { provider, apiKey, model } = this._config;

    let res;
    if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt, messages, stream: true }),
      });
    } else {
      const baseUrl = provider === 'custom'
        ? this._config.baseUrl
        : 'https://api.openai.com/v1';
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          stream: true,
          stream_options: { include_usage: true },
        }),
      });
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    let fullText = '';
    let inputTokens = 0, outputTokens = 0;
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          if (provider === 'anthropic') {
            if (json.type === 'message_start') {
              inputTokens = json.message?.usage?.input_tokens || 0;
            } else if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
              fullText += json.delta.text;
              onChunk(fullText);
            } else if (json.type === 'message_delta') {
              outputTokens = json.usage?.output_tokens || 0;
            }
          } else {
            const content = json.choices?.[0]?.delta?.content;
            if (content) { fullText += content; onChunk(fullText); }
            if (json.usage) {
              inputTokens  = json.usage.prompt_tokens     || 0;
              outputTokens = json.usage.completion_tokens || 0;
            }
          }
        } catch { /* skip malformed SSE lines */ }
      }
    }

    onComplete(fullText, inputTokens, outputTokens);
    return fullText;
  }
}

// ── ResultCard ────────────────────────────────────────────────────────────────

class ResultCard {
  constructor({ id, customer, mode, time } = {}) {
    this.id       = id   || String(Date.now());
    this.customer = customer;
    this.mode     = mode;
    this.time     = time || new Date().toLocaleTimeString();
    this.rawText      = null;
    this.systemPrompt = null;
    this.messages     = null;
    this._el = this._createElement();
  }

  get element() { return this._el; }
  get bodyEl()  { return document.getElementById(`rb-${this.id}`); }

  _createElement() {
    const el = document.createElement('div');
    el.className = 'result-card';
    // customer/mode/time are HTML-escaped before insertion
    el.innerHTML = `
      <div class="result-header">
        <div class="result-meta">
          <span class="result-customer">${escapeHtml(this.customer)}</span>
          <span class="result-mode">${escapeHtml(this.mode)}</span>
        </div>
        <div class="result-actions">
          <button class="copy-btn" id="cb-${this.id}" onclick="app.copyResult('${this.id}')" style="display:none">Copy</button>
          <span class="result-time">${escapeHtml(this.time)}</span>
        </div>
      </div>
      <div class="result-body loading" id="rb-${this.id}">⟳ Loading — fetching code and translating to business language...</div>
      <div class="followup-section" id="fu-${this.id}" style="display:none">
        <div class="followup-thread" id="ft-${this.id}"></div>
        <div class="followup-row">
          <input type="text" class="followup-input" id="fi-${this.id}"
                 placeholder="Ask a follow-up question..."
                 onkeydown="if(event.key==='Enter')app.sendFollowUp('${this.id}')"/>
          <button class="followup-send" onclick="app.sendFollowUp('${this.id}')">→</button>
        </div>
      </div>
    `;
    return el;
  }

  beginStreaming() {
    const body = this.bodyEl;
    body.classList.remove('loading');
    body.classList.add('streaming');
  }

  update(text, isError, systemPrompt = null, messages = null, skipSave = false) {
    const body = this.bodyEl;
    if (!body) return;
    body.classList.remove('loading', 'streaming');
    // safeMarkdown runs DOMPurify.sanitize — neutralises any injected HTML/scripts in LLM output
    body.innerHTML = safeMarkdown(text);
    if (isError) {
      body.style.color = '#c0392b';
    } else {
      this.rawText      = text;
      this.systemPrompt = systemPrompt;
      this.messages     = messages;
      document.getElementById(`cb-${this.id}`).style.display = 'inline-flex';
      if (systemPrompt && messages) {
        document.getElementById(`fu-${this.id}`).style.display = 'block';
      }
      if (!skipSave) app.saveResults();
    }
  }

  showTokenBadge(inputTokens, outputTokens) {
    if (!inputTokens && !outputTokens) return;
    const existing = this._el.querySelector('.token-badge');
    if (existing) existing.remove();
    const badge = document.createElement('div');
    badge.className = 'token-badge';
    const total = (inputTokens + outputTokens).toLocaleString();
    badge.textContent = `${total} tokens · ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`;
    this._el.querySelector('.result-header').appendChild(badge);
  }

  copy() {
    if (!this.rawText) return;
    navigator.clipboard.writeText(this.rawText).then(() => {
      const btn = document.getElementById(`cb-${this.id}`);
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
    });
  }

  toJSON() {
    return {
      id:       this.id,
      customer: this.customer,
      mode:     this.mode,
      time:     this.time,
      rawText:  this.rawText,
    };
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

class App {
  constructor() {
    this.config = new ConfigManager();
    this.github = new GitHubClient(this.config);
    this.llm    = new LLMClient(this.config);

    this._allRepos       = [];
    this._selectedRepo   = null;
    this._selectedCompare = new Set();
    this._currentMode    = 'summarise';
    this._cards          = new Map(); // id → ResultCard
  }

  async init() {
    this._setupRepoListEvents();
    const fromServer = await this.config.loadFromServer();
    if (!fromServer) this.config.load();
    this._renderQuickPrompts();
    this._updatePlaceholder();
    this._loadSavedResults();
  }

  // ── Event delegation for repo list (avoids inline handlers with user data) ──

  _setupRepoListEvents() {
    const list = document.getElementById('repo-list');

    list.addEventListener('click', e => {
      if (this._currentMode === 'compare') return;
      const item = e.target.closest('[data-repo]');
      if (item) this.selectRepo(item.dataset.repo);
    });

    list.addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      const item = e.target.closest('[data-repo]');
      if (item) this.toggleCompare(item.dataset.repo, e.target.checked);
    });
  }

  // ── Mode ──

  setMode(mode) {
    this._currentMode = mode;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    document.getElementById('compare-bar').style.display      = mode === 'compare' ? 'block' : 'none';
    document.getElementById('feature-note').style.display     = mode === 'feature' ? 'block' : 'none';
    document.getElementById('path-filter-row').style.display  = (mode === 'summarise' || mode === 'translate') ? 'flex' : 'none';
    this._renderQuickPrompts();
    this._updatePlaceholder();
    if (this._allRepos.length) this._renderRepoList();
  }

  _renderQuickPrompts() {
    const prompts = QUICK_PROMPTS[this._currentMode] || [];
    document.getElementById('quick-prompts').innerHTML = prompts
      .map(p => `<div class="quick-prompt" onclick="usePrompt(this)">${escapeHtml(p)}</div>`)
      .join('');
  }

  _updatePlaceholder() {
    const ta = document.getElementById('query-input');
    if (this._currentMode === 'feature') {
      ta.placeholder = 'e.g. Which customers have automated invoicing?';
    } else if (this._currentMode === 'compare') {
      ta.placeholder = 'Select 2+ customers from the sidebar, then ask a comparison question...';
    } else if (this._selectedRepo) {
      ta.placeholder = `Ask about ${this._selectedRepo}...`;
    } else {
      ta.placeholder = 'Select a customer from the sidebar, then ask anything...';
    }
  }

  // ── Repositories ──

  async loadRepos() {
    this._allRepos = await this.github.loadRepos();
    if (this._allRepos.length) {
      this._renderRepoList();
      this.config.collapsePanel();
    }
  }

  filterRepos() {
    this._renderRepoList();
  }

  selectRepo(name) {
    this._selectedRepo = name;
    this._renderRepoList();
    this._updatePlaceholder();
  }

  toggleCompare(name, checked) {
    if (checked) this._selectedCompare.add(name);
    else this._selectedCompare.delete(name);
    this._updateCompareBar();
    this._renderRepoList();
  }

  _renderRepoList() {
    const q     = document.getElementById('repo-search').value.toLowerCase();
    const list  = document.getElementById('repo-list');
    const repos = this._allRepos.filter(r => r.name.toLowerCase().includes(q));

    if (!repos.length) {
      list.innerHTML = '<div class="repo-empty">No repositories found.</div>';
      return;
    }

    // data-repo attribute carries the raw name; event delegation reads it back safely
    list.innerHTML = repos.map(r => {
      const eName = escapeHtml(r.name);
      if (this._currentMode === 'compare') {
        const checked = this._selectedCompare.has(r.name) ? 'checked' : '';
        const active  = this._selectedCompare.has(r.name) ? 'active' : '';
        return `<label class="repo-item ${active}" data-repo="${eName}">
          <input type="checkbox" ${checked}/>
          <span class="repo-icon">◉</span><span>${eName}</span>
        </label>`;
      }
      const active = this._selectedRepo === r.name ? 'active' : '';
      return `<div class="repo-item ${active}" data-repo="${eName}">
        <span class="repo-icon">◎</span><span>${eName}</span>
      </div>`;
    }).join('');
  }

  _updateCompareBar() {
    const n = this._selectedCompare.size;
    document.getElementById('compare-selected').textContent = `${n} customer${n !== 1 ? 's' : ''} selected`;
    document.getElementById('compare-btn').disabled = n < 2;
  }

  // ── Queries ──

  async runQuery() {
    const query = document.getElementById('query-input').value.trim();
    if (!query) return;
    if (!this.config.apiKey) { alert('Enter your API key first.'); return; }

    if (this._currentMode === 'feature') { await this._runFeatureSearch(query); return; }
    if (this._currentMode === 'compare') { await this._runCompare(query);       return; }
    if (!this._selectedRepo) { alert('Please select a customer from the sidebar first.'); return; }

    const card = this._addCard(this._selectedRepo, this._currentMode === 'summarise' ? 'Summary' : 'Translation');
    this._setBusy('fetching code...');

    try {
      const pathFilter = document.getElementById('path-filter').value.trim();
      const code = await this.github.fetchRepoFiles(
        this._selectedRepo,
        this._currentMode === 'summarise' ? 15 : 20,
        pathFilter
      );

      this.config.setStatus('asking AI...');

      const systemPrompt = this._currentMode === 'summarise'
        ? `You are a business analyst assistant. Your job is to read source code and explain what the system does in clear, plain English — suitable for a non-technical business stakeholder or project manager. Focus on: what business problems the system solves, the main business processes and workflows, key business rules or logic, integrations with other systems, and what data flows in and out. Use business language, not technical jargon. Structure your answer with clear headings.`
        : `You are a business analyst assistant. Translate the provided source code into plain English business language. Explain what each script or module does in terms of business processes, rules, and outcomes. A non-technical manager should be able to fully understand what this code does after reading your explanation. Avoid technical terms — if you must use one, explain it. Use bullet points and short paragraphs.`;

      const userMessage = `Customer repository: ${this._selectedRepo}\n\nCode files:\n${code}\n\nQuestion: ${query}`;
      const messages    = [{ role: 'user', content: userMessage }];

      card.beginStreaming();
      await this.llm.ask(
        systemPrompt, messages,
        partial => { card.bodyEl.textContent = partial; },
        (fullText, inputTokens, outputTokens) => {
          card.update(fullText, false, systemPrompt, [...messages, { role: 'assistant', content: fullText }]);
          card.showTokenBadge(inputTokens, outputTokens);
        }
      );
    } catch (e) {
      card.update(`**Error:** ${e.message}`, true);
    }

    this._setReady();
  }

  async _runFeatureSearch(query) {
    if (!this._allRepos.length) { alert('Load repositories first.'); return; }

    const card = this._addCard('All customers', 'Feature Search');
    const sample = this._allRepos.slice(0, 50);
    this._setBusy(`scanning ${sample.length} repos...`);

    try {
      const summaries = await Promise.all(sample.map(async repo => {
        try {
          const code = await this.github.fetchRepoFiles(repo.name, 8);
          return `CUSTOMER: ${repo.name}\n${code.slice(0, 2000)}`;
        } catch { return `CUSTOMER: ${repo.name}\n(could not read)`; }
      }));

      this.config.setStatus('asking AI...');

      const systemPrompt = `You are a business analyst. You are given code snippets from multiple customer repositories. Answer the user's question by identifying which customers have the requested feature or capability. Be specific — name the customers and explain what you found in their code. Speak in business language.`;
      const messages = [{
        role: 'user',
        content: `Question: ${query}\n\nCustomer repositories:\n\n${summaries.join('\n\n---\n\n')}`,
      }];

      card.beginStreaming();
      await this.llm.ask(
        systemPrompt, messages,
        partial => { card.bodyEl.textContent = partial; },
        (fullText, inputTokens, outputTokens) => {
          card.update(fullText, false, null, null);
          card.showTokenBadge(inputTokens, outputTokens);
        }
      );
    } catch (e) {
      card.update(`**Error:** ${e.message}`, true);
    }

    this._setReady();
  }

  async _runCompare(query) {
    query = query || document.getElementById('query-input').value.trim();
    if (this._selectedCompare.size < 2) { alert('Select at least 2 customers to compare.'); return; }

    const customers = Array.from(this._selectedCompare);
    const card = this._addCard(customers.join(' vs '), 'Comparison');
    document.getElementById('compare-btn').disabled = true;
    this._setBusy('fetching repos...');

    try {
      const codes = await Promise.all(customers.map(async name => {
        const code = await this.github.fetchRepoFiles(name, 15);
        return `CUSTOMER: ${name}\n${code}`;
      }));

      this.config.setStatus('asking AI...');

      const systemPrompt = `You are a business analyst comparing multiple customer implementations. Explain the similarities and differences between their business logic, processes, and capabilities in plain English. Use a structured format with clear sections. Focus on business impact, not technical details.`;
      const userMessage  = `Question: ${query || 'Compare the business logic and processes of these customers.'}\n\nCustomer repositories:\n\n${codes.join('\n\n---\n\n')}`;
      const messages     = [{ role: 'user', content: userMessage }];

      card.beginStreaming();
      await this.llm.ask(
        systemPrompt, messages,
        partial => { card.bodyEl.textContent = partial; },
        (fullText, inputTokens, outputTokens) => {
          card.update(fullText, false, systemPrompt, [...messages, { role: 'assistant', content: fullText }]);
          card.showTokenBadge(inputTokens, outputTokens);
        }
      );
    } catch (e) {
      card.update(`**Error:** ${e.message}`, true);
    }

    document.getElementById('compare-btn').disabled = (this._selectedCompare.size < 2);
    this._setReady();
  }

  async sendFollowUp(id) {
    const card = this._cards.get(id);
    if (!card || !card.messages) return;

    const input    = document.getElementById(`fi-${id}`);
    const question = input.value.trim();
    if (!question) return;

    input.value    = '';
    input.disabled = true;

    const thread = document.getElementById(`ft-${id}`);

    const qDiv = document.createElement('div');
    qDiv.className   = 'followup-question';
    qDiv.textContent = question;
    thread.appendChild(qDiv);

    const aDiv = document.createElement('div');
    aDiv.className   = 'followup-answer loading';
    aDiv.textContent = '⟳ Thinking...';
    thread.appendChild(aDiv);
    aDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const messages = [...card.messages, { role: 'user', content: question }];

    try {
      let firstChunk = true;
      await this.llm.ask(
        card.systemPrompt, messages,
        partial => {
          if (firstChunk) { aDiv.classList.remove('loading'); firstChunk = false; }
          aDiv.textContent = partial;
        },
        (fullText, inputTokens, outputTokens) => {
          aDiv.innerHTML  = safeMarkdown(fullText);
          card.messages   = [...messages, { role: 'assistant', content: fullText }];
          card.rawText   += `\n\n---\n\n**Follow-up:** ${question}\n\n${fullText}`;
          this.saveResults();
          if (inputTokens || outputTokens) card.showTokenBadge(inputTokens, outputTokens);
        }
      );
    } catch (e) {
      aDiv.classList.remove('loading');
      aDiv.style.color = '#c0392b';
      aDiv.textContent = `Error: ${e.message}`;
    }

    input.disabled = false;
    input.focus();
  }

  copyResult(id) {
    const card = this._cards.get(id);
    if (card) card.copy();
  }

  // ── Card management ──

  _addCard(customer, mode, opts = {}) {
    document.getElementById('empty-state')?.remove();
    const card = new ResultCard({ customer, mode, ...opts });
    this._cards.set(card.id, card);
    document.getElementById('results').prepend(card.element);
    this._showClearHistoryBtn();
    return card;
  }

  _showClearHistoryBtn() {
    if (document.getElementById('results-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.id        = 'results-toolbar';
    toolbar.className = 'results-toolbar';
    toolbar.innerHTML = '<button class="clear-history-btn" onclick="app.clearHistory()">Clear history</button>';
    const results = document.getElementById('results');
    results.parentElement.insertBefore(toolbar, results);
  }

  // ── Persistence ──

  saveResults() {
    try {
      const data = [...this._cards.values()]
        .filter(c => c.rawText)
        .slice(0, 20)
        .map(c => c.toJSON());
      localStorage.setItem('ci_results', JSON.stringify(data));
    } catch { /* ignore quota errors */ }
  }

  _loadSavedResults() {
    try {
      const data = JSON.parse(localStorage.getItem('ci_results') || '[]');
      if (!data.length) return;
      [...data].reverse().forEach(d => {
        const card = this._addCard(d.customer, d.mode, { id: d.id, time: d.time });
        card.update(d.rawText, false, null, null, true);
      });
    } catch { /* ignore corrupt data */ }
  }

  clearHistory() {
    localStorage.removeItem('ci_results');
    this._cards.clear();
    document.querySelectorAll('.result-card').forEach(c => c.remove());
    document.getElementById('results-toolbar')?.remove();
    document.getElementById('results').innerHTML = `
      <div class="empty-state" id="empty-state">
        <div class="empty-icon">◈</div>
        <h2>Ready to translate</h2>
        <p>Load your GitHub repositories, select a customer, and ask questions in plain English.</p>
        <div class="steps">
          <div class="step">1. configure</div>
          <div class="step">2. load repos</div>
          <div class="step">3. select customer</div>
          <div class="step">4. ask</div>
        </div>
      </div>`;
  }

  // ── Status helpers ──

  _setBusy(text = 'loading...') {
    document.getElementById('send-btn').disabled = true;
    this.config.setStatus(text, 'loading');
  }

  _setReady() {
    document.getElementById('send-btn').disabled = false;
    this.config.setStatus('configured', 'ready');
  }
}

// ── Global singleton ───────────────────────────────────────────────────────────

const app = new App();

// HTML onclick wrappers — thin shims so existing HTML attributes keep working
function setMode(mode)               { app.setMode(mode); }
function loadRepos()                 { app.loadRepos(); }
function filterRepos()               { app.filterRepos(); }
function selectRepo(name)            { app.selectRepo(name); }
function toggleCompare(name, checked){ app.toggleCompare(name, checked); }
function runQuery()                  { app.runQuery(); }
function runCompare()                { app.runQuery(); }
function sendFollowUp(id)            { app.sendFollowUp(id); }
function copyResult(id)              { app.copyResult(id); }
function clearHistory()              { app.clearHistory(); }
function toggleConfig()              { app.config.togglePanel(); }
function onProviderChange()          { app.config.onProviderChange(); }
function saveConfig()                { app.config.save(); }
function usePrompt(el)               { document.getElementById('query-input').value = el.textContent; }

// ── Bootstrap ─────────────────────────────────────────────────────────────────

(async () => { await app.init(); })();
