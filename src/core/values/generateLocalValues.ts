import YAML from 'yaml';

import type { LocalInstallFlags } from '../../commands/local/install.js';
import { LOCAL_CONFIGMAP_NAME, LOCAL_SECRET_NAME } from '../state.js';

export type GeneratedValuesContext = {
    namespace: string;
    release: string;
    serverPortLocalhost: number;
};

export type GeneratedValuesOutput = {
    yamlText: string;
    values: Record<string, any>;
};

export function generateLocalHelmValues(flags: LocalInstallFlags, ctx: GeneratedValuesContext): GeneratedValuesOutput {
    // This object is intentionally minimal; local.defaults.yaml contains the “product defaults”.
    // This generated overlay captures computed or user-provided values.
    const values: Record<string, any> = {
        namespaceOverride: ctx.namespace,

        server: {
            // Default access is via port-forward; keep services internal.
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

        // Dependencies: in-cluster by default for local.
        postgresql: { enabled: true },
        redis: { enabled: true },
        elasticsearch: { enabled: false },
        metering: { enabled: false },
    };

    // Allow pinning image tag for local installs (useful for testing).
    if (flags.imageTag) {
        values.global = { ...(values.global ?? {}), image: { ...(values.global?.image ?? {}), tag: flags.imageTag } };
    }

    // Allow low-resource toggles by turning off HPAs and using smaller presets (best-effort).
    if (flags.lowResource) {
        for (const svc of ['server', 'persist', 'orchestrator', 'jobs', 'runner'] as const) {
            values[svc] = {
                ...(values[svc] ?? {}),
                autoscaling: { ...(values[svc]?.autoscaling ?? {}), hpa: { enabled: false } },
                resourcesPreset: 'small',
            };
        }
    }

    const yamlText = YAML.stringify(values);
    return { yamlText, values };
}

