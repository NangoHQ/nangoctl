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

