import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs/promises';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import { CliError } from './errors.js';
import { logDebug } from './output/render.js';

export const LocalPaths = z.object({
  stateDir: z.string(),
  stateFile: z.string(),
  generatedValuesFile: z.string(),
  configMapManifestFile: z.string(),
  secretManifestFile: z.string(),
});
export type LocalPaths = z.infer<typeof LocalPaths>;

function defaultStateDir(): string {
  const override = process.env.NANGOCTL_STATE_DIR;
  if (override && override.trim().length > 0) {
    return override;
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim().length > 0) {
    return path.join(xdg, 'nangoctl', 'local');
  }
  // macOS: ~/Library/Application Support/nangoctl/local
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'nangoctl', 'local');
  }
  // Linux default: ~/.config/nangoctl/local
  return path.join(os.homedir(), '.config', 'nangoctl', 'local');
}

export async function getLocalPaths(stateDir?: string): Promise<LocalPaths> {
  const base = stateDir ?? defaultStateDir();
  return LocalPaths.parse({
    stateDir: base,
    stateFile: path.join(base, 'state.json'),
    generatedValuesFile: path.join(base, 'generated.values.yaml'),
    configMapManifestFile: path.join(base, 'configmap.yaml'),
    secretManifestFile: path.join(base, 'secret.yaml'),
  });
}

export async function ensureStateDir(paths: LocalPaths): Promise<void> {
  try {
    if (!existsSync(paths.stateDir)) {
      mkdirSync(paths.stateDir, { recursive: true });
    }
    // Best-effort: protect local secrets materialization.
    try {
      chmodSync(paths.stateDir, 0o700);
    } catch {
      // ignore
    }
  } catch (err) {
    throw new CliError('STATE_DIR_CREATE_FAILED', `Failed to create state dir at ${paths.stateDir}`, {
      cause: err,
    });
  }
  logDebug(`stateDir=${paths.stateDir}`);
}

export async function writeFile0600(filePath: string, contents: string): Promise<void> {
  await fs.writeFile(filePath, contents, { encoding: 'utf8' });
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // ignore
  }
}

