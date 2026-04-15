import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Works in both dev (tsx) and compiled dist (single-file ESM bundle).
export function readVersion(): string {
  // Try nearest package.json from CWD first.
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg?.version) return pkg.version;
  } catch {
    // ignore
  }

  // Fallback: walk from this module (ESM: bundled entry resolves to dist/bin/nangoctl.js).
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, '..', '..', 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg?.version) return pkg.version;
  } catch {
    // ignore
  }
  return '0.0.0';
}

