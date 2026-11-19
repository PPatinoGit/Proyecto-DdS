/*
  Resolve extensionless relative imports to .ts files for Node's test runner.

  The project uses bundler-style extensionless imports in TypeScript source.
  Node can strip types but still needs a resolvable specifier, so this loader
  appends ".ts" when the target file exists.
*/

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[a-zA-Z0-9]+$/.test(specifier)
  ) {
    const parent = context.parentURL ?? import.meta.url;
    const candidate = new URL(`${specifier}.ts`, parent);
    if (existsSync(fileURLToPath(candidate))) {
      return { url: candidate.href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
