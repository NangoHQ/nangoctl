import { describe, expect, it } from 'vitest';

import { generateLocalConfigMap } from '../../src/core/config/generateConfigMap.js';
import type { LocalRuntimeConfig } from '../../src/core/config/localConfigSchema.js';

const base: LocalRuntimeConfig = {
  nodeEnv: 'development',
  serverPortInPod: 8080,
  connectUiPortInPod: 3009,
  publicConnectBaseUrl: 'http://127.0.0.1:4281',
  authAllowSignup: false,
  authEnabled: false,
  dashboardUsername: 'admin',
  dashboardPassword: 'x',
  publicBaseUrl: 'http://127.0.0.1:4280',
  inClusterUrls: {
    server: 'http://nango-server-svc.nango.svc.cluster.local',
    persist: 'http://nango-persist-svc.nango.svc.cluster.local',
    orchestrator: 'http://nango-orchestrator-svc.nango.svc.cluster.local',
    jobs: 'http://nango-jobs-svc.nango.svc.cluster.local',
    runner: 'http://nango-runner-svc.nango.svc.cluster.local',
  },
  logsProvider: 'elasticsearch',
  logsEnabled: false,
  logsIndexPrefix: 'nango-local',
  integrationsFullPath: '/nango/data/integrations',
  enterpriseMode: true,
  lambdaEnabled: false,
};

describe('generateLocalConfigMap', () => {
  it('sets LAMBDA_ENABLED from config', () => {
    const off = generateLocalConfigMap({ name: 'cm', namespace: 'nango', config: base });
    expect(off.data.LAMBDA_ENABLED).toBe('false');

    const on = generateLocalConfigMap({
      name: 'cm',
      namespace: 'nango',
      config: { ...base, lambdaEnabled: true },
    });
    expect(on.data.LAMBDA_ENABLED).toBe('true');
  });
});
