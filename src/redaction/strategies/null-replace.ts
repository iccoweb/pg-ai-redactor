import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

export class NullReplaceStrategy implements RedactionStrategy {
  readonly name = "null_replace";

  redact(_value: unknown, _context: RedactionContext): unknown {
    return null;
  }
}
