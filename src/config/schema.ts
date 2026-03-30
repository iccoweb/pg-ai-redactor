import { z } from "zod/v4";

const sslConfigSchema = z.object({
  enabled: z.boolean().default(false),
  rejectUnauthorized: z.boolean().default(true),
  ca: z.string().optional(),
});

const databaseConfigSchema = z.object({
  type: z.enum(["postgres", "mssql", "mysql"]).default("postgres"),
  host: z.string(),
  port: z.number().int().positive().default(5432),
  database: z.string(),
  username: z.string(),
  password: z.string(),
  ssl: sslConfigSchema.optional(),
});

const aiConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "ollama"]).default("openai"),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  maxTokens: z.number().int().positive().default(4096),
  sampleRows: z.number().int().positive().default(10),
});

const denylistColumnSchema = z.object({
  table: z.string(),
  column: z.string(),
  phiType: z.string(),
});

const allowlistSchema = z.object({
  tables: z.array(z.string()).default([]),
  columns: z.array(z.string()).default([]),
});

const denylistSchema = z.object({
  columns: z.array(denylistColumnSchema).default([]),
});

const overrideSchema = z.object({
  table: z.string(),
  column: z.string(),
  strategy: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const redactionConfigSchema = z.object({
  chunkSize: z.number().int().positive().default(5000),
  concurrency: z.number().int().positive().default(4),
  consistentMapping: z.boolean().default(true),
  seed: z.number().optional(),
});

const auditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  outputPath: z.string().default(".pg-ai-redactor/audit/"),
  format: z.enum(["jsonl", "json"]).default("jsonl"),
});

const cacheConfigSchema = z.object({
  directory: z.string().default(".pg-ai-redactor/cache"),
  enabled: z.boolean().default(true),
});

export const configSchema = z.object({
  database: databaseConfigSchema,
  ai: aiConfigSchema,
  redaction: redactionConfigSchema.default({
    chunkSize: 5000,
    concurrency: 4,
    consistentMapping: true,
  }),
  allowlist: allowlistSchema.default({ tables: [], columns: [] }),
  denylist: denylistSchema.default({ columns: [] }),
  overrides: z.array(overrideSchema).default([]),
  cache: cacheConfigSchema.default({ directory: ".pg-ai-redactor/cache", enabled: true }),
  audit: auditConfigSchema.default({
    enabled: true,
    outputPath: ".pg-ai-redactor/audit/",
    format: "jsonl" as const,
  }),
});

export type AppConfig = z.infer<typeof configSchema>;
export type DatabaseConfigType = z.infer<typeof databaseConfigSchema>;
export type AIConfigType = z.infer<typeof aiConfigSchema>;
