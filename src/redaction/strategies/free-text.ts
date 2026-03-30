import type { RedactionStrategy, RedactionContext } from "./strategy.ts";

/** Regex patterns for common PHI in free text */
const PHI_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // SSN: 123-45-6789 or 123456789
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "XXX-XX-XXXX" },
  { pattern: /\b\d{9}\b/g, replacement: "XXXXXXXXX" },

  // Phone: (123) 456-7890, 123-456-7890, 123.456.7890
  { pattern: /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g, replacement: "(XXX) XXX-XXXX" },

  // Email
  { pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: "[EMAIL REDACTED]" },

  // IP addresses (v4)
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: "X.X.X.X" },

  // URLs
  { pattern: /https?:\/\/[^\s)]+/g, replacement: "[URL REDACTED]" },

  // Dates: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
  { pattern: /\b\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\b/g, replacement: "[DATE REDACTED]" },
  { pattern: /\b\d{4}[/\-]\d{1,2}[/\-]\d{1,2}\b/g, replacement: "[DATE REDACTED]" },

  // Common date words followed by numbers
  {
    pattern: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
    replacement: "[DATE REDACTED]",
  },
];

export class FreeTextStrategy implements RedactionStrategy {
  readonly name = "free_text_scrub";

  redact(value: unknown, _context: RedactionContext): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value !== "string") return value;

    let text = value;
    for (const { pattern, replacement } of PHI_PATTERNS) {
      // Reset lastIndex for global regex patterns
      pattern.lastIndex = 0;
      text = text.replace(pattern, replacement);
    }
    return text;
  }
}
