// Token-protected story API: /api/story/* (D1 CRUD). The UI at /story/ is static; the browser keeps the token.
const enc = new TextEncoder();
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function tokenOk(request, env) {
  const given = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.STORY_TOKEN || !given) return false;
  const [a, b] = await Promise.all([given, env.STORY_TOKEN].map((v) => crypto.subtle.digest("SHA-256", enc.encode(v))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  return x.every((v, i) => v === y[i]);
}

export async function handleStory(request, env, url) {
  const path = url.pathname;
  if (!path.startsWith("/api/story/")) return env.ASSETS.fetch(request);
  if (!(await tokenOk(request, env))) return json({ error: "Unauthorized" }, 401);

  const m = /^\/api\/story\/stories(?:\/([\w-]+))?$/.exec(path);
  if (!m) return json({ error: "Not found" }, 404);
  const id = m[1];
  const now = Date.now();

  if (!id && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, title, genre, logline, updated_at FROM stories ORDER BY updated_at DESC").all();
    return json(results);
  }
  if (!id && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const newId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO stories (id, title, genre, logline, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
      .bind(newId, String(b.title || "Untitled").slice(0, 200), b.genre ? String(b.genre).slice(0, 50) : null, "", "{}", now, now).run();
    return json({ id: newId, title: b.title || "Untitled", genre: b.genre || null, logline: "", data: {}, updated_at: now }, 201);
  }
  if (id && request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM stories WHERE id = ?").bind(id).first();
    return row ? json({ ...row, data: JSON.parse(row.data) }) : json({ error: "Not found" }, 404);
  }
  if (id && request.method === "PUT") {
    const b = await request.json().catch(() => null);
    if (!b) return json({ error: "Bad JSON" }, 400);
    const data = JSON.stringify(b.data || {});
    if (data.length > 500000) return json({ error: "Too large" }, 413);
    const r = await env.DB.prepare("UPDATE stories SET title=?, genre=?, logline=?, data=?, updated_at=? WHERE id=?")
      .bind(String(b.title || "Untitled").slice(0, 200), b.genre ? String(b.genre).slice(0, 50) : null, String(b.logline || "").slice(0, 2000), data, now, id).run();
    return r.meta.changes ? json({ ok: true, updated_at: now }) : json({ error: "Not found" }, 404);
  }
  if (id && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM stories WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
