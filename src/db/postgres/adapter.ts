import pg from "pg";
import { randomUUID } from "crypto";
import type { DatabaseAdapter } from "../adapter.ts";
import type {
  TableInfo,
  ColumnInfo,
  BatchUpdate,
  DatabaseConfig,
  Transaction,
} from "../types.ts";
import * as introspector from "./introspector.ts";
import { executeBatchUpdate } from "./executor.ts";

const { Pool } = pg;

export class PostgresAdapter implements DatabaseAdapter {
  private pool: InstanceType<typeof Pool> | null = null;

  async connect(config: DatabaseConfig): Promise<void> {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl?.enabled
        ? {
            rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
            ca: config.ssl.ca,
          }
        : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
    });

    // Test connection
    const client = await this.pool.connect();
    client.release();
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private getPool(): InstanceType<typeof Pool> {
    if (!this.pool) throw new Error("Database not connected. Call connect() first.");
    return this.pool;
  }

  async getTables(): Promise<TableInfo[]> {
    return introspector.getTables(this.getPool());
  }

  async getColumns(tableName: string, schema = "public"): Promise<ColumnInfo[]> {
    return introspector.getColumns(this.getPool(), tableName, schema);
  }

  async getSampleRows(
    tableName: string,
    columns: string[],
    limit: number,
    schema = "public",
  ): Promise<Record<string, unknown>[]> {
    return introspector.getSampleRows(this.getPool(), tableName, columns, limit, schema);
  }

  async getRowCount(tableName: string, schema = "public"): Promise<number> {
    return introspector.getRowCount(this.getPool(), tableName, schema);
  }

  async beginTransaction(): Promise<Transaction> {
    const pool = this.getPool();
    const client = await pool.connect();
    await client.query("BEGIN");
    return { id: randomUUID(), _client: client };
  }

  async batchUpdate(
    tx: Transaction,
    tableName: string,
    schema: string,
    updates: BatchUpdate,
  ): Promise<number> {
    const client = tx._client as pg.PoolClient;
    return executeBatchUpdate(client, tableName, schema, updates);
  }

  async commitTransaction(tx: Transaction): Promise<void> {
    const client = tx._client as pg.PoolClient;
    try {
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  }

  async rollbackTransaction(tx: Transaction): Promise<void> {
    const client = tx._client as pg.PoolClient;
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }

  async *streamRows(
    tableName: string,
    columns: string[],
    primaryKey: string,
    chunkSize: number,
    schema = "public",
  ): AsyncIterable<Record<string, unknown>[]> {
    const pool = this.getPool();
    const columnList = [...new Set([primaryKey, ...columns])]
      .map((c) => `"${c}"`)
      .join(", ");

    let lastPk: unknown = null;
    let hasMore = true;

    while (hasMore) {
      let query: string;
      let params: unknown[];

      if (lastPk === null) {
        query = `SELECT ${columnList} FROM "${schema}"."${tableName}" ORDER BY "${primaryKey}" LIMIT $1`;
        params = [chunkSize];
      } else {
        query = `SELECT ${columnList} FROM "${schema}"."${tableName}" WHERE "${primaryKey}" > $1 ORDER BY "${primaryKey}" LIMIT $2`;
        params = [lastPk, chunkSize];
      }

      const result = await pool.query(query, params);
      if (result.rows.length === 0) {
        hasMore = false;
      } else {
        lastPk = result.rows[result.rows.length - 1]![primaryKey];
        yield result.rows;
        if (result.rows.length < chunkSize) {
          hasMore = false;
        }
      }
    }
  }
}
