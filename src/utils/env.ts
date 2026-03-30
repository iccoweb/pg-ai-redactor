/**
 * Resolves environment variable references in strings.
 * Supports $VAR_NAME and ${VAR_NAME} syntax.
 */
export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, plain) => {
    const varName = braced || plain;
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(`Environment variable ${varName} is not set (referenced as ${match})`);
    }
    return envValue;
  });
}

/**
 * Recursively resolves environment variable references in an object.
 */
export function resolveEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === "string") {
    // Only resolve if the string starts with $ (env var reference)
    if (obj.startsWith("$")) {
      return resolveEnvVars(obj);
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVarsDeep);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVarsDeep(value);
    }
    return result;
  }
  return obj;
}
