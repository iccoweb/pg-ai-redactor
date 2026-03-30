import { existsSync, writeFileSync } from "fs";
import { DEFAULT_CONFIG_YAML } from "../../config/defaults.ts";
import { logger } from "../../utils/logger.ts";

export function runInit(configPath: string): void {
  if (existsSync(configPath)) {
    logger.error(`Configuration file already exists: ${configPath}`);
    logger.output("Use a different path with --config or delete the existing file.");
    process.exit(1);
  }

  writeFileSync(configPath, DEFAULT_CONFIG_YAML);
  logger.output(`Created configuration file: ${configPath}`);
  logger.output("Edit the file to configure your database, AI provider, and redaction settings.");
  logger.output("Use environment variables for sensitive values (e.g., $DB_PASSWORD).");
}
