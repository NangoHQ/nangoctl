import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import { ensureDir } from './paths.js';

export const LocalStateSchema = z.object({
  version: z.literal(1),
  clusterRuntime: z.enum(['kind']),
  clusterName: z.string(),
  kubeContext: z.string(),
  namespace: z.string(),
  release: z.string(),
  chartRef: z.string(),
  chartVersion: z.string().optional(),
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

