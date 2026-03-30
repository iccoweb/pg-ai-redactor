import { mkdirSync, appendFileSync, existsSync } from "fs";
import { join } from "path";
import type { RedactionPlan } from "../redaction/plan.ts";
import type { RedactionSummary } from "../redaction/engine.ts";

export class AuditLogger {
  private filePath: string;

  constructor(outputDir: string, format: "jsonl" | "json") {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = format === "jsonl" ? "jsonl" : "json";
    this.filePath = join(outputDir, `redaction-${timestamp}.${ext}`);
  }

  private append(entry: Record<string, unknown>): void {
    appendFileSync(this.filePath, JSON.stringify(entry) + "\n");
  }

  logRunStart(plan: RedactionPlan): void {
    this.append({
      event: "run_start",
      timestamp: new Date().toISOString(),
      fingerprint: plan.schemaFingerprint,
      tables: plan.tables.map((t) => ({
        name: t.fullName,
        columns: t.columns.map((c) => ({
          name: c.name,
          phiType: c.phiType,
          strategy: c.strategy,
        })),
        rowCount: t.rowCount,
      })),
      totalColumnsToRedact: plan.totalColumnsToRedact,
      totalRowsAffected: plan.totalRowsAffected,
    });
  }

  logTableComplete(tableName: string, columnsRedacted: number, rowsRedacted: number): void {
    this.append({
      event: "table_complete",
      timestamp: new Date().toISOString(),
      table: tableName,
      columnsRedacted,
      rowsRedacted,
    });
  }

  logRunEnd(summary: RedactionSummary): void {
    this.append({
      event: "run_end",
      timestamp: new Date().toISOString(),
      tablesProcessed: summary.tablesProcessed,
      rowsRedacted: summary.rowsRedacted,
      errors: summary.errors,
      duration: `${new Date(summary.finishedAt).getTime() - new Date(summary.startedAt).getTime()}ms`,
    });
  }

  close(): void {
    // No-op for file-based logging; placeholder for future stream-based loggers
  }
}
