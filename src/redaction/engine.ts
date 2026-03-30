import type { DatabaseAdapter } from "../db/adapter.ts";
import type { AppConfig } from "../config/schema.ts";
import type { RedactionPlan, RedactionTablePlan } from "./plan.ts";
import type { RedactionContext } from "./strategies/strategy.ts";
import { getStrategy } from "./strategies/index.ts";
import { ConsistencyMap } from "./consistency-map.ts";
import { AuditLogger } from "../audit/logger.ts";
import { logger } from "../utils/logger.ts";

export async function executeRedaction(
  db: DatabaseAdapter,
  plan: RedactionPlan,
  config: AppConfig,
): Promise<RedactionSummary> {
  const consistencyMap = new ConsistencyMap();
  const auditLogger = config.audit.enabled
    ? new AuditLogger(config.audit.outputPath, config.audit.format)
    : null;

  const summary: RedactionSummary = {
    startedAt: new Date().toISOString(),
    finishedAt: "",
    tablesProcessed: 0,
    rowsRedacted: 0,
    errors: [],
  };

  auditLogger?.logRunStart(plan);

  // Process tables with concurrency control
  const semaphore = new Semaphore(config.redaction.concurrency);
  const tablePromises = plan.tables.map((tablePlan) =>
    semaphore.acquire().then(async () => {
      try {
        const rowsRedacted = await processTable(
          db,
          tablePlan,
          config,
          consistencyMap,
          auditLogger,
        );
        summary.tablesProcessed++;
        summary.rowsRedacted += rowsRedacted;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to redact ${tablePlan.fullName}: ${message}`);
        summary.errors.push({ table: tablePlan.fullName, error: message });
      } finally {
        semaphore.release();
      }
    }),
  );

  await Promise.all(tablePromises);

  summary.finishedAt = new Date().toISOString();
  auditLogger?.logRunEnd(summary);
  auditLogger?.close();

  return summary;
}

async function processTable(
  db: DatabaseAdapter,
  tablePlan: RedactionTablePlan,
  config: AppConfig,
  consistencyMap: ConsistencyMap,
  auditLogger: AuditLogger | null,
): Promise<number> {
  if (!tablePlan.primaryKey) {
    logger.warn(`Skipping ${tablePlan.fullName}: no primary key found`);
    return 0;
  }

  const columnNames = tablePlan.columns.map((c) => c.name);
  const chunkSize = config.redaction.chunkSize;
  let totalRedacted = 0;

  logger.info(`Redacting ${tablePlan.fullName} (${tablePlan.columns.length} columns, ~${tablePlan.rowCount} rows)`);

  for await (const chunk of db.streamRows(
    tablePlan.name,
    columnNames,
    tablePlan.primaryKey,
    chunkSize,
    tablePlan.schema,
  )) {
    const tx = await db.beginTransaction();
    try {
      const updates: Array<{ pk: unknown; values: Record<string, unknown> }> = [];

      for (const row of chunk) {
        const newValues: Record<string, unknown> = {};
        let hasChanges = false;

        for (const colPlan of tablePlan.columns) {
          const originalValue = row[colPlan.name];
          if (originalValue === null || originalValue === undefined) continue;

          const strategy = getStrategy(colPlan.strategy);
          const context: RedactionContext = {
            tableName: tablePlan.fullName,
            columnName: colPlan.name,
            dataType: "", // Could be enriched if needed
            consistencyMap,
            config: colPlan.config,
          };

          const redactedValue = strategy.redact(originalValue, context);
          if (redactedValue !== originalValue) {
            newValues[colPlan.name] = redactedValue;
            hasChanges = true;
          }
        }

        if (hasChanges) {
          updates.push({ pk: row[tablePlan.primaryKey!], values: newValues });
        }
      }

      if (updates.length > 0) {
        await db.batchUpdate(tx, tablePlan.name, tablePlan.schema, {
          primaryKeyColumn: tablePlan.primaryKey!,
          updates,
        });
        totalRedacted += updates.length;
      }

      await db.commitTransaction(tx);
    } catch (err) {
      await db.rollbackTransaction(tx);
      throw err;
    }
  }

  logger.info(`Completed ${tablePlan.fullName}: ${totalRedacted} rows redacted`);
  auditLogger?.logTableComplete(tablePlan.fullName, tablePlan.columns.length, totalRedacted);

  return totalRedacted;
}

export interface RedactionSummary {
  startedAt: string;
  finishedAt: string;
  tablesProcessed: number;
  rowsRedacted: number;
  errors: Array<{ table: string; error: string }>;
}

/** Simple concurrency-limiting semaphore */
class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(private max: number) {}

  acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.current--;
    }
  }
}
