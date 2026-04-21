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
});
