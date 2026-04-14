/**
 * In-cluster Postgres / Redis credentials for `nangoctl local install`.
 * Must stay in sync with `postgresql.auth` and `redis.auth` in `values/local.defaults.yaml`
 * (Bitnami charts default to random passwords when unset).
 */
/** Matches `postgresql.auth` in local defaults: superuser + database (no custom Bitnami app user). */
export const LOCAL_POSTGRES_USER = 'postgres';
export const LOCAL_POSTGRES_PASSWORD = 'nango';
export const LOCAL_POSTGRES_DATABASE = 'nango';

export const LOCAL_REDIS_PASSWORD = 'nango';

export function localPostgresUrl(namespace: string): string {
  const u = encodeURIComponent(LOCAL_POSTGRES_USER);
  const p = encodeURIComponent(LOCAL_POSTGRES_PASSWORD);
  const db = encodeURIComponent(LOCAL_POSTGRES_DATABASE);
  return `postgres://${u}:${p}@nango-postgresql.${namespace}.svc.cluster.local:5432/${db}`;
}

/** Password auth (Bitnami `redis.auth.enabled` defaults to true). */
export function localRedisUrl(namespace: string): string {
  const pw = encodeURIComponent(LOCAL_REDIS_PASSWORD);
  return `redis://:${pw}@nango-redis-master.${namespace}.svc.cluster.local:6379`;
}
