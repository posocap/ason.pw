const FEED = "https://www.postsocialist.com/feed";
const SITE = "The Ason Peikoff Library";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cdata = (s) => (s || "").replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? cdata(m[1]) : "";
};

async function loadPosts(ctx) {
  const res = await fetch(FEED, { cf: { cacheTtl: 600, cacheEverything: true }, headers: { "user-agent": "ason-peikoff-library/1.0" } });
  if (!res.ok) throw new Error("feed " + res.status);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const it = m[1];
    const link = decode(tag(it, "link"));
    const slug = (link.match(/\/p\/([^/?#]+)/) || [])[1] || "";
    const enc = it.match(/<enclosure[^>]*url="([^"]+)"/);
    return {
      slug, link,
      title: decode(tag(it, "title")),
      desc: decode(tag(it, "description")),
      date: new Date(tag(it, "pubDate")),
      html: tag(it, "content:encoded"),
      img: enc ? decode(enc[1]) : "",
    };
  }).filter((p) => p.slug);
}

const fmt = (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

function layout(title, desc, body, extra = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta name="twitter:card" content="summary_large_image">${extra}
<link rel="icon" href="/img/emblem.jpg"><link rel="stylesheet" href="/style.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Roboto+Condensed:wght@700&display=swap" rel="stylesheet">
</head><body><header class="nav"><a class="brand" href="/"><img src="/img/emblem.jpg" alt="">${SITE}</a><a class="l" href="/library/">The Library</a><a class="l" href="/about/">About</a></header>${body}
<footer>${SITE} &middot; an independent, self-funded personal project.</footer></body></html>`;
}

const CSP = "default-src 'none'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const html = (body, status = 200, cache = "public, max-age=300") =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, "cache-control": cache, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" } });

async function sanitize(raw) {
  const rw = new HTMLRewriter()
    .on("script,style,iframe,object,embed,form,button,input,svg,video,audio,.subscription-widget-wrap,.button-wrapper,.captioned-button-wrap,.pencraft", { element: (e) => e.remove() })
    .on("*", {
      element(e) {
        for (const [name, value] of [...e.attributes]) {
          const n = name.toLowerCase();
          if (n.startsWith("on") || n === "style" || n === "srcset" || n === "sizes" || n === "class" || n === "id" || n.startsWith("data-")) e.removeAttribute(name);
          else if ((n === "href" || n === "src") && !/^(https?:|mailto:|#|\/)/i.test(value.trim())) e.removeAttribute(name);
        }
        if (e.tagName === "a") { e.setAttribute("rel", "noopener noreferrer"); e.setAttribute("target", "_blank"); }
        if (e.tagName === "img") { e.setAttribute("loading", "lazy"); e.setAttribute("referrerpolicy", "no-referrer"); }
      },
    });
  return rw.transform(new Response(raw)).text();
}

function listPage(posts) {
  const cards = posts.map((p) => `<a class="card post-card" href="/post/${esc(p.slug)}">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<h3>${esc(p.title)}</h3><p class="meta">${fmt(p.date)}</p><p>${esc(p.desc)}</p></a>`).join("");
  return layout(`The Library — ${SITE}`, "Essays from Postsocialist Press, served live.", `<div class="page-title"><h1>The Library</h1></div><main>
<section><h2>Postsocialist Press</h2><p>Essays by Ason Peikoff, served live from my Substack, <a href="https://www.postsocialist.com">postsocialist.com</a>. More collections &mdash; historical blog posts, data science writing and journal articles &mdash; are on the way.</p><div class="grid">${cards}</div></section></main>`);
}

async function postPage(p) {
  const body = await sanitize(p.html || `<p>${esc(p.desc)}</p>`);
  return layout(`${p.title} — ${SITE}`, p.desc, `<div class="page-title"><p class="meta"><a href="/library/">&larr; The Library</a> &middot; ${fmt(p.date)}</p><h1>${esc(p.title)}</h1></div>
<main><article class="post">${body}</article><p class="note">Originally published on <a href="${esc(p.link)}">Postsocialist Press</a>. The original may contain more than shown here.</p></main>`,
    `<link rel="canonical" href="${esc(p.link)}">`);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/library" ) return Response.redirect(url.origin + "/library/", 301);
    if (path === "/library/" || path.startsWith("/post/")) {
      let posts;
      try { posts = await loadPosts(ctx); } catch (e) { return html(layout("Unavailable", "", `<main><h2>The shelves are being restocked</h2><p>Try again shortly.</p></main>`), 502, "no-store"); }
      if (path === "/library/") return html(listPage(posts));
      const slug = decodeURIComponent(path.slice(6)).replace(/\/$/, "");
      const p = posts.find((x) => x.slug === slug);
      if (!p) return html(layout("Not found", "", `<main><h2>404</h2><p>No such post. <a href="/library/">Back to the Library</a>.</p></main>`), 404);
      return html(await postPage(p));
    }
    return env.ASSETS.fetch(request);
  },
};
