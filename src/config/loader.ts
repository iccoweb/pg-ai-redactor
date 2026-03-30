import { readFileSync, existsSync } from "fs";
import YAML from "yaml";
import { configSchema, type AppConfig } from "./schema.ts";
import { resolveEnvVarsDeep } from "../utils/env.ts";

export function loadConfig(configPath: string): AppConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, "utf-8");
  let parsed: unknown;

  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse YAML config: ${err instanceof Error ? err.message : err}`);
  }

  // Resolve environment variable references
  const resolved = resolveEnvVarsDeep(parsed);

  // Validate with Zod
  const result = configSchema.safeParse(resolved);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return result.data;
}
