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
