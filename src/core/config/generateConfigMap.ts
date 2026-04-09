import type { LocalRuntimeConfig } from './localConfigSchema.js';

export type ConfigMapManifest = {
  apiVersion: 'v1';
  kind: 'ConfigMap';
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  data: Record<string, string>;
};

export function generateLocalConfigMap(opts: {
  name: string;
  namespace: string;
  config: LocalRuntimeConfig;
}): ConfigMapManifest {
  const { name, namespace, config } = opts;

  const data: Record<string, string> = {
    NODE_ENV: config.nodeEnv,
    SERVER_RUN_MODE: 'KUBERNETES_LOCAL',
    SERVER_PORT: String(config.serverPortInPod),
    AUTH_ALLOW_SIGNUP: String(config.authAllowSignup),

    // Public-facing URLs (local)
    NANGO_SERVER_URL: config.publicBaseUrl,
    NANGO_PUBLIC_SERVER_URL: config.publicBaseUrl,
    NANGO_PUBLIC_CONNECT_URL: `${config.publicBaseUrl}/connect`,

    // In-cluster URLs (service discovery via Kubernetes DNS)
    SERVER_SERVICE_URL: config.inClusterUrls.server,
    PERSIST_SERVICE_URL: config.inClusterUrls.persist,
    ORCHESTRATOR_SERVICE_URL: config.inClusterUrls.orchestrator,
    JOBS_SERVICE_URL: config.inClusterUrls.jobs,
    RUNNER_SERVICE_URL: config.inClusterUrls.runner,
    RUNNER_URL: config.inClusterUrls.runner,

    RUNNER_TYPE: 'kubernetes',
    RUNNER_NODE_ID: config.runnerNodeId,

    // Local posture: disable prod-only telemetry/integrations by default.
    DD_TRACE_ENABLED: 'false',
    DD_TRACING_ENABLED: 'false',
    DD_PROFILING_ENABLED: 'false',

    NANGO_LOGS_ENABLED: 'false'
  };

  // SSL toggles: local DB is in-cluster non-TLS by default.
  data.ORCHESTRATOR_DB_SSL = 'false';
  data.NANGO_DB_SSL = 'false';
  data.RECORDS_DATABASE_SSL = 'false';

  if (config.enterpriseMode !== undefined) data.NANGO_ENTERPRISE = String(config.enterpriseMode);

  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name,
      namespace,
      labels: { 'app.kubernetes.io/managed-by': 'nangoctl' }
    },
    data
  };
}

