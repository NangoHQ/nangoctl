import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Works in both dev (ts-node/tsx) and compiled dist (tsup) layouts.
export function readVersion(): string {
  // Try nearest package.json from CWD first.
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg?.version) return pkg.version;
  } catch {
    // ignore
  }

  // Fallback: walk from this file location.
  try {
    const raw = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg?.version) return pkg.version;
  } catch {
    // ignore
  }
  return '0.0.0';
}

