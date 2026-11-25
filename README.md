# ason.pw

Landing page for ason.pw, deployed as its own Worker (`ason-pw`), distinct from `asonpeikoff-com`. Static assets in `public/`, plus a small Worker script:

- `index.html` — the page: an isometric pure-CSS 3D room (adapted from the CodePen "3D Room" by Ricardo Oliva Alonso, scene by Jarlan Perez) with Ayn Rand posters and a TV cycling Objectivist-site screenshots (assets in `room/`, pointer parallax and `?theme=` accent colours in `room.js`). Carries the title, description, canonical, Open Graph/Twitter tags and WebSite JSON-LD.
- `404.html` — served with a 404 status for unknown paths (`not_found_handling = "404-page"`); `noindex`.
- `_headers` — security headers (CSP, HSTS, nosniff, frame and referrer policy) for every asset.
- `favicon.svg`, `robots.txt`, `sitemap.xml`

`src/index.js` runs in front of the assets and does two things:

- 301-redirects `http://` and bare `ason.pw` requests to `https://www.ason.pw` in a single hop, so only one version of each URL exists.
- serves the 1200×630 share image at `/og.png` (stored as base64 in `src/og-image.js`).

## Deploy

This is the Worker's own repo (moved out of `asonpeikoff.com`'s `ason-pw/` subdirectory). The Cloudflare Workers Build for `ason-pw` builds from this repo's root; manual deploy:

```bash
npx wrangler deploy
```

## Story suite (`/story`)

A private Save the Cat workspace: 15 beat cards with prompts, 10 genre guides (3 required elements each), per-story saves, and Word export (a section per beat with a small reminder header, then your text).

- UI: `public/story/` (static; `data.js` holds the beats and genres). The browser stores the access token in localStorage.
- API: `src/story.js` → `/api/story/*`, Bearer-token auth against the `STORY_TOKEN` secret, stories in D1 (`ason-pw-story`, binding `DB`, schema in `migrations/`).
- Set the token once: `npx wrangler secret put STORY_TOKEN`
