type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

const VALID_LEVELS = Object.keys(LEVEL_ORDER) as LogLevel[];

function resolveMinLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL ?? 'info';
  if ((VALID_LEVELS as string[]).includes(raw)) return raw as LogLevel;
  console.warn(`[logger] Invalid LOG_LEVEL "${raw}", defaulting to "info"`);
  return 'info';
}

const MIN_LEVEL = resolveMinLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

function format(level: LogLevel, message: string, meta?: object): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${message}`;
  return meta ? `${base} ${JSON.stringify(meta)}` : base;
}

export const logger = {
  info(message: string, meta?: object): void {
    if (shouldLog('info')) console.log(format('info', message, meta));
  },
  warn(message: string, meta?: object): void {
    if (shouldLog('warn')) console.warn(format('warn', message, meta));
  },
  error(message: string, meta?: object): void {
    if (shouldLog('error')) console.error(format('error', message, meta));
  },
  debug(message: string, meta?: object): void {
    if (shouldLog('debug')) console.log(format('debug', message, meta));
  },
};
