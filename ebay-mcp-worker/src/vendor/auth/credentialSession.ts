import type { EbayConfig, EbayUserToken, StoredTokenData } from '@/types/ebay.js';
import { Data, Effect } from 'effect';

/**
 * Default lifetime for stored eBay user access tokens when eBay omits an expiry.
 */
export const DEFAULT_USER_ACCESS_TOKEN_TTL_SECONDS = 7200;

/**
 * Default lifetime for stored eBay user refresh tokens when eBay omits an expiry.
 */
export const DEFAULT_USER_REFRESH_TOKEN_TTL_SECONDS = 18 * 30 * 24 * 60 * 60;

/**
 * Safety buffer removed from app-token expiry to avoid using near-expired tokens.
 */
export const APP_ACCESS_TOKEN_EXPIRY_BUFFER_SECONDS = 60;

/**
 * eBay user-token response shape with the required access token fields enforced.
 */
export type EbayUserTokenResponse = Pick<EbayUserToken, 'access_token' | 'expires_in'> &
  Partial<Omit<EbayUserToken, 'access_token' | 'expires_in'>>;

/** Tagged failure returned when credential persistence cannot write to the backing store. */
export class CredentialStoreError extends Data.TaggedError('CredentialStoreError')<{
  /** Label of the backing store that failed (kept as `envPath` for upstream compatibility). */
  readonly envPath: string;
  /** Human-readable persistence failure message. */
  readonly message: string;
  /** Lower-level storage failure. */
  readonly cause: unknown;
}> {}

/** Persisted credential values plus the time they were last written. */
export interface CredentialSnapshot {
  /** Env-style key/value pairs (EBAY_USER_ACCESS_TOKEN, EBAY_USER_REFRESH_TOKEN). */
  values: Record<string, string>;
  /** Epoch ms of the last token write, or 0 when unknown. */
  writtenAt: number;
}

/**
 * Persistence boundary for credential values.
 *
 * Workers port: upstream wrote refreshed tokens to a local `.env`; here the Worker
 * installs a Durable Object-backed store (see src/token-store.ts).
 */
export interface CredentialStore {
  /** Merge env-style credential updates into the backing store. */
  write(updates: Record<string, string>): Effect.Effect<void, CredentialStoreError>;
  /** Load persisted credentials, or null when none are stored. */
  read?(): Effect.Effect<CredentialSnapshot | null, CredentialStoreError>;
  /** Remove all persisted credentials. */
  clear?(): Effect.Effect<void, CredentialStoreError>;
}

/** In-memory fallback store (used by tests / when no durable store is installed). */
export class MemoryCredentialStore implements CredentialStore {
  private values: Record<string, string> = {};
  private writtenAt = 0;

  write(updates: Record<string, string>): Effect.Effect<void, CredentialStoreError> {
    return Effect.sync(() => {
      for (const [key, value] of Object.entries(updates)) {
        if (typeof value === 'string') {
          this.values[key] = value;
        }
      }
      this.writtenAt = Date.now();
    });
  }

  read(): Effect.Effect<CredentialSnapshot | null, CredentialStoreError> {
    return Effect.sync(() =>
      Object.keys(this.values).length > 0
        ? { values: { ...this.values }, writtenAt: this.writtenAt }
        : null,
    );
  }

  clear(): Effect.Effect<void, CredentialStoreError> {
    return Effect.sync(() => {
      this.values = {};
      this.writtenAt = 0;
    });
  }
}

let defaultCredentialStore: CredentialStore = new MemoryCredentialStore();

/** Install the store new `EbayOAuthClient` instances use by default. */
export const setDefaultCredentialStore = (store: CredentialStore): void => {
  defaultCredentialStore = store;
};

/** The store new `EbayOAuthClient` instances use by default. */
export const getDefaultCredentialStore = (): CredentialStore => defaultCredentialStore;

/**
 * Redact token values for status and credential display output.
 *
 * @param token - Raw credential or token string.
 * @returns Redacted token with only short prefix/suffix visible.
 *
 * @example
 * ```ts
 * maskToken('abcdef1234567890');
 * ```
 */
export const maskToken = (token: string): string => {
  if (!token || token.length < 12) {
    return '***';
  }

  return `${token.substring(0, 6)}...${token.substring(token.length - 6)}`;
};

/**
 * Convert an expires-in duration from eBay into an absolute timestamp.
 *
 * @param expiresInSeconds - Relative lifetime returned by eBay.
 * @param now - Timestamp used as the calculation base.
 * @returns Absolute expiry timestamp in milliseconds.
 *
 * @example
 * ```ts
 * createExpiryTimestamp(7200, Date.UTC(2026, 0, 1));
 * ```
 */
export const createExpiryTimestamp = (expiresInSeconds: number, now = Date.now()): number =>
  now + expiresInSeconds * 1000;

/**
 * Create the fallback expiry timestamp for a stored eBay user access token.
 *
 * @param now - Timestamp used as the calculation base.
 * @returns Absolute fallback access-token expiry timestamp in milliseconds.
 *
 * @example
 * ```ts
 * createDefaultAccessTokenExpiry(Date.UTC(2026, 0, 1));
 * ```
 */
export const createDefaultAccessTokenExpiry = (now = Date.now()): number =>
  createExpiryTimestamp(DEFAULT_USER_ACCESS_TOKEN_TTL_SECONDS, now);

/**
 * Create the fallback expiry timestamp for a stored eBay user refresh token.
 *
 * @param now - Timestamp used as the calculation base.
 * @returns Absolute fallback refresh-token expiry timestamp in milliseconds.
 *
 * @example
 * ```ts
 * createDefaultRefreshTokenExpiry(Date.UTC(2026, 0, 1));
 * ```
 */
export const createDefaultRefreshTokenExpiry = (now = Date.now()): number =>
  createExpiryTimestamp(DEFAULT_USER_REFRESH_TOKEN_TTL_SECONDS, now);

/**
 * Create the cached app-token expiry timestamp with an early refresh buffer.
 *
 * @param expiresInSeconds - Relative app-token lifetime returned by eBay.
 * @param now - Timestamp used as the calculation base.
 * @returns Absolute app-token expiry timestamp in milliseconds.
 *
 * @example
 * ```ts
 * createAppAccessTokenExpiry(7200, Date.UTC(2026, 0, 1));
 * ```
 */
export const createAppAccessTokenExpiry = (expiresInSeconds: number, now = Date.now()): number =>
  createExpiryTimestamp(
    Math.max(0, expiresInSeconds - APP_ACCESS_TOKEN_EXPIRY_BUFFER_SECONDS),
    now,
  );

/**
 * Determine whether a stored token expiry is missing or no longer valid.
 *
 * @param expiry - Absolute expiry timestamp, null, or undefined.
 * @param now - Timestamp used as the comparison base.
 * @returns True when no expiry exists or the expiry is at or before now.
 *
 * @example
 * ```ts
 * isTokenExpired(Date.now() - 1);
 * ```
 */
export const isTokenExpired = (expiry: number | null | undefined, now = Date.now()): boolean =>
  expiry ? now >= expiry : true;

/**
 * Inputs for constructing the stored credential snapshot after user auth.
 */
export interface CreateStoredUserTokensInput {
  /** Fresh user access token value. */
  accessToken: string;
  /** Optional precomputed access-token expiry timestamp. */
  accessTokenExpiry?: number;
  /** eBay app configuration persisted alongside token values. */
  config: EbayConfig;
  /** Optional app access token already cached in the environment. */
  envAppToken?: string;
  /** Optional clock override used by tests. */
  now?: number;
  /** Fresh or existing user refresh token value. */
  refreshToken: string;
  /** Optional precomputed refresh-token expiry timestamp. */
  refreshTokenExpiry?: number;
  /** OAuth scope string returned by eBay. */
  scope?: string;
  /** OAuth token type, defaulting to Bearer. */
  tokenType?: string;
}

/**
 * Build a StoredTokenData object from normalized eBay user-token fields.
 *
 * @param input - Normalized token fields plus app configuration.
 * @returns Stored token snapshot used by the credential session.
 *
 * @example
 * ```ts
 * const tokens = createStoredUserTokens({ config, accessToken: 'access', refreshToken: 'refresh' });
 * ```
 */
export const createStoredUserTokens = (input: CreateStoredUserTokensInput): StoredTokenData => {
  const now = input.now ?? Date.now();

  return {
    clientId: input.config.clientId,
    clientSecret: input.config.clientSecret,
    redirectUri: input.config.redirectUri,
    locale: input.config.locale,
    marketplaceId: input.config.marketplaceId,
    contentLanguage: input.config.contentLanguage,
    envAppToken: input.envAppToken ?? input.config.appAccessToken,
    userAccessToken: input.accessToken,
    userRefreshToken: input.refreshToken,
    tokenType: input.tokenType ?? 'Bearer',
    userAccessTokenExpiry: input.accessTokenExpiry ?? createDefaultAccessTokenExpiry(now),
    userRefreshTokenExpiry: input.refreshTokenExpiry ?? createDefaultRefreshTokenExpiry(now),
    scope: input.scope,
  };
};

/**
 * Inputs for merging a fresh eBay token response with any existing stored tokens.
 */
export interface CreateStoredUserTokensFromResponseInput {
  /** eBay app configuration persisted alongside token values. */
  config: EbayConfig;
  /** Optional app access token already cached in the environment. */
  envAppToken?: string;
  /** Existing token snapshot used when refresh responses omit stable fields. */
  previousTokens?: StoredTokenData | null;
  /** Raw eBay user-token response. */
  tokenData: EbayUserTokenResponse;
  /** Optional clock override used by tests. */
  now?: number;
}

/**
 * Build stored token data from an eBay token endpoint response.
 *
 * @param input - eBay token response plus config and optional prior token snapshot.
 * @returns Stored token snapshot with omitted refresh fields preserved from previous data.
 *
 * @example
 * ```ts
 * const tokens = createStoredUserTokensFromResponse({ config, tokenData });
 * ```
 */
export const createStoredUserTokensFromResponse = (
  input: CreateStoredUserTokensFromResponseInput,
): StoredTokenData => {
  const now = input.now ?? Date.now();
  const previousTokens = input.previousTokens;

  return createStoredUserTokens({
    config: input.config,
    envAppToken: input.envAppToken ?? previousTokens?.envAppToken,
    accessToken: input.tokenData.access_token,
    refreshToken: input.tokenData.refresh_token ?? previousTokens?.userRefreshToken ?? '',
    tokenType: input.tokenData.token_type ?? previousTokens?.tokenType,
    accessTokenExpiry: createExpiryTimestamp(input.tokenData.expires_in, now),
    refreshTokenExpiry: input.tokenData.refresh_token_expires_in
      ? createExpiryTimestamp(input.tokenData.refresh_token_expires_in, now)
      : previousTokens?.userRefreshTokenExpiry,
    scope: input.tokenData.scope ?? previousTokens?.scope,
    now,
  });
};

const tokenExpiry = (expiry: number | null | undefined) => {
  if (!expiry) {
    return 'Not available';
  }

  return {
    timestamp: expiry,
    date: new Date(expiry).toISOString(),
    expired: Date.now() >= expiry,
  };
};

/**
 * Inputs used to render redacted credential and token status details.
 */
export interface CredentialDisplayInput {
  /** Cached app access token value, when available. */
  appAccessToken: string | null | undefined;
  /** Cached app-token expiry timestamp, when available. */
  appAccessTokenExpiry: number | null | undefined;
  /** Whether the auth manager currently considers the user authenticated. */
  authenticated: boolean;
  /** Validated eBay API runtime configuration used by the current facade. */
  config: EbayConfig;
  /** Boolean token availability flags returned by the auth manager. */
  tokenInfo: {
    /** Whether an app access token exists. */
    hasAppAccessToken: boolean;
    /** Whether a user token exists. */
    hasUserToken: boolean;
  };
  /** Stored user tokens, when available. */
  userTokens: StoredTokenData | null;
}

/**
 * Build redacted credential and token status data for auth diagnostics.
 *
 * @param input - Raw credential, token, and environment values to redact.
 * @returns Redacted credential display data for diagnostics and token-management tools.
 *
 * @example
 * ```ts
 * const display = buildCredentialDisplay({ appAccessToken, appAccessTokenExpiry, authenticated, config, tokenInfo, userTokens });
 * ```
 */
export const buildCredentialDisplay = (input: CredentialDisplayInput) => {
  const { appAccessToken, appAccessTokenExpiry, authenticated, config, tokenInfo, userTokens } =
    input;
  const refreshToken = userTokens?.userRefreshToken || config.refreshToken || '';
  let currentTokenType = 'none';

  if (tokenInfo.hasUserToken) {
    currentTokenType = 'user_token (10,000-50,000 req/day)';
  } else if (tokenInfo.hasAppAccessToken) {
    currentTokenType = 'app_access_token (1,000 req/day)';
  }

  return {
    credentials: {
      clientId: config.clientId ? maskToken(config.clientId) : 'Not set',
      clientSecret: config.clientSecret ? '****** (set)' : 'Not set',
      environment: config.environment,
      redirectUri: config.redirectUri || 'Not set',
    },
    tokens: {
      refreshToken: refreshToken ? maskToken(refreshToken) : 'Not set',
      accessToken: userTokens?.userAccessToken
        ? maskToken(userTokens.userAccessToken)
        : 'Not available',
      accessTokenExpiry: tokenExpiry(userTokens?.userAccessTokenExpiry),
      refreshTokenExpiry: tokenExpiry(userTokens?.userRefreshTokenExpiry),
      appToken: appAccessToken ? maskToken(appAccessToken) : 'Not cached',
      appTokenExpiry: tokenExpiry(appAccessTokenExpiry),
    },
    status: {
      hasUserToken: tokenInfo.hasUserToken,
      hasAppAccessToken: tokenInfo.hasAppAccessToken,
      authenticated,
      currentTokenType,
    },
    scopes: userTokens?.scope ? userTokens.scope.split(' ') : [],
  };
};
