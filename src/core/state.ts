import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import { ensureDir } from './paths.js';

// Stable resource names for local mode.
export const LOCAL_CONFIGMAP_NAME = 'nango-local-config';
export const LOCAL_SECRET_NAME = 'nango-local-secrets';

export const LocalStateSchema = z.object({
  version: z.literal(1),
  clusterRuntime: z.enum(['kind']),
  clusterName: z.string(),
  kubeContext: z.string(),
  namespace: z.string(),
  release: z.string(),
  chartRef: z.string(),
  chartVersion: z.string().optional(),
  // Seed used to deterministically generate local secrets. Stored locally only.
  seed: z.string(),
  /** Localhost port used for server port-forward (optional for older state files). */
  serverLocalPort: z.number().int().min(1).max(65535).optional(),
  /** Localhost port used for Connect UI port-forward (optional for older state files). */
  connectUiLocalPort: z.number().int().min(1).max(65535).optional(),
  /** Logs backend used on last install (optional for older state files). */
  logsProvider: z.enum(['elasticsearch', 'opensearch']).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocalState = z.infer<typeof LocalStateSchema>;

export async function readState(path: string): Promise<LocalState | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return LocalStateSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeState(path: string, state: LocalState): Promise<void> {
  await ensureDir(path);
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
}

