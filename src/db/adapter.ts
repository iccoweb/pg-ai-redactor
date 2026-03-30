import type {
  TableInfo,
  ColumnInfo,
  BatchUpdate,
  DatabaseConfig,
  Transaction,
} from "./types.ts";

export interface DatabaseAdapter {
  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;

  getTables(): Promise<TableInfo[]>;
  getColumns(tableName: string, schema?: string): Promise<ColumnInfo[]>;
  getSampleRows(
    tableName: string,
    columns: string[],
    limit: number,
    schema?: string,
  ): Promise<Record<string, unknown>[]>;
  getRowCount(tableName: string, schema?: string): Promise<number>;

  beginTransaction(): Promise<Transaction>;
  batchUpdate(
    tx: Transaction,
    tableName: string,
    schema: string,
    updates: BatchUpdate,
  ): Promise<number>;
  commitTransaction(tx: Transaction): Promise<void>;
  rollbackTransaction(tx: Transaction): Promise<void>;

  streamRows(
    tableName: string,
    columns: string[],
    primaryKey: string,
    chunkSize: number,
    schema?: string,
  ): AsyncIterable<Record<string, unknown>[]>;
}
