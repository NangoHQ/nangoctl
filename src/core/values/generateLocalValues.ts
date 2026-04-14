import YAML from 'yaml';

import { LOCAL_CONFIGMAP_NAME, LOCAL_SECRET_NAME } from '../state.js';

export type GeneratedValuesContext = {
  namespace: string;
  release: string;
  serverPortLocalhost: number;
};

export type LocalHelmFlags = {
  lowResource?: boolean;
  imageTag?: string;
};

export type GeneratedValuesOutput = {
  yamlText: string;
  values: Record<string, unknown>;
};

export function generateLocalHelmValues(flags: LocalHelmFlags, ctx: GeneratedValuesContext): GeneratedValuesOutput {
  const values: Record<string, unknown> = {
    namespaceOverride: ctx.namespace,

    server: {
      ingress: { enabled: false },
      service: { type: 'ClusterIP' },
      extraEnvVarsCMs: [LOCAL_CONFIGMAP_NAME],
      extraEnvVarsSecrets: [LOCAL_SECRET_NAME],
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
    elasticsearch: { enabled: true },
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
