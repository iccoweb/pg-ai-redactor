import type { PoolClient } from "pg";
import type { BatchUpdate } from "../types.ts";

/**
 * Executes a batch UPDATE using a single SQL statement with CASE expressions.
 * This is much more efficient than individual UPDATE statements.
 *
 * Generates SQL like:
 *   UPDATE "schema"."table" SET
 *     "col1" = CASE "pk" WHEN $1 THEN $2 WHEN $3 THEN $4 END,
 *     "col2" = CASE "pk" WHEN $5 THEN $6 WHEN $7 THEN $8 END
 *   WHERE "pk" IN ($9, $10)
 */
export async function executeBatchUpdate(
  client: PoolClient,
  tableName: string,
  schema: string,
  batch: BatchUpdate,
): Promise<number> {
  if (batch.updates.length === 0) return 0;

  const { primaryKeyColumn, updates } = batch;
  const params: unknown[] = [];
  let paramIndex = 1;

  // Collect all columns being updated
  const allColumns = new Set<string>();
  for (const update of updates) {
    for (const col of Object.keys(update.values)) {
      allColumns.add(col);
    }
  }

  // Build CASE expressions for each column
  const setClauses: string[] = [];
  for (const column of allColumns) {
    const whenClauses: string[] = [];
    for (const update of updates) {
      if (column in update.values) {
        params.push(update.pk);
        params.push(update.values[column]);
        whenClauses.push(`WHEN $${paramIndex} THEN $${paramIndex + 1}`);
        paramIndex += 2;
      }
    }
    setClauses.push(
      `"${column}" = CASE "${primaryKeyColumn}" ${whenClauses.join(" ")} ELSE "${column}" END`,
    );
  }

  // Build the WHERE IN clause
  const pkPlaceholders: string[] = [];
  for (const update of updates) {
    params.push(update.pk);
    pkPlaceholders.push(`$${paramIndex}`);
    paramIndex++;
  }

  const sql = `UPDATE "${schema}"."${tableName}" SET ${setClauses.join(", ")} WHERE "${primaryKeyColumn}" IN (${pkPlaceholders.join(", ")})`;

  const result = await client.query(sql, params);
  return result.rowCount ?? 0;
}
