import { describe, expect, it } from 'vitest';

import {
  elasticsearchHttpUrl,
  helmCommonFullname,
  nangoComponentServiceUrl,
  nangoServerDeploymentName,
  nangoServerPersistenceClaimName,
  nangoServerServiceName,
} from '../../src/core/helm/names.js';

describe('helm naming helpers', () => {
  it('derives server Service name from release (chart fullname + -server-svc)', () => {
    expect(nangoServerServiceName('nango')).toBe('nango-server-svc');
    expect(nangoServerServiceName('acme')).toBe('acme-nango-server-svc');
  });

  it('derives server PVC name (server.names.fullname)', () => {
    expect(nangoServerPersistenceClaimName('nango')).toBe('nango-server');
    expect(nangoServerPersistenceClaimName('acme')).toBe('acme-nango-server');
  });

  it('server Deployment name matches PVC / workload fullname', () => {
    expect(nangoServerDeploymentName('nango')).toBe(nangoServerPersistenceClaimName('nango'));
  });

  it('matches chart fullname when release contains chart name', () => {
    expect(helmCommonFullname('nango')).toBe('nango');
  });

  it('prefixes chart name when release does not contain it', () => {
    expect(helmCommonFullname('acme', 'nango')).toBe('acme-nango');
  });

  it('builds component service URLs with -svc suffix', () => {
    expect(nangoComponentServiceUrl('nango', 'server', 'nango')).toBe(
      'http://nango-server-svc.nango.svc.cluster.local'
    );
  });

  it('builds elasticsearch URL from Helm release name', () => {
    expect(elasticsearchHttpUrl('nango', 'nango')).toBe(
      'http://nango-elasticsearch.nango.svc.cluster.local:9200'
    );
  });
});
