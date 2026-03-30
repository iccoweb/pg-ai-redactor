import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ClassificationResponse } from "../ai/types.ts";

export interface CachedClassification {
  fingerprint: string;
  createdAt: string;
  classification: ClassificationResponse;
}

export class ClassificationCache {
  private cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  private ensureDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getCachePath(fingerprint: string): string {
    return join(this.cacheDir, `${fingerprint}.json`);
  }

  get(fingerprint: string): CachedClassification | null {
    const path = this.getCachePath(fingerprint);
    if (!existsSync(path)) return null;

    try {
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as CachedClassification;
    } catch {
      return null;
    }
  }

  set(fingerprint: string, classification: ClassificationResponse): void {
    this.ensureDir();
    const entry: CachedClassification = {
      fingerprint,
      createdAt: new Date().toISOString(),
      classification,
    };
    writeFileSync(this.getCachePath(fingerprint), JSON.stringify(entry, null, 2));
  }

  clear(): number {
    if (!existsSync(this.cacheDir)) return 0;
    const { readdirSync, unlinkSync } = require("fs");
    const files = readdirSync(this.cacheDir).filter((f: string) => f.endsWith(".json"));
    for (const file of files) {
      unlinkSync(join(this.cacheDir, file));
    }
    return files.length;
  }

  inspect(): CachedClassification[] {
    if (!existsSync(this.cacheDir)) return [];
    const { readdirSync } = require("fs");
    const files = readdirSync(this.cacheDir).filter((f: string) => f.endsWith(".json"));
    const entries: CachedClassification[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(this.cacheDir, file), "utf-8");
        entries.push(JSON.parse(raw) as CachedClassification);
      } catch {
        // Skip corrupted cache files
      }
    }
    return entries;
  }
}
