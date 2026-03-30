#!/usr/bin/env bun
import { createCLI } from "../src/cli/index.ts";

const program = createCLI();
program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
