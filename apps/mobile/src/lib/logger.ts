/**
 * Minimal logger. Never pass amounts, descriptions, account numbers, tokens
 * or emails: log ids, error codes and event names only. In production builds
 * only warnings and errors are emitted; plug a crash reporter in `sink`.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Context = Record<string, string | number | boolean | null | undefined>;

const SENSITIVE_KEYS = /amount|balance|title|merchant|notes|email|token|password|description|last4/i;

const scrub = (context?: Context): Context | undefined => {
  if (!context) return undefined;
  return Object.fromEntries(
    Object.entries(context).map(([k, v]) => [k, SENSITIVE_KEYS.test(k) ? '[redacted]' : v]),
  );
};

const sink = (level: Level, event: string, context?: Context) => {
  if (!__DEV__ && (level === 'debug' || level === 'info')) return;
  const line = `[${level}] ${event}`;
  const payload = scrub(context);
  if (level === 'error') console.error(line, payload ?? '');
  else if (level === 'warn') console.warn(line, payload ?? '');
  else console.log(line, payload ?? '');
};

export const logger = {
  debug: (event: string, context?: Context) => sink('debug', event, context),
  info: (event: string, context?: Context) => sink('info', event, context),
  warn: (event: string, context?: Context) => sink('warn', event, context),
  error: (event: string, context?: Context) => sink('error', event, context),
};
