(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const { beats, genres } = window.STC;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let token = "", stories = [], cur = null, tab = "beats", timer = null;
  try { token = localStorage.getItem("story_token") || ""; } catch {}

  async function api(path, opts = {}) {
    const r = await fetch("/api/story/" + path, { ...opts, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } });
    if (r.status === 401) { showLogin("Wrong or missing token"); throw new Error("unauthorized"); }
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  function showLogin(msg) { $("#app").style.display = "none"; $("#login").style.display = "block"; $("#lerr").textContent = msg || ""; }
  $("#login").addEventListener("submit", (e) => {
    e.preventDefault(); token = $("#tok").value.trim();
    try { localStorage.setItem("story_token", token); } catch {}
    start();
  });
  async function start() {
    if (!token) return showLogin();
    try { stories = await api("stories"); } catch { return; }
    $("#login").style.display = "none"; $("#app").style.display = "grid";
    if (stories.length) await open(stories[0].id); else render();
    renderList();
  }

  function renderList() {
    $("#list").innerHTML = stories.map((s) => `<button class="story ${cur && cur.id === s.id ? "on" : ""}" data-id="${s.id}">${esc(s.title)}<small>${esc((genres.find((g) => g.key === s.genre) || {}).name || "No genre")}</small></button>`).join("") || '<div class="status">No stories yet.</div>';
  }
  $("#list").addEventListener("click", (e) => { const b = e.target.closest(".story"); if (b) open(b.dataset.id); });
  async function open(id) { await flush(); cur = await api("stories/" + id); tab = "beats"; syncTabs(); renderList(); render(); }
  $("#new").onclick = async () => {
    const title = prompt("Story title?"); if (!title) return;
    await flush(); const s = await api("stories", { method: "POST", body: JSON.stringify({ title }) });
    stories.unshift(s); cur = s; tab = "beats"; syncTabs(); renderList(); render();
  };
  document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => { tab = t.dataset.t; syncTabs(); render(); }));
  const syncTabs = () => document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.t === tab));

  function save() { $("#status").textContent = "Saving…"; clearTimeout(timer); timer = setTimeout(flush, 800); }
  async function flush() {
    if (!timer || !cur) return; clearTimeout(timer); timer = null;
    try {
      const r = await api("stories/" + cur.id, { method: "PUT", body: JSON.stringify(cur) });
      const s = stories.find((x) => x.id === cur.id); if (s) Object.assign(s, { title: cur.title, genre: cur.genre, updated_at: r.updated_at });
      $("#status").textContent = "Saved"; renderList();
    } catch { $("#status").textContent = "Save failed"; }
  }
  addEventListener("beforeunload", () => { if (timer) flush(); });

  function genreBox(g) {
    if (!g) return "";
    return `<div class="req"><h3>${esc(g.name)}: 3 required elements</h3><ol>${g.required.map(([n, d]) => `<li><b>${esc(n)}</b> <span>— ${esc(d)}</span></li>`).join("")}</ol></div>`;
  }
  function render() {
    const v = $("#view");
    if (tab === "genres") {
      v.innerHTML = genres.map((g) => `<div class="g"><h2>${esc(g.name)}</h2><span class="status">${esc(g.blurb)}</span>${genreBox(g)}<div class="ex">e.g. ${esc(g.examples)}</div>${cur ? `<button class="btn ghost" data-use="${g.key}" style="margin-top:8px">Use for “${esc(cur.title)}”</button>` : ""}</div>`).join("");
      v.querySelectorAll("[data-use]").forEach((b) => (b.onclick = () => { cur.genre = b.dataset.use; save(); tab = "beats"; syncTabs(); render(); }));
      return;
    }
    if (!cur) { v.innerHTML = '<div class="empty">Create a story to start working through the beats.</div>'; return; }
    cur.data = cur.data || {}; cur.data.beats = cur.data.beats || {};
    const g = genres.find((x) => x.key === cur.genre);
    const done = beats.filter((b) => (cur.data.beats[b.key] || "").trim()).length;
    v.innerHTML = `<input class="title" value="${esc(cur.title)}" aria-label="Title">
      <input id="logline" class="logline" placeholder="Logline (one sentence)" value="${esc(cur.logline)}">
      <div class="chips">${genres.map((x) => `<button class="chip ${x.key === cur.genre ? "on" : ""}" data-g="${x.key}">${esc(x.name)}</button>`).join("")}</div>
      ${g ? `<div class="status" style="margin-top:10px">${esc(g.blurb)} <i>e.g. ${esc(g.examples)}</i></div>` : '<div class="status" style="margin-top:10px">Pick a genre to see its 3 required elements.</div>'}
      ${genreBox(g)}
      <div class="prog"><div style="width:${Math.round((done / beats.length) * 100)}%"></div></div><div class="status" id="prog">${done} of ${beats.length} beats written</div>
      ${beats.map((b, i) => `${window.STC.acts[b.key] ? `<h3 class="act">${esc(window.STC.acts[b.key])}</h3>` : ""}<div class="card"><h2><span class="n">${i + 1}</span>${esc(b.name)}<i>${esc(b.pct)} · ${esc(b.pages)}</i></h2><p>${esc(b.prompt)}</p><textarea data-k="${b.key}" placeholder="What happens in this story at this beat…">${esc(cur.data.beats[b.key] || "")}</textarea></div>`).join("")}
      <button class="btn danger" id="del">Delete this story</button>`;
    v.querySelectorAll(".chip").forEach((c) => (c.onclick = () => { cur.genre = cur.genre === c.dataset.g ? null : c.dataset.g; save(); render(); }));
    $(".title").oninput = (e) => { cur.title = e.target.value; save(); };
    $("#logline").oninput = (e) => { cur.logline = e.target.value; save(); };
    v.querySelectorAll("textarea").forEach((t) => (t.oninput = () => { cur.data.beats[t.dataset.k] = t.value; save(); const n = beats.filter((b) => (cur.data.beats[b.key] || "").trim()).length; $("#prog").textContent = `${n} of ${beats.length} beats written`; $(".prog div").style.width = Math.round((n / beats.length) * 100) + "%"; }));
    $("#del").onclick = async () => {
      if (!confirm(`Delete “${cur.title}”? This can't be undone.`)) return;
      await api("stories/" + cur.id, { method: "DELETE" }); stories = stories.filter((s) => s.id !== cur.id); cur = null; timer = null;
      if (stories.length) await open(stories[0].id); else render(); renderList();
    };
  }

  // ---- Word export: minimal .docx (stored zip, no dependencies) ----
  const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
  function zip(files) {
    const te = new TextEncoder(), parts = [], cen = []; let off = 0;
    const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    for (const [name, text] of Object.entries(files)) {
      const nb = te.encode(name), d = te.encode(text), crc = crc32(d);
      const h = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(d.length), ...u32(d.length), ...u16(nb.length), 0, 0]);
      parts.push(h, nb, d);
      cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(d.length), ...u32(d.length), ...u16(nb.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), nb);
      off += h.length + nb.length + d.length;
    }
    const cl = cen.reduce((a, b) => a + b.length, 0);
    return new Blob([...parts, ...cen, new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(cen.length / 2), ...u16(cen.length / 2), ...u32(cl), ...u32(off), 0, 0])], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? "<w:b/>" : ""}${o.i ? "<w:i/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ""}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const para = (runs, o = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ""}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 80}"/></w:pPr>${runs}</w:p>`;
  function exportDoc() {
    if (!cur) return;
    const g = genres.find((x) => x.key === cur.genre), body = [];
    body.push(para(run(cur.title, { b: 1, sz: 48 }), { style: "Title" }));
    if (cur.logline) body.push(para(run(cur.logline, { i: 1, sz: 24 })));
    if (g) {
      body.push(para(run("Genre: " + g.name, { b: 1, sz: 18, color: "7A6E5C" }), { before: 120, after: 20 }));
      g.required.forEach(([n, d], i) => body.push(para(run(`${i + 1}. ${n}`, { b: 1, sz: 18, color: "7A6E5C" }) + run(" — " + d, { sz: 18, color: "7A6E5C" }), { after: 20 })));
    }
    beats.forEach((b, i) => {
      body.push(para(run(`${i + 1}. ${b.name}`) + run(`   ${b.pages} · ${b.pct}`, { sz: 18, color: "A69A89" }), { style: "Heading1", before: 360, after: 40 }));
      body.push(para(run(b.prompt, { i: 1, sz: 16, color: "8A7F6E" }), { after: 120 }));
      const t = (cur.data?.beats?.[b.key] || "").trim();
      (t ? t.split(/\n/) : [""]).forEach((l) => body.push(para(run(l), { after: 120 })));
      body.push(para("", { after: 240 }));
    });
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const files = {
      "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      "word/_rels/document.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="C7623A"/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`,
      "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    };
    const a = document.createElement("a"); a.href = URL.createObjectURL(zip(files));
    a.download = (cur.title.replace(/[^\w\- ]+/g, "").trim() || "story") + " - beat sheet.docx"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  $("#export").onclick = exportDoc;
  start();
})();
