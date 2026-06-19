import { describe, expect, it } from 'vitest';

import { generateLocalHelmValues } from '../../src/core/values/generateLocalValues.js';

const ctx = {
  namespace: 'nango',
  release: 'nango',
  serverPortLocalhost: 4280,
  connectUiPortInPod: 3009,
};

describe('generateLocalHelmValues', () => {
  it('sets global.image.tag when imageTag is passed', () => {
    const { values } = generateLocalHelmValues({ imageTag: 'sha-abc123' }, ctx);
    const global = values.global as { image?: { tag?: string } };
    expect(global?.image?.tag).toBe('sha-abc123');
  });

  it('does not emit global.image when imageTag is omitted', () => {
    const { values } = generateLocalHelmValues({}, ctx);
    expect(values.global).toBeUndefined();
  });

  it('disables Bitnami elasticsearch when logsProvider is opensearch', () => {
    const { values } = generateLocalHelmValues({ logsProvider: 'opensearch' }, ctx);
    expect((values.elasticsearch as { enabled?: boolean }).enabled).toBe(false);
  });

  it('keeps elasticsearch enabled by default (no logsProvider)', () => {
    const { values } = generateLocalHelmValues({}, ctx);
    expect((values.elasticsearch as { enabled?: boolean }).enabled).toBe(true);
  });

  it('sets server memory for entrypoint (API + Connect UI)', () => {
    const { values } = generateLocalHelmValues({}, ctx);
    const resources = (values.server as { resources?: { limits?: { memory?: string } } }).resources;
    expect(resources?.limits?.memory).toBe('1Gi');
  });

  it('appends AWS credentials Secret to all workloads when awsCredentialsSecretName is set', () => {
    const { values } = generateLocalHelmValues({ awsCredentialsSecretName: 'nango-local-aws-credentials' }, ctx);
    for (const key of ['server', 'persist', 'orchestrator', 'jobs', 'runner'] as const) {
      const secrets = (values[key] as { extraEnvVarsSecrets?: string[] }).extraEnvVarsSecrets;
      expect(secrets).toContain('nango-local-secrets');
      expect(secrets).toContain('nango-local-aws-credentials');
    }
  });
});
