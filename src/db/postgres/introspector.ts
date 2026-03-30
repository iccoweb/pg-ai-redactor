import type { Pool } from "pg";
import type { TableInfo, ColumnInfo } from "../types.ts";

export async function getTables(pool: Pool, schemas: string[] = ["public"]): Promise<TableInfo[]> {
  const placeholders = schemas.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(
    `SELECT
      t.table_schema AS schema,
      t.table_name AS name,
      COALESCE(s.n_live_tup, 0)::int AS row_count
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables s
      ON s.schemaname = t.table_schema AND s.relname = t.table_name
    WHERE t.table_schema IN (${placeholders})
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_schema, t.table_name`,
    schemas,
  );

  return result.rows.map((row) => ({
    schema: row.schema,
    name: row.name,
    fullName: `${row.schema}.${row.name}`,
    rowCount: row.row_count,
  }));
}

export async function getColumns(
  pool: Pool,
  tableName: string,
  schema: string = "public",
): Promise<ColumnInfo[]> {
  const result = await pool.query(
    `SELECT
      c.column_name AS name,
      c.data_type AS data_type,
      c.character_maximum_length AS max_length,
      c.is_nullable = 'YES' AS is_nullable,
      c.column_default AS default_value,
      COALESCE(pk.is_pk, false) AS is_primary_key,
      COALESCE(fk.is_fk, false) AS is_foreign_key,
      fk.foreign_table,
      fk.foreign_column
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT
        kcu.column_name,
        true AS is_pk
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = $1
        AND tc.table_schema = $2
    ) pk ON pk.column_name = c.column_name
    LEFT JOIN (
      SELECT
        kcu.column_name,
        true AS is_fk,
        ccu.table_schema || '.' || ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
        AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1
        AND tc.table_schema = $2
    ) fk ON fk.column_name = c.column_name
    WHERE c.table_name = $1 AND c.table_schema = $2
    ORDER BY c.ordinal_position`,
    [tableName, schema],
  );

  return result.rows.map((row) => ({
    name: row.name,
    dataType: row.data_type,
    maxLength: row.max_length,
    isNullable: row.is_nullable,
    defaultValue: row.default_value,
    isPrimaryKey: row.is_primary_key,
    isForeignKey: row.is_foreign_key,
    foreignKeyRef: row.is_foreign_key
      ? { table: row.foreign_table, column: row.foreign_column }
      : null,
  }));
}

export async function getSampleRows(
  pool: Pool,
  tableName: string,
  columns: string[],
  limit: number,
  schema: string = "public",
): Promise<Record<string, unknown>[]> {
  const columnList = columns
    .map((c) => `"${c}"`)
    .join(", ");
  // Use fully-qualified, quoted identifiers to prevent injection
  const result = await pool.query(
    `SELECT ${columnList} FROM "${schema}"."${tableName}" LIMIT $1`,
    [limit],
  );
  return result.rows;
}

export async function getRowCount(
  pool: Pool,
  tableName: string,
  schema: string = "public",
): Promise<number> {
  // Use the stats estimate for large tables, exact count for small ones
  const statsResult = await pool.query(
    `SELECT n_live_tup::int AS count
     FROM pg_stat_user_tables
     WHERE schemaname = $1 AND relname = $2`,
    [schema, tableName],
  );

  const estimate = statsResult.rows[0]?.count ?? 0;

  // If estimate is small, do an exact count
  if (estimate < 100_000) {
    const exactResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM "${schema}"."${tableName}"`,
    );
    return exactResult.rows[0]?.count ?? 0;
  }

  return estimate;
}
