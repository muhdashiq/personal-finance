import { logger } from './logger';

/**
 * Normalised application error. API functions throw AppError so screens can
 * show a friendly message without knowing about PostgREST/Auth internals.
 */
export class AppError extends Error {
  readonly code: string;
  readonly isNetwork: boolean;

  constructor(message: string, options: { code?: string; isNetwork?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = options.code ?? 'unknown';
    this.isNetwork = options.isNetwork ?? false;
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

type PostgrestLikeError = { message?: string; code?: string; details?: string | null; hint?: string | null };

const isNetworkMessage = (message: string) =>
  /network request failed|failed to fetch|networkerror|load failed|timed out|offline/i.test(message);

/** Messages raised deliberately by our SQL functions are safe to show. */
const FRIENDLY_SQL_CODES = new Set(['22023', 'P0002', '42501', '23505']);

export const toAppError = (error: unknown, fallback = 'Something went wrong. Please try again.'): AppError => {
  if (error instanceof AppError) return error;
  const e = (error ?? {}) as PostgrestLikeError & { name?: string; status?: number };
  const message = e.message ?? String(error);

  // supabase-js auth: the request did not reach the server (status 0) or the
  // server/gateway failed (5xx).
  if (e.name === 'AuthRetryableFetchError') {
    const unreachable = !e.status;
    return new AppError(
      unreachable
        ? 'Can’t reach the server. Check your internet connection and that the app is configured with the right Supabase URL.'
        : 'The server is temporarily unavailable. Please try again in a moment.',
      { code: unreachable ? 'network' : `http_${e.status}`, isNetwork: unreachable, cause: error },
    );
  }

  if (isNetworkMessage(message)) {
    return new AppError('You appear to be offline. Check your connection and try again.', {
      code: 'network',
      isNetwork: true,
      cause: error,
    });
  }

  switch (e.code) {
    case '23503':
      return new AppError('This item is still in use, so it cannot be removed. Try archiving or closing it instead.', {
        code: e.code,
        cause: error,
      });
    case '23505':
      return new AppError(FRIENDLY_SQL_CODES.has(e.code) && message ? message : 'That already exists.', {
        code: e.code,
        cause: error,
      });
    case '42501':
      return new AppError(
        /permission denied|row-level security/i.test(message) ? 'You do not have permission to do that.' : message,
        { code: e.code, cause: error },
      );
    case 'PGRST116':
      return new AppError('That item could not be found. It may have been deleted.', { code: e.code, cause: error });
    default:
      break;
  }

  if (e.code && FRIENDLY_SQL_CODES.has(e.code)) return new AppError(message, { code: e.code, cause: error });
  if (e.name === 'AuthApiError' || e.name === 'AuthError') return new AppError(message, { code: 'auth', cause: error });

  logger.error('unexpected_error', { code: e.code ?? 'none', name: e.name ?? 'unknown' });
  return new AppError(fallback, { code: e.code ?? 'unknown', cause: error });
};

/** Unwraps a Supabase `{ data, error }` response, throwing AppError on failure. */
export const unwrap = <T>(response: { data: T; error: unknown }, fallback?: string): NonNullable<T> => {
  if (response.error) throw toAppError(response.error, fallback);
  if (response.data === null || response.data === undefined) {
    throw new AppError('No data returned', { code: 'empty' });
  }
  return response.data as NonNullable<T>;
};

/** Like unwrap, for mutations that return no rows. */
export const check = (response: { error: unknown }, fallback?: string): void => {
  if (response.error) throw toAppError(response.error, fallback);
};
