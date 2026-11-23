/*
  Resolve relative imports for Node's test runner with type stripping.

  Source uses .js extensions in imports for Node ESM runtime compatibility.
  Node can strip types but needs resolvable files, so this loader maps .js/.jsx
  specifiers to existing .ts/.tsx files, and also supports extensionless imports.
*/

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function tryResolve(specifier, parent) {
  const candidate = new URL(specifier, parent);
  if (existsSync(fileURLToPath(candidate))) {
    return { url: candidate.href, shortCircuit: true };
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parent = context.parentURL ?? import.meta.url;

    // Map .js -> .ts/.tsx when the JS file doesn't exist but TS does.
    if (specifier.endsWith(".js")) {
      const ts = tryResolve(specifier.slice(0, -3) + ".ts", parent);
      if (ts) return ts;
      const tsx = tryResolve(specifier.slice(0, -3) + ".tsx", parent);
      if (tsx) return tsx;
    }
    if (specifier.endsWith(".jsx")) {
      const tsx = tryResolve(specifier.slice(0, -4) + ".tsx", parent);
      if (tsx) return tsx;
    }

    // Support extensionless relative imports.
    if (!/\.[a-zA-Z0-9]+$/.test(specifier)) {
      const ts = tryResolve(`${specifier}.ts`, parent);
      if (ts) return ts;
      const tsx = tryResolve(`${specifier}.tsx`, parent);
      if (tsx) return tsx;
    }
  }

  return nextResolve(specifier, context);
}
