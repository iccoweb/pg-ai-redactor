/**
 * Per-run consistency map: ensures the same input value always maps to
 * the same redacted output within a single run.
 *
 * Keys are "{strategy}:{originalValue}" to avoid collisions between strategies.
 */
export class ConsistencyMap {
  private map = new Map<string, unknown>();

  getOrSet(strategy: string, originalValue: unknown, generator: () => unknown): unknown {
    const key = `${strategy}:${String(originalValue)}`;
    const existing = this.map.get(key);
    if (existing !== undefined) return existing;

    const newValue = generator();
    this.map.set(key, newValue);
    return newValue;
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
