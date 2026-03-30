import { Command } from "commander";
import { runInit } from "./commands/init.ts";
import { runAnalyze } from "./commands/analyze.ts";
import { runRedact } from "./commands/redact.ts";
import { runCacheInspect, runCacheClear } from "./commands/cache.ts";
import { setLogLevel, type LogLevel } from "../utils/logger.ts";

const DEFAULT_CONFIG = "redactor.config.yaml";

export function createCLI(): Command {
  const program = new Command();

  program
    .name("pg-ai-redactor")
    .description("AI-powered HIPAA Safe Harbor de-identification for PostgreSQL databases")
    .version("0.1.0")
    .option("-c, --config <path>", "Path to configuration file", DEFAULT_CONFIG)
    .option("-v, --verbose", "Enable verbose output")
    .option("--log-level <level>", "Log level: debug | info | warn | error", "info")
    .hook("preAction", (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.verbose) {
        setLogLevel("debug");
      } else if (opts.logLevel) {
        setLogLevel(opts.logLevel as LogLevel);
      }
    });

  program
    .command("init")
    .description("Generate a starter configuration file")
    .action(() => {
      const configPath = program.opts().config || DEFAULT_CONFIG;
      runInit(configPath);
    });

  program
    .command("analyze")
    .description("Run AI classification on the database schema")
    .option("--force", "Re-run AI analysis even if cache is valid")
    .option("--output <path>", "Write classification JSON to file")
    .action(async (opts) => {
      await runAnalyze({
        config: program.opts().config || DEFAULT_CONFIG,
        force: opts.force,
        output: opts.output,
      });
    });

  program
    .command("redact")
    .description("Execute redaction on the database")
    .option("--dry-run", "Print redaction plan without executing")
    .option("--force-analyze", "Force AI re-analysis before redacting")
    .option("--tables <list>", "Comma-separated tables to redact")
    .option("--concurrency <n>", "Override parallel table count", parseInt)
    .action(async (opts) => {
      await runRedact({
        config: program.opts().config || DEFAULT_CONFIG,
        dryRun: opts.dryRun,
        forceAnalyze: opts.forceAnalyze,
        tables: opts.tables,
        concurrency: opts.concurrency,
      });
    });

  const cacheCmd = program
    .command("cache")
    .description("Manage the classification cache");

  cacheCmd
    .command("inspect")
    .description("Show cached schema fingerprints and classifications")
    .action(() => {
      runCacheInspect(program.opts().config || DEFAULT_CONFIG);
    });

  cacheCmd
    .command("clear")
    .description("Clear the classification cache")
    .action(() => {
      runCacheClear(program.opts().config || DEFAULT_CONFIG);
    });

  return program;
}
