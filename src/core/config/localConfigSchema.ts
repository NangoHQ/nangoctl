import { z } from 'zod';

import { DEFAULT_LOCAL_CONNECT_UI_PORT, DEFAULT_LOCAL_SERVER_PORT } from '../defaults.js';

export const localInstallOptionsSchema = z.object({
  json: z.boolean().default(false),
  verbose: z.boolean().default(false),
  kubeContext: z.string().optional(),
  namespace: z.string().min(1).default('nango'),
  release: z.string().min(1).default('nango'),
  stateDir: z.string().optional(),
  clusterRuntime: z.enum(['kind']).default('kind'),
  createCluster: z.boolean().default(true),
  access: z.enum(['port-forward']).default('port-forward'),
  serverPort: z.coerce.number().int().min(1024).max(65535).default(DEFAULT_LOCAL_SERVER_PORT),
  connectUiPort: z.coerce.number().int().min(1024).max(65535).default(DEFAULT_LOCAL_CONNECT_UI_PORT),
  waitTimeout: z.string().default('10m'),
  valuesFile: z.string().optional(),
  set: z.array(z.string()).default([]),
});

export type LocalInstallOptions = z.infer<typeof localInstallOptionsSchema>;

/** Non-secret runtime shape passed into ConfigMap generation. */
export const LocalRuntimeConfigSchema = z.object({
  nodeEnv: z.string(),
  serverPortInPod: z.number(),
  /** Port inside the server container where Connect UI listens (see `NANGO_CONNECT_UI_PORT`). */
  connectUiPortInPod: z.number().int(),
  /** Browser-facing URL for Connect UI (localhost + port-forward), e.g. http://127.0.0.1:4281 */
  publicConnectBaseUrl: z.string(),
  authAllowSignup: z.boolean(),
  authEnabled: z.boolean(),
  dashboardUsername: z.string(),
  dashboardPassword: z.string(),
  publicBaseUrl: z.string(),
  inClusterUrls: z.object({
    server: z.string(),
    persist: z.string(),
    orchestrator: z.string(),
    jobs: z.string(),
    runner: z.string(),
  }),
  /** In-cluster Elasticsearch URL; set when `logsEnabled` and bitnami ES is deployed. */
  elasticsearchUrl: z.string().optional(),
  logsEnabled: z.boolean(),
  /** Prefix for ES index names, e.g. `nango-local` → `nango-local-operations`. */
  logsIndexPrefix: z.string(),
  /** Absolute path in server/jobs pods where `providers.yaml` and integrations live (see Helm persistence mount). */
  integrationsFullPath: z.string(),
  enterpriseMode: z.boolean().optional(),
});

export type LocalRuntimeConfig = z.infer<typeof LocalRuntimeConfigSchema>;
