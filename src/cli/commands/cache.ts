import { loadConfig } from "../../config/loader.ts";
import { ClassificationCache } from "../../analysis/cache.ts";
import { logger } from "../../utils/logger.ts";

export function runCacheInspect(configPath: string): void {
  const config = loadConfig(configPath);
  const cache = new ClassificationCache(config.cache.directory);
  const entries = cache.inspect();

  if (entries.length === 0) {
    logger.output("No cached classifications found.");
    return;
  }

  logger.output(`Found ${entries.length} cached classification(s):\n`);
  for (const entry of entries) {
    logger.output(`  Fingerprint: ${entry.fingerprint.slice(0, 12)}...`);
    logger.output(`  Created: ${entry.createdAt}`);
    const tableCount = entry.classification.tables.length;
    const phiCols = entry.classification.tables.reduce(
      (sum, t) => sum + t.columns.filter((c) => c.phiType !== null).length,
      0,
    );
    logger.output(`  Tables: ${tableCount}, PHI columns: ${phiCols}`);
    logger.output("");
  }
}

export function runCacheClear(configPath: string): void {
  const config = loadConfig(configPath);
  const cache = new ClassificationCache(config.cache.directory);
  const cleared = cache.clear();
  logger.output(`Cleared ${cleared} cached classification(s).`);
}
