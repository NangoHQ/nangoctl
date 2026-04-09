import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

import { generateLocalConfigMap } from '../config/generateConfigMap.js';
import type { LocalRuntimeConfig } from '../config/localConfigSchema.js';
import { generateLocalSecrets, renderKubernetesSecret } from '../config/generateSecret.js';
import { mergeValues } from '../values/mergeValues.js';
import { generateLocalHelmValues } from '../values/generateLocalValues.js';
import { LOCAL_CONFIGMAP_NAME, LOCAL_SECRET_NAME } from '../state.js';

/** Packaged `values/` lives next to the CLI bundle (`dist/values/`) after build. */
export async function loadPackagedLocalDefaultsYaml(): Promise<string> {
  const exe = process.argv[1];
  const candidates = [
    exe ? path.join(path.dirname(exe), '..', 'values', 'local.defaults.yaml') : '',
    path.join(process.cwd(), 'values', 'local.defaults.yaml'),
    path.join(process.cwd(), 'dist', 'values', 'local.defaults.yaml'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      return await readFile(p, 'utf8');
    } catch {
      // try next
    }
  }
  throw new Error(
    `Could not find local.defaults.yaml (tried: ${candidates.join(', ')}). Run \`npm run build\` so values/ is copied to dist.`
  );
}

export type MaterializeLocalRuntimeInput = {
  namespace: string;
  release: string;
  serverPortLocalhost: number;
  seed: string;
  lowResource: boolean;
  imageTag?: string;
};

export type MaterializeLocalRuntimeResult = {
  configMapYaml: string;
  secretYaml: string;
  generatedValuesYaml: string;
  mergedValues: Record<string, unknown>;
};

function manifestToYaml(manifest: Record<string, unknown>): string {
  return YAML.stringify(manifest);
}

function buildInClusterUrls(namespace: string, release: string) {
  const rel = release.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const base = `${rel}-nango`;
  return {
    server: `http://${base}-server.${namespace}.svc.cluster.local`,
    persist: `http://${base}-persist.${namespace}.svc.cluster.local`,
    orchestrator: `http://${base}-orchestrator.${namespace}.svc.cluster.local`,
    jobs: `http://${base}-jobs.${namespace}.svc.cluster.local`,
    runner: `http://${base}-runner.${namespace}.svc.cluster.local`,
  };
}

export async function materializeLocalRuntime(input: MaterializeLocalRuntimeInput): Promise<MaterializeLocalRuntimeResult> {
  const publicBaseUrl = `http://127.0.0.1:${input.serverPortLocalhost}`;
  const inClusterUrls = buildInClusterUrls(input.namespace, input.release);

  const { generated } = generateLocalSecrets({
    seed: input.seed,
    namespace: input.namespace,
    name: LOCAL_SECRET_NAME,
  });

  const runtimeConfig: LocalRuntimeConfig = {
    nodeEnv: 'development',
    serverPortInPod: 8080,
    authAllowSignup: true,
    publicBaseUrl,
    inClusterUrls,
    runnerNodeId: generated.runnerNodeId,
    enterpriseMode: true,
  };

  const cm = generateLocalConfigMap({
    name: LOCAL_CONFIGMAP_NAME,
    namespace: input.namespace,
    config: runtimeConfig,
  });

  const postgresUrl =
    `postgres://nango:nango@nango-postgresql.${input.namespace}.svc.cluster.local:5432/nango`;
  const redisUrl = `redis://nango-redis-master.${input.namespace}.svc.cluster.local:6379`;

  const secretYaml = renderKubernetesSecret({
    name: LOCAL_SECRET_NAME,
    namespace: input.namespace,
    postgresUrl,
    redisUrl,
    secrets: generated,
  });

  const configMapYaml = manifestToYaml(cm as unknown as Record<string, unknown>);

  const packagedDefaults = await loadPackagedLocalDefaultsYaml();
  const baseValues = YAML.parse(packagedDefaults) as Record<string, unknown>;

  const { yamlText: generatedOverlayYaml, values: generatedOverlay } = generateLocalHelmValues(
    {
      lowResource: input.lowResource,
      imageTag: input.imageTag,
    },
    {
      namespace: input.namespace,
      release: input.release,
      serverPortLocalhost: input.serverPortLocalhost,
    }
  );

  const mergedValues = mergeValues(baseValues, generatedOverlay);
  return {
    configMapYaml,
    secretYaml,
    generatedValuesYaml: generatedOverlayYaml,
    mergedValues,
  };
}

export function defaultKubeContextForKind(clusterName: string): string {
  return `kind-${clusterName}`;
}
