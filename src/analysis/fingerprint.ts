import { createHash } from "crypto";
import type { TableInfo, ColumnInfo } from "../db/types.ts";

export function computeSchemaFingerprint(
  tables: TableInfo[],
  columns: Map<string, ColumnInfo[]>,
  allowlistTables: string[],
  allowlistColumns: string[],
  denylistColumns: Array<{ table: string; column: string; phiType: string }>,
): string {
  const data = {
    tables: tables.map((t) => t.fullName).sort(),
    columns: Object.fromEntries(
      [...columns.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([table, cols]) => [
          table,
          cols
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => ({
              name: c.name,
              dataType: c.dataType,
              maxLength: c.maxLength,
              isNullable: c.isNullable,
            })),
        ]),
    ),
    allowlistTables: [...allowlistTables].sort(),
    allowlistColumns: [...allowlistColumns].sort(),
    denylistColumns: [...denylistColumns].sort((a, b) =>
      `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`),
    ),
  };

  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
