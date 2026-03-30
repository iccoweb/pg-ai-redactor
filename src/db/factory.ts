import type { DatabaseAdapter } from "./adapter.ts";
import type { DatabaseConfig } from "./types.ts";
import { PostgresAdapter } from "./postgres/adapter.ts";

export function createDatabaseAdapter(config: DatabaseConfig): DatabaseAdapter {
  switch (config.type) {
    case "postgres":
      return new PostgresAdapter();
    case "mssql":
      throw new Error("MSSQL adapter is not yet implemented. Coming soon.");
    case "mysql":
      throw new Error("MySQL adapter is not yet implemented. Coming soon.");
    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}
