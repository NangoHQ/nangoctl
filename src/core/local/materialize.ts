import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

import { generateLocalConfigMap } from '../config/generateConfigMap.js';
import type { LocalRuntimeConfig } from '../config/localConfigSchema.js';
import { generateLocalSecrets, renderKubernetesSecret } from '../config/generateSecret.js';
import {
  elasticsearchHttpUrl,
  helmCommonFullname,
  nangoComponentServiceUrl,
  opensearchClusterName,
  opensearchHttpUrl,
} from '../helm/names.js';
import type { LogsProvider } from '../logs/types.js';
import { localPostgresUrl, localRedisUrl } from './bitnamiLocalDeps.js';
import {
  DEFAULT_CONNECT_UI_POD_PORT,
  DEFAULT_LOCAL_CONNECT_UI_PORT,
  nangoIntegrationsFullPath,
} from '../defaults.js';
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
  /** Localhost port for Connect UI (port-forward target differs from server). */
  connectUiPortLocalhost?: number;
  /** Container port for Connect UI; must match Helm `server.extraContainerPorts` (default 3009). */
  connectUiPortInPod?: number;
  seed: string;
  lowResource: boolean;
  imageTag?: string;
  /** Default `elasticsearch`; when `opensearch`, Bitnami ES is disabled and URL points at the OpenSearch Service. */
  logsProvider?: LogsProvider;
  /** Secret name appended to `extraEnvVarsSecrets` on all workloads when using `--aws-profile`. */
  awsCredentialsSecretName?: string;
  /** Sets `LAMBDA_ENABLED` in the ConfigMap (default false). */
  lambdaEnabled?: boolean;
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
  const logsProvider: LogsProvider = input.logsProvider ?? 'elasticsearch';

  const esCfg = baseValues.elasticsearch as Record<string, unknown> | undefined;
  const elasticsearchEnabledInDefaults = Boolean(esCfg?.enabled);

  let elasticsearchUrl: string | undefined;
  let logsEnabled: boolean;

  if (logsProvider === 'opensearch') {
    logsEnabled = true;
    elasticsearchUrl = opensearchHttpUrl(opensearchClusterName(input.release), input.namespace);
  } else {
    logsEnabled = elasticsearchEnabledInDefaults;
    elasticsearchUrl = logsEnabled ? elasticsearchHttpUrl(input.release, input.namespace) : undefined;
  }

  const publicBaseUrl = `http://127.0.0.1:${input.serverPortLocalhost}`;
  const connectUiLocal = input.connectUiPortLocalhost ?? DEFAULT_LOCAL_CONNECT_UI_PORT;
  const connectUiPod = input.connectUiPortInPod ?? DEFAULT_CONNECT_UI_POD_PORT;
  const publicConnectBaseUrl = `http://127.0.0.1:${connectUiLocal}`;
  const inClusterUrls = buildInClusterUrls(input.namespace, input.release);

  const { generated } = generateLocalSecrets({
    seed: input.seed,
    namespace: input.namespace,
    name: LOCAL_SECRET_NAME,
  });

  const runtimeConfig: LocalRuntimeConfig = {
    nodeEnv: 'development',
    serverPortInPod: 8080,
    connectUiPortInPod: connectUiPod,
    publicConnectBaseUrl,
    authAllowSignup: false,
    authEnabled: false,
    dashboardUsername: 'admin',
    dashboardPassword: 'P@ssw0rd',
    publicBaseUrl,
    inClusterUrls,
    elasticsearchUrl,
    logsProvider,
    logsEnabled,
    logsIndexPrefix: 'nango-local',
    integrationsFullPath: nangoIntegrationsFullPath(),
    enterpriseMode: true,
    lambdaEnabled: input.lambdaEnabled ?? false,
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
      logsProvider,
      awsCredentialsSecretName: input.awsCredentialsSecretName,
    },
    {
      namespace: input.namespace,
      release: input.release,
      serverPortLocalhost: input.serverPortLocalhost,
      connectUiPortInPod: connectUiPod,
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
