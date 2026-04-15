import { describe, expect, it } from 'vitest';

import { localPostgresUrl, localRedisUrl } from '../../src/core/local/bitnamiLocalDeps.js';

describe('bitnamiLocalDeps', () => {
  it('builds postgres URL with user, password, and database', () => {
    expect(localPostgresUrl('nango')).toBe(
      'postgres://postgres:nango@nango-postgresql.nango.svc.cluster.local:5432/nango'
    );
  });

  it('builds redis URL with password (Bitnami auth.enabled)', () => {
    expect(localRedisUrl('nango')).toBe('redis://:nango@nango-redis-master.nango.svc.cluster.local:6379');
  });
});
