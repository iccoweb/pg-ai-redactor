import type { ClassificationResponse, PHIType } from "../ai/types.ts";
import type { AppConfig } from "../config/schema.ts";
import { getDefaultStrategyName } from "./strategies/index.ts";

export interface RedactionColumnPlan {
  name: string;
  phiType: PHIType;
  strategy: string;
  config?: Record<string, unknown>;
}

export interface RedactionTablePlan {
  schema: string;
  name: string;
  fullName: string;
  primaryKey: string | null;
  rowCount: number;
  columns: RedactionColumnPlan[];
}

export interface RedactionPlan {
  generatedAt: string;
  schemaFingerprint: string;
  tables: RedactionTablePlan[];
  totalColumnsToRedact: number;
  totalRowsAffected: number;
}

export function buildRedactionPlan(
  classification: ClassificationResponse,
  config: AppConfig,
  fingerprint: string,
  primaryKeys: Map<string, string>,
  rowCounts: Map<string, number>,
): RedactionPlan {
  const tables: RedactionTablePlan[] = [];

  for (const tableClass of classification.tables) {
    const fullName = `${tableClass.schema}.${tableClass.name}`;

    // Only include columns that were classified as PHI
    const phiColumns = tableClass.columns.filter((c) => c.phiType !== null);
    if (phiColumns.length === 0) continue;

    const columnPlans: RedactionColumnPlan[] = phiColumns.map((col) => {
      // Check for strategy overrides in config
      const override = config.overrides.find(
        (o) => o.table === fullName && o.column === col.name,
      );

      return {
        name: col.name,
        phiType: col.phiType!,
        strategy: override?.strategy ?? col.suggestedStrategy ?? getDefaultStrategyName(col.phiType!),
        config: override?.config,
      };
    });

    tables.push({
      schema: tableClass.schema,
      name: tableClass.name,
      fullName,
      primaryKey: primaryKeys.get(fullName) ?? null,
      rowCount: rowCounts.get(fullName) ?? 0,
      columns: columnPlans,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    schemaFingerprint: fingerprint,
    tables,
    totalColumnsToRedact: tables.reduce((sum, t) => sum + t.columns.length, 0),
    totalRowsAffected: tables.reduce((sum, t) => sum + t.rowCount, 0),
  };
}
