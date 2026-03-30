import { createHash } from "crypto";
import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

export class URLStrategy implements RedactionStrategy {
  readonly name = "url_redact";

  redact(value: unknown, context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;

    return context.consistencyMap.getOrSet(this.name, value, () => {
      const str = String(value);

      try {
        const url = new URL(str);
        const hash = createHash("md5").update(str).digest("hex").slice(0, 8);
        // Preserve path depth
        const pathSegments = url.pathname.split("/").filter(Boolean).length;
        const fakePath = Array.from({ length: pathSegments }, (_, i) => `path${i + 1}`).join("/");
        return `https://example.com/${fakePath ? fakePath + "/" : ""}${hash}`;
      } catch {
        // Not a valid URL, just hash it
        const hash = createHash("md5").update(str).digest("hex").slice(0, 8);
        return `https://example.com/${hash}`;
      }
    });
  }
}
