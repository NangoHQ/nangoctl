import type { Command } from 'commander';
import { z } from 'zod';

import { getLocalPaths, ensureStateDir } from './paths.js';
import { getDefaultNamespace, getDefaultRelease, getDefaultClusterName } from './defaults.js';

export const LocalContextSchema = z.object({
  namespace: z.string(),
  release: z.string(),
  clusterName: z.string(),
  stateDir: z.string(),
});

export type LocalContext = z.infer<typeof LocalContextSchema>;

export function getDefaultContext(cmd: { opts?: () => any; optsWithGlobals?: () => any } | undefined): string | undefined {
  const o = cmd?.optsWithGlobals?.() ?? cmd?.opts?.() ?? {};
  const ctx = typeof o.context === 'string' ? o.context : undefined;
  return ctx && ctx.trim().length > 0 ? ctx : undefined;
}

/** Global `--json` / `--verbose` / `--context` from the root program (best-effort). */
export function getGlobalCliOptions(cmd: Command | undefined): {
  json: boolean;
  verbose: boolean;
  context?: string;
} {
  const o = (cmd?.optsWithGlobals?.() ?? cmd?.opts?.() ?? {}) as Record<string, unknown>;
  const ctx = typeof o.context === 'string' && o.context.trim().length > 0 ? o.context : undefined;
  return {
    json: Boolean(o.json),
    verbose: Boolean(o.verbose),
    context: ctx,
  };
}

export async function resolveLocalContext(opts?: {
  namespace?: string;
  release?: string;
  clusterName?: string;
  stateDir?: string;
}): Promise<LocalContext> {
  const namespace = opts?.namespace ?? getDefaultNamespace();
  const release = opts?.release ?? getDefaultRelease();
  const clusterName = opts?.clusterName ?? getDefaultClusterName();
  const paths = await getLocalPaths(opts?.stateDir);
  await ensureStateDir(paths);
  return LocalContextSchema.parse({
    namespace,
    release,
    clusterName,
    stateDir: paths.stateDir,
  });
}

