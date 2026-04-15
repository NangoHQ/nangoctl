import { describe, expect, it } from 'vitest';

import {
  buildLocalStatusReport,
  parseHelmStatusJson,
} from '../../src/core/local/gatherLocalStatus.js';

describe('parseHelmStatusJson', () => {
  it('parses chart string and info.status', () => {
    const h = parseHelmStatusJson({
      name: 'nango',
      version: 3,
      chart: 'nango-0.4.2',
      info: { status: 'deployed', last_deployed: '2026-01-01T12:00:00Z' },
    });
    expect(h).toEqual({
      status: 'deployed',
      revision: 3,
      chart: 'nango-0.4.2',
      appVersion: undefined,
      updated: '2026-01-01T12:00:00Z',
    });
  });

  it('reads appVersion from nested chart metadata', () => {
    const h = parseHelmStatusJson({
      version: 1,
      chart: {
        metadata: { name: 'nango', version: '0.1.0', appVersion: '1.2.3' },
      },
      info: { status: 'deployed' },
    });
    expect(h?.chart).toBe('nango-0.1.0');
    expect(h?.appVersion).toBe('1.2.3');
  });
});

describe('buildLocalStatusReport', () => {
  it('maps Kubernetes List items to rows and endpoint counts', () => {
    const kubeList = {
      apiVersion: 'v1',
      kind: 'List',
      items: [
        {
          kind: 'Endpoints',
          metadata: { name: 'api' },
          subsets: [{ addresses: [{ ip: '10.0.0.1' }, { ip: '10.0.0.2' }] }],
        },
        {
          kind: 'Service',
          metadata: { name: 'api' },
          spec: { type: 'ClusterIP', clusterIP: '10.96.0.1', ports: [{ port: 80, protocol: 'TCP' }] },
        },
        {
          kind: 'Deployment',
          metadata: { name: 'server' },
          spec: {
            replicas: 1,
            template: {
              spec: {
                containers: [{ name: 'nango', image: 'nangohq/nango:tag123' }],
              },
            },
          },
          status: { replicas: 1, readyReplicas: 1, updatedReplicas: 1 },
        },
        {
          kind: 'Pod',
          metadata: { name: 'server-abc' },
          spec: { containers: [{ image: 'nangohq/nango:tag123' }] },
          status: {
            phase: 'Running',
            containerStatuses: [{ ready: true, restartCount: 0 }],
          },
        },
      ],
    };

    const r = buildLocalStatusReport({
      kubeContext: 'kind-test',
      state: null,
      statePath: '/tmp/state.json',
      namespace: 'nango',
      release: 'nango',
      helmJson: { version: 1, chart: 'nango-1', info: { status: 'deployed' } },
      kubeList,
      clusterError: null,
    });

    expect(r.clusterError).toBeNull();
    expect(r.deployments).toHaveLength(1);
    expect(r.deployments[0]).toMatchObject({
      name: 'server',
      ready: '1/1',
      images: ['nangohq/nango:tag123'],
    });
    expect(r.services).toHaveLength(1);
    expect(r.services[0]).toMatchObject({
      name: 'api',
      endpoints: '2 ready',
      ports: '80/TCP',
    });
    expect(r.pods).toHaveLength(1);
    expect(r.pods[0]).toMatchObject({
      name: 'server-abc',
      ready: '1/1',
      phase: 'Running',
      images: ['nangohq/nango:tag123'],
    });
  });
});
