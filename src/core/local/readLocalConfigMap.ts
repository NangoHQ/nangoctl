import { readFile } from 'node:fs/promises';

import YAML from 'yaml';

import { PreflightError } from '../errors.js';
import type { LocalPaths } from '../paths.js';

export type DashboardCredentials = {
  NANGO_DASHBOARD_USERNAME: string;
  NANGO_DASHBOARD_PASSWORD: string;
};

/**
 * Reads dashboard basic-auth credentials from the materialized ConfigMap written by `local install`.
 */
export async function readDashboardCredentials(paths: LocalPaths): Promise<DashboardCredentials> {
  let raw: string;
  try {
    raw = await readFile(paths.configMapManifestFile, 'utf8');
  } catch {
    throw new PreflightError(`No local configmap found at ${paths.configMapManifestFile}.`, [
      'Run `nangoctl local install` to generate it.',
    ]);
  }

  const doc = YAML.parse(raw) as { kind?: string; data?: Record<string, string> };
  if (doc.kind !== 'ConfigMap' || !doc.data || typeof doc.data !== 'object') {
    throw new PreflightError(`${paths.configMapManifestFile} is not a valid ConfigMap manifest.`, [
      'Re-run `nangoctl local install` to regenerate it.',
    ]);
  }

  const username = doc.data.NANGO_DASHBOARD_USERNAME;
  const password = doc.data.NANGO_DASHBOARD_PASSWORD;
  if (username === undefined || password === undefined) {
    throw new PreflightError('ConfigMap does not contain NANGO_DASHBOARD_USERNAME / NANGO_DASHBOARD_PASSWORD.', [
      'Re-run `nangoctl local install` with a current nangoctl version.',
    ]);
  }

  return {
    NANGO_DASHBOARD_USERNAME: username,
    NANGO_DASHBOARD_PASSWORD: password,
  };
}
