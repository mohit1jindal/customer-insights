# Customer Insights

> **Translate customer code into plain business language — instantly, in the browser.**

Sales engineers, support teams, and business analysts often need to understand what a customer's system does — without being able to read code. This tool bridges that gap: point it at a GitHub organisation, ask a question in plain English, and get a clear business-language answer powered by Claude AI.

No installation. No backend. No technical knowledge required.

![Customer Insights UI](docs/screenshot.png)

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

1. Enter your **Anthropic API key** and a **GitHub token** (PAT with `repo` scope)
2. Enter your **GitHub org or username** and click **Load Repositories**
3. Select a customer repo from the sidebar
4. Ask anything in plain English — Claude reads the source files and responds in business language

All API calls go directly from your browser to GitHub and Anthropic. Nothing is stored on any server.

---

## Quick Start

```bash
# Option 1 — open locally (no install needed)
open index.html

# Option 2 — serve with any static host
# Drop the folder on Netlify, S3, GitHub Pages, etc.
```

For server-deployed environments (Tomcat, Jetty), copy `config.sample.json` → `config.json`, fill in credentials, and package as a WAR — the `WEB-INF/web.xml` descriptor is already included.

---

## Tech Stack

- **Vanilla JS** — no framework, no build step, single `app.js`
- **Claude API** (`claude-sonnet-4-20250514`) — business language translation
- **GitHub REST API** — repo and file access
- **localStorage** — credential storage (client-side only)

---

## Project Structure

```
customer-insights/
├── index.html          # App shell
├── css/styles.css      # All styles
├── js/app.js           # All application logic
├── config.sample.json  # Credential template for server deployments
└── WEB-INF/web.xml     # Servlet descriptor (WAR packaging)
```

---

## Notes

- Feature Search scans up to 30 repositories to stay within GitHub API rate limits
- Files are prioritised by likely business relevance (`.py`, `.java`, `.sql`, config files) and capped at 3,000 characters each to manage token usage
- API keys never leave the browser
