import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("debug")) {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      console.error(chalk.gray(`[${timestamp()}] DEBUG: ${message}${metaStr}`));
    }
  },

  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("info")) {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      console.error(chalk.blue(`[${timestamp()}] INFO: ${message}${metaStr}`));
    }
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("warn")) {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      console.error(chalk.yellow(`[${timestamp()}] WARN: ${message}${metaStr}`));
    }
  },

  error(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("error")) {
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
      console.error(chalk.red(`[${timestamp()}] ERROR: ${message}${metaStr}`));
    }
  },

  /** Log a table summary (for dry-run output) */
  table(data: Record<string, unknown>[]): void {
    console.table(data);
  },

  /** Plain output to stdout (for user-facing results) */
  output(message: string): void {
    console.log(message);
  },
};
