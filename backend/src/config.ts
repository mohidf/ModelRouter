/**
 * Central config — all env-derived values live here.
 * Import this module instead of reading process.env directly in services.
 */

// ---------------------------------------------------------------------------
// Required env var validation — call once at startup before app.listen()
// ---------------------------------------------------------------------------

const REQUIRED_ENV_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

/**
 * Throws at startup if any required environment variable is absent.
 * Call this before binding to a port so the process fails fast with a
 * clear message rather than silently crashing on the first DB call.
 */
export function validateRequiredEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.\n` +
      'Copy .env.example to .env and fill in the values.',
    );
  }
}

const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = typeof VALID_LOG_LEVELS[number];

function parseLogLevel(raw: string | undefined): LogLevel {
  const value = raw ?? 'info';
  if ((VALID_LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel;
  }
  console.warn(`[config] Invalid LOG_LEVEL "${value}", defaulting to "info"`);
  return 'info';
}

function parsePositiveFloat(raw: string | undefined, fallback: number, name: string): number {
  const value = parseFloat(raw ?? String(fallback));
  if (isNaN(value) || value < 0) {
    console.warn(`[config] Invalid ${name} "${raw}", defaulting to ${fallback}`);
    return fallback;
  }
  return value;
}

/** Parse a float in [0, 1] — allows 0 (disable escalation) unlike parsePositiveFloat. */
function parseUnitFloat(raw: string | undefined, fallback: number, name: string): number {
  const value = parseFloat(raw ?? String(fallback));
  if (isNaN(value) || value < 0 || value > 1) {
    console.warn(`[config] Invalid ${name} "${raw}" (must be 0–1), defaulting to ${fallback}`);
    return fallback;
  }
  return value;
}

function parseAlpha(raw: string | undefined, fallback: number): number {
  const value = parseFloat(raw ?? String(fallback));
  if (isNaN(value) || value <= 0 || value > 1) {
    console.warn(`[config] Invalid EMA_ALPHA "${raw}" (must be 0 < α ≤ 1), defaulting to ${fallback}`);
    return fallback;
  }
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  const value = parseInt(raw ?? String(fallback), 10);
  if (isNaN(value) || value <= 0) {
    console.warn(`[config] Invalid ${name} "${raw}", defaulting to ${fallback}`);
    return fallback;
  }
  return value;
}

export const config = {
  port:                parseInt(process.env.PORT ?? '3000', 10),
  logLevel:            parseLogLevel(process.env.LOG_LEVEL),
  confidenceThreshold: parseUnitFloat(process.env.CONFIDENCE_THRESHOLD, 0.6, 'CONFIDENCE_THRESHOLD'),
  defaultMaxTokens:    parsePositiveInt(  process.env.DEFAULT_MAX_TOKENS,   1024,   'DEFAULT_MAX_TOKENS'),
  bodyLimit:           process.env.REQUEST_BODY_LIMIT ?? '100kb',
  emaAlpha:            parseAlpha(process.env.EMA_ALPHA, 0.2),
  rateLimitPerHour:    parsePositiveInt(process.env.RATE_LIMIT_PER_HOUR, 50, 'RATE_LIMIT_PER_HOUR'),
} as const;
