<div align="center">

# Roy Padayao — Portfolio Website

**Data Analyst & Data Engineer · PostgreSQL · DBT · Airflow · FastAPI · Power BI**

[![Live Site](https://img.shields.io/badge/LIVE-rtpadayao.com-0a66c2?style=for-the-badge)](https://rtpadayao.com/)
[![Netlify Status](https://img.shields.io/netlify/88a0e3e4-e0e5-4a47-9bd0-3c34a190ab7e?label=deployed%20on&style=for-the-badge)](https://app.netlify.com/sites/rtpadayao)</div>

## Tech Stack

| Layer | Tools |
|-------|-------|
| SSG | Hugo v0.163.3 |
| Theme | PaperMod (customized) |
| Hosting | Netlify |
| Content | Markdown · YAML front matter |

## Quick Start

```bash
# 1. Clone
git clone https://github.com/rtpadayao/roy_portfolio_website.git

# 2. Start dev server (http://localhost:1313)
hugo server -D

# 3. Build for production (outputs to public/)
hugo --gc --minify
```

## Project Structure

```
content/            # Site pages & posts (Markdown)
├── _index.md       # Homepage (profile card + hero)
├── about/          # About page
├── posts/          # Blog posts
├── projects/       # Project showcase
└── contact/        # Contact page

layouts/            # Template overrides (list, single, partials)
static/             # Raw assets (profile.png)
themes/papermod/    # PaperMod theme
config.toml         # Site config (menu, profile, socials)
netlify.toml         # Build + deploy config
docs/               # Planning & reference
archetypes/         # New-content templates
```

## Deployment

**Production:** https://rtpadayao.netlify.app/ — auto-deploys on push to `main` via Netlify.

## About This Site

Hugo rebuild of the original [HTML5 UP](https://html5up.net) template. Refactored with PaperMod theme, custom layouts, and content managed in Markdown for easier long-term maintenance.
