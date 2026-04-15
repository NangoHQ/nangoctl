import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readDashboardCredentials } from '../../src/core/local/readLocalConfigMap.js';
import { getLocalPaths } from '../../src/core/paths.js';

const sampleConfigMap = `apiVersion: v1
kind: ConfigMap
metadata:
  name: nango-local-config
  namespace: nango
data:
  NANGO_DASHBOARD_USERNAME: admin@example.com
  NANGO_DASHBOARD_PASSWORD: hunter2
`;

describe('readDashboardCredentials', () => {
  it('reads dashboard keys from materialized ConfigMap', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'nangoctl-cred-'));
    try {
      const paths = await getLocalPaths(dir);
      await writeFile(paths.configMapManifestFile, sampleConfigMap, 'utf8');
      await expect(readDashboardCredentials(paths)).resolves.toEqual({
        NANGO_DASHBOARD_USERNAME: 'admin@example.com',
        NANGO_DASHBOARD_PASSWORD: 'hunter2',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
