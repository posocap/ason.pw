// Workers port: no package.json at runtime; version is pinned to the vendored upstream release.
export const UPSTREAM_VERSION = '1.18.0';
export const getVersion = (): string => UPSTREAM_VERSION;
export const getPackageName = (): string => 'ebay-mcp';
