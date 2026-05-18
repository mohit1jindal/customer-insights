# Customer Insights

> **Translate customer code into plain business language — instantly, in the browser.**

Sales engineers, support teams, and business analysts often need to understand what a customer's system does — without being able to read code. This tool bridges that gap: point it at a GitHub organisation, ask a question in plain English, and get a clear business-language answer powered by AI.

No installation. No backend. No technical knowledge required.

---

## The Problem

When you manage dozens of customer implementations, answering questions like:

- *"Does this customer have automated invoicing?"*
- *"What does their overnight batch job actually do?"*
- *"How does Customer A's setup differ from Customer B's?"*

…usually means filing a ticket, waiting for a developer, and getting a technical answer that still needs translating. This tool removes that dependency entirely.

---

## What It Does

| Mode | Question it answers |
|---|---|
| **Summarise Customer** | *"What does this customer's system do in plain English?"* |
| **Translate Script** | *"What business process does this code implement?"* |
| **Feature Search** | *"Which of my customers have multi-currency support?"* |
| **Cross-Customer Compare** | *"How does Customer A's billing logic differ from Customer B's?"* |

---

## How It Works

1. Choose your **AI provider** (Anthropic, OpenAI, or any OpenAI-compatible endpoint like Groq or Ollama) and enter your **API key**
2. Enter your **GitHub token** (PAT with `repo` scope) and your **GitHub org or username**
3. Click **Load Repositories** — the sidebar populates with all your repos
4. Select a customer, ask anything in plain English — the AI reads the source files and responds in business language

All API calls go directly from your browser to GitHub and your AI provider. Nothing is stored on any server.

---

## Quick Start

```bash
# Option 1 — open locally (no install needed)
open index.html

# Option 2 — serve with any static host
# Drop the folder on Netlify, S3, GitHub Pages, etc.
```

For server-deployed environments (Tomcat, JBoss, WebLogic), copy `config.sample.json` → `config.json`, fill in credentials, and package as a WAR — the `WEB-INF/web.xml` descriptor is already included.

See [`docs/guide.html`](docs/guide.html) for the full deployment guide.

---

## Tech Stack

- **Vanilla JS** — no framework, no build step, single `app.js`
- **Object-oriented architecture** — `ConfigManager`, `GitHubClient`, `LLMClient`, `ResultCard`, `App`
- **Any AI provider** — works with any model behind an OpenAI-compatible API
- **GitHub REST API** — repository tree and file access
- **DOMPurify + marked.js** — safe markdown rendering
- **localStorage** — credential and result storage (client-side only)

---

## Project Structure

```
customer-insights/
├── index.html          # App shell
├── css/styles.css      # All styles
├── js/app.js           # All application logic
├── docs/guide.html     # WAR deployment guide & technical reference
├── config.sample.json  # Credential template for server deployments
└── WEB-INF/web.xml     # Servlet descriptor (WAR packaging)
```

---

## Notes

- Feature Search scans up to 50 repositories
- Files are prioritised by likely business relevance (`.py`, `.java`, `.sql`, config files) and capped at 5,000 characters each
- API keys never leave the browser
- Retry with exponential backoff on GitHub API failures
- GitHub rate limit indicator shown in the header when quota runs low
