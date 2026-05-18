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

// Fetches config.json from the server and populates credentials.
// Returns true if credentials were loaded, false to fall back to localStorage.
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
    // Collapse config panel — credentials pre-loaded from server
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

// ── Load repos ──
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
      const url = `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&type=private`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
      if (!res.ok) {
        const res2 = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&visibility=private`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
        });
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

// ── Fetch repo files ──
async function fetchRepoFiles(repoName, maxFiles = 20) {
  const token = document.getElementById('github-token').value;
  const org = document.getElementById('github-org').value.trim();
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };

  const treeRes = await fetch(`https://api.github.com/repos/${org}/${repoName}/git/trees/HEAD?recursive=1`, { headers });
  if (!treeRes.ok) throw new Error(`Could not read repo: ${repoName}`);
  const tree = await treeRes.json();

  const PRIORITY_PATTERNS = [/\.py$/, /\.js$/, /\.ts$/, /\.java$/, /\.cs$/, /\.rb$/, /\.php$/, /config/i, /settings/i, /business/i, /logic/i, /process/i, /rules/i, /\.sql$/];
  const SKIP_PATTERNS = [/node_modules/, /\.min\.js/, /dist\//, /build\//, /package-lock/, /yarn\.lock/, /\.lock$/, /\.map$/, /\.png/, /\.jpg/, /\.ico/, /\.svg/];

  const files = (tree.tree || [])
    .filter(f => f.type === 'blob')
    .filter(f => !SKIP_PATTERNS.some(p => p.test(f.path)))
    .sort((a, b) => {
      const aScore = PRIORITY_PATTERNS.filter(p => p.test(a.path)).length;
      const bScore = PRIORITY_PATTERNS.filter(p => p.test(b.path)).length;
      return bScore - aScore;
    })
    .slice(0, maxFiles);

  const contents = await Promise.all(files.map(async f => {
    try {
      const r = await fetch(`https://api.github.com/repos/${org}/${repoName}/contents/${f.path}`, { headers });
      if (!r.ok) return null;
      const d = await r.json();
      if (d.encoding === 'base64') {
        const text = atob(d.content.replace(/\n/g,''));
        return `\n\n### FILE: ${f.path}\n\`\`\`\n${text.slice(0, 3000)}\n\`\`\``;
      }
      return null;
    } catch { return null; }
  }));

  return contents.filter(Boolean).join('');
}

// ── Claude API ──
async function askClaude(systemPrompt, userMessage) {
  const key = document.getElementById('anthropic-key').value;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
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

  const card = addResultCard(selectedRepo, currentMode === 'summarise' ? 'Summary' : 'Translation', true);
  document.getElementById('send-btn').disabled = true;
  document.getElementById('status-dot').className = 'dot loading';
  document.getElementById('status-text').textContent = 'fetching code...';

  try {
    const code = await fetchRepoFiles(selectedRepo, currentMode === 'summarise' ? 15 : 20);
    document.getElementById('status-text').textContent = 'asking Claude...';

    const systemPrompt = currentMode === 'summarise'
      ? `You are a business analyst assistant. Your job is to read source code and explain what the system does in clear, plain English — suitable for a non-technical business stakeholder or project manager. Focus on: what business problems the system solves, the main business processes and workflows, key business rules or logic, integrations with other systems, and what data flows in and out. Use business language, not technical jargon. Structure your answer with clear headings.`
      : `You are a business analyst assistant. Translate the provided source code into plain English business language. Explain what each script or module does in terms of business processes, rules, and outcomes. A non-technical manager should be able to fully understand what this code does after reading your explanation. Avoid technical terms — if you must use one, explain it. Use bullet points and short paragraphs.`;

    const answer = await askClaude(systemPrompt,
      `Customer repository: ${selectedRepo}\n\nCode files:\n${code}\n\nQuestion: ${query}`
    );
    updateResultCard(card, answer);
  } catch(e) {
    updateResultCard(card, `Error: ${e.message}`, true);
  }

  document.getElementById('send-btn').disabled = false;
  document.getElementById('status-dot').className = 'dot ready';
  document.getElementById('status-text').textContent = 'configured';
}

// ── Feature search ──
async function runFeatureSearch(query) {
  if (!allRepos.length) { alert('Load repositories first.'); return; }
  const key = document.getElementById('anthropic-key').value;
  const token = document.getElementById('github-token').value;
  if (!key || !token) { alert('Configure API keys first.'); return; }

  const card = addResultCard('All customers', 'Feature Search', true);
  document.getElementById('send-btn').disabled = true;
  document.getElementById('status-dot').className = 'dot loading';

  try {
    const sample = allRepos.slice(0, 30);
    document.getElementById('status-text').textContent = `scanning ${sample.length} repos...`;

    const summaries = await Promise.all(sample.map(async repo => {
      try {
        const code = await fetchRepoFiles(repo.name, 8);
        return `CUSTOMER: ${repo.name}\n${code.slice(0, 2000)}`;
      } catch { return `CUSTOMER: ${repo.name}\n(could not read)`; }
    }));

    document.getElementById('status-text').textContent = 'asking Claude...';

    const answer = await askClaude(
      `You are a business analyst. You are given code snippets from multiple customer repositories. Answer the user's question by identifying which customers have the requested feature or capability. Be specific — name the customers and explain what you found in their code. Speak in business language.`,
      `Question: ${query}\n\nCustomer repositories:\n\n${summaries.join('\n\n---\n\n')}`
    );
    updateResultCard(card, answer);
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
  const card = addResultCard(customers.join(' vs '), 'Comparison', true);
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

    const answer = await askClaude(
      `You are a business analyst comparing multiple customer implementations. Explain the similarities and differences between their business logic, processes, and capabilities in plain English. Use a structured format with clear sections. Focus on business impact, not technical details.`,
      `Question: ${query || 'Compare the business logic and processes of these customers.'}\n\nCustomer repositories:\n\n${codes.join('\n\n---\n\n')}`
    );
    updateResultCard(card, answer);
  } catch(e) {
    updateResultCard(card, `Error: ${e.message}`, true);
  }

  document.getElementById('compare-btn').disabled = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('status-dot').className = 'dot ready';
  document.getElementById('status-text').textContent = 'configured';
}

// ── Result cards ──
function addResultCard(customer, mode, loading) {
  document.getElementById('empty-state')?.remove();
  const results = document.getElementById('results');
  const time = new Date().toLocaleTimeString();
  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML = `
    <div class="result-header">
      <div class="result-meta">
        <span class="result-customer">${customer}</span>
        <span class="result-mode">${mode}</span>
      </div>
      <span class="result-time">${time}</span>
    </div>
    <div class="result-body loading" id="rb-${Date.now()}">⟳ Loading — fetching code and translating to business language...</div>
  `;
  results.prepend(card);
  card._bodyId = card.querySelector('.result-body').id;
  return card;
}

function updateResultCard(card, text, isError) {
  const body = document.getElementById(card._bodyId);
  if (!body) return;
  body.classList.remove('loading');
  if (isError) {
    body.style.color = '#c0392b';
    body.innerHTML = marked.parse(text);
  } else {
    body.innerHTML = marked.parse(text);
  }
}

// ── Init ──
// Try loading credentials from config.json first; fall back to localStorage.
(async () => {
  const fromServer = await loadServerConfig();
  if (!fromServer) loadConfig();
  renderQuickPrompts();
  updatePlaceholder();
})();
