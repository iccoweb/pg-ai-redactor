import type { ConsistencyMap } from "../consistency-map.ts";

export interface RedactionContext {
  tableName: string;
  columnName: string;
  dataType: string;
  consistencyMap: ConsistencyMap;
  seed?: number;
  config?: Record<string, unknown>;
}

export interface RedactionStrategy {
  readonly name: string;
  redact(value: unknown, context: RedactionContext): unknown;
}
