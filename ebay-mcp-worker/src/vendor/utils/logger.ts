// Workers port: console-backed replacement for upstream's winston logger.
// Same exported surface; no filesystem, no transports. Level from EBAY_LOG_LEVEL.
const LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'] as const;

let currentLevel: string = 'info';

const threshold = (): number => {
  const level = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.EBAY_LOG_LEVEL;
  const idx = LEVELS.indexOf((level ?? currentLevel) as (typeof LEVELS)[number]);
  return idx === -1 ? 2 : idx;
};

const emit = (level: (typeof LEVELS)[number], message: string, meta?: Record<string, unknown>) => {
  if (LEVELS.indexOf(level) > threshold()) {
    return;
  }
  const line = `[${level.toUpperCase()}] ${message}${meta ? ` ${safeStringify(meta)}` : ''}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
};

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
};

export interface ComponentLogger {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  http: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  verbose: (message: string, meta?: Record<string, unknown>) => void;
}

export interface LogPaths {
  logDir: string;
  errorLog: string;
  combinedLog: string;
  debugLog: string;
}

export const createLogger = (component: string): ComponentLogger => ({
  error: (m, meta) => emit('error', `[${component}] ${m}`, meta),
  warn: (m, meta) => emit('warn', `[${component}] ${m}`, meta),
  info: (m, meta) => emit('info', `[${component}] ${m}`, meta),
  http: (m, meta) => emit('http', `[${component}] ${m}`, meta),
  debug: (m, meta) => emit('debug', `[${component}] ${m}`, meta),
  verbose: (m, meta) => emit('verbose', `[${component}] ${m}`, meta),
});

export const serverLogger = createLogger('Server');
export const apiLogger = createLogger('API');
export const authLogger = createLogger('Auth');
export const toolLogger = createLogger('Tool');
export const setupLogger = createLogger('Setup');

const truncateData = (data: unknown, maxLength = 1000): unknown => {
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return `[binary ${data.byteLength} bytes]`;
  }
  const str = safeStringify(data);
  return str.length <= maxLength ? data : `${str.substring(0, maxLength)}... [truncated]`;
};

export const logRequest = (
  method: string,
  url: string,
  params?: Record<string, unknown>,
  body?: unknown,
): void => {
  apiLogger.http(`Request: ${method.toUpperCase()} ${url}`, {
    params: params && Object.keys(params).length > 0 ? params : undefined,
    body: body ? truncateData(body) : undefined,
  });
};

export const logResponse = (
  status: number,
  statusText: string,
  data?: unknown,
  rateLimitRemaining?: string,
  rateLimitTotal?: string,
): void => {
  const meta: Record<string, unknown> = {};
  if (rateLimitRemaining && rateLimitTotal) {
    meta.rateLimit = `${rateLimitRemaining}/${rateLimitTotal}`;
  }
  if (data) {
    meta.data = truncateData(data);
  }
  apiLogger.http(`Response: ${status} ${statusText}`, meta);
};

export const logErrorResponse = (
  status: number | undefined,
  statusText: string | undefined,
  url: string,
  errorData?: unknown,
): void => {
  apiLogger.error(`Error Response: ${status === undefined ? 'No status' : status} ${statusText ?? 'No response'}`, {
    url,
    error: errorData ? truncateData(errorData) : undefined,
  });
};

export const getLogPaths = (): LogPaths => ({ logDir: '', errorLog: '', combinedLog: '', debugLog: '' });
export const isFileLoggingEnabled = (): boolean => false;
export const setFileLogging = (_enabled: boolean): void => {};
export const setLogLevel = (level: string): void => {
  currentLevel = level;
};
