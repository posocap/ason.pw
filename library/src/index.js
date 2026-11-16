const FEED = "https://www.postsocialist.com/feed";
const SITE = "The Ason Peikoff Library";
const AUTHOR = "Ason Peikoff";
const SAME_AS = ["https://www.postsocialist.com", "https://asonpeikoff.com", "https://github.com/asonpeikoff"];
const STATIC_LASTMOD = "2026-11-16";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cdata = (s) => (s || "").replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? cdata(m[1]) : "";
};
const fmt = (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const iso = (d) => d.toISOString().slice(0, 10);
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

async function loadPosts() {
  const res = await fetch(FEED, { cf: { cacheTtl: 600, cacheEverything: true }, headers: { "user-agent": "ason-peikoff-library/1.0" } });
  if (!res.ok) throw new Error("feed " + res.status);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const it = m[1];
    const link = decode(tag(it, "link"));
    const slug = (link.match(/\/p\/([^/?#]+)/) || [])[1] || "";
    const enc = it.match(/<enclosure[^>]*url="([^"]+)"/);
    return { slug, link, title: decode(tag(it, "title")), desc: decode(tag(it, "description")), date: new Date(tag(it, "pubDate")), html: tag(it, "content:encoded"), img: enc ? decode(enc[1]) : "" };
  }).filter((p) => p.slug);
}

// ---------- shared layout + SEO head ----------
function layout(ctx, o) {
  const { origin } = ctx;
  const canonical = o.canonical || origin + o.path;
  const image = o.image || origin + "/img/og.jpg";
  const robots = o.noindex ? "noindex,follow" : "index,follow,max-image-preview:large,max-snippet:-1";
  const ogType = o.ogType || "website";
  const extra = (o.jsonld || []).map(ld).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<meta name="robots" content="${robots}">
<meta name="author" content="${AUTHOR}">
<meta name="theme-color" content="#0b1730">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:site_name" content="${SITE}"><meta property="og:locale" content="en_US">
<meta property="og:type" content="${ogType}"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:alt" content="${esc(o.imageAlt || SITE + " — essays, notes and philosophy by " + AUTHOR)}">
${o.published ? `<meta property="article:published_time" content="${o.published}"><meta property="article:author" content="${AUTHOR}">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(o.title)}"><meta name="twitter:description" content="${esc(o.description)}"><meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">
<link rel="stylesheet" href="/style.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Roboto+Condensed:wght@700&display=swap" rel="stylesheet">
${o.preload || ""}${extra}
</head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav"><a class="brand" href="/"><img src="/favicon-48x48.png" alt="" width="34" height="34">${SITE}</a><nav aria-label="Main"><a class="l" href="/library/"${o.nav === "library" ? ' aria-current="page"' : ""}>The Library</a><a class="l" href="/about/"${o.nav === "about" ? ' aria-current="page"' : ""}>About ${AUTHOR}</a></nav></header>
${o.body}
<footer><p><strong>${SITE}</strong> &middot; essays, notes and philosophy by ${AUTHOR}.</p><p><a href="/">Peikoff Library</a> &middot; <a href="/library/">Essays &amp; notes</a> &middot; <a href="/about/">About</a> &middot; <a href="https://www.postsocialist.com" rel="me">Postsocialist Press</a></p><p class="small">An independent, self-funded personal project.</p></footer>
</body></html>`;
}

const CSP = "default-src 'none'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const html = (body, status = 200, cache = "public, max-age=300") =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP, "cache-control": cache, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" } });

const personLd = (origin) => ({
  "@context": "https://schema.org", "@type": "Person", "@id": origin + "/#ason-peikoff",
  name: AUTHOR, givenName: "Ason", familyName: "Peikoff", url: origin + "/", image: origin + "/img/portrait.jpg",
  jobTitle: "Writer", description: "Ason Peikoff writes essays on philosophy, politics and technology at Postsocialist Press and keeps The Ason Peikoff Library.",
  sameAs: SAME_AS,
});
const websiteLd = (origin) => ({
  "@context": "https://schema.org", "@type": "WebSite", "@id": origin + "/#website", url: origin + "/", name: SITE, alternateName: ["Peikoff Library", "Ason Peikoff Library"],
  description: "A personal library of essays, notes and philosophy by Ason Peikoff.", inLanguage: "en-US", publisher: { "@id": origin + "/#ason-peikoff" }, author: { "@id": origin + "/#ason-peikoff" },
});
const crumbs = (origin, items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: origin + path })) });

// ---------- pages ----------
function homePage(ctx) {
  const o = ctx.origin;
  const body = `<main id="main"><div class="hero"><div class="in"><h1>The Ason Peikoff Library</h1><p class="lead">Essays, study notes and philosophy by <strong>Ason Peikoff</strong> &mdash; a personal library built by one person, for the benefit of that person, and open to anyone who finds it useful.</p><p><a class="btn" href="/library/">Explore the Library</a></p></div></div>
<div class="wrap">
<section class="who" aria-labelledby="who"><img class="portrait" src="/img/portrait.jpg" alt="Portrait of Ason Peikoff, writer and keeper of the Peikoff Library" width="600" height="900" fetchpriority="high"><div><h2 id="who">Who is Ason Peikoff?</h2><p>Ason Peikoff is a writer and student of philosophy who publishes <a href="https://www.postsocialist.com" rel="me">Postsocialist Press</a> and keeps this library for his own use: notes, remixes, essays and the occasional thought experiment. He is not Leonard Peikoff; this library was inspired by the <em>Leonard Peikoff Library</em> and is a personal project of its own.</p><p><a href="/about/">More about Ason Peikoff and this library</a></p></div></section>
<section aria-labelledby="what"><h2 id="what">What is the Peikoff Library?</h2><p>A curated shelf of essays, condensed notes and remixes of excellent public material, plus original writing. Every item says where it came from and what I added. Start with <a href="/library/">the latest essays from Postsocialist Press</a>.</p></section>
<section aria-labelledby="for"><h2 id="for">Who is this library for?</h2><ul class="check"><li>Me, first. That is the point.</li><li>Students of philosophy and anyone curious about Objectivism.</li><li>Anyone building their own course of study.</li></ul></section>
<section aria-labelledby="fund"><h2 id="fund">Funded by nobody</h2><p>No donations, no sponsors, no ads. <a href="/about/">Read why this Peikoff library is deliberately selfish</a>.</p></section></div></main>`;
  return layout(ctx, {
    path: "/", title: "Ason Peikoff — The Ason Peikoff Library | Essays & Philosophy",
    description: "Essays, study notes and philosophy by Ason Peikoff: a self-funded personal Peikoff library with writing from Postsocialist Press.",
    body, nav: "", jsonld: [personLd(o), websiteLd(o)], image: o + "/img/og.jpg",
    preload: `<link rel="preload" as="image" href="/img/hero.jpg" fetchpriority="high">`,
  });
}

function aboutPage(ctx) {
  const o = ctx.origin;
  const body = `<main id="main"><div class="page-title"><h1>About Ason Peikoff and this library</h1></div><div class="wrap">
<section aria-labelledby="selfish"><h2 id="selfish">A selfish library</h2>
<p>This library exists for one reason: I want it. I built it to organize my own thinking, keep my own notes where I can find them, and give my own writing a home. Nobody asked me to, and nobody is paying me to.</p>
<p>I take no donations, no sponsorships and no ads. Every hour and every dollar is mine, and so is every decision about what goes on the shelves. I do not owe the library an audience, and the audience does not owe it support.</p>
<p>That is the whole arrangement, and I think it is the honest one: I pursue my own interest, in the open, and anyone who finds value in the result is welcome to it. Trade, not charity, in both directions.</p></section>
<section aria-labelledby="who2"><h2 id="who2">Who is Ason Peikoff?</h2><p>I'm Ason Peikoff, a writer and student of philosophy. I publish essays at <a href="https://www.postsocialist.com" rel="me">Postsocialist Press</a> and keep the work I find useful here. You can also find me at <a href="https://asonpeikoff.com" rel="me">asonpeikoff.com</a> and on <a href="https://github.com/asonpeikoff" rel="me">GitHub</a>.</p></section>
<section aria-labelledby="find"><h2 id="find">What you will find</h2><ul class="check"><li>Essays from my Substack, <a href="https://www.postsocialist.com">Postsocialist Press</a>, served live in <a href="/library/">the Library</a>.</li><li>Remixed notes, always crediting the original source.</li><li>Historical blog posts and journal articles I find along the way, with credit.</li></ul></section>
<section aria-labelledby="insp"><h2 id="insp">Inspiration</h2><p>This library was inspired by the Leonard Peikoff Library, which does the real work of making Dr. Peikoff's courses and lectures freely available. This is in no way making fun of it. It is simply my own fun version, for myself &mdash; until somebody wants to donate money to make me a real library like that one.</p></section>
<section aria-labelledby="ind"><h2 id="ind">Independence</h2><p class="note">This is a personal project. It is not affiliated with, endorsed by, or a copy of the Ayn Rand Institute, the Leonard Peikoff Library, or any other site. Ason Peikoff and Leonard Peikoff are different people.</p></section></div></main>`;
  return layout(ctx, {
    path: "/about/", title: "About Ason Peikoff — The Ason Peikoff Library",
    description: "About Ason Peikoff and his self-funded personal library of essays and philosophy: no donations, no sponsors, no ads. Not affiliated with Leonard Peikoff or the Leonard Peikoff Library.",
    body, nav: "about", ogType: "profile", jsonld: [{ "@context": "https://schema.org", "@type": "AboutPage", "@id": o + "/about/#page", url: o + "/about/", name: "About Ason Peikoff", about: { "@id": o + "/#ason-peikoff" }, isPartOf: { "@id": o + "/#website" } }, personLd(o), crumbs(o, [["Home", "/"], ["About", "/about/"]])],
  });
}

function listPage(ctx, posts) {
  const o = ctx.origin;
  const cards = posts.map((p) => `<article><a class="card post-card" href="/post/${esc(p.slug)}">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" decoding="async" width="640" height="360" referrerpolicy="no-referrer">` : ""}<h3>${esc(p.title)}</h3><p class="meta"><time datetime="${iso(p.date)}">${fmt(p.date)}</time></p><p>${esc(clip(p.desc, 180))}</p></a></article>`).join("");
  const body = `<main id="main"><div class="page-title"><h1>The Peikoff Library: essays &amp; notes by Ason Peikoff</h1></div><div class="wrap"><section aria-labelledby="pp"><h2 id="pp">Postsocialist Press</h2><p>Essays by Ason Peikoff, served live from his Substack, <a href="https://www.postsocialist.com" rel="me">postsocialist.com</a>. More collections &mdash; historical blog posts, data science writing and journal articles &mdash; are on the way.</p><div class="grid">${cards}</div></section></div></main>`;
  return layout(ctx, {
    path: "/library/", title: "Essays & Notes by Ason Peikoff — The Peikoff Library",
    description: `Read ${posts.length} essays by Ason Peikoff from Postsocialist Press, collected in the Ason Peikoff Library: philosophy, politics, technology and more.`,
    body, nav: "library",
    jsonld: [{ "@context": "https://schema.org", "@type": "CollectionPage", "@id": o + "/library/#page", url: o + "/library/", name: "The Library — essays and notes by Ason Peikoff", isPartOf: { "@id": o + "/#website" }, about: { "@id": o + "/#ason-peikoff" } },
      { "@context": "https://schema.org", "@type": "ItemList", itemListElement: posts.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: o + "/post/" + p.slug, name: p.title })) },
      crumbs(o, [["Home", "/"], ["The Library", "/library/"]])],
  });
}

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

async function postPage(ctx, p) {
  const o = ctx.origin;
  const body = await sanitize(p.html || `<p>${esc(p.desc)}</p>`);
  const page = `<main id="main"><div class="page-title"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Peikoff Library</a> &rsaquo; <a href="/library/">The Library</a></nav><p class="meta"><time datetime="${iso(p.date)}">${fmt(p.date)}</time> &middot; by ${AUTHOR}</p><h1>${esc(p.title)}</h1></div>
<div class="wrap"><article class="post">${body}</article><p class="note">Originally published on <a href="${esc(p.link)}" rel="canonical">Postsocialist Press</a>. The original may contain more than shown here.</p></div></main>`;
  return layout(ctx, {
    path: "/post/" + p.slug, canonical: p.link, ogType: "article", published: p.date.toISOString(), image: p.img || o + "/img/og.jpg",
    title: `${p.title} — ${AUTHOR}`, description: clip(p.desc || p.title, 160), body: page, nav: "library",
    jsonld: [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title, description: p.desc, datePublished: p.date.toISOString(), mainEntityOfPage: p.link, url: p.link, image: p.img || undefined, author: { "@id": o + "/#ason-peikoff", "@type": "Person", name: AUTHOR, url: o + "/" }, publisher: { "@type": "Organization", name: "Postsocialist Press", url: "https://www.postsocialist.com" }, isPartOf: { "@id": o + "/#website" } },
      crumbs(o, [["Home", "/"], ["The Library", "/library/"], [p.title, "/post/" + p.slug]])],
  });
}

function sitemap(o, posts) {
  const u = (loc, last, pri) => `<url><loc>${esc(o + loc)}</loc><lastmod>${last}</lastmod><priority>${pri}</priority></url>`;
  const newest = posts.length ? iso(posts[0].date) : STATIC_LASTMOD;
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${u("/", newest > STATIC_LASTMOD ? newest : STATIC_LASTMOD, "1.0")}${u("/library/", newest, "0.9")}${u("/about/", STATIC_LASTMOD, "0.6")}${posts.map((p) => u("/post/" + p.slug, iso(p.date), "0.5")).join("")}</urlset>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Canonicalize: bare domain and http:// go to https://www in a single hop (only when a custom domain is configured).
    if (env.APEX_HOST && env.WWW_HOST && (url.hostname === env.APEX_HOST || (url.hostname === env.WWW_HOST && url.protocol === "http:"))) {
      return Response.redirect(`https://${env.WWW_HOST}${url.pathname}${url.search}`, 301);
    }
    const ctx = { origin: (env.SITE_URL || url.origin).replace(/\/$/, "") };
    const path = url.pathname;

    if (path === "/robots.txt") {
      return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${ctx.origin}/sitemap.xml\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }
    if (path === "/about") return Response.redirect(ctx.origin + "/about/", 301);
    if (path === "/library") return Response.redirect(ctx.origin + "/library/", 301);
    if (path === "/") return html(homePage(ctx), 200, "public, max-age=600");
    if (path === "/about/") return html(aboutPage(ctx), 200, "public, max-age=600");

    if (path === "/sitemap.xml" || path === "/library/" || path.startsWith("/post/")) {
      let posts;
      try { posts = await loadPosts(); } catch (e) {
        if (path === "/sitemap.xml") posts = [];
        else return html(layout(ctx, { path, noindex: true, title: "Restocking — " + SITE, description: "The shelves are being restocked.", body: `<main id="main"><div class="wrap"><h1>The shelves are being restocked</h1><p>Try again shortly.</p></div></main>` }), 502, "no-store");
      }
      posts.sort((a, b) => b.date - a.date);
      if (path === "/sitemap.xml") return new Response(sitemap(ctx.origin, posts), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
      if (path === "/library/") return html(listPage(ctx, posts));
      const slug = decodeURIComponent(path.slice(6)).replace(/\/$/, "");
      const p = posts.find((x) => x.slug === slug);
      if (!p) return html(layout(ctx, { path, noindex: true, title: "Not found — " + SITE, description: "Page not found.", body: `<main id="main"><div class="wrap"><h1>404</h1><p>No such post. <a href="/library/">Back to the Library</a>.</p></div></main>` }), 404);
      return html(await postPage(ctx, p));
    }
    return env.ASSETS.fetch(request);
  },
};
