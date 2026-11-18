import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { TokenStore } from './token-do';

export { TokenStore };

const SERVICE = 'ebay-mcp-worker';

interface Env {
  TOKEN_STORE: DurableObjectNamespace<TokenStore>;
  MCP_AUTH_TOKEN?: string;
  [key: string]: unknown;
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

/** Mirror string vars/secrets into process.env (upstream config reads process.env). */
const applyEnv = (env: Env): void => {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      process.env[key] = value;
    }
  }
  // README default: dynamic tool mode unless the operator says otherwise.
  process.env.EBAY_MCP_TOOLS ||= 'dynamic';
};

/** Constant-time string comparison (compares SHA-256 digests). */
const safeEqual = async (a: string, b: string): Promise<boolean> => {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) {
    diff |= x[i] ^ y[i];
  }
  return diff === 0;
};

const isAuthorized = async (request: Request, token: string): Promise<boolean> => {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? safeEqual(match[1].trim(), token) : false;
};

// Per-isolate cache of the eBay API facade (tokens live in memory + the Durable Object).
type Api = import('@/api/index.js').EbaySellerApi;
let apiPromise: Promise<Api> | undefined;

const getApi = (env: Env): Promise<Api> => {
  apiPromise ??= (async () => {
    const [{ EbaySellerApi }, { getEbayConfig }, { setDefaultCredentialStore }, { DurableObjectCredentialStore }, { Effect }] =
      await Promise.all([
        import('@/api/index.js'),
        import('@/config/environment.js'),
        import('@/auth/credentialSession.js'),
        import('./credential-store'),
        import('effect'),
      ]);
    setDefaultCredentialStore(new DurableObjectCredentialStore(() => tokenStub(env)));
    const api = new EbaySellerApi(getEbayConfig());
    await Effect.runPromise(api.initialize());
    return api;
  })().catch((error) => {
    apiPromise = undefined;
    throw error;
  });
  return apiPromise;
};

const tokenStub = (env: Env) => env.TOKEN_STORE.get(env.TOKEN_STORE.idFromName('global'));

const handleHealth = async (): Promise<Response> => {
  const [{ getToolEntries }, { getVersion }] = await Promise.all([
    import('@/tools/registry.js'),
    import('@/utils/version.js'),
  ]);
  return json({
    status: 'healthy',
    service: SERVICE,
    tools: getToolEntries().length,
    upstreamVersion: getVersion(),
    environment: process.env.EBAY_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
    toolMode: process.env.EBAY_MCP_TOOLS,
    readOnly: ['true', '1', 'yes'].includes((process.env.EBAY_READ_ONLY ?? '').toLowerCase()),
  });
};

const handleMcp = async (request: Request, env: Env): Promise<Response> => {
  const token = env.MCP_AUTH_TOKEN;
  if (!token) {
    return json({ error: 'MCP_AUTH_TOKEN is not configured on this Worker' }, 503);
  }
  if (!(await isAuthorized(request, token))) {
    return json({ error: 'Unauthorized' }, 401, { 'www-authenticate': 'Bearer' });
  }
  if (request.method !== 'POST') {
    // Stateless JSON mode: no server-initiated SSE stream and no sessions to delete.
    return json({ error: 'Method not allowed; use POST' }, 405, { allow: 'POST' });
  }

  const [{ createEbayMcpRuntime }, { mcpConfig }, api] = await Promise.all([
    import('@/mcp/runtime.js'),
    import('@/config/environment.js'),
    getApi(env),
  ]);

  const stub = tokenStub(env);
  const dynamic = process.env.EBAY_MCP_TOOLS?.trim().toLowerCase() === 'dynamic';
  const enabledTools = dynamic ? await stub.getEnabledTools() : [];

  const runtime = createEbayMcpRuntime({
    api,
    serverConfig: mcpConfig,
    enabledTools,
    onEnabledToolsChange: (names) => stub.setEnabledTools(names),
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: no session IDs
    enableJsonResponse: true,
  });
  await runtime.server.connect(transport);
  return transport.handleRequest(request);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    applyEnv(env);
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/health') {
        return await handleHealth();
      }
      if (pathname === '/mcp') {
        return await handleMcp(request, env);
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error(`[${SERVICE}] unhandled error`, error instanceof Error ? error.message : error);
      return json({ error: 'Internal server error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
