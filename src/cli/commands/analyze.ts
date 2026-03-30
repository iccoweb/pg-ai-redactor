import { writeFileSync } from "fs";
import { loadConfig } from "../../config/loader.ts";
import { createDatabaseAdapter } from "../../db/factory.ts";
import { createAIProvider } from "../../ai/factory.ts";
import { classifySchema } from "../../analysis/classifier.ts";
import { logger } from "../../utils/logger.ts";

export interface AnalyzeOptions {
  config: string;
  force?: boolean;
  output?: string;
}

export async function runAnalyze(options: AnalyzeOptions): Promise<void> {
  const config = loadConfig(options.config);
  const db = createDatabaseAdapter(config.database);
  const ai = createAIProvider({
    provider: config.ai.provider,
    model: config.ai.model,
    apiKey: config.ai.apiKey,
    baseUrl: config.ai.baseUrl,
    maxTokens: config.ai.maxTokens,
  });

  try {
    await db.connect(config.database);
    const result = await classifySchema(db, ai, config, options.force);

    if (result.fromCache) {
      logger.output("Classification loaded from cache (schema unchanged).");
      logger.output(`Use --force to re-run AI analysis.`);
    } else {
      logger.output("AI classification complete.");
    }

    // Print summary
    for (const table of result.classification.tables) {
      const phiCols = table.columns.filter((c) => c.phiType !== null);
      if (phiCols.length === 0) continue;

      logger.output(`\n${table.schema}.${table.name}:`);
      for (const col of phiCols) {
        logger.output(
          `  ${col.name}: ${col.phiType} (${(col.confidence * 100).toFixed(0)}%) → ${col.suggestedStrategy}`,
        );
        logger.output(`    Reason: ${col.reasoning}`);
      }
    }

    // Write to file if requested
    if (options.output) {
      writeFileSync(options.output, JSON.stringify(result.classification, null, 2));
      logger.output(`\nClassification written to: ${options.output}`);
    }

    logger.output(`\nFingerprint: ${result.fingerprint}`);
  } finally {
    await db.disconnect();
  }
}
