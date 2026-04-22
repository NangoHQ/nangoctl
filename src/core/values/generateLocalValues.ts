import YAML from 'yaml';

import type { LogsProvider } from '../logs/types.js';
import { DEFAULT_CONNECT_UI_POD_PORT, NANGO_IMAGE_APP_ROOT, NANGO_PERSISTENCE_MOUNT_PATH } from '../defaults.js';
import { nangoServerPersistenceClaimName } from '../helm/names.js';
import { LOCAL_CONFIGMAP_NAME, LOCAL_SECRET_NAME } from '../state.js';

export type GeneratedValuesContext = {
  namespace: string;
  release: string;
  serverPortLocalhost: number;
  /** Port inside the server container for Connect UI (exposed via Service extraPorts). */
  connectUiPortInPod: number;
};

export type LocalHelmFlags = {
  lowResource?: boolean;
  imageTag?: string;
  /** When `opensearch`, Bitnami Elasticsearch subchart is disabled (OpenSearch installed separately). */
  logsProvider?: LogsProvider;
  /** Enable the Unleash feature-flag subchart wired against the bundled postgres. */
  unleash?: boolean;
};

export type GeneratedValuesOutput = {
  yamlText: string;
  values: Record<string, unknown>;
};

export function generateLocalHelmValues(flags: LocalHelmFlags, ctx: GeneratedValuesContext): GeneratedValuesOutput {
  const connectUiPort = ctx.connectUiPortInPod ?? DEFAULT_CONNECT_UI_POD_PORT;
  const serverPvcName = nangoServerPersistenceClaimName(ctx.release);

  const values: Record<string, unknown> = {
    namespaceOverride: ctx.namespace,

    server: {
      ingress: { enabled: false },
      // Chart defaults to `args: [node, packages/server/dist/server.js]`, which skips
      // `packages/server/entrypoint.sh` and never starts Connect UI (see Nango `Dockerfile.self_hosted`).
      command: ['/bin/bash', '-c', `cd ${NANGO_IMAGE_APP_ROOT} && exec ./packages/server/entrypoint.sh`],
      // Empty array clears chart defaults; `if .Values.server.args` is false so no args are rendered.
      args: [],
      service: {
        type: 'ClusterIP',
        extraPorts: [
          {
            name: 'connect-ui',
            port: connectUiPort,
            protocol: 'TCP',
            targetPort: 'connect-ui',
          },
        ],
      },
      extraContainerPorts: [{ name: 'connect-ui', containerPort: connectUiPort }],
      extraEnvVarsCMs: [LOCAL_CONFIGMAP_NAME],
      extraEnvVarsSecrets: [LOCAL_SECRET_NAME],
      persistence: {
        enabled: true,
        mountPath: NANGO_PERSISTENCE_MOUNT_PATH,
        size: '2Gi',
        existingClaim: '',
      },
    },
    persist: {
      ingress: { enabled: false },
      service: { type: 'ClusterIP' },
      extraEnvVarsCMs: [LOCAL_CONFIGMAP_NAME],
      extraEnvVarsSecrets: [LOCAL_SECRET_NAME],
    },
    orchestrator: {
      ingress: { enabled: false },
      service: { type: 'ClusterIP' },
      extraEnvVarsCMs: [LOCAL_CONFIGMAP_NAME],
      extraEnvVarsSecrets: [LOCAL_SECRET_NAME],
    },
    jobs: {
      ingress: { enabled: false },
      service: { type: 'ClusterIP' },
      extraEnvVarsCMs: [LOCAL_CONFIGMAP_NAME],
      extraEnvVarsSecrets: [LOCAL_SECRET_NAME],
      persistence: {
        enabled: true,
        mountPath: NANGO_PERSISTENCE_MOUNT_PATH,
        existingClaim: serverPvcName,
      },
    },
    runner: {
      enabled: true,
      ingress: { enabled: false },
      service: { type: 'ClusterIP' },
      extraEnvVarsCMs: [LOCAL_CONFIGMAP_NAME],
      extraEnvVarsSecrets: [LOCAL_SECRET_NAME],
    },

    postgresql: { enabled: true },
    redis: { enabled: true },
    elasticsearch: { enabled: flags.logsProvider !== 'opensearch' },
    metering: { enabled: false },
  };

  if (flags.imageTag) {
    values.global = {
      ...(values.global as Record<string, unknown> | undefined),
      image: {
        ...((values.global as { image?: Record<string, unknown> } | undefined)?.image ?? {}),
        tag: flags.imageTag,
      },
    };
  }

  if (flags.unleash) {
    values.unleash = {
      enabled: true,
      // Triggers the chart's post-install Helm Job that creates the Unleash DB inside
      // `<release>-postgresql`. Requires postgresql.enabled=true (chart guards this).
      bootstrapDatabase: true,
      // One replica avoids the "Unable to create default user 'admin'" race when two
      // Unleash pods try to seed the admin on startup against the same fresh DB.
      replicaCount: 1,
      // Predictable in-cluster DNS: `unleash.<namespace>.svc.cluster.local`.
      fullnameOverride: 'unleash',
      image: { tag: '7.5.0' },
      service: { type: 'ClusterIP', port: 4242 },
      ingress: { enabled: false },
      // The bundled subchart-postgres shares `app.kubernetes.io/instance=<release>` with the
      // top-level postgresql subchart; their pod labels collide and both Services end up backing
      // both pods. Point Unleash at the top-level DB instead.
      postgresql: { enabled: false },
      dbConfig: { database: 'unleash', ssl: 'false' },
      env: [
        { name: 'AUTH_TYPE', value: 'none' },
        {
          name: 'DATABASE_HOST',
          value: `${ctx.release}-postgresql.${ctx.namespace}.svc.cluster.local`,
        },
        { name: 'DATABASE_PORT', value: '5432' },
        { name: 'DATABASE_USERNAME', value: 'postgres' },
        // Matches `postgresql.auth.postgresPassword` in values/local.defaults.yaml.
        { name: 'DATABASE_PASSWORD', value: 'nango' },
        { name: 'DATABASE_NAME', value: 'unleash' },
        { name: 'DATABASE_SSL', value: 'false' },
      ],
    };

    const unleashUrl = `http://unleash.${ctx.namespace}.svc.cluster.local:4242/api`;
    const flagEnvs = [
      { name: 'NANGO_FLAG_PROVIDER', value: 'unleash' },
      { name: 'NANGO_UNLEASH_URL', value: unleashUrl },
      { name: 'NANGO_UNLEASH_APP_NAME', value: 'nango-local' },
    ];
    for (const svc of ['server', 'jobs'] as const) {
      const existing = values[svc] as Record<string, unknown>;
      const existingExtra = (existing.extraEnvVars as Array<Record<string, string>> | undefined) ?? [];
      values[svc] = { ...existing, extraEnvVars: [...existingExtra, ...flagEnvs] };
    }
  }

  if (flags.lowResource) {
    for (const svc of ['server', 'persist', 'orchestrator', 'jobs', 'runner'] as const) {
      values[svc] = {
        ...(values[svc] as Record<string, unknown>),
        autoscaling: {
          ...((values[svc] as { autoscaling?: Record<string, unknown> })?.autoscaling ?? {}),
          hpa: { enabled: false },
        },
        resourcesPreset: 'small',
      };
    }
  }

  const yamlText = YAML.stringify(values);
  return { yamlText, values };
}
