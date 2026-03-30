import chalk from "chalk";
import { loadConfig } from "../../config/loader.ts";
import { createDatabaseAdapter } from "../../db/factory.ts";
import { createAIProvider } from "../../ai/factory.ts";
import { classifySchema } from "../../analysis/classifier.ts";
import { buildRedactionPlan } from "../../redaction/plan.ts";
import { executeRedaction } from "../../redaction/engine.ts";
import { logger } from "../../utils/logger.ts";

export interface RedactOptions {
  config: string;
  dryRun?: boolean;
  forceAnalyze?: boolean;
  tables?: string;
  concurrency?: number;
}

export async function runRedact(options: RedactOptions): Promise<void> {
  const config = loadConfig(options.config);

  if (options.concurrency) {
    config.redaction.concurrency = options.concurrency;
  }

  const db = createDatabaseAdapter(config.database);
  const ai = createAIProvider({
    provider: config.ai.provider,
    model: config.ai.model,
    apiKey: config.ai.apiKey,
    baseUrl: config.ai.baseUrl,
    maxTokens: config.ai.maxTokens,
  });

  try {
    await db.connect(config.database);

    // Step 1: Classify
    const result = await classifySchema(db, ai, config, options.forceAnalyze);

    // Step 2: Gather primary keys and row counts
    const primaryKeys = new Map<string, string>();
    const rowCounts = new Map<string, number>();

    for (const tableClass of result.classification.tables) {
      const fullName = `${tableClass.schema}.${tableClass.name}`;
      const columns = await db.getColumns(tableClass.name, tableClass.schema);
      const pk = columns.find((c) => c.isPrimaryKey);
      if (pk) primaryKeys.set(fullName, pk.name);
      const count = await db.getRowCount(tableClass.name, tableClass.schema);
      rowCounts.set(fullName, count);
    }

    // Step 3: Build plan
    let plan = buildRedactionPlan(
      result.classification,
      config,
      result.fingerprint,
      primaryKeys,
      rowCounts,
    );

    // Filter to specific tables if requested
    if (options.tables) {
      const tableFilter = options.tables.split(",").map((t) => t.trim());
      plan = {
        ...plan,
        tables: plan.tables.filter((t) =>
          tableFilter.some((f) => t.fullName === f || t.name === f),
        ),
        totalColumnsToRedact: 0,
        totalRowsAffected: 0,
      };
      plan.totalColumnsToRedact = plan.tables.reduce((s, t) => s + t.columns.length, 0);
      plan.totalRowsAffected = plan.tables.reduce((s, t) => s + t.rowCount, 0);
    }

    // Step 4: Dry run or execute
    if (options.dryRun) {
      printDryRunSummary(plan);
      return;
    }

    if (plan.tables.length === 0) {
      logger.output("No tables to redact. All columns are either allowlisted or classified as non-PHI.");
      return;
    }

    logger.output(chalk.yellow("\nExecuting redaction..."));
    logger.output(`Tables: ${plan.tables.length}, Columns: ${plan.totalColumnsToRedact}, Estimated rows: ${plan.totalRowsAffected}`);

    const summary = await executeRedaction(db, plan, config);

    logger.output(chalk.green("\nRedaction complete!"));
    logger.output(`  Tables processed: ${summary.tablesProcessed}`);
    logger.output(`  Rows redacted: ${summary.rowsRedacted}`);
    if (summary.errors.length > 0) {
      logger.output(chalk.red(`  Errors: ${summary.errors.length}`));
      for (const err of summary.errors) {
        logger.output(chalk.red(`    ${err.table}: ${err.error}`));
      }
    }
    const duration = new Date(summary.finishedAt).getTime() - new Date(summary.startedAt).getTime();
    logger.output(`  Duration: ${(duration / 1000).toFixed(1)}s`);
  } finally {
    await db.disconnect();
  }
}

function printDryRunSummary(plan: ReturnType<typeof buildRedactionPlan>): void {
  logger.output(chalk.cyan("\n=== DRY RUN — Redaction Plan Summary ===\n"));
  logger.output(`Generated: ${plan.generatedAt}`);
  logger.output(`Schema fingerprint: ${plan.schemaFingerprint.slice(0, 12)}...`);
  logger.output(`Total tables: ${plan.tables.length}`);
  logger.output(`Total columns to redact: ${plan.totalColumnsToRedact}`);
  logger.output(`Total rows affected: ${plan.totalRowsAffected.toLocaleString()}`);

  for (const table of plan.tables) {
    logger.output(`\n${chalk.bold(table.fullName)} (${table.rowCount.toLocaleString()} rows)`);
    if (!table.primaryKey) {
      logger.output(chalk.yellow(`  ⚠ No primary key — table will be skipped`));
      continue;
    }
    for (const col of table.columns) {
      logger.output(
        `  ${col.name}: ${chalk.magenta(col.phiType)} → ${chalk.green(col.strategy)}`,
      );
    }
  }

  logger.output(chalk.cyan("\n=== No changes were made ==="));
}
