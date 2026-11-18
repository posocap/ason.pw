// Smoke test for the eBay MCP Worker. Usage:
//   MCP_URL=http://127.0.0.1:8787/mcp MCP_AUTH_TOKEN=<token> npm run smoke
const URL_ = process.env.MCP_URL ?? 'http://127.0.0.1:8787/mcp';
const TOKEN = process.env.MCP_AUTH_TOKEN;
if (!TOKEN) {
  console.error('MCP_AUTH_TOKEN is required');
  process.exit(2);
}

let id = 0;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

/** One stateless JSON-RPC call; each call is an independent "client" (no session id). */
async function rpc(method, params = {}, { token = TOKEN } = {}) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    const data = text.split('\n').find((l) => l.startsWith('data:'));
    body = data ? JSON.parse(data.slice(5)) : { raw: text };
  }
  return { status: res.status, body, headers: res.headers };
}
const callTool = async (name, args = {}) => {
  const { body } = await rpc('tools/call', { name, arguments: args });
  return body.result ?? { isError: true, content: [{ text: JSON.stringify(body) }] };
};
const toolText = (result) => result.content?.map((c) => c.text).join('\n') ?? '';
const listNames = async () => (await rpc('tools/list')).body.result.tools.map((t) => t.name);

// --- auth -------------------------------------------------------------------
check('rejects missing bearer token', (await rpc('tools/list', {}, { token: '' })).status === 401);
check('rejects wrong bearer token', (await rpc('tools/list', {}, { token: 'nope' })).status === 401);

// --- initialize -------------------------------------------------------------
const init = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'smoke', version: '0' },
});
check('initialize succeeds', init.status === 200 && !!init.body.result?.serverInfo, init.body.result?.serverInfo?.name);
check('stateless: no session id issued', !init.headers.get('mcp-session-id'));
check('dynamic-mode instructions advertised', /list_ebay_tools/.test(init.body.result?.instructions ?? ''));

// --- dynamic discovery (reset known state first) ----------------------------
const PROBE = ['ebay_display_credentials', 'ebay_get_inventory_items'];
await callTool('disable_ebay_tools', { names: PROBE });
let names = await listNames();
check('discovery tools visible', ['list_ebay_tools', 'enable_ebay_tools', 'disable_ebay_tools'].every((n) => names.includes(n)));
check('eBay tools hidden by default', !PROBE.some((n) => names.includes(n)), `${names.length} visible`);

const families = JSON.parse(toolText(await callTool('list_ebay_tools')));
check('list_ebay_tools returns families', Array.isArray(families.families) && families.families.length > 5);

// --- enable persists across requests / clients ------------------------------
const en = JSON.parse(toolText(await callTool('enable_ebay_tools', { names: PROBE })));
check('enable_ebay_tools reports enabled', PROBE.every((n) => en.enabled?.includes(n)));
names = await listNames(); // separate stateless request == separate client
check('enabled tools persist for a new client', PROBE.every((n) => names.includes(n)));

// --- masked credential display ----------------------------------------------
const cred = toolText(await callTool('ebay_display_credentials'));
check('credentials are masked (secret not echoed)', !cred.includes(process.env.EBAY_CLIENT_SECRET ?? 'dummy-secret') && /\*{3,}|\.\.\./.test(cred));

// --- real eBay API call -----------------------------------------------------
const live = await callTool('ebay_get_inventory_items', {});
const liveText = toolText(live);
check('eBay API call returns well-formed result', typeof liveText === 'string' && liveText.length > 0, liveText.slice(0, 120).replace(/\s+/g, ' '));

// --- disable persists --------------------------------------------------------
await callTool('disable_ebay_tools', { names: PROBE });
names = await listNames();
check('disable persists', !PROBE.some((n) => names.includes(n)));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
