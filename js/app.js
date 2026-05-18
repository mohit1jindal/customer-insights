// ── State ──
let allRepos = [];
let selectedRepo = null;
let selectedForCompare = new Set();
let currentMode = 'summarise';
let configVisible = true;

// ── Prompts per mode ──
const QUICK_PROMPTS = {
  summarise: [
    'What does this customer\'s system do in plain English?',
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
    'What features does one have that the other doesn\'t?',
    'How do their configurations compare?',
  ],
};

// ── Config persistence ──
function saveConfig() {
  localStorage.setItem('ci_anthropic', document.getElementById('anthropic-key').value);
  localStorage.setItem('ci_github', document.getElementById('github-token').value);
  localStorage.setItem('ci_org', document.getElementById('github-org').value);
  updateStatus();
}

function loadConfig() {
  document.getElementById('anthropic-key').value = localStorage.getItem('ci_anthropic') || '';
  document.getElementById('github-token').value = localStorage.getItem('ci_github') || '';
  document.getElementById('github-org').value = localStorage.getItem('ci_org') || '';
  updateStatus();
}

async function loadServerConfig() {
  try {
    const res = await fetch('config.json');
    if (!res.ok) return false;
    const cfg = await res.json();
    if (!cfg.anthropicKey && !cfg.githubToken && !cfg.githubOrg) return false;
    if (cfg.anthropicKey) document.getElementById('anthropic-key').value = cfg.anthropicKey;
    if (cfg.githubToken)  document.getElementById('github-token').value  = cfg.githubToken;
    if (cfg.githubOrg)    document.getElementById('github-org').value    = cfg.githubOrg;
    updateStatus();
    configVisible = false;
    document.getElementById('config-body').classList.add('hidden');
    document.getElementById('config-chevron').textContent = '▶';
    return true;
  } catch {
    return false;
  }
}

function updateStatus() {
  const hasAnthro = !!document.getElementById('anthropic-key').value;
  const hasGH = !!document.getElementById('github-token').value;
  const hasOrg = !!document.getElementById('github-org').value;
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  if (hasAnthro && hasGH && hasOrg) {
    dot.className = 'dot ready';
    txt.textContent = 'configured';
  } else {
    dot.className = 'dot';
    txt.textContent = 'not configured';
  }
}

function toggleConfig() {
  configVisible = !configVisible;
  document.getElementById('config-body').classList.toggle('hidden', !configVisible);
  document.getElementById('config-chevron').textContent = configVisible ? '▼' : '▶';
}

// ── Load repos ── [fix #7: fetch all repos, not just private]
async function loadRepos() {
  const token = document.getElementById('github-token').value;
  const org = document.getElementById('github-org').value.trim();
  if (!token || !org) { alert('Enter GitHub token and org/user name first.'); return; }

  const list = document.getElementById('repo-list');
  list.innerHTML = '<div class="loading-repos">⟳ Loading repositories...</div>';
  document.getElementById('load-btn').disabled = true;

  try {
    allRepos = [];
    let page = 1;
    while (true) {
      const url = `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&type=all`;
      const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
      checkRateLimit(res);
      if (!res.ok) {
        const res2 = await fetchWithRetry(`https://api.github.com/user/repos?per_page=100&page=${page}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
        });
        checkRateLimit(res2);
        if (!res2.ok) throw new Error(`GitHub API error: ${res2.status}`);
        const data = await res2.json();
        allRepos = allRepos.concat(data);
        if (data.length < 100) break;
      } else {
        const data = await res.json();
        allRepos = allRepos.concat(data);
        if (data.length < 100) break;
      }
      page++;
    }
    allRepos.sort((a,b) => a.name.localeCompare(b.name));
    renderRepoList(allRepos);
    configVisible = false;
    document.getElementById('config-body').classList.add('hidden');
    document.getElementById('config-chevron').textContent = '▶';
  } catch(e) {
    list.innerHTML = `<div class="repo-empty" style="color:#c0392b">Error: ${e.message}</div>`;
  }
  document.getElementById('load-btn').disabled = false;
}

function renderRepoList(repos) {
  const list = document.getElementById('repo-list');
  if (!repos.length) { list.innerHTML = '<div class="repo-empty">No repositories found.</div>'; return; }

  list.innerHTML = repos.map(r => {
    if (currentMode === 'compare') {
      const checked = selectedForCompare.has(r.name) ? 'checked' : '';
      return `<label class="repo-item ${selectedForCompare.has(r.name)?'active':''}">
        <input type="checkbox" ${checked} onchange="toggleCompare('${r.name}', this.checked)"/>
        <span class="repo-icon">◉</span>
        <span>${r.name}</span>
      </label>`;
    }
    return `<div class="repo-item ${selectedRepo===r.name?'active':''}" onclick="selectRepo('${r.name}')">
      <span class="repo-icon">◎</span>
      <span>${r.name}</span>
    </div>`;
  }).join('');
}

function filterRepos() {
  const q = document.getElementById('repo-search').value.toLowerCase();
  const filtered = allRepos.filter(r => r.name.toLowerCase().includes(q));
  renderRepoList(filtered);
}

function selectRepo(name) {
  selectedRepo = name;
  renderRepoList(allRepos.filter(r => r.name.toLowerCase().includes(document.getElementById('repo-search').value.toLowerCase())));
  updatePlaceholder();
}

function toggleCompare(name, checked) {
  if (checked) selectedForCompare.add(name);
  else selectedForCompare.delete(name);
  updateCompareBar();
  renderRepoList(allRepos.filter(r => r.name.toLowerCase().includes(document.getElementById('repo-search').value.toLowerCase())));
}

function updateCompareBar() {
  const n = selectedForCompare.size;
  document.getElementById('compare-selected').textContent = `${n} customer${n!==1?'s':''} selected`;
  document.getElementById('compare-btn').disabled = n < 2;
}

// ── Mode ──
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  document.getElementById('compare-bar').style.display = mode === 'compare' ? 'block' : 'none';
  document.getElementById('feature-note').style.display = mode === 'feature' ? 'block' : 'none';
  // [fix #8] show path filter only for summarise/translate
  document.getElementById('path-filter-row').style.display = (mode === 'summarise' || mode === 'translate') ? 'flex' : 'none';
  renderQuickPrompts();
  updatePlaceholder();
  if (allRepos.length) renderRepoList(allRepos.filter(r => r.name.toLowerCase().includes(document.getElementById('repo-search').value.toLowerCase())));
}

function renderQuickPrompts() {
  const prompts = QUICK_PROMPTS[currentMode] || [];
  document.getElementById('quick-prompts').innerHTML = prompts.map(p =>
    `<div class="quick-prompt" onclick="usePrompt(this)">${p}</div>`
  ).join('');
}

function usePrompt(el) {
  document.getElementById('query-input').value = el.textContent;
}

function updatePlaceholder() {
  const ta = document.getElementById('query-input');
  if (currentMode === 'feature') {
    ta.placeholder = 'e.g. Which customers have automated invoicing?';
  } else if (currentMode === 'compare') {
    ta.placeholder = 'Select 2+ customers from the sidebar, then ask a comparison question...';
  } else if (selectedRepo) {
    ta.placeholder = `Ask about ${selectedRepo}...`;
  } else {
    ta.placeholder = 'Select a customer from the sidebar, then ask anything...';
  }
}

// ── Retry helper [fix #13] ──
async function fetchWithRetry(url, opts, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(url, opts);
    } catch(e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
}

// ── Rate limit check [fix #11] ──
function checkRateLimit(response) {
  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '');
  if (isNaN(remaining)) return;
  const indicator = document.getElementById('rate-limit-status');
  const countEl = document.getElementById('rate-limit-count');
  if (remaining < 100) {
    const reset = response.headers.get('X-RateLimit-Reset');
    const resetTime = reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString() : '';
    countEl.textContent = remaining < 10
      ? `⚠ ${remaining} GitHub requests left${resetTime ? ' · resets ' + resetTime : ''}`
      : `${remaining} GitHub requests left`;
    indicator.style.display = 'inline-flex';
    indicator.className = remaining < 10 ? 'rate-limit-status critical' : 'rate-limit-status warning';
  } else {
    indicator.style.display = 'none';
  }
  if (response.status === 403 || response.status === 429) {
    const reset = response.headers.get('X-RateLimit-Reset');
    const resetTime = reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString() : 'soon';
    throw new Error(`GitHub rate limit exceeded. Resets at ${resetTime}.`);
  }
}

// ── Fetch repo files [fix #8 path filter, #12 report failures, #13 retry] ──
async function fetchRepoFiles(repoName, maxFiles = 20, pathFilter = '') {
  const token = document.getElementById('github-token').value;
  const org = document.getElementById('github-org').value.trim();
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };

  const treeRes = await fetchWithRetry(`https://api.github.com/repos/${org}/${repoName}/git/trees/HEAD?recursive=1`, { headers });
  checkRateLimit(treeRes);
  if (!treeRes.ok) throw new Error(`Could not read repo: ${repoName}`);
  const tree = await treeRes.json();

  const PRIORITY_PATTERNS = [/\.py$/, /\.js$/, /\.ts$/, /\.java$/, /\.cs$/, /\.rb$/, /\.php$/, /config/i, /settings/i, /business/i, /logic/i, /process/i, /rules/i, /\.sql$/];
  const SKIP_PATTERNS = [/node_modules/, /\.min\.js/, /dist\//, /build\//, /package-lock/, /yarn\.lock/, /\.lock$/, /\.map$/, /\.png/, /\.jpg/, /\.ico/, /\.svg/];

  let files = (tree.tree || [])
    .filter(f => f.type === 'blob')
    .filter(f => !SKIP_PATTERNS.some(p => p.test(f.path)))
    .filter(f => !pathFilter || f.path.toLowerCase().includes(pathFilter.toLowerCase()))
    .sort((a, b) => {
      const aScore = PRIORITY_PATTERNS.filter(p => p.test(a.path)).length;
      const bScore = PRIORITY_PATTERNS.filter(p => p.test(b.path)).length;
      return bScore - aScore;
    })
    .slice(0, maxFiles);

  const failedFiles = [];
  const contents = await Promise.all(files.map(async f => {
    try {
      const r = await fetchWithRetry(`https://api.github.com/repos/${org}/${repoName}/contents/${f.path}`, { headers });
      checkRateLimit(r);
      if (!r.ok) { failedFiles.push(f.path); return null; }
      const d = await r.json();
      if (d.encoding === 'base64') {
        const text = atob(d.content.replace(/\n/g,''));
        return `\n\n### FILE: ${f.path}\n\`\`\`\n${text.slice(0, 3000)}\n\`\`\``;
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

// ── Claude API ──
async function askClaude(systemPrompt, messages) {
  const key = document.getElementById('anthropic-key').value;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

// ── Run query ──
async function runQuery() {
  const query = document.getElementById('query-input').value.trim();
  if (!query) return;

  const key = document.getElementById('anthropic-key').value;
  if (!key) { alert('Enter your Anthropic API key first.'); return; }

  if (currentMode === 'feature') { await runFeatureSearch(query); return; }
  if (currentMode === 'compare') { await runCompare(query); return; }
  if (!selectedRepo) { alert('Please select a customer from the sidebar first.'); return; }

  const card = addResultCard(selectedRepo, currentMode === 'summarise' ? 'Summary' : 'Translation');
  document.getElementById('send-btn').disabled = true;
  document.getElementById('status-dot').className = 'dot loading';
  document.getElementById('status-text').textContent = 'fetching code...';

  try {
    // [fix #8] read path filter
    const pathFilter = document.getElementById('path-filter').value.trim();
    const code = await fetchRepoFiles(selectedRepo, currentMode === 'summarise' ? 15 : 20, pathFilter);
    document.getElementById('status-text').textContent = 'asking Claude...';

    const systemPrompt = currentMode === 'summarise'
      ? `You are a business analyst assistant. Your job is to read source code and explain what the system does in clear, plain English — suitable for a non-technical business stakeholder or project manager. Focus on: what business problems the system solves, the main business processes and workflows, key business rules or logic, integrations with other systems, and what data flows in and out. Use business language, not technical jargon. Structure your answer with clear headings.`
      : `You are a business analyst assistant. Translate the provided source code into plain English business language. Explain what each script or module does in terms of business processes, rules, and outcomes. A non-technical manager should be able to fully understand what this code does after reading your explanation. Avoid technical terms — if you must use one, explain it. Use bullet points and short paragraphs.`;

    const userMessage = `Customer repository: ${selectedRepo}\n\nCode files:\n${code}\n\nQuestion: ${query}`;
    const messages = [{ role: 'user', content: userMessage }];
    const answer = await askClaude(systemPrompt, messages);
    updateResultCard(card, answer, false, systemPrompt, [...messages, { role: 'assistant', content: answer }]);
  } catch(e) {
    updateResultCard(card, `Error: ${e.message}`, true);
  }

  document.getElementById('send-btn').disabled = false;
  document.getElementById('status-dot').className = 'dot ready';
  document.getElementById('status-text').textContent = 'configured';
}

// ── Feature search [fix #6: raise cap to 50] ──
async function runFeatureSearch(query) {
  if (!allRepos.length) { alert('Load repositories first.'); return; }
  const key = document.getElementById('anthropic-key').value;
  const token = document.getElementById('github-token').value;
  if (!key || !token) { alert('Configure API keys first.'); return; }

  const card = addResultCard('All customers', 'Feature Search');
  document.getElementById('send-btn').disabled = true;
  document.getElementById('status-dot').className = 'dot loading';

  try {
    const sample = allRepos.slice(0, 50);
    document.getElementById('status-text').textContent = `scanning ${sample.length} repos...`;

    const summaries = await Promise.all(sample.map(async repo => {
      try {
        const code = await fetchRepoFiles(repo.name, 8);
        return `CUSTOMER: ${repo.name}\n${code.slice(0, 2000)}`;
      } catch { return `CUSTOMER: ${repo.name}\n(could not read)`; }
    }));

    document.getElementById('status-text').textContent = 'asking Claude...';

    const systemPrompt = `You are a business analyst. You are given code snippets from multiple customer repositories. Answer the user's question by identifying which customers have the requested feature or capability. Be specific — name the customers and explain what you found in their code. Speak in business language.`;
    const answer = await askClaude(systemPrompt, [{ role: 'user', content: `Question: ${query}\n\nCustomer repositories:\n\n${summaries.join('\n\n---\n\n')}` }]);
    updateResultCard(card, answer, false, null, null);
  } catch(e) {
    updateResultCard(card, `Error: ${e.message}`, true);
  }

  document.getElementById('send-btn').disabled = false;
  document.getElementById('status-dot').className = 'dot ready';
  document.getElementById('status-text').textContent = 'configured';
}

// ── Compare ──
async function runCompare(query) {
  query = query || document.getElementById('query-input').value.trim();
  if (selectedForCompare.size < 2) { alert('Select at least 2 customers to compare.'); return; }
  const key = document.getElementById('anthropic-key').value;
  if (!key) { alert('Configure API keys first.'); return; }

  const customers = Array.from(selectedForCompare);
  const card = addResultCard(customers.join(' vs '), 'Comparison');
  document.getElementById('compare-btn').disabled = true;
  document.getElementById('send-btn').disabled = true;
  document.getElementById('status-dot').className = 'dot loading';

  try {
    document.getElementById('status-text').textContent = 'fetching repos...';
    const codes = await Promise.all(customers.map(async name => {
      const code = await fetchRepoFiles(name, 15);
      return `CUSTOMER: ${name}\n${code}`;
    }));

    document.getElementById('status-text').textContent = 'asking Claude...';

    const systemPrompt = `You are a business analyst comparing multiple customer implementations. Explain the similarities and differences between their business logic, processes, and capabilities in plain English. Use a structured format with clear sections. Focus on business impact, not technical details.`;
    const userMessage = `Question: ${query || 'Compare the business logic and processes of these customers.'}\n\nCustomer repositories:\n\n${codes.join('\n\n---\n\n')}`;
    const messages = [{ role: 'user', content: userMessage }];
    const answer = await askClaude(systemPrompt, messages);
    updateResultCard(card, answer, false, systemPrompt, [...messages, { role: 'assistant', content: answer }]);
  } catch(e) {
    updateResultCard(card, `Error: ${e.message}`, true);
  }

  document.getElementById('compare-btn').disabled = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('status-dot').className = 'dot ready';
  document.getElementById('status-text').textContent = 'configured';
}

// ── Result cards ──
function addResultCard(customer, mode, opts = {}) {
  document.getElementById('empty-state')?.remove();
  const results = document.getElementById('results');
  const id = opts.id || String(Date.now());
  const time = opts.time || new Date().toLocaleTimeString();
  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML = `
    <div class="result-header">
      <div class="result-meta">
        <span class="result-customer">${customer}</span>
        <span class="result-mode">${mode}</span>
      </div>
      <div class="result-actions">
        <button class="copy-btn" id="cb-${id}" onclick="copyResult('${id}')" style="display:none">Copy</button>
        <span class="result-time">${time}</span>
      </div>
    </div>
    <div class="result-body loading" id="rb-${id}">⟳ Loading — fetching code and translating to business language...</div>
    <div class="followup-section" id="fu-${id}" style="display:none">
      <div class="followup-thread" id="ft-${id}"></div>
      <div class="followup-row">
        <input type="text" class="followup-input" id="fi-${id}"
               placeholder="Ask a follow-up question..."
               onkeydown="if(event.key==='Enter')sendFollowUp('${id}')"/>
        <button class="followup-send" onclick="sendFollowUp('${id}')">→</button>
      </div>
    </div>
  `;
  results.prepend(card);
  card._id = id;
  card._customer = customer;
  card._mode = mode;
  card._time = time;
  card._bodyId = `rb-${id}`;
  showClearHistoryBtn();
  return card;
}

function updateResultCard(card, text, isError, systemPrompt, messages, skipSave = false) {
  const body = document.getElementById(card._bodyId);
  if (!body) return;
  body.classList.remove('loading');
  if (isError) {
    body.style.color = '#c0392b';
    body.innerHTML = marked.parse(text);
  } else {
    body.innerHTML = marked.parse(text);
    card._rawText = text;
    card._systemPrompt = systemPrompt || null;
    card._messages = messages || null;
    document.getElementById(`cb-${card._id}`).style.display = 'inline-flex';
    if (systemPrompt && messages) {
      document.getElementById(`fu-${card._id}`).style.display = 'block';
    }
    if (!skipSave) saveResults();
  }
}

// ── Follow-up chat ──
async function sendFollowUp(id) {
  const card = [...document.querySelectorAll('.result-card')].find(c => c._id === id);
  if (!card || !card._messages) return;

  const input = document.getElementById(`fi-${id}`);
  const question = input.value.trim();
  if (!question) return;

  input.value = '';
  input.disabled = true;

  const thread = document.getElementById(`ft-${id}`);

  const qDiv = document.createElement('div');
  qDiv.className = 'followup-question';
  qDiv.textContent = question;
  thread.appendChild(qDiv);

  const aDiv = document.createElement('div');
  aDiv.className = 'followup-answer loading';
  aDiv.textContent = '⟳ Thinking...';
  thread.appendChild(aDiv);
  aDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const messages = [...card._messages, { role: 'user', content: question }];

  try {
    const answer = await askClaude(card._systemPrompt, messages);
    aDiv.classList.remove('loading');
    aDiv.innerHTML = marked.parse(answer);
    card._messages = [...messages, { role: 'assistant', content: answer }];
    card._rawText += `\n\n---\n\n**Follow-up:** ${question}\n\n${answer}`;
    saveResults();
  } catch(e) {
    aDiv.classList.remove('loading');
    aDiv.style.color = '#c0392b';
    aDiv.textContent = `Error: ${e.message}`;
  }

  input.disabled = false;
  input.focus();
}

// ── Copy to clipboard ──
function copyResult(id) {
  const card = [...document.querySelectorAll('.result-card')].find(c => c._id === id);
  if (!card || !card._rawText) return;
  navigator.clipboard.writeText(card._rawText).then(() => {
    const btn = document.getElementById(`cb-${id}`);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  });
}

// ── Result persistence [fix #9] ──
function saveResults() {
  try {
    const cards = [...document.querySelectorAll('.result-card')]
      .filter(c => c._rawText)
      .slice(0, 20);
    const data = cards.map(c => ({
      id: c._id,
      customer: c._customer,
      mode: c._mode,
      time: c._time,
      rawText: c._rawText
    }));
    localStorage.setItem('ci_results', JSON.stringify(data));
  } catch {}
}

function loadSavedResults() {
  try {
    const data = JSON.parse(localStorage.getItem('ci_results') || '[]');
    if (!data.length) return;
    [...data].reverse().forEach(d => {
      const card = addResultCard(d.customer, d.mode, { id: d.id, time: d.time });
      updateResultCard(card, d.rawText, false, null, null, true);
    });
  } catch {}
}

function clearHistory() {
  localStorage.removeItem('ci_results');
  document.querySelectorAll('.result-card').forEach(c => c.remove());
  document.getElementById('results-toolbar')?.remove();
  const results = document.getElementById('results');
  results.innerHTML = `<div class="empty-state" id="empty-state">
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

function showClearHistoryBtn() {
  if (document.getElementById('results-toolbar')) return;
  const main = document.querySelector('main');
  const results = document.getElementById('results');
  const toolbar = document.createElement('div');
  toolbar.id = 'results-toolbar';
  toolbar.className = 'results-toolbar';
  toolbar.innerHTML = '<button class="clear-history-btn" onclick="clearHistory()">Clear history</button>';
  main.insertBefore(toolbar, results);
}

// ── Init ──
(async () => {
  const fromServer = await loadServerConfig();
  if (!fromServer) loadConfig();
  renderQuickPrompts();
  updatePlaceholder();
  loadSavedResults();
})();
