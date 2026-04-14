import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

import { generateLocalConfigMap } from '../config/generateConfigMap.js';
import type { LocalRuntimeConfig } from '../config/localConfigSchema.js';
import { generateLocalSecrets, renderKubernetesSecret } from '../config/generateSecret.js';
import { elasticsearchHttpUrl, helmCommonFullname, nangoComponentServiceUrl } from '../helm/names.js';
import { localPostgresUrl, localRedisUrl } from './bitnamiLocalDeps.js';
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
  const full = helmCommonFullname(release);
  return {
    server: nangoComponentServiceUrl(full, 'server', namespace),
    persist: nangoComponentServiceUrl(full, 'persist', namespace),
    orchestrator: nangoComponentServiceUrl(full, 'orchestrator', namespace),
    jobs: nangoComponentServiceUrl(full, 'jobs', namespace),
    runner: nangoComponentServiceUrl(full, 'runner', namespace),
  };
}

export async function materializeLocalRuntime(input: MaterializeLocalRuntimeInput): Promise<MaterializeLocalRuntimeResult> {
  const packagedDefaults = await loadPackagedLocalDefaultsYaml();
  const baseValues = YAML.parse(packagedDefaults) as Record<string, unknown>;
  const esCfg = baseValues.elasticsearch as Record<string, unknown> | undefined;
  const elasticsearchEnabled = Boolean(esCfg?.enabled);

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
    elasticsearchUrl: elasticsearchEnabled ? elasticsearchHttpUrl(input.release, input.namespace) : undefined,
    logsEnabled: elasticsearchEnabled,
    logsIndexPrefix: 'nango-local',
    enterpriseMode: true,
  };

  const cm = generateLocalConfigMap({
    name: LOCAL_CONFIGMAP_NAME,
    namespace: input.namespace,
    config: runtimeConfig,
  });

  const postgresUrl = localPostgresUrl(input.namespace);
  const redisUrl = localRedisUrl(input.namespace);

  const secretYaml = renderKubernetesSecret({
    name: LOCAL_SECRET_NAME,
    namespace: input.namespace,
    postgresUrl,
    redisUrl,
    secrets: generated,
  });

  const configMapYaml = manifestToYaml(cm as unknown as Record<string, unknown>);

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
