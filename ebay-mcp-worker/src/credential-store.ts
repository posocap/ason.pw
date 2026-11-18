import {
  CredentialStoreError,
  type CredentialSnapshot,
  type CredentialStore,
} from '@/auth/credentialSession.js';
import { Effect } from 'effect';
import type { TokenStore } from './token-do';

const LABEL = 'durable-object:TokenStore';

const fail = (message: string) => (cause: unknown) =>
  new CredentialStoreError({ envPath: LABEL, message, cause });

/** Keys never persisted: app tokens are cached in memory per isolate. */
const NOT_PERSISTED = new Set(['EBAY_APP_ACCESS_TOKEN']);

/** `CredentialStore` backed by the TokenStore Durable Object. */
export class DurableObjectCredentialStore implements CredentialStore {
  /**
   * @param getStub - Resolves a *fresh* stub per operation: DO stubs are bound to the request
   * that created them, and this store lives in a per-isolate cached API facade.
   */
  constructor(private readonly getStub: () => DurableObjectStub<TokenStore>) {}

  write(updates: Record<string, string>): Effect.Effect<void, CredentialStoreError> {
    const persisted: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'string' && value !== '' && !NOT_PERSISTED.has(key)) {
        persisted[key] = value;
      }
    }
    if (Object.keys(persisted).length === 0) {
      return Effect.void;
    }
    return Effect.tryPromise({
      try: () => this.getStub().mergeTokens(persisted),
      catch: fail('Failed to write tokens to Durable Object'),
    });
  }

  read(): Effect.Effect<CredentialSnapshot | null, CredentialStoreError> {
    return Effect.tryPromise({
      try: () => this.getStub().getTokens(),
      catch: fail('Failed to read tokens from Durable Object'),
    });
  }

  clear(): Effect.Effect<void, CredentialStoreError> {
    return Effect.tryPromise({
      try: () => this.getStub().clearTokens(),
      catch: fail('Failed to clear tokens in Durable Object'),
    });
  }
}
