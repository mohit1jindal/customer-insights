# Customer Insights

A browser-based tool that connects to your GitHub organisation, reads customer repositories, and uses Claude AI to translate code into plain business language — no technical knowledge required.

## Features

| Mode | Description |
|---|---|
| **Summarise Customer** | Explains what a customer's system does in plain English |
| **Translate Script** | Converts code logic into business process descriptions |
| **Feature Search** | Scans all repos to find which customers have a given capability |
| **Cross-Customer Compare** | Side-by-side comparison of business logic across customers |

## Getting Started

Open `index.html` directly in a browser (no build step needed), or deploy the folder to any static web host / Java servlet container.

### Configuration

Enter the following in the sidebar:

1. **Anthropic API Key** — from [console.anthropic.com](https://console.anthropic.com)
2. **GitHub Token** — a PAT with `repo` scope for reading private repositories
3. **GitHub Org / User** — the organisation or username that owns the customer repos

Click **Load Repositories** — the sidebar will populate with all accessible private repos.

## Project Structure

```
customer-insights/
├── index.html          # App shell / markup
├── css/
│   └── styles.css      # All styles
├── js/
│   └── app.js          # All application logic
└── WEB-INF/
    └── web.xml         # Servlet descriptor (for WAR deployment)
```

## Deployment

**Static host** (Netlify, S3, GitHub Pages): drop the folder contents as-is.

**Java servlet container** (Tomcat, Jetty): re-package as a WAR — the `WEB-INF/web.xml` descriptor is already included.

## Notes

- API keys are stored only in `localStorage` — nothing is sent to any server other than Anthropic and GitHub directly.
- Feature Search samples up to 30 repositories to stay within GitHub API rate limits.
