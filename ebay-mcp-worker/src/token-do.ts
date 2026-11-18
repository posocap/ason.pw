import { DurableObject } from 'cloudflare:workers';

/** Persisted eBay user-token values (env-style keys) plus when they were last written. */
export interface TokenSnapshot {
  values: Record<string, string>;
  writtenAt: number;
}

const TOKENS_KEY = 'tokens';
const WRITTEN_AT_KEY = 'tokensWrittenAt';
const ENABLED_KEY = 'enabledTools';

/**
 * Single global Durable Object (`idFromName('global')`) holding:
 *  - eBay user tokens (refreshed tokens are written back here, never to a file)
 *  - the dynamic-mode enabled-tool set (shared by all clients)
 * SQLite-backed (migration `v1` in wrangler.jsonc), accessed over RPC.
 */
export class TokenStore extends DurableObject {
  async getTokens(): Promise<TokenSnapshot | null> {
    const values = await this.ctx.storage.get<Record<string, string>>(TOKENS_KEY);
    if (!values || Object.keys(values).length === 0) {
      return null;
    }
    const writtenAt = (await this.ctx.storage.get<number>(WRITTEN_AT_KEY)) ?? 0;
    return { values, writtenAt };
  }

  /** Merge string values into the stored tokens; stamps the write time. */
  async mergeTokens(updates: Record<string, string>): Promise<void> {
    const current = (await this.ctx.storage.get<Record<string, string>>(TOKENS_KEY)) ?? {};
    const next = { ...current };
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'string') {
        next[key] = value;
      }
    }
    await this.ctx.storage.put({ [TOKENS_KEY]: next, [WRITTEN_AT_KEY]: Date.now() });
  }

  async clearTokens(): Promise<void> {
    await this.ctx.storage.delete([TOKENS_KEY, WRITTEN_AT_KEY]);
  }

  async getEnabledTools(): Promise<string[]> {
    return (await this.ctx.storage.get<string[]>(ENABLED_KEY)) ?? [];
  }

  async setEnabledTools(names: string[]): Promise<void> {
    await this.ctx.storage.put(ENABLED_KEY, [...new Set(names)]);
  }
}
