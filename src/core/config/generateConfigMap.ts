import type { LocalRuntimeConfig } from './localConfigSchema.js';

export type ConfigMapManifest = {
  apiVersion: 'v1';
  kind: 'ConfigMap';
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  data: Record<string, string>;
};

const HTTP_AGENT_CONFIG = `{
  "keepAlive": true,
  "timeout": 120000,
  "scheduling": "fifo"
}`;

export function generateLocalConfigMap(opts: {
  name: string;
  namespace: string;
  config: LocalRuntimeConfig;
}): ConfigMapManifest {
  const { name, namespace, config } = opts;

  const data: Record<string, string> = {
    NODE_ENV: config.nodeEnv,
    NANGO_ENTERPRISE: String(config.enterpriseMode ?? true),
    // Must match `SERVER_RUN_MODE` in Nango `parseEnvs` (e.g. DOCKERIZED for container images).
    SERVER_RUN_MODE: 'DOCKERIZED',
    SERVER_PORT: String(config.serverPortInPod),
    HTTP_AGENT_CONFIG,
    FLAG_AUTH_ENABLED: String(config.authEnabled),
    AUTH_ALLOW_SIGNUP: String(config.authAllowSignup),
    NANGO_DASHBOARD_USERNAME: String(config.dashboardUsername),
    NANGO_DASHBOARD_PASSWORD: String(config.dashboardPassword),

    // Connect UI is served on a separate port in the server image (same pod as the API).
    FLAG_SERVE_CONNECT_UI: 'true',
    NANGO_CONNECT_UI_PORT: String(config.connectUiPortInPod),

    // Public-facing URLs (local port-forward / localhost)
    NANGO_SERVER_URL: config.publicBaseUrl,
    NANGO_PUBLIC_SERVER_URL: config.publicBaseUrl,
    NANGO_PUBLIC_CONNECT_URL: config.publicConnectBaseUrl,

    // In-cluster URLs (Helm `*-svc` service names)
    SERVER_SERVICE_URL: config.inClusterUrls.server,
    PERSIST_SERVICE_URL: config.inClusterUrls.persist,
    ORCHESTRATOR_SERVICE_URL: config.inClusterUrls.orchestrator,
    JOBS_SERVICE_URL: config.inClusterUrls.jobs,
    RUNNER_SERVICE_URL: config.inClusterUrls.runner,
    RUNNER_URL: config.inClusterUrls.runner,

    RUNNER_TYPE: 'REMOTE',

    NANGO_INTEGRATIONS_FULL_PATH: config.integrationsFullPath,

    // No AWS ActiveMQ in local; use app default (`none`) for pub/sub.
    NANGO_PUBSUB_TRANSPORT: 'none',

    // SSL toggles: local DB is in-cluster non-TLS by default.
    ORCHESTRATOR_DB_SSL: 'false',
    NANGO_DB_SSL: 'false',
    RECORDS_DATABASE_SSL: 'false',

    // Datadog off for local; tag env if you enable the agent later.
    DD_ENV: 'local',
    DD_TRACE_ENABLED: 'false',
    DD_TRACING_ENABLED: 'false',
    DD_PROFILING_ENABLED: 'false',

    NANGO_SLACK_INTEGRATION_KEY: 'slack-notifications',
    PUBLIC_AUTHENTICATION_DEPRECATION_DATE: '9999-12-31',
  };

  data.NANGO_LOGS_ENABLED = String(config.logsEnabled);
  if (config.logsEnabled && config.elasticsearchUrl) {
    data.NANGO_LOGS_ES_URL = config.elasticsearchUrl;
    data.NANGO_LOGS_ES_PREFIX = config.logsIndexPrefix;
    data.NANGO_LOGS_ES_INDEX_OPERATIONS = `${config.logsIndexPrefix}-operations`;
    data.NANGO_LOGS_ES_INDEX_MESSAGES = `${config.logsIndexPrefix}-messages`;
    data.NANGO_LOGS_ES_USER = '';
    data.NANGO_LOGS_ES_PWD = '';
  }

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
