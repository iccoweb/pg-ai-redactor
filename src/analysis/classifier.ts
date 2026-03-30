import type { DatabaseAdapter } from "../db/adapter.ts";
import type { AIProvider } from "../ai/provider.ts";
import type { ClassificationResponse, ClassificationRequest } from "../ai/types.ts";
import type { AppConfig } from "../config/schema.ts";
import type { ColumnInfo } from "../db/types.ts";
import { computeSchemaFingerprint } from "./fingerprint.ts";
import { ClassificationCache } from "./cache.ts";
import { logger } from "../utils/logger.ts";

export interface ClassificationResult {
  fingerprint: string;
  classification: ClassificationResponse;
  fromCache: boolean;
}

export async function classifySchema(
  db: DatabaseAdapter,
  ai: AIProvider,
  config: AppConfig,
  forceAnalyze = false,
): Promise<ClassificationResult> {
  logger.info("Introspecting database schema...");
  const tables = await db.getTables();

  // Filter out allowlisted tables
  const filteredTables = tables.filter(
    (t) => !config.allowlist.tables.includes(t.fullName),
  );

  logger.info(`Found ${filteredTables.length} tables (${tables.length - filteredTables.length} allowlisted)`);

  // Get columns for each table
  const columnsMap = new Map<string, ColumnInfo[]>();
  for (const table of filteredTables) {
    const cols = await db.getColumns(table.name, table.schema);
    columnsMap.set(table.fullName, cols);
  }

  // Compute fingerprint
  const fingerprint = computeSchemaFingerprint(
    filteredTables,
    columnsMap,
    config.allowlist.tables,
    config.allowlist.columns,
    config.denylist.columns,
  );

  logger.info(`Schema fingerprint: ${fingerprint.slice(0, 12)}...`);

  // Check cache
  if (config.cache.enabled && !forceAnalyze) {
    const cache = new ClassificationCache(config.cache.directory);
    const cached = cache.get(fingerprint);
    if (cached) {
      logger.info("Using cached classification (schema unchanged)");
      return {
        fingerprint,
        classification: cached.classification,
        fromCache: true,
      };
    }
  }

  // Collect schema + samples for AI
  logger.info("Collecting sample data for AI analysis...");
  const requestTables: ClassificationRequest["tables"] = [];

  for (const table of filteredTables) {
    const cols = columnsMap.get(table.fullName) ?? [];

    // Filter out allowlisted columns
    const filteredCols = cols.filter(
      (c) => !config.allowlist.columns.includes(`${table.fullName}.${c.name}`),
    );

    // Get sample rows (non-PK, non-FK columns only for sampling)
    const sampleColumnNames = filteredCols
      .filter((c) => !c.isPrimaryKey)
      .map((c) => c.name);

    let sampleRows: Record<string, unknown>[] = [];
    if (sampleColumnNames.length > 0) {
      try {
        sampleRows = await db.getSampleRows(
          table.name,
          sampleColumnNames,
          config.ai.sampleRows,
          table.schema,
        );
      } catch (err) {
        logger.warn(`Could not sample ${table.fullName}: ${err instanceof Error ? err.message : err}`);
      }
    }

    requestTables.push({
      schema: table.schema,
      name: table.name,
      columns: filteredCols,
      sampleRows,
    });
  }

  // Call AI for classification
  logger.info(`Sending ${requestTables.length} tables to AI for classification...`);
  const classification = await ai.classify({ tables: requestTables });

  // Merge denylist overrides
  for (const deny of config.denylist.columns) {
    const [schema, tableName] = deny.table.includes(".")
      ? deny.table.split(".")
      : ["public", deny.table];

    const tableClass = classification.tables.find(
      (t) => t.schema === schema && t.name === tableName,
    );
    if (tableClass) {
      const colClass = tableClass.columns.find((c) => c.name === deny.column);
      if (colClass) {
        colClass.phiType = deny.phiType as ClassificationResponse["tables"][0]["columns"][0]["phiType"];
        colClass.confidence = 1.0;
        colClass.reasoning = "Forced by denylist configuration";
      } else {
        tableClass.columns.push({
          name: deny.column,
          phiType: deny.phiType as ClassificationResponse["tables"][0]["columns"][0]["phiType"],
          confidence: 1.0,
          reasoning: "Forced by denylist configuration",
          suggestedStrategy: "consistent_hash",
        });
      }
    }
  }

  // Cache the result
  if (config.cache.enabled) {
    const cache = new ClassificationCache(config.cache.directory);
    cache.set(fingerprint, classification);
    logger.info("Classification cached");
  }

  return { fingerprint, classification, fromCache: false };
}
