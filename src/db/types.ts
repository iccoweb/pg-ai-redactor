export interface TableInfo {
  schema: string;
  name: string;
  fullName: string; // "schema.name"
  rowCount: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  maxLength: number | null;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyRef: { table: string; column: string } | null;
}

export interface BatchUpdate {
  primaryKeyColumn: string;
  updates: Array<{ pk: unknown; values: Record<string, unknown> }>;
}

export interface DatabaseConfig {
  type: "postgres" | "mssql" | "mysql";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: {
    enabled: boolean;
    rejectUnauthorized?: boolean;
    ca?: string;
  };
}

export interface Transaction {
  id: string;
  _client: unknown; // Provider-specific client reference
}
